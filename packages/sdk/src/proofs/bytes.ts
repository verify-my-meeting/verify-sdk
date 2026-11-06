/**
 * Byte helpers that work in browsers, Node, Deno, and workers.
 */
export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

export function fromHex(hex: string): Uint8Array {
  if (!/^[0-9a-f]*$/iu.test(hex) || hex.length % 2 !== 0) {
    throw new TypeError('Invalid hex string.')
  }
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function concat(...parts: Array<Uint8Array>): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function fromBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '')
}

/** SHA-512: the protocol hash (spec section 3). */
export async function sha512(...parts: Array<Uint8Array>): Promise<Uint8Array> {
  const data = concat(...parts)
  const digest = await crypto.subtle.digest('SHA-512', data as BufferSource)
  return new Uint8Array(digest)
}

/** SHA-256: not a protocol hash; kept for PKCE and owner-supplied digests. */
export async function sha256(...parts: Array<Uint8Array>): Promise<Uint8Array> {
  const data = concat(...parts)
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return new Uint8Array(digest)
}
