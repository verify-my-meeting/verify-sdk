/**
 * Ed25519 attestation signatures. The signed message is
 * `sha512(canonical payload)`; public keys are raw 32-byte values, hex
 * encoded on verification pages.
 */
import { fromBase64, fromHex, sha512, utf8 } from './bytes'

/** Hash of the canonical (RFC 8785) payload: the bytes that were signed. */
export function payloadHash(canonical: string): Promise<Uint8Array> {
  return sha512(utf8(canonical))
}

export async function verifySignature(
  payloadCanonical: string,
  signatureB64: string,
  publicKeyHex: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      fromHex(publicKeyHex) as BufferSource,
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    const hash = await payloadHash(payloadCanonical)
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      fromBase64(signatureB64) as BufferSource,
      hash as BufferSource,
    )
  } catch {
    return false
  }
}
