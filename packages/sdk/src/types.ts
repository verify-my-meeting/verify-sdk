/**
 * Request and response shapes of the VerifyMyMeeting REST API, version 1.
 * Hand-written against the server's domain modules; `spec/openapi.yaml` is
 * the published contract.
 */
import type { JsonValue } from './proofs/canonicalize'
import type {
  CommitAuthor,
  CommitBody,
  CommitKind,
  Provenance,
  TreeEntry,
} from './proofs/commit'
import type { GradeResult, Witness } from './proofs/grade'
import type { Receipt, ReceiptVerdict } from './proofs/receipt'

export type Visibility = 'private' | 'link' | 'public'
export type WorkspaceStatus = 'draft' | 'open' | 'closed'
export type AccessLevel = 'none' | 'public' | 'link' | 'viewer' | 'owner'
export type RecordKind = 'link' | 'hash' | 'text'
export type ContentVisibility = 'public' | 'link' | 'viewer'
export type InvitationKind = 'slot' | 'open' | 'viewer'
export type AttestationKind = 'attendance' | 'record' | 'disclosure'
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
  createdAt: string
  updatedAt: string
}

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
 * it. The SDK carries no vCon types of its own: `@verifymymeeting/vcon`
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
