/**
 * The signed form (draft section 6.2): JWS General JSON Serialization
 * (RFC 7515 section 7.2.1) around the unsigned form. Web Crypto only.
 *
 * Signing uses `EdDSA` (Ed25519) by default, the algorithm of the
 * VerifyMyMeeting service key, or `ES256` for a P-256 key. Verification
 * additionally accepts `RS256`, the algorithm the draft recommends for
 * interoperability. `alg` is never `none`.
 *
 * Header placement: `alg`, `kid`, `uuid` and `cty` go in the JWS Protected
 * Header so they are integrity protected (the draft says `alg` SHOULD be
 * protected and registers `uuid` for either header). The draft requires
 * `x5c` or `x5u` in the unprotected header; VerifyMyMeeting publishes its
 * keys as a JWK Set instead, so neither is emitted unless passed in
 * `header`, and verification does not require them.
 */
import { fromBase64, toBase64Url, utf8 } from '@verifymymeeting/sdk'

import type { JwsHeader, SignedVcon, Vcon } from './types'
import { VCON_GZIP_MEDIATYPE, VCON_MEDIATYPE } from './types'

export type JwsAlgorithm = 'EdDSA' | 'ES256' | 'RS256'

export type SignOptions = {
  /** A Web Crypto private key: Ed25519, ECDSA P-256, or RSASSA-PKCS1-v1_5. */
  privateKey: CryptoKey
  /** Key id, as served in the JWK Set. */
  kid: string
  /** Defaults to `vcon.uuid`. */
  uuid?: string
  /** `typ` protected header parameter, e.g. `vcon+json`; omitted by default. */
  typ?: string
  /** Extra unprotected header parameters (`x5c`, `x5u`, ...). */
  header?: JwsHeader
  /** Serialize the payload yourself (e.g. with stable key order). */
  serialize?: (vcon: Vcon) => string
}

export type KeyResolver = (
  kid: string | undefined,
  header: JwsHeader,
) => Promise<CryptoKey | JsonWebKey | null | undefined>

export type VerifyResult =
  | { ok: true; vcon: Vcon; kid: string | undefined; alg: string }
  | { ok: false; reason: string; kid?: string | undefined }

function algorithmOf(key: CryptoKey): JwsAlgorithm {
  const name = key.algorithm.name
  if (name === 'Ed25519') return 'EdDSA'
  if (name === 'ECDSA') {
    const curve = (key.algorithm as EcKeyAlgorithm).namedCurve
    if (curve !== 'P-256') throw new TypeError(`Unsupported curve ${curve}.`)
    return 'ES256'
  }
  if (name === 'RSASSA-PKCS1-v1_5') return 'RS256'
  throw new TypeError(`Unsupported key algorithm ${name}.`)
}

function signParams(alg: JwsAlgorithm): AlgorithmIdentifier | EcdsaParams {
  if (alg === 'EdDSA') return { name: 'Ed25519' }
  if (alg === 'ES256') return { name: 'ECDSA', hash: 'SHA-256' }
  return { name: 'RSASSA-PKCS1-v1_5' }
}

function importParams(
  alg: JwsAlgorithm,
): AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams {
  if (alg === 'EdDSA') return { name: 'Ed25519' }
  if (alg === 'ES256') return { name: 'ECDSA', namedCurve: 'P-256' }
  return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
}

function isJwsAlgorithm(value: unknown): value is JwsAlgorithm {
  return value === 'EdDSA' || value === 'ES256' || value === 'RS256'
}

function b64urlJson(value: unknown): string {
  return toBase64Url(utf8(JSON.stringify(value)))
}

function ascii(text: string): Uint8Array {
  return utf8(text)
}

/** Sign the unsigned form. The payload is `JSON.stringify(vcon)` as is. */
export async function signVcon(
  vcon: Vcon,
  options: SignOptions,
): Promise<SignedVcon> {
  const alg = algorithmOf(options.privateKey)
  const protectedHeader: JwsHeader = {
    alg,
    kid: options.kid,
    uuid: options.uuid ?? vcon.uuid,
    cty: VCON_MEDIATYPE,
  }
  if (options.typ) protectedHeader.typ = options.typ
  const serialize =
    options.serialize ?? ((value: Vcon) => JSON.stringify(value))
  const payload = toBase64Url(utf8(serialize(vcon)))
  const protectedB64 = b64urlJson(protectedHeader)
  const signingInput = ascii(`${protectedB64}.${payload}`)
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      signParams(alg),
      options.privateKey,
      signingInput as BufferSource,
    ),
  )
  const entry: SignedVcon['signatures'][number] = {
    protected: protectedB64,
    signature: toBase64Url(signature),
  }
  if (options.header && Object.keys(options.header).length > 0) {
    for (const key of Object.keys(options.header)) {
      if (key in protectedHeader) {
        throw new TypeError(
          `Header parameter "${key}" is already in the protected header.`,
        )
      }
    }
    entry.header = { ...options.header }
  }
  return { payload, signatures: [entry] }
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Decode the payload bytes, gunzipping when the payload is compressed. */
export async function payloadBytes(signed: SignedVcon): Promise<Uint8Array> {
  const raw = fromBase64(signed.payload)
  return isGzip(raw) ? gunzip(raw) : raw
}

