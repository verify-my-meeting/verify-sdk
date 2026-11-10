/**
 * Request and response shapes of the ProofOfMeetProtocol REST API, version 1.
 * Hand-written against the server's domain modules; `spec/openapi.yaml` is
 * the published contract.
 */
import type { JsonValue } from './proofs/canonicalize.js'
import type {
  CommitAuthor,
  CommitBody,
  CommitKind,
  Provenance,
  TreeEntry,
} from './proofs/commit.js'
import type { GradeResult, Witness } from './proofs/grade.js'
import type { Receipt, ReceiptVerdict } from './proofs/receipt.js'

export type Visibility = 'private' | 'link' | 'public'
export type WorkspaceStatus = 'draft' | 'open' | 'closed'
export type AccessLevel = 'none' | 'public' | 'link' | 'viewer' | 'owner'
export type RecordKind = 'link' | 'hash' | 'text'
export type ContentVisibility = 'public' | 'link' | 'viewer'
export type InvitationKind = 'slot' | 'open' | 'viewer'
/**
 * `attendance`, `record` and `disclosure` are signed by the participant;
 * `confirmed` is the organiser's second statement about an attendance
 * attestation (spec section 6.1), signed by the service on the owner's
 * behalf until owners hold their own key.
 */
export type AttestationKind =
  'attendance' | 'record' | 'disclosure' | 'confirmed'
export type ConfirmationMode = 'automatic' | 'manual'
/** Who signed a confirmation. More kinds follow when owners hold keys. */
/**
 * Who signed a confirmation. `ref` is the owner's reference in that
 * workspace (spec 6.1): a keyed hash, stable within the workspace and
 * unrelated across workspaces, never an account id.
 */
export type ConfirmerRef = { kind: 'service'; role: 'owner'; ref: string }
export type BatchStatus = 'building' | 'submitted' | 'confirmed' | 'failed'

export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'limit_exceeded'
  | 'standing_required'
  | 'cubid_unavailable'
  | 'rate_limited'
  | 'feature_disabled'
  | 'invalid_state'
  | 'database_unavailable'
  | 'unsupported_extension'
  | 'internal'

export type ApiErrorBody = {
  error: { code: ErrorCode | string; message: string; details?: unknown }
}

export type Workspace = {
  id: string
  ownerAccountId: string
  integratorId: string | null
  title: string
  description: string
  purpose: string
  scheduledStart: string | null
  actualStart: string | null
  durationMinutes: number | null
  timezone: string
  visibility: Visibility
  status: WorkspaceStatus
  publicSlug: string | null
  minScore: number | null
  publicAckAt: string | null
  policy: Policy
  createdAt: string
  updatedAt: string
}

/**
 * The attestation policy block (spec 6; PATCH `/workspaces/:id/policy`).
 * Null means no condition, or for `autoConfirm` the service default.
 */
export type Policy = {
  attestFrom: string | null
  attestUntil: string | null
  maxAttesters: number | null
  minPresenceMinutes: number | null
  autoConfirm: boolean | null
}

/** A partial policy; a null value clears that condition. */
export type PolicyInput = Partial<Policy>

export type WorkspaceInput = {
  title: string
  description?: string
  purpose?: string
  scheduledStart?: string | null
  actualStart?: string | null
  durationMinutes?: number | null
  timezone?: string
  minScore?: number | null
}

/** One version of a document: content committed as a Merkle tree. */
export type RecordSummary = {
  id: string
  workspaceId: string
  /** Stable across versions; what commit trees and approvals name. */
  documentId: string
  kind: RecordKind
  label: string
  url: string | null
  /** Owner-supplied digest for `link` and `hash` records, hex. */
  hashHex: string | null
  /** Algorithm of `hashHex`: `sha512` (default) or `sha256`. Null when absent. */
  hashAlg: HashAlg | null
  contentBytes: number
  segmentationVersion: string | null
  leafCount: number
  rootHex: string
  version: number
  provenance: Provenance | null
  contentVisibility: ContentVisibility
  createdAt: string
}

