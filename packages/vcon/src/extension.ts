/**
 * The `proofofmeet` vCon extension (protocol spec section 14): a
 * Compatible extension that adds no parameters. Every ProofOfMeetProtocol
 * object travels as an Attachment Object with a `purpose` from the fixed
 * set below, an inline JSON body (`encoding: "json"`), and a media type
 * `application/vnd.proofofmeet.<kind>+json`. A reader that does not
 * know the extension sees ordinary attachments and a valid conversation;
 * the token is listed in `extensions`, never in `critical`.
 */
import type {
  AttestationKind,
  AttestationPayload,
  CommitBody,
  DocumentKind,
  ContentVisibility,
  LeafSet,
  Provenance,
  Receipt,
  ScoreSnapshot,
  Witness,
} from '@proofofmeet/sdk'

import type { Attachment, DateString, Vcon } from './types.js'

export const POMP_EXTENSION = 'proofofmeet'

/** Version of the mapping (spec section 15) an export was rendered with. */
export const POMP_MAPPING_VERSION = 1 as const

export const pompKinds = [
  'attestation',
  'provenance',
  'commitment',
  'receipt',
  'consent',
  'identity',
] as const
export type PompKind = (typeof pompKinds)[number]

export type PompPurpose = `proofofmeet/${PompKind}`
export type PompMediatype = `application/vnd.proofofmeet.${PompKind}+json`

export const pompPurposes: Record<PompKind, PompPurpose> = {
  attestation: 'proofofmeet/attestation',
  provenance: 'proofofmeet/provenance',
  commitment: 'proofofmeet/commitment',
  receipt: 'proofofmeet/receipt',
  consent: 'proofofmeet/consent',
  identity: 'proofofmeet/identity',
}

export function pompMediatype(kind: PompKind): PompMediatype {
  return `application/vnd.proofofmeet.${kind}+json`
}

/** Where a POMP document landed in the vCon. */
export type EntryLocator = {
  array: 'dialog' | 'analysis' | 'attachments'
  index: number
}

/** `proofofmeet/attestation`: one signed attestation (spec section 6). */
export type AttestationRecord = {
  v: 1
  id: string
  kind: AttestationKind
  /** The signed payload; `null` for a tombstone. */
  payload: AttestationPayload | null
  payloadHashHex: string | null
  signatureB64: string | null
  keyId: string | null
  /** Raw Ed25519 public key, hex, so the attachment verifies on its own. */
  publicKeyHex: string | null
  score: ScoreSnapshot | null
  supersedesId: string | null
  createdAt: DateString
  tombstonedAt: DateString | null
}

export type WitnessStatement = {
  handle: string
  witness: Witness
  leaves: LeafSet
}

/** `proofofmeet/provenance`: a document's declaration and statements. */
export type ProvenanceRecord = {
  v: 1
  /** POMP document id (stable across versions). */
  doc: string
  label: string
  kind: DocumentKind
  contentVisibility: ContentVisibility
  /** Where the document's content sits in this vCon; null when absent. */
  entry: EntryLocator | null
  provenance: Provenance
  witnesses: Array<WitnessStatement>
}

/**
 * `proofofmeet/commitment`: the commit this vCon renders (spec
 * section 12) with its tree of Merkle roots, and optionally the leaf
 * hashes per document so a reader can check segments.
 */
export type CommitmentRecord = {
  v: 1
  hashHex: string
  body: CommitBody
  leaves?: Record<string, Array<string>>
}

/** `proofofmeet/receipt`: an anchoring receipt (spec section 9). */
export type ReceiptRecord = Receipt

export type ConsentEntry = {
  /** What was disclosed or granted, e.g. `profile:public`, `workspaces:read`. */
  scope: string
  /** Whom it was disclosed to: `public`, `viewer`, `owner`, or an integrator id. */
  to: string
  at: DateString
  /** Fields or identifier kinds covered, when the scope is a profile level. */
  fields?: Array<string>
}

/** `proofofmeet/consent`: what a participant disclosed, when, to whom. */
export type ConsentRecord = {
  v: 1
  handle: string
  entries: Array<ConsentEntry>
}

export type IdentifierStatus = 'verified' | 'unverified' | 'revoked'

export type VerifiedIdentifier = {
  /** `email`, `phone`, `name`, or a social account kind (`github`, ...). */
  kind: string
  value: string
  verifiedBy: 'cubid'
  verifiedAt?: DateString
  status: IdentifierStatus
}

