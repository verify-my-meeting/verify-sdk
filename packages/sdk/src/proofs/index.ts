export { canonicalize } from './canonicalize'
export type { JsonValue } from './canonicalize'
export {
  auditPath,
  fromHex,
  leafHash,
  nodeHash,
  rootFromAuditPath,
  rootFromLeafHashes,
  rootFromLeaves,
  toHex,
  verifyInclusion,
} from './merkle'
export type { AuditStep } from './merkle'
export { verifyReceipt } from './receipt'
export type { Receipt, ReceiptVerdict } from './receipt'
export {
  leafBytes,
  normalizeText,
  segmentBytes,
  segmentString,
  segmentText,
  segmentationVersion,
  textRecordCommitment,
} from './segmentation'
export type { Segment } from './segmentation'
export { payloadHash, verifySignature } from './signature'
export { concat, fromBase64, sha256, sha512, toBase64Url, utf8 } from './bytes'
export {
  aiInvolvements,
  aiRoles,
  commitCanonical,
  commitHashHex,
  commitKinds,
  createdWhen,
  creators,
  normalizeCommit,
  normalizeProvenance,
  normalizeTree,
  provenanceTypes,
  verifyChain,
  verifyCommitHash,
} from './commit'
export type {
  AiInvolvement,
  AiRole,
  CommitAuthor,
  CommitBody,
  CommitKind,
  CreatedWhen,
  Creator,
  DocumentKind,
  Provenance,
  ProvenanceType,
  TreeEntry,
} from './commit'
export {
  declarationCap,
  gradeDocument,
  statementGrade,
  suggestWitness,
  witnesses,
} from './grade'
export type { Grade, GradeResult, Witness } from './grade'
