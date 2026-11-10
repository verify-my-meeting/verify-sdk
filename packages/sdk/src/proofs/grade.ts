/**
 * Human-involvement grade (spec section 13). Derived from a document's
 * provenance declaration and the witness statements of its approving
 * participants; never stored or signed. This is the published rule; the
 * VerifyMyMeeting server mirrors it in `src/lib/proofs/grade.ts`.
 */
import type { Provenance } from './commit.js'

export const witnesses = [
  'author',
  'witnessed',
  'representative',
  'inspired',
  'verified-prior',
  'told-by-participant',
  'told-third-party',
  'none',
] as const
export type Witness = (typeof witnesses)[number]

export type Grade = 'A' | 'B' | 'C' | 'ungraded'

const rank: Record<Grade, number> = { A: 3, B: 2, C: 1, ungraded: 0 }

/** The strongest grade a witness statement can support on its own. */
export const statementGrade: Record<Witness, Grade> = {
  author: 'A',
  witnessed: 'A',
  representative: 'B',
  inspired: 'C',
  'verified-prior': 'C',
  'told-by-participant': 'C',
  'told-third-party': 'C',
  none: 'ungraded',
}

/** The strongest grade a declaration allows, whatever participants say. */
export function declarationCap(provenance: Provenance | null): Grade {
  if (!provenance) return 'ungraded'
  if (provenance.created === 'before') return 'C'
  const humanContent =
    provenance.ai === 'none' ||
    (provenance.ai === 'assisted' && provenance.aiRole === 'verbatim')
  if (humanContent) return provenance.created === 'during' ? 'A' : 'B'
  return 'B'
}

function weaker(a: Grade, b: Grade): Grade {
  return rank[a] <= rank[b] ? a : b
}

export type GradeResult = {
  grade: Grade
  cap: Grade
  statements: Array<{ witness: Witness; grade: Grade; mismatch: boolean }>
  mismatch: boolean
}

/**
 * Grade one document. The document grade is the weakest effective statement
 * among approving participants, each capped by the declaration. A statement
 * stronger than the cap is a mismatch (flagged, graded by the declaration);
 * an undeclared document cannot mismatch. No statements, or any `none`,
 * leaves the document ungraded.
 */
export function gradeDocument(
  provenance: Provenance | null,
  witnessStatements: Array<Witness>,
): GradeResult {
  const cap = declarationCap(provenance)
  const statements = witnessStatements.map((witness) => {
    const own = statementGrade[witness]
    return {
      witness,
      grade: weaker(own, cap),
      mismatch: cap !== 'ungraded' && rank[own] > rank[cap],
    }
  })
  const grade =
    statements.length === 0
      ? 'ungraded'
      : statements.reduce<Grade>((acc, s) => weaker(acc, s.grade), 'A')
  return {
    grade,
    cap,
    statements,
    mismatch: statements.some((s) => s.mismatch),
  }
}

/** The statement the attestation page pre-fills from a declaration. */
export function suggestWitness(provenance: Provenance): Witness {
  if (provenance.created === 'before') {
    return provenance.evidenceDocId ? 'verified-prior' : 'told-by-participant'
  }
  if (provenance.ai === 'generated') return 'representative'
  if (provenance.ai === 'assisted' && provenance.aiRole !== 'verbatim') {
    return 'representative'
  }
  return provenance.created === 'during' ? 'witnessed' : 'representative'
}