/**
 * `proofofmeet/identity`: the identifiers a participant disclosed at
 * this level, each verified by Cubid, plus any self-declared labels.
 */
export type IdentityRecord = {
  v: 1
  handle: string
  identifiers: Array<VerifiedIdentifier>
  /** Self-declared, never verified. */
  displayName?: string
  affiliation?: string
}

export type PompPayloadByKind = {
  attestation: AttestationRecord
  provenance: ProvenanceRecord
  commitment: CommitmentRecord
  receipt: ReceiptRecord
  consent: ConsentRecord
  identity: IdentityRecord
}

export function isVmmPurpose(value: unknown): value is PompPurpose {
  return (
    typeof value === 'string' &&
    (Object.values(pompPurposes) as Array<string>).includes(value)
  )
}

export function kindOfPurpose(purpose: PompPurpose): PompKind {
  return purpose.slice('proofofmeet/'.length) as PompKind
}

/** True when the attachment carries a ProofOfMeetProtocol object. */
export function isVmmAttachment(
  attachment: Attachment,
): attachment is Attachment & { purpose: PompPurpose } {
  return isVmmPurpose(attachment.purpose)
}

export type PompAttachmentPlacement = {
  start: DateString
  party: number
  dialog?: number
  session?: number | Array<number>
}

/** Build the attachment for one POMP object. */
export function pompAttachment<K extends PompKind>(
  kind: K,
  payload: PompPayloadByKind[K],
  placement: PompAttachmentPlacement,
): Attachment & { purpose: PompPurpose } {
  const attachment: Attachment & { purpose: PompPurpose } = {
    purpose: pompPurposes[kind],
    start: placement.start,
    party: placement.party,
    mediatype: pompMediatype(kind),
    encoding: 'json',
    body: payload,
  }
  if (placement.dialog !== undefined) attachment.dialog = placement.dialog
  else attachment.session = placement.session ?? 0
  return attachment
}

export type PompAttachmentMatch<K extends PompKind> = {
  index: number
  attachment: Attachment & { purpose: PompPurpose }
  payload: PompPayloadByKind[K]
}

/** The inline JSON payload of a POMP attachment, or null when malformed. */
export function readVmmPayload<K extends PompKind>(
  attachment: Attachment,
  kind: K,
): PompPayloadByKind[K] | null {
  if (attachment.purpose !== pompPurposes[kind]) return null
  if (attachment.encoding === 'json') {
    return attachment.body && typeof attachment.body === 'object'
      ? (attachment.body as PompPayloadByKind[K])
      : null
  }
  if (attachment.encoding === 'none' && typeof attachment.body === 'string') {
    try {
      return JSON.parse(attachment.body) as PompPayloadByKind[K]
    } catch {
      return null
    }
  }
  return null
}

/** Every attachment of one POMP kind, in array order, with its payload. */
export function findVmmAttachments<K extends PompKind>(
  vcon: Pick<Vcon, 'attachments'>,
  kind: K,
): Array<PompAttachmentMatch<K>> {
  const out: Array<PompAttachmentMatch<K>> = []
  for (const [index, attachment] of (vcon.attachments ?? []).entries()) {
    if (!isVmmAttachment(attachment)) continue
    const payload = readVmmPayload(attachment, kind)
    if (payload) out.push({ index, attachment, payload })
  }
  return out
}

export const attestations = (vcon: Pick<Vcon, 'attachments'>) =>
  findVmmAttachments(vcon, 'attestation')
export const provenances = (vcon: Pick<Vcon, 'attachments'>) =>
  findVmmAttachments(vcon, 'provenance')
export const commitments = (vcon: Pick<Vcon, 'attachments'>) =>
  findVmmAttachments(vcon, 'commitment')
export const receipts = (vcon: Pick<Vcon, 'attachments'>) =>
  findVmmAttachments(vcon, 'receipt')
export const consents = (vcon: Pick<Vcon, 'attachments'>) =>
  findVmmAttachments(vcon, 'consent')
export const identities = (vcon: Pick<Vcon, 'attachments'>) =>
  findVmmAttachments(vcon, 'identity')

/** True when the vCon declares the extension in `extensions`. */
export function usesVmmExtension(vcon: Pick<Vcon, 'extensions'>): boolean {
  return (vcon.extensions ?? []).includes(POMP_EXTENSION)
}