type DocumentShared = {
  label?: string
  contentVisibility?: ContentVisibility
  /** Replace this document with a new version; omit to add a document. */
  documentId?: string
  /** Required: the provenance declaration (spec section 13). */
  provenance: Provenance
}

/** Algorithms accepted for owner-supplied digests. The protocol itself is SHA-512. */
export type HashAlg = 'sha512' | 'sha256'

export type DocumentInput =
  | (DocumentShared & {
      kind: 'link'
      url: string
      hashHex?: string
      /** Defaults to `sha512`; `sha256` for a 32-byte digest. */
      hashAlg?: HashAlg
    })
  | (DocumentShared & {
      kind: 'hash'
      label: string
      hashHex: string
      hashAlg?: HashAlg
    })
  | (DocumentShared & { kind: 'text'; text: string })

/** `POST /records`: one document as one commit, optional message. */
export type RecordInput = DocumentInput & { message?: string }

export type CommitInput = {
  message?: string
  documents?: Array<DocumentInput>
  /** Document ids to drop from the package. */
  remove?: Array<string>
}

export type CommitSummary = {
  id: string
  workspaceId: string
  seq: number
  hashHex: string
  parentHashHex: string | null
  kind: CommitKind
  author: CommitAuthor
  message: string
  committedAt: string
  tree: Array<TreeEntry>
  documents: Array<{ documentId: string; recordId: string }>
  parentDocuments: Array<string>
}

/** `GET /commits/:hash`: the summary plus the hashed body. */
export type CommitDetail = CommitSummary & {
  body: CommitBody
  canonical: string
}

export type DocumentDiff = {
  documentId: string
  label: string
  change: 'added' | 'removed' | 'modified' | 'unchanged'
  leaves: { same: number; added: number; removed: number } | null
  provenanceChanged: boolean
  labelChanged: boolean
}

export type CommitDiff = {
  commit: CommitSummary
  parent: CommitSummary | null
  documents: Array<DocumentDiff>
}

export type LeafSet = 'all' | 'none' | Array<[number, number]>

export type RecordContent = {
  record: RecordSummary
  segments: Array<{ index: number; text: string; leafHash: string }>
  leaves: Array<{ index: number; leafHash: string }>
}

export type Invitation = {
  id: string
  workspaceId: string
  kind: InvitationKind
  label: string
  maxUses: number
  uses: number
  expiresAt: string
  revokedAt: string | null
  createdAt: string
  /** The three-word code on an open invitation, when one is set (owner lists). */
  code?: string | null
}

export type InvitationInput = {
  kind: InvitationKind
  label?: string
  maxUses?: number
}

export type CreatedInvitation = {
  invitation: Invitation
  /** Shown once; only a keyed hash is stored. */
  token: string
  /** Absolute URL of the invitation page. */
  url: string
}

/**
 * One kiosk frame (`GET .../invitations/:id/kiosk`): a thirty-second join
 * token as a URL and a QR in SVG, for an open invitation shown on a screen.
 * `code` is the invitation's three-word code when one is set.
 */
export type KioskFrame = {
  token: string
  expiresAt: string
  url: string
  svg: string
  code: string | null
}

export type InvitationPreview = {
  usable: boolean
  reason: 'ok' | 'revoked' | 'expired' | 'exhausted' | 'closed'
  kind: InvitationKind
  expiresAt: string
  workspace: {
    id: string
    title: string
    description: string
    purpose: string
    scheduledStart: string | null
    actualStart: string | null
    durationMinutes: number | null
    timezone: string
    status: WorkspaceStatus
    minScore: number | null
  }
  signedIn: boolean
}

export type Participant = {
  id: string
  workspaceId: string
  handleNumber: number
  handle: string
  joinedAt: string
  withdrawnAt: string | null
  keyId: string | null
  publicKeyHex: string | null
}

