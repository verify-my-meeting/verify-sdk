/**
 * @verifymymeeting/vcon
 *
 * IETF vCon (draft-ietf-vcon-vcon-core-05, syntax 0.5.0): types, builder,
 * validator, `content_hash` helpers, JWS signing and verification, the
 * `verifymymeeting` extension, and the VerifyMyMeeting mapping in both
 * directions. Browser-safe: Web Crypto only.
 */
export const PACKAGE_VERSION = '0.1.0'

export * from './types'
export {
  contentHash,
  contentHashFromDigest,
  isContentHashToken,
  isHashAlgorithm,
  parseContentHash,
  parseContentHashes,
  preferredContentHash,
  verifyContentHash,
} from './hash'
export type { HashAlgorithm, ParsedContentHash } from './hash'
export {
  bytesToUuid,
  DNS_NAMESPACE,
  isUuid,
  URL_NAMESPACE,
  uuidToBytes,
  uuidv5,
  VMM_VCON_NAMESPACE,
  vmmVconUuid,
} from './uuid'
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
} from './build'
export type { CreateVconOptions } from './build'
export {
  assertKnownCritical,
  assertValidVcon,
  UnknownCriticalExtensionError,
  validateVcon,
  VconValidationError,
} from './validate'
export type { Problem } from './validate'
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
} from './jws'
export type {
  JwsAlgorithm,
  KeyResolver,
  SignOptions,
  VerifyResult,
} from './jws'
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
  VMM_EXTENSION,
  VMM_MAPPING_VERSION,
  vmmAttachment,
  vmmKinds,
  vmmMediatype,
  vmmPurposes,
} from './extension'
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
  VmmAttachmentMatch,
  VmmAttachmentPlacement,
  VmmKind,
  VmmMediatype,
  VmmPayloadByKind,
  VmmPurpose,
  WitnessStatement,
} from './extension'
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
  VMM_VALIDATION,
} from './mapping'
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
  VmmExportInput,
  WorkspaceInput,
} from './mapping'
