/**
 * Commit chain (spec section 12): one linear, append-only chain per
 * workspace. A commit names its parent, a tree of documents, an author, a
 * time, a message, and a kind, and is hashed as
 * `SHA-512(canonicalize(body))` (body version 2, spec 2.0). Mirrors `src/lib/proofs/commit.ts` in the
 * ProofOfMeetProtocol server; browser-safe.
 */
import { sha512, toHex, utf8 } from './bytes.js'
import { canonicalize } from './canonicalize.js'
import type { JsonValue } from './canonicalize.js'

export const provenanceTypes = [
  'transcript',
  'minutes',
  'notes',
  'recording',
  'image',
  'evidence',
  'code',
  'other',
] as const
export type ProvenanceType = (typeof provenanceTypes)[number]

export const creators = ['owner', 'participant', 'other-human'] as const
export type Creator = (typeof creators)[number]

export const createdWhen = ['before', 'during', 'after'] as const
export type CreatedWhen = (typeof createdWhen)[number]

export const aiInvolvements = ['none', 'assisted', 'generated'] as const
export type AiInvolvement = (typeof aiInvolvements)[number]

export const aiRoles = ['verbatim', 'summary', 'enhanced'] as const
export type AiRole = (typeof aiRoles)[number]

/** Provenance declaration made by whoever adds a document. */
export type Provenance = {
  type: ProvenanceType
  creators: Array<Creator>
  created: CreatedWhen
  ai: AiInvolvement
  aiRole?: AiRole
  evidenceDocId?: string
  note?: string
}

export const commitKinds = [
  'initial',
  'edit',
  'comment',
  'add-document',
  'remove-document',
] as const
export type CommitKind = (typeof commitKinds)[number]

export type DocumentKind = 'link' | 'hash' | 'text'

/** One document in a commit tree. Content lives in the record version. */
export type TreeEntry = {
  doc: string
  kind: DocumentKind
  label: string
  root: string
  leafCount: number
  segmentation: string | null
  provenance: Provenance
}

export type CommitAuthor = {
  role: 'owner' | 'integrator' | 'participant'
  ref: string | null
}

/** The hashed object. `tree` is sorted by `doc` before hashing. */
export type CommitBody = {
  v: 2
  workspace: string
  seq: number
  parent: string | null
  kind: CommitKind
  author: CommitAuthor
  time: string
  message: string
  tree: Array<TreeEntry>
}

export function normalizeProvenance(input: Provenance): Provenance {
  const out: Provenance = {
    type: input.type,
    creators: [...input.creators].sort(),
    created: input.created,
    ai: input.ai,
  }
  if (input.ai !== 'none' && input.aiRole) out.aiRole = input.aiRole
  if (input.evidenceDocId) out.evidenceDocId = input.evidenceDocId
  if (input.note) out.note = input.note
  return out
}

export function normalizeTree(tree: Array<TreeEntry>): Array<TreeEntry> {
  return [...tree]
    .map((entry) => ({
      doc: entry.doc,
      kind: entry.kind,
      label: entry.label,
      root: entry.root.toLowerCase(),
      leafCount: entry.leafCount,
      segmentation: entry.segmentation,
      provenance: normalizeProvenance(entry.provenance),
    }))
    .sort((a, b) => (a.doc < b.doc ? -1 : a.doc > b.doc ? 1 : 0))
}

export function normalizeCommit(body: CommitBody): CommitBody {
  return {
    v: 2,
    workspace: body.workspace,
    seq: body.seq,
    parent: body.parent ? body.parent.toLowerCase() : null,
    kind: body.kind,
    author: { role: body.author.role, ref: body.author.ref },
    time: body.time,
    message: body.message,
    tree: normalizeTree(body.tree),
  }
}

export function commitCanonical(body: CommitBody): string {
  return canonicalize(normalizeCommit(body) as unknown as JsonValue)
}

export async function commitHashHex(body: CommitBody): Promise<string> {
  return toHex(await sha512(utf8(commitCanonical(body))))
}

/** True when `hashHex` is the hash of `body`. */
export async function verifyCommitHash(
  body: CommitBody,
  hashHex: string,
): Promise<boolean> {
  return (await commitHashHex(body)) === hashHex.toLowerCase()
}

/**
 * Verify a chain: every commit hashes to its stated hash, sequence numbers
 * run 1..n, and each parent is the previous hash. Returns the first problem.
 */
export async function verifyChain(
  commits: Array<{ hashHex: string; body: CommitBody }>,
): Promise<{ ok: true } | { ok: false; seq: number; reason: string }> {
  let previous: string | null = null
  for (const [index, commit] of commits.entries()) {
    const seq = index + 1
    if (commit.body.seq !== seq) return { ok: false, seq, reason: 'sequence' }
    if ((commit.body.parent ?? null) !== previous) {
      return { ok: false, seq, reason: 'parent' }
    }
    if (!(await verifyCommitHash(commit.body, commit.hashHex))) {
      return { ok: false, seq, reason: 'hash' }
    }
    previous = commit.hashHex.toLowerCase()
  }
  return { ok: true }
}
