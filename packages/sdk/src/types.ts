/**
 * Request and response shapes of the VerifyMyMeeting REST API, version 1.
 * Hand-written against the server's domain modules; `spec/openapi.yaml` is
 * the published contract.
 */
import type { JsonValue } from './proofs/canonicalize'
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

export type RecordSummary = {
  id: string
  workspaceId: string
  kind: RecordKind
  label: string
  url: string | null
  hashHex: string | null
  contentBytes: number
  segmentationVersion: string | null
  leafCount: number
  rootHex: string
  version: number
  supersedesRecordId: string | null
  contentVisibility: ContentVisibility
  locked: boolean
  createdAt: string
}

export type RecordInput =
  | {
      kind: 'link'
      url: string
      label?: string
      hashHex?: string
      contentVisibility?: ContentVisibility
      supersedesRecordId?: string
    }
  | {
      kind: 'hash'
      label: string
      hashHex: string
      contentVisibility?: ContentVisibility
      supersedesRecordId?: string
    }
  | {
      kind: 'text'
      text: string
      label?: string
      contentVisibility?: ContentVisibility
      supersedesRecordId?: string
    }

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
  recordId: string | null
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
      record: string
      root: string
      leaves: 'all' | Array<[number, number]>
    })
  | (AttestationPayloadBase & {
      kind: 'disclosure'
      /** SHA-256 of the sealed public profile. */
      public: string
      /** SHA-256 of the sealed viewer profile. */
      viewer: string
    })

export type ProfileFields = {
  displayName?: string
  affiliation?: string
  contact?: string
  linkIdentity?: boolean
}

export type WorkspaceDetail = {
  workspace: Workspace
  level: AccessLevel
  records: Array<RecordSummary>
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
  approvals: Array<{ recordId: string; attestation: Attestation }>
  profile: ProfileFields
  profileUpdatedAt: string | null
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
  records: Array<
    RecordSummary & { contentVisible: boolean; approvedBy: Array<string> }
  >
  anchoring: {
    anchored: number
    pending: number
    items: Array<{
      itemKind: 'attestation' | 'record'
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
  'workspaces:read' | 'workspaces:write' | 'invitations:write'

export type TokenResponse = {
  access_token: string
  token_type: 'Bearer'
  scope: string
}

export type ListResponse<T> = { items: Array<T> }

export type { Receipt, ReceiptVerdict }
