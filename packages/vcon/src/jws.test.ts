import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { addParty, addSession, createVcon } from './build'
import {
  headerOf,
  jwkFromRawEd25519,
  payloadMediatype,
  protectedHeaderOf,
  resolverFromJwks,
  signVcon,
  unsignedFrom,
  verifyVcon,
} from './jws'
import type { SignedVcon, Vcon } from './types'

const fixtureDir = fileURLToPath(new URL('../test-fixtures/', import.meta.url))

function sample(): Vcon {
  const vcon = createVcon({
    uuid: '0a1ef5b3-f353-5995-a562-29895c6a9e87',
    created_at: '2026-11-07T10:00:00Z',
    subject: 'Signing',
  })
  addParty(vcon, { name: 'Alice' })
  addSession(vcon, { parties: [0] })
  return vcon
}

async function ed25519() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])
  const raw = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey),
  )
  return { ...pair, raw }
}

describe('signVcon / verifyVcon', () => {
  it('signs with EdDSA, verifies through a JWK Set, and rejects tampering', async () => {
    const key = await ed25519()
    const vcon = sample()
    const signed = await signVcon(vcon, {
      privateKey: key.privateKey,
      kid: 'pomp-1',
    })
    expect(signed.signatures).toHaveLength(1)
    const header = protectedHeaderOf(signed.signatures[0]!)
    expect(header).toEqual({
      alg: 'EdDSA',
      kid: 'pomp-1',
      uuid: vcon.uuid,
      cty: 'application/vcon',
    })
    expect(signed.signatures[0]!.header).toBeUndefined()
    expect(payloadMediatype(signed)).toBe('application/vcon')
    expect(await unsignedFrom(signed)).toEqual(vcon)

    const jwks = { keys: [jwkFromRawEd25519(key.raw, 'pomp-1')] }
    expect(jwks.keys[0]).toMatchObject({
      kty: 'OKP',
      crv: 'Ed25519',
      kid: 'pomp-1',
    })
    const result = await verifyVcon(signed, resolverFromJwks(jwks))
    expect(result).toMatchObject({ ok: true, kid: 'pomp-1', alg: 'EdDSA' })
    if (result.ok) expect(result.vcon).toEqual(vcon)

    // Also with a CryptoKey resolver.
    expect((await verifyVcon(signed, async () => key.publicKey)).ok).toBe(true)

    // Tamper with the payload: change the subject.
    const altered = { ...vcon, subject: 'Tampered' }
    const forged: SignedVcon = {
      payload: Buffer.from(JSON.stringify(altered)).toString('base64url'),
      signatures: signed.signatures,
    }
    expect(await verifyVcon(forged, resolverFromJwks(jwks))).toMatchObject({
      ok: false,
      reason: 'signature does not verify',
    })

    // Tamper with the protected header: another uuid.
    const badHeader: SignedVcon = {
      payload: signed.payload,
      signatures: [
        {
          protected: Buffer.from(
            JSON.stringify({ ...header, uuid: 'other' }),
          ).toString('base64url'),
          signature: signed.signatures[0]!.signature,
        },
      ],
    }
    expect((await verifyVcon(badHeader, resolverFromJwks(jwks))).ok).toBe(false)

    // Wrong key.
    const other = await ed25519()
    expect(
      (
        await verifyVcon(
          signed,
          resolverFromJwks({ keys: [jwkFromRawEd25519(other.raw, 'pomp-1')] }),
        )
      ).ok,
    ).toBe(false)

    // Unknown kid.
    expect(await verifyVcon(signed, async () => null)).toMatchObject({
      ok: false,
      reason: 'no signature key resolved',
    })
  })

  it('signs and verifies with ES256 and an EC JWK', async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
    const signed = await signVcon(sample(), {
      privateKey: pair.privateKey,
      kid: 'ec-1',
      typ: 'vcon+json',
      header: { x5u: 'https://example.com/cert.pem' },
    })
    expect(protectedHeaderOf(signed.signatures[0]!).alg).toBe('ES256')
    expect(headerOf(signed.signatures[0]!)).toMatchObject({
      alg: 'ES256',
      typ: 'vcon+json',
      x5u: 'https://example.com/cert.pem',
    })
    const result = await verifyVcon(
      signed,
      resolverFromJwks({ keys: [{ ...jwk, kid: 'ec-1' }] }),
    )
    expect(result).toMatchObject({ ok: true, alg: 'ES256' })
    const tampered = { ...signed, payload: `${signed.payload.slice(0, -2)}AA` }
    expect((await verifyVcon(tampered, async () => jwk)).ok).toBe(false)
  })

  it('refuses a header parameter in both headers', async () => {
    const key = await ed25519()
    await expect(
      signVcon(sample(), {
        privateKey: key.privateKey,
        kid: 'k',
        header: { alg: 'none' },
      }),
    ).rejects.toThrow(TypeError)
  })

  it('rejects alg none and empty signature lists', async () => {
    const payload = Buffer.from(JSON.stringify(sample())).toString('base64url')
    const none: SignedVcon = {
      payload,
      signatures: [
        {
          protected: Buffer.from(JSON.stringify({ alg: 'none' })).toString(
            'base64url',
          ),
          signature: '',
        },
      ],
    }
    expect(await verifyVcon(none, async () => null)).toMatchObject({
      ok: false,
      reason: 'unsupported alg none',
    })
    expect(
      (await verifyVcon({ payload, signatures: [] }, async () => null)).ok,
    ).toBe(false)
  })

  it('reads the draft B.6 signed example (RS256, x5c in the unprotected header)', async () => {
    const signed = JSON.parse(
      readFileSync(`${fixtureDir}ab_call_ext_rec_signed.vcon`, 'utf8'),
    ) as SignedVcon
    const header = headerOf(signed.signatures[0]!)
    expect(header.alg).toBe('RS256')
    expect(Array.isArray(header.x5c)).toBe(true)
    const vcon = await unsignedFrom(signed)
    expect(vcon.uuid).toBe(header.uuid)
    expect(vcon).toEqual(
      JSON.parse(readFileSync(`${fixtureDir}ab_call_ext_rec.vcon`, 'utf8')),
    )
    // No key resolves (the certificate chain is not parsed here), so it is
    // reported as unverified rather than invalid.
    expect(await verifyVcon(signed, async () => null)).toMatchObject({
      ok: false,
      reason: 'no signature key resolved',
    })
  })

  it('gunzips a compressed payload', async () => {
    const key = await ed25519()
    const vcon = sample()
    const gz = new Uint8Array(
      await new Response(
        new Blob([JSON.stringify(vcon)])
          .stream()
          .pipeThrough(new CompressionStream('gzip')),
      ).arrayBuffer(),
    )
    const payload = Buffer.from(gz).toString('base64url')
    const protectedB64 = Buffer.from(
      JSON.stringify({ alg: 'EdDSA', kid: 'k', cty: 'application/vcon+gzip' }),
    ).toString('base64url')
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        key.privateKey,
        new TextEncoder().encode(`${protectedB64}.${payload}`),
      ),
    )
    const signed: SignedVcon = {
      payload,
      signatures: [
        {
          protected: protectedB64,
          signature: Buffer.from(signature).toString('base64url'),
        },
      ],
    }
    expect(payloadMediatype(signed)).toBe('application/vcon+gzip')
    expect(await unsignedFrom(signed)).toEqual(vcon)
    expect((await verifyVcon(signed, async () => key.publicKey)).ok).toBe(true)
  })
})
