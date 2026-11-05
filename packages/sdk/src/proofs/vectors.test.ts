import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { canonicalize } from './canonicalize'
import type { JsonValue } from './canonicalize'
import { commitCanonical, commitHashHex, verifyChain } from './commit'
import type { CommitBody, Provenance } from './commit'
import { gradeDocument, suggestWitness } from './grade'
import type { Grade, Witness } from './grade'
import {
  auditPath,
  fromHex,
  leafHash,
  rootFromLeafHashes,
  rootFromLeaves,
  toHex,
  verifyInclusion,
} from './merkle'
import { verifyReceipt } from './receipt'
import {
  leafBytes,
  normalizeText,
  segmentString,
  segmentText,
  textRecordCommitment,
} from './segmentation'
import { payloadHash, verifySignature } from './signature'
import { toBase64Url, utf8 } from './bytes'

function vectors<T>(name: string): T {
  const path = fileURLToPath(
    new URL(`../../../../spec/vectors/${name}`, import.meta.url),
  )
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

describe('merkle vectors', () => {
  const v = vectors<{
    emptyTreeRoot: string
    emptyLeafHash: string
    trees: Array<{ leavesHex: Array<string>; rootHex: string }>
  }>('merkle.json')

  it('matches the empty tree and empty leaf', async () => {
    expect(toHex(await rootFromLeafHashes([]))).toBe(v.emptyTreeRoot)
    expect(toHex(await leafHash(new Uint8Array()))).toBe(v.emptyLeafHash)
  })

  it('matches every tree vector', async () => {
    for (const tree of v.trees) {
      const leaves = tree.leavesHex.map((hex) => fromHex(hex))
      expect(toHex(await rootFromLeaves(leaves))).toBe(tree.rootHex)
    }
  })

  it('produces verifiable audit paths', async () => {
    const hashes = await Promise.all(
      Array.from({ length: 11 }, (_, i) => leafHash(utf8(`leaf-${i}`))),
    )
    const root = toHex(await rootFromLeafHashes(hashes))
    for (const [index, hash] of hashes.entries()) {
      const path = await auditPath(hashes, index)
      expect(await verifyInclusion(toHex(hash), path, root)).toBe(true)
    }
    const receipt = {
      v: 1 as const,
      batch: 'b',
      root,
      index: 3,
      path: await auditPath(hashes, 3),
      item: {
        kind: 'attestation' as const,
        id: 'a',
        leafHash: toHex(hashes[3]!),
      },
      ledger: {
        kind: 'opentimestamps' as const,
        calendar: null,
        proof: null,
        status: 'submitted' as const,
        submittedAt: null,
      },
      service: { keyId: null, signature: null },
    }
    expect((await verifyReceipt(receipt)).verdict).toBe('pending')
    expect(
      (
        await verifyReceipt({
          ...receipt,
          ledger: { ...receipt.ledger, status: 'confirmed' },
        })
      ).verdict,
    ).toBe('valid')
    expect((await verifyReceipt({ ...receipt, root: '00' })).verdict).toBe(
      'invalid',
    )
  })
})

describe('canonicalize vectors', () => {
  const v = vectors<{ cases: Array<{ input: JsonValue; expected: string }> }>(
    'canonicalize.json',
  )
  it('matches every case', () => {
    for (const c of v.cases) expect(canonicalize(c.input)).toBe(c.expected)
  })
  it('drops undefined and rejects non-finite numbers', () => {
    expect(canonicalize({ a: undefined, b: 1 })).toBe('{"b":1}')
    expect(() => canonicalize({ x: Number.NaN })).toThrow()
  })
})

describe('segmentation vectors', () => {
  const v = vectors<{
    cases: Array<{
      text: string
      segments: Array<string>
      leaf?: { index: number; utf8: string }
    }>
  }>('segmentation.json')
  it('matches every case', () => {
    for (const c of v.cases) {
      const normalized = normalizeText(c.text)
      const segments = segmentText(normalized)
      expect(segments.map((s) => segmentString(normalized, s))).toEqual(
        c.segments,
      )
      if (c.leaf) {
        expect(
          new TextDecoder().decode(
            leafBytes(normalized, segments[c.leaf.index]!),
          ),
        ).toBe(c.leaf.utf8)
      }
    }
  })
  it('computes a text record root', async () => {
    const a = await textRecordCommitment('A: one\nB: two\n')
    const b = await textRecordCommitment('A: one\r\nB: two\r\n')
    expect(a.rootHex).toBe(b.rootHex)
    expect(a.segments).toHaveLength(2)
  })
})

describe('signature', () => {
  it('verifies an Ed25519 signature over sha256(canonical)', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
      'sign',
      'verify',
    ])
    const canonical = canonicalize({ kind: 'attendance', mode: 'full' })
    const hash = await payloadHash(canonical)
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        (pair as CryptoKeyPair).privateKey,
        hash as BufferSource,
      ),
    )
    const raw = new Uint8Array(
      await crypto.subtle.exportKey('raw', (pair as CryptoKeyPair).publicKey),
    )
    expect(
      await verifySignature(canonical, toBase64Url(signature), toHex(raw)),
    ).toBe(true)
    expect(
      await verifySignature('{"kind":"x"}', toBase64Url(signature), toHex(raw)),
    ).toBe(false)
  })
})

describe('commit vectors', () => {
  const v = vectors<{
    commits: Array<{ body: CommitBody; canonical: string; hashHex: string }>
    unsortedInput: CommitBody
    brokenChain: { parent: string }
  }>('commit.json')

  it('canonicalizes and hashes every commit', async () => {
    for (const c of v.commits) {
      expect(commitCanonical(c.body)).toBe(c.canonical)
      expect(await commitHashHex(c.body)).toBe(c.hashHex)
    }
  })

  it('normalizes unsorted input to the same hash', async () => {
    expect(await commitHashHex(v.unsortedInput)).toBe(v.commits[1]!.hashHex)
  })

  it('verifies the chain and rejects a broken parent', async () => {
    expect(await verifyChain(v.commits)).toEqual({ ok: true })
    const broken = {
      ...v.commits[1]!,
      body: { ...v.commits[1]!.body, parent: v.brokenChain.parent },
    }
    expect(await verifyChain([v.commits[0]!, broken])).toEqual({
      ok: false,
      seq: 2,
      reason: 'parent',
    })
  })
})

describe('grade vectors', () => {
  const v = vectors<{
    cases: Array<{
      name: string
      provenance: Provenance | null
      witnesses: Array<Witness>
      grade: Grade
      cap: Grade
      mismatch: boolean
    }>
    suggestions: Array<{ provenance: Provenance; witness: Witness }>
  }>('grade.json')

  it('matches every case', () => {
    for (const c of v.cases) {
      const result = gradeDocument(c.provenance, c.witnesses)
      expect(
        { grade: result.grade, cap: result.cap, mismatch: result.mismatch },
        c.name,
      ).toEqual({
        grade: c.grade,
        cap: c.cap,
        mismatch: c.mismatch,
      })
    }
  })

  it('suggests the expected statement', () => {
    for (const s of v.suggestions) {
      expect(suggestWitness(s.provenance)).toBe(s.witness)
    }
  })
})