export type ScoreSnapshot = { value: number; schema: string; fetchedAt: string }

export type Attestation = {
  id: string
  workspaceId: string
  participantId: string
  kind: AttestationKind
  /** The approved commit, for `record` attestations. */
  commitId: string | null
  payload: JsonValue | null
  payloadHashHex: string | null
  signatureB64: string | null
  keyId: string | null
  score: ScoreSnapshot | null
  supersedesId: string | null
  createdAt: string
  tombstonedAt: string | null
}

/** Fields common to every signed attestation payload. */
export type AttestationPayloadBase = {
  v: 1
  workspace: string
  handle: string
  issuedAt: string
  score: ScoreSnapshot
}

export type AttestationPayload =
  | (AttestationPayloadBase & { kind: 'attendance'; mode: 'full' })
  | (AttestationPayloadBase & {
      kind: 'attendance'
      mode: 'range'
      from: string
      to: string
    })
  | (AttestationPayloadBase & {
      kind: 'record'
      commit: string
      seq: number
      approvals: Array<{
        doc: string
        root: string
        leaves: LeafSet
        witness: Witness
      }>
    })
  | (AttestationPayloadBase & {
      kind: 'disclosure'
      /** SHA-512 of the canonical public profile fields. */
      public: string
      /** SHA-512 of the canonical viewer profile fields. */
      viewer: string
    })
  | ConfirmationPayload

/**
 * A confirmation carries no score: it is the organiser's statement, not
 * the participant's. `attestation` names the confirmed attendance
 * attestation by id and payload hash; `mode` says whether the service
 * wrote it automatically or the organiser confirmed by hand.
 */
export type ConfirmationPayload = {
  v: 1
  kind: 'confirmed'
  workspace: string
  handle: string
  issuedAt: string
  attestation: { id: string; hash: string }
  mode: ConfirmationMode
  confirmer: ConfirmerRef
}

/**
 * What a participant disclosed at a level. `displayName` and
 * `affiliation` are self-declared; `identifiers` are Cubid-verified
 * identifiers (email, phone, name, social accounts) the participant chose
 * to disclose, synced from Cubid at disclosure time. Nothing else is ever
 * disclosed.
 */
export type ProfileFields = {
  displayName?: string
  affiliation?: string
  identifiers?: Array<DisclosedIdentifier>
}

export type DisclosedIdentifier = {
  /** `email`, `phone`, `name`, or a social account kind (`github`, ...). */
  kind: string
  value: string
  status: 'verified'
  verifiedBy: 'cubid'
  /** When the identifier was last read from Cubid. */
  syncedAt: string
}

export type WorkspaceDetail = {
  workspace: Workspace
  level: AccessLevel
  /** Documents at the head commit. */
  records: Array<RecordSummary>
  head: CommitSummary | null
  commits: Array<CommitSummary>
  participants: Array<Participant>
  invitations: Array<Invitation>
  attestations: Array<Attestation>
}

export type WorkspaceGlimpse = {
  workspace: Pick<Workspace, 'id' | 'title' | 'visibility' | 'status'>
  level: AccessLevel
}

export type VisibilityResult = {
  workspace: Workspace
  /** Present when a link token was first created; shown once. */
  linkToken: string | null
}

export type VerificationParticipant = {
  id: string
  handle: string
  joinedAt: string
  withdrawn: boolean
  keyId: string | null
  publicKeyHex: string | null
  score: ScoreSnapshot | null
  attendance: Attestation | null
  /** The organiser's confirmation of the current attendance, or null. */
  confirmation: {
    attestation: Attestation
    mode: ConfirmationMode | null
    confirmer: ConfirmerRef | null
  } | null
  approval: ParticipantApproval | null
  profile: ProfileFields
  profileUpdatedAt: string | null
}

export type ParticipantApproval = {
  attestation: Attestation
  commitId: string
  commitHashHex: string
  commitSeq: number
  /** False when later commits exist that this participant has not approved. */
  current: boolean
  documents: Array<{ documentId: string; leaves: LeafSet; witness: Witness }>
}