/** The unsigned form carried in `payload`, without verifying anything. */
export async function unsignedFrom(signed: SignedVcon): Promise<Vcon> {
  const text = new TextDecoder().decode(await payloadBytes(signed))
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('The JWS payload is not a JSON object.')
  }
  return value as Vcon
}

/** Decode a signature entry's protected header; `{}` when absent. */
export function protectedHeaderOf(
  entry: SignedVcon['signatures'][number],
): JwsHeader {
  if (!entry.protected) return {}
  const value: unknown = JSON.parse(
    new TextDecoder().decode(fromBase64(entry.protected)),
  )
  if (!value || typeof value !== 'object') {
    throw new TypeError('The protected header is not a JSON object.')
  }
  return value as JwsHeader
}

/** Protected and unprotected header parameters of one signature, joined. */
export function headerOf(entry: SignedVcon['signatures'][number]): JwsHeader {
  const protectedHeader = protectedHeaderOf(entry)
  const unprotected = entry.header ?? {}
  for (const key of Object.keys(unprotected)) {
    if (key in protectedHeader) {
      throw new TypeError(
        `Header parameter "${key}" appears in both JWS headers.`,
      )
    }
  }
  return { ...unprotected, ...protectedHeader }
}

async function toCryptoKey(
  key: CryptoKey | JsonWebKey,
  alg: JwsAlgorithm,
): Promise<CryptoKey> {
  if (key instanceof CryptoKey) return key
  return crypto.subtle.importKey('jwk', key, importParams(alg), true, [
    'verify',
  ])
}

/**
 * Verify a signed vCon. Every signature whose key `resolveKey` returns
 * must verify, at least one key must resolve, and the `uuid` header, when
 * present, must equal the payload's uuid. The payload is parsed, not
 * validated: run `validateVcon` on the result.
 */
export async function verifyVcon(
  signed: SignedVcon,
  resolveKey: KeyResolver,
): Promise<VerifyResult> {
  if (
    !signed ||
    typeof signed.payload !== 'string' ||
    !Array.isArray(signed.signatures) ||
    signed.signatures.length === 0
  ) {
    return { ok: false, reason: 'not a JWS General JSON Serialization' }
  }
  let vcon: Vcon
  try {
    vcon = await unsignedFrom(signed)
  } catch (error) {
    return { ok: false, reason: `payload: ${(error as Error).message}` }
  }
  let verified: { kid: string | undefined; alg: string } | null = null
  for (const entry of signed.signatures) {
    let header: JwsHeader
    try {
      header = headerOf(entry)
    } catch (error) {
      return { ok: false, reason: (error as Error).message }
    }
    const kid = typeof header.kid === 'string' ? header.kid : undefined
    if (!isJwsAlgorithm(header.alg)) {
      return { ok: false, reason: `unsupported alg ${String(header.alg)}`, kid }
    }
    if (header.uuid !== undefined && header.uuid !== vcon.uuid) {
      return { ok: false, reason: 'uuid header does not match payload', kid }
    }
    const resolved = await resolveKey(kid, header)
    if (!resolved) continue
    let key: CryptoKey
    try {
      key = await toCryptoKey(resolved, header.alg)
    } catch (error) {
      return { ok: false, reason: `key: ${(error as Error).message}`, kid }
    }
    const signingInput = ascii(`${entry.protected ?? ''}.${signed.payload}`)
    let ok = false
    try {
      ok = await crypto.subtle.verify(
        signParams(header.alg),
        key,
        fromBase64(entry.signature) as BufferSource,
        signingInput as BufferSource,
      )
    } catch {
      ok = false
    }
    if (!ok) return { ok: false, reason: 'signature does not verify', kid }
    verified ??= { kid, alg: header.alg }
  }
  if (!verified) return { ok: false, reason: 'no signature key resolved' }
  return { ok: true, vcon, kid: verified.kid, alg: verified.alg }
}

/** A public JWK for a raw 32-byte Ed25519 key, as served in a JWK Set. */
export function jwkFromRawEd25519(
  publicKeyRaw: Uint8Array,
  kid: string,
): JsonWebKey & { kid: string } {
  if (publicKeyRaw.length !== 32) {
    throw new TypeError('An Ed25519 public key is 32 bytes.')
  }
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: toBase64Url(publicKeyRaw),
    kid,
    alg: 'EdDSA',
    use: 'sig',
  }
}

/** A `KeyResolver` over a JWK Set document (`/.well-known/jwks.json`). */
export function resolverFromJwks(jwks: {
  keys: Array<JsonWebKey & { kid?: string }>
}): KeyResolver {
  return async (kid) => {
    if (kid === undefined) return jwks.keys.length === 1 ? jwks.keys[0] : null
    return jwks.keys.find((key) => key.kid === kid) ?? null
  }
}

/** Media type of a signed vCon's payload, from its `cty` header. */
export function payloadMediatype(signed: SignedVcon): string {
  const first = signed.signatures[0]
  const cty = first ? headerOf(first).cty : undefined
  return typeof cty === 'string'
    ? cty
    : isGzip(fromBase64(signed.payload))
      ? VCON_GZIP_MEDIATYPE
      : VCON_MEDIATYPE
}
