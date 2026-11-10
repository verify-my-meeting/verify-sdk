/**
 * RFC 6962 (Certificate Transparency) Merkle trees over SHA-512.
 *
 * leaf hash:  SHA-512(0x00 || leaf)
 * node hash:  SHA-512(0x01 || left || right)
 * A tree with n > 1 leaves splits at k, the largest power of two less than
 * n. A single-leaf tree's root is its leaf hash. The empty tree's root is
 * SHA-512 of the empty string. (Protocol spec 2.0: SHA-512 throughout.)
 *
 * Mirrors `src/lib/proofs/merkle.ts` in the VerifyMyMeeting server. Web
 * Crypto digests are asynchronous, so every hashing function here returns a
 * Promise.
 */
import { fromHex, sha512, toHex } from './bytes.js'

export type AuditStep = { hash: string; side: 'left' | 'right' }

export function leafHash(leaf: Uint8Array): Promise<Uint8Array> {
  return sha512(Uint8Array.of(0), leaf)
}

export function nodeHash(
  left: Uint8Array,
  right: Uint8Array,
): Promise<Uint8Array> {
  return sha512(Uint8Array.of(1), left, right)
}

function largestPowerOfTwoBelow(n: number): number {
  let k = 1
  while (k * 2 < n) k *= 2
  return k
}

/** Root over already-hashed leaves. */
export async function rootFromLeafHashes(
  hashes: Array<Uint8Array>,
): Promise<Uint8Array> {
  if (hashes.length === 0) return sha512()
  if (hashes.length === 1) return new Uint8Array(hashes[0] as Uint8Array)
  const k = largestPowerOfTwoBelow(hashes.length)
  return nodeHash(
    await rootFromLeafHashes(hashes.slice(0, k)),
    await rootFromLeafHashes(hashes.slice(k)),
  )
}

export async function rootFromLeaves(
  leaves: Array<Uint8Array>,
): Promise<Uint8Array> {
  return rootFromLeafHashes(
    await Promise.all(leaves.map((leaf) => leafHash(leaf))),
  )
}

/** Audit path for leaf `index` over hashed leaves (RFC 6962 section 2.1.1). */
export async function auditPath(
  hashes: Array<Uint8Array>,
  index: number,
): Promise<Array<AuditStep>> {
  if (index < 0 || index >= hashes.length) {
    throw new RangeError('Leaf index out of range.')
  }
  if (hashes.length <= 1) return []
  const k = largestPowerOfTwoBelow(hashes.length)
  if (index < k) {
    return [
      ...(await auditPath(hashes.slice(0, k), index)),
      { hash: toHex(await rootFromLeafHashes(hashes.slice(k))), side: 'right' },
    ]
  }
  return [
    ...(await auditPath(hashes.slice(k), index - k)),
    { hash: toHex(await rootFromLeafHashes(hashes.slice(0, k))), side: 'left' },
  ]
}

/** Recompute a root from a leaf hash and its audit path. */
export async function rootFromAuditPath(
  leafHashHex: string,
  path: Array<AuditStep>,
): Promise<string> {
  let current = fromHex(leafHashHex)
  for (const step of path) {
    const sibling = fromHex(step.hash)
    current =
      step.side === 'left'
        ? await nodeHash(sibling, current)
        : await nodeHash(current, sibling)
  }
  return toHex(current)
}

export async function verifyInclusion(
  leafHashHex: string,
  path: Array<AuditStep>,
  rootHex: string,
): Promise<boolean> {
  return (await rootFromAuditPath(leafHashHex, path)) === rootHex.toLowerCase()
}

export { fromHex, toHex }