export type VerificationCommit = {
  id: string
  seq: number
  hashHex: string
  parentHashHex: string | null
  kind: CommitKind
  author: CommitAuthor
  message: string
  committedAt: string
  tree: Array<TreeEntry>
}

export type VerificationDocument = RecordSummary & {
  contentVisible: boolean
  approvals: Array<{ handle: string; leaves: LeafSet; witness: Witness }>
  /** Recomputed by the server; recompute it yourself with `gradeDocument()`. */
  grade: GradeResult
}

export type VerificationPage = {
  level: AccessLevel
  workspace: Pick<
    Workspace,
    | 'id'
    | 'title'
    | 'description'
    | 'purpose'
    | 'scheduledStart'
    | 'actualStart'
    | 'durationMinutes'
    | 'timezone'
    | 'visibility'
    | 'status'
    | 'publicSlug'
    | 'minScore'
    | 'createdAt'
  >
  participants: Array<VerificationParticipant>
  withdrawnCount: number
  /** Attested, attested and confirmed, and confirmed by hand. */
  counts: { attested: number; confirmed: number; confirmedManually: number }
  head: VerificationCommit | null
  commits: Array<VerificationCommit>
  /** Documents at the head commit. */
  documents: Array<VerificationDocument>
  anchoring: {
    anchored: number
    pending: number
    items: Array<{
      itemKind: 'attestation' | 'record' | 'commit'
      itemId: string
      batchId: string
      status: BatchStatus
    }>
  }
  proves: Array<string>
  doesNotProve: Array<string>
}

export type ReceiptResponse =
  | { receipt: null; verdict: 'pending' }
  | { receipt: Receipt; verdict: ReceiptVerdict; inclusion: boolean }

export type Batch = {
  id: string
  createdAt: string
  rootHex: string
  leafCount: number
  ledgerKind: string
  calendarUrl: string | null
  status: BatchStatus
  submittedAt: string | null
  confirmedAt: string | null
  error: string | null
  serviceSignatureB64: string | null
  serviceKeyId: string | null
}

export type BatchList = {
  serviceKey: { keyId: string; publicKeyHex: string }
  items: Array<Batch>
}

export type Account = {
  id: string
  isOwner: boolean
  isAdmin: boolean
  createdAt: string
  lastSeenAt: string
  hasCubidUserId: boolean
}

