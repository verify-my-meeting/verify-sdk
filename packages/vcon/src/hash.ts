/**
 * `content_hash` tokens (draft section 2.2 "ContentHash" and 2.4.2):
 * `<alg>-<base64url digest>` over the bytes of the referenced content.
 * SHA-512 is mandatory; `sha256` is accepted on verification because the
 * draft allows other IANA-recommended algorithms and ProofOfMeetProtocol
 * carries owner-supplied SHA-256 digests for `link` and `hash` documents.
 * Browser-safe: Web Crypto only.
 */
import { fromBase64, toBase64Url, toHex, fromHex } from '@proofofmeet/sdk'

import type { ContentHash, ContentHashes } from './types.js'

export type HashAlgorithm = 'sha512' | 'sha256'

const webCryptoName: Record<HashAlgorithm, 'SHA-512' | 'SHA-256'> = {
  sha512: 'SHA-512',
  sha256: 'SHA-256',
}

const digestLength: Record<HashAlgorithm, number> = { sha512: 64, sha256: 32 }

export function isHashAlgorithm(value: string): value is HashAlgorithm {
  return value === 'sha512' || value === 'sha256'
}

async function digest(
  bytes: Uint8Array,
  algorithm: HashAlgorithm,
): Promise<Uint8Array> {
  const out = await crypto.subtle.digest(
    webCryptoName[algorithm],
    bytes as BufferSource,
  )
  return new Uint8Array(out)
}

/** `sha512-<base64url>` of `bytes` (or `sha256-` when asked). */
export async function contentHash(
  bytes: Uint8Array,
  algorithm: HashAlgorithm = 'sha512',
): Promise<ContentHash> {
  return `${algorithm}-${toBase64Url(await digest(bytes, algorithm))}`
}

/** Build a token from a digest you already hold (hex or bytes). */
export function contentHashFromDigest(
  digestValue: Uint8Array | string,
  algorithm: HashAlgorithm,
): ContentHash {
  const bytes =
    typeof digestValue === 'string' ? fromHex(digestValue) : digestValue
  if (bytes.length !== digestLength[algorithm]) {
    throw new TypeError(
      `A ${algorithm} digest is ${digestLength[algorithm]} bytes, got ${bytes.length}.`,
    )
  }
  return `${algorithm}-${toBase64Url(bytes)}`
}

export type ParsedContentHash = {
  algorithm: string
  /** Raw digest bytes. */
  digest: Uint8Array
  /** Lowercase hex of the digest. */
  hex: string
  token: string
}

const tokenSyntax = /^([a-z0-9]+)-([A-Za-z0-9_-]+)$/u

/** True when `token` has the `<alg>-<base64url>` syntax. */
export function isContentHashToken(token: unknown): token is ContentHash {
  return typeof token === 'string' && tokenSyntax.test(token)
}

/** Parse one token; throws on bad syntax. Unknown algorithms are kept. */
export function parseContentHash(token: string): ParsedContentHash {
  const match = tokenSyntax.exec(token)
  if (!match) throw new TypeError(`Invalid content_hash token: ${token}`)
  const algorithm = match[1] as string
  const digestBytes = fromBase64(match[2] as string)
  return { algorithm, digest: digestBytes, hex: toHex(digestBytes), token }
}

/** Parse a `content_hash` value: one token or an array of tokens. */
export function parseContentHashes(
  value: ContentHashes | string | Array<string>,
): Array<ParsedContentHash> {
  const tokens = Array.isArray(value) ? value : [value]
  return tokens.map((token) => parseContentHash(token))
}

/**
 * Verify `bytes` against a `content_hash` value. With several tokens, every
 * token whose algorithm this package supports must match and at least one
 * must be supported; tokens of unknown algorithms are ignored.
 */
export async function verifyContentHash(
  bytes: Uint8Array,
  value: ContentHashes | string | Array<string>,
): Promise<boolean> {
  let parsed: Array<ParsedContentHash>
  try {
    parsed = parseContentHashes(value)
  } catch {
    return false
  }
  let checked = 0
  for (const token of parsed) {
    if (!isHashAlgorithm(token.algorithm)) continue
    checked += 1
    const actual = await digest(bytes, token.algorithm)
    if (toHex(actual) !== token.hex) return false
  }
  return checked > 0
}

/** The first supported token of a `content_hash` value, if any. */
export function preferredContentHash(
  value: ContentHashes | string | Array<string> | undefined,
): (ParsedContentHash & { algorithm: HashAlgorithm }) | null {
  if (value === undefined) return null
  let parsed: Array<ParsedContentHash>
  try {
    parsed = parseContentHashes(value)
  } catch {
    return null
  }
  const sha512 = parsed.find((token) => token.algorithm === 'sha512')
  const chosen =
    sha512 ?? parsed.find((token) => isHashAlgorithm(token.algorithm))
  return chosen
    ? { ...chosen, algorithm: chosen.algorithm as HashAlgorithm }
    : null
}
