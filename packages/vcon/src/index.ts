/**
 * @proofofmeet/vcon
 *
 * IETF vCon (draft-ietf-vcon-vcon-core-05, syntax 0.5.0): types, builder,
 * validator, `content_hash` helpers, JWS signing and verification, the
 * `proofofmeet` extension, and the ProofOfMeetProtocol mapping in both
 * directions. Browser-safe: Web Crypto only.
 */
export const PACKAGE_VERSION = '0.1.0'

export * from './types.js'
export {
  contentHash,
  contentHashFromDigest,
  isContentHashToken,
  isHashAlgorithm,
  parseContentHash,
  parseContentHashes,
  preferredContentHash,
  verifyContentHash,
} from './hash.js'
export type { HashAlgorithm, ParsedContentHash } from './hash.js'
export {
  bytesToUuid,
  DNS_NAMESPACE,
  isUuid,
  URL_NAMESPACE,
  uuidToBytes,
  uuidv5,
  POMP_VCON_NAMESPACE,
  pompVconUuid,
} from './uuid.js'
export {
  addAnalysis,
  addAttachment,
  addDialog,
  addEvent,
  addParty,
  addSession,
  cloneVcon,
  createVcon,
  externalContent,
  inlineBytes,
  inlineJson,
  inlineText,
  useExtension,
} from './build.js'
export type { CreateVconOptions } from './build.js'
export {
  assertKnownCritical,
  assertValidVcon,
  UnknownCriticalExtensionError,
  validateVcon,
  VconValidationError,
} from './validate.js'
export type { Problem } from './validate.js'
export {
  headerOf,
  jwkFromRawEd25519,
  payloadBytes,
  payloadMediatype,
  protectedHeaderOf,
  resolverFromJwks,
  signVcon,
  unsignedFrom,
  verifyVcon,
} from './jws.js'
export type {
  JwsAlgorithm,
  KeyResolver,
  SignOptions,
  VerifyResult,
} from './jws.js'
export { exportVcon, importVcon, verifyExport } from './client.js'
export type {
  ExportedVcon,
  ExportVconOptions,
  ImportVconInput,
  VerifyExportOptions,
} from './client.js'
export {
  attestations,
  commitments,
  consents,
  findVmmAttachments,
  identities,
  isVmmAttachment,
  isVmmPurpose,
  kindOfPurpose,
  provenances,
  readVmmPayload,
  receipts,
  usesVmmExtension,
  POMP_EXTENSION,
  POMP_MAPPING_VERSION,
  pompAttachment,
  pompKinds,
  pompMediatype,
  pompPurposes,
} from './extension.js'
export type {
  AttestationRecord,
  CommitmentRecord,
  ConsentEntry,
  ConsentRecord,
  EntryLocator,
  IdentifierStatus,
  IdentityRecord,
  ProvenanceRecord,
  ReceiptRecord,
  VerifiedIdentifier,
  PompAttachmentMatch,
  PompAttachmentPlacement,
  PompKind,
  PompMediatype,
  PompPayloadByKind,
  PompPurpose,
  WitnessStatement,
} from './extension.js'
export {
  disclosedAt,
  fromVcon,
  MappingError,
  OWNER_PARTY_UUID,
  placementOf,
  redactVcon,
  SERVICE_PARTY_NAME,
  SERVICE_PARTY_UUID,
  toVcon,
  URI_LIST_MEDIATYPE,
  POMP_VALIDATION,
} from './mapping.js'
export type {
  AttestationInput,
  CommitInput,
  ConsentInput,
  DisclosedProfile,
  ExportLevel,
  FromVconOptions,
  ImportDocument,
  ImportParty,
  ImportPlan,
  OwnerInput,
  ParticipantInput,
  PartyRole,
  Placement,
  RecordInput,
  RedactOptions,
  ToVconOptions,
  PompExportInput,
  WorkspaceInput,
} from './mapping.js'
