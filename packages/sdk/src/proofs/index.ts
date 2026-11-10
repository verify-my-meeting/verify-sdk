export { canonicalize } from './canonicalize.js'
export type { JsonValue } from './canonicalize.js'
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
} from './merkle.js'
export type { AuditStep } from './merkle.js'
export { verifyReceipt } from './receipt.js'
export type { Receipt, ReceiptVerdict } from './receipt.js'
export {
  leafBytes,
  normalizeText,
  segmentBytes,
  segmentString,
  segmentText,
  segmentationVersion,
  textRecordCommitment,
} from './segmentation.js'
export type { Segment } from './segmentation.js'
export { payloadHash, verifySignature } from './signature.js'
export {
  concat,
  fromBase64,
  sha256,
  sha512,
  toBase64Url,
  utf8,
} from './bytes.js'
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
} from './commit.js'
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
} from './commit.js'
export {
  declarationCap,
  gradeDocument,
  statementGrade,
  suggestWitness,
  witnesses,
} from './grade.js'
export type { Grade, GradeResult, Witness } from './grade.js'
