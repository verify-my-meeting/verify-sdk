/**
 * Inclusion receipts and their offline verification. Mirrors
 * `src/lib/proofs/receipt.ts` in the VerifyMyMeeting server.
 */
import type { AuditStep } from './merkle'
import { verifyInclusion } from './merkle'

export type Receipt = {
  v: 1
  batch: string
  root: string
  index: number
  path: Array<AuditStep>
  item: {
    kind: 'attestation' | 'record' | 'commit'
    id: string
    leafHash: string
  }
  ledger: {
    kind: 'opentimestamps' | 'none'
    calendar: string | null
    proof: string | null
    status: 'submitted' | 'confirmed' | 'pending' | 'failed'
    submittedAt: string | null
  }
  service: { keyId: string | null; signature: string | null }
}

export type ReceiptVerdict = 'valid' | 'invalid' | 'pending'

/**
 * Check that the receipt's leaf is included under its batch root.
 * `valid` requires the ledger to report the batch root as confirmed; a
 * submitted-but-unconfirmed batch yields `pending`.
 */
export async function verifyReceipt(
  receipt: Receipt,
): Promise<{ verdict: ReceiptVerdict; inclusion: boolean }> {
  const inclusion = await verifyInclusion(
    receipt.item.leafHash,
    receipt.path,
    receipt.root,
  )
  if (!inclusion) return { verdict: 'invalid', inclusion }
  return {
    verdict: receipt.ledger.status === 'confirmed' ? 'valid' : 'pending',
    inclusion,
  }
}
