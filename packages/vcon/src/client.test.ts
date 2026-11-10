import type { PompClient } from '@proofofmeet/sdk'
import { describe, expect, it } from 'vitest'

import { addParty, addSession, createVcon } from './build'
import { exportVcon, importVcon, verifyExport } from './client'
import { jwkFromRawEd25519, signVcon } from './jws'
import type { SignedVcon, Vcon } from './types'

function sample(): Vcon {
  const vcon = createVcon({
    uuid: '07ff0c10-f61d-519d-8e6b-b08721f96097',
    created_at: '2026-11-07T10:00:00Z',
    subject: 'Export',
  })
  addParty(vcon, { name: 'Alice' })
  addSession(vcon, { parties: [0] })
  return vcon
}

async function signedSample() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])
  const raw = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey),
  )
  const vcon = sample()
  const signed = await signVcon(vcon, {
    privateKey: pair.privateKey,
    kid: 'pomp-1',
  })
  return { vcon, signed, jwks: { keys: [jwkFromRawEd25519(raw, 'pomp-1')] } }
}

type Call = { method: string; args: Array<unknown> }

function fakeClient(responses: {
  export?: SignedVcon
  import?: unknown
  jwks?: unknown
}) {
  const calls: Array<Call> = []
  const client = {
    vcon: {
      export: async (...args: Array<unknown>) => {
        calls.push({ method: 'export', args })
        return responses.export
      },
      exportVerification: async (...args: Array<unknown>) => {
        calls.push({ method: 'exportVerification', args })
        return responses.export
      },
      import: async (...args: Array<unknown>) => {
        calls.push({ method: 'import', args })
        return responses.import
      },
      jwks: async () => {
        calls.push({ method: 'jwks', args: [] })
        return responses.jwks
      },
    },
  } as unknown as PompClient
  return { calls, client }
}

describe('exportVcon', () => {
  it('fetches the signed form and decodes the payload', async () => {
    const { vcon, signed } = await signedSample()
    const { calls, client } = fakeClient({ export: signed })
    const exported = await exportVcon(client, 'w1', { commit: 2 })
    expect(exported.signed).toBe(signed)
    expect(exported.vcon).toEqual(vcon)
    expect(calls).toEqual([
      { method: 'export', args: ['w1', { commit: 2, form: 'signed' }] },
    ])
  })
})

describe('verifyExport', () => {
  it('verifies with a JWK Set in hand', async () => {
    const { vcon, signed, jwks } = await signedSample()
    const result = await verifyExport(signed, { jwks })
    expect(result).toMatchObject({ ok: true, kid: 'pomp-1', alg: 'EdDSA' })
    if (result.ok) expect(result.vcon).toEqual(vcon)
  })

  it('fetches the JWK Set from a URL and reports fetch failures', async () => {
    const { signed, jwks } = await signedSample()
    const seen: Array<string> = []
    const fetchLike = async (input: string | URL) => {
      seen.push(String(input))
      return new Response(JSON.stringify(jwks), {
        headers: { 'content-type': 'application/json' },
      })
    }
    const result = await verifyExport(signed, {
      jwksUrl: 'https://pomp.example/.well-known/jwks.json',
      fetch: fetchLike,
    })
    expect(result.ok).toBe(true)
    expect(seen).toEqual(['https://pomp.example/.well-known/jwks.json'])

    const failing = await verifyExport(signed, {
      jwksUrl: 'https://pomp.example/.well-known/jwks.json',
      fetch: async () => new Response('', { status: 503 }),
    })
    expect(failing.ok).toBe(false)
    if (!failing.ok) expect(failing.reason).toContain('503')
  })

  it('rejects an unknown key and a tampered payload', async () => {
    const { signed } = await signedSample()
    const other = await signedSample()
    const unknownKey = await verifyExport(signed, { jwks: other.jwks })
    expect(unknownKey).toEqual({
      ok: false,
      reason: 'signature does not verify',
      kid: 'pomp-1',
    })
    await expect(verifyExport(signed, {})).rejects.toThrow(/jwks/u)
  })
})

describe('importVcon', () => {
  it('passes the document through to the client', async () => {
    const { signed } = await signedSample()
    const result = { workspace: { id: 'w2' }, commit: { seq: 1 } }
    const { calls, client } = fakeClient({ import: result })
    expect(await importVcon(client, { vcon: sample(), message: 'm' })).toBe(
      result,
    )
    expect(await importVcon(client, { vcon: signed, workspaceId: 'w2' })).toBe(
      result,
    )
    expect(calls[0]).toEqual({
      method: 'import',
      args: [{ vcon: sample(), workspaceId: undefined, message: 'm' }],
    })
    expect(calls[1]).toEqual({
      method: 'import',
      args: [{ vcon: signed, workspaceId: 'w2', message: undefined }],
    })
  })
})
