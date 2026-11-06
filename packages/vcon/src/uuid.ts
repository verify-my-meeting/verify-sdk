/**
 * Name-based UUIDs, version 5 (RFC 9562 section 5.5, formerly RFC 4122
 * section 4.3): SHA-1 over the namespace UUID's bytes followed by the name,
 * with the version and variant bits set. Web Crypto SHA-1; browser-safe.
 *
 * The draft recommends version 8 UUIDs derived from a time and the signing
 * domain (section 4.1.2, a SHOULD). VerifyMyMeeting uses version 5 over the
 * commit hash instead so that re-rendering a commit yields the same uuid.
 */
import { toHex, utf8 } from '@verifymymeeting/sdk'

/** RFC 9562 appendix: the DNS namespace. */
export const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
export const URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'

/**
 * `uuidv5(DNS_NAMESPACE, 'verifymymeeting.com/vcon')`: the namespace under
 * which VerifyMyMeeting derives every vCon uuid (spec section 15).
 */
export const VMM_VCON_NAMESPACE = '71a32ea6-9a91-57a1-865b-62e4bff8c148'

const uuidSyntax =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidSyntax.test(value)
}

export function uuidToBytes(uuid: string): Uint8Array {
  if (!isUuid(uuid)) throw new TypeError(`Invalid UUID: ${uuid}`)
  const hex = uuid.replace(/-/gu, '').toLowerCase()
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function bytesToUuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new TypeError('A UUID is 16 bytes.')
  const hex = toHex(bytes)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Version 5 UUID of `name` (UTF-8) under `namespace`. */
export async function uuidv5(
  namespace: string,
  name: string | Uint8Array,
): Promise<string> {
  const nameBytes = typeof name === 'string' ? utf8(name) : name
  const input = new Uint8Array(16 + nameBytes.length)
  input.set(uuidToBytes(namespace), 0)
  input.set(nameBytes, 16)
  const sha1 = new Uint8Array(
    await crypto.subtle.digest('SHA-1', input as BufferSource),
  )
  const out = sha1.slice(0, 16)
  out[6] = ((out[6] as number) & 0x0f) | 0x50
  out[8] = ((out[8] as number) & 0x3f) | 0x80
  return bytesToUuid(out)
}

/** The uuid VerifyMyMeeting gives the vCon of one commit at one level. */
export function vmmVconUuid(
  commitHashHex: string,
  level: 'owner' | 'viewer' | 'link' | 'public' = 'owner',
): Promise<string> {
  const name =
    level === 'owner'
      ? commitHashHex.toLowerCase()
      : `${commitHashHex.toLowerCase()}:${level}`
  return uuidv5(VMM_VCON_NAMESPACE, name)
}