export type Connection = {
  id: string
  integratorId: string
  integratorName: string
  scopes: Array<string>
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export type Me =
  | { authenticated: false }
  | { authenticated: true; credential: 'job' }
  | {
      authenticated: true
      credential: 'api_key' | 'consent'
      integratorId: string
    }
  | {
      authenticated: true
      credential: 'session'
      account: Account
      owned: Array<Workspace>
      participating: Array<
        Workspace & { participantId: string; handleNumber: number }
      >
      connections: Array<Connection>
    }

export type ConsentScope =
  | 'workspaces:read'
  | 'workspaces:write'
  | 'invitations:write'
  /** Read the workspaces the consenting account attested in (integrators
   * such as VerifyMyResearch showing a participant their studies). */
  | 'participant:read'

/** `POST /workspaces/aggregate`: counts across workspaces the caller owns. */
/**
 * How an integrator counts confirmations: `automatic-accepted` (default)
 * counts automatic and manual confirmations; `manual-required` counts only
 * those the organiser made by hand.
 */
export type ConfirmationCount = 'automatic-accepted' | 'manual-required'

export type ConfirmationView = {
  participantId: string
  handle: string
  attendance: { id: string; createdAt: string } | null
  confirmation: {
    id: string
    mode: ConfirmationMode | null
    confirmer: ConfirmerRef | null
    createdAt: string
    current: boolean
  } | null
}

export type ConfirmInput = {
  /** Specific participants; omitted means everyone who attested. */
  participants?: Array<string>
  /** Only attendance attestations made inside this window. */
  within?: { from?: string; to?: string }
  /** List what would be confirmed without writing anything. */
  preview?: boolean
}

export type ConfirmResult = {
  preview: boolean
  toConfirm: Array<{
    participantId: string
    handle: string
    attestationId: string
    attestedAt: string
  }>
  alreadyConfirmed: Array<{ participantId: string; handle: string }>
  notAttested: Array<{ participantId: string; handle: string }>
  created: Array<Attestation>
}

export type WorkspaceAggregate = {
  /** Workspace ids that were counted. */
  workspaces: Array<string>
  /** Ids the caller may not read; they are left out of the counts. */
  unavailable: Array<string>
  /** Distinct humans (internal participant identity) across the set. */
  distinctParticipants: number
  /** Lowest attested score snapshot across the set, if any. */
  lowestScore: number | null
  withdrawals: number
  attendanceAttestations: number
  /** Attending participants whose current attendance carries a confirmation. */
  confirmedAttendance: number
  /** Which confirmations counted, as requested. */
  confirmation: ConfirmationCount
  recordApprovals: number
}

/** `GET /me/workspaces` under `participant:read`: the caller's participation. */
export type Participation = {
  workspace: Pick<
    Workspace,
    | 'id'
    | 'title'
    | 'scheduledStart'
    | 'actualStart'
    | 'durationMinutes'
    | 'timezone'
    | 'status'
    | 'visibility'
  >
  participantId: string
  handleNumber: number
  handle: string
  joinedAt: string
  attendance: boolean
  approval: boolean
}

export type TokenResponse = {
  access_token: string
  token_type: 'Bearer'
  scope: string
}

export type ListResponse<T> = { items: Array<T> }

/**
 * An unsigned IETF vCon (draft-ietf-vcon-vcon-core-05) as the API serves
 * it. The SDK carries no vCon types of its own: `@proofofmeet/vcon`
 * depends on this package and types, validates and verifies the document.
 */
export type VconDocument = Record<string, unknown>

/** A signed vCon: JWS General JSON Serialization (RFC 7515 section 7.2.1). */
export type SignedVconDocument = {
  payload: string
  signatures: Array<{
    protected: string
    header?: Record<string, unknown>
    signature: string
  }>
}

/**
 * Forms of a vCon export, each with its media type: `signed`
 * (`application/jose+json`, the default), `unsigned`
 * (`application/vcon+json`), and `gzip` (`application/gzip` of the signed
 * JSON).
 */
export type VconForm = 'signed' | 'unsigned' | 'gzip'

export type VconExportResult<F extends VconForm> = F extends 'gzip'
  ? Uint8Array
  : F extends 'unsigned'
    ? VconDocument
    : SignedVconDocument

/** `POST /vcon/import`: a vCon (signed or unsigned) or an email thread. */
export type VconImportInput =
  | {
      vcon: VconDocument | SignedVconDocument
      /** Commit onto this workspace instead of creating one. */
      workspaceId?: string
      message?: string
    }
  | {
      /** One RFC 5322 message (`.eml`) or, with `mbox`, a thread (mbox). */
      email: string | Uint8Array
      mbox?: boolean
      workspaceId?: string
      message?: string
    }

export type VconImportResult = {
  workspace: Workspace
  commit: CommitSummary
  imported: {
    parties: number
    documents: number
    /** `verified` when the document was a JWS signed by a known key. */
    signature: 'verified' | 'unverified' | 'none'
  }
}

/** One service public key as served in the JWK Set. */
export type Jwk = {
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
  kid: string
  use: 'sig'
  alg: 'EdDSA'
}

/** `GET /.well-known/jwks.json`: the current service key and retired keys. */
export type Jwks = { keys: Array<Jwk> }

export type AnchorItemKind = 'attestation' | 'commit'

export type { Receipt, ReceiptVerdict }
