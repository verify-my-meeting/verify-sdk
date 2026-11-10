/**
 * The `verifymymeeting` vCon extension (protocol spec section 14): a
 * Compatible extension that adds no parameters. Every VerifyMyMeeting
 * object travels as an Attachment Object with a `purpose` from the fixed
 * set below, an inline JSON body (`encoding: "json"`), and a media type
 * `application/vnd.verifymymeeting.<kind>+json`. A reader that does not
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
} from '@verifymymeeting/sdk'

import type { Attachment, DateString, Vcon } from './types.js'

export const VMM_EXTENSION = 'verifymymeeting'

/** Version of the mapping (spec section 15) an export was rendered with. */
export const VMM_MAPPING_VERSION = 1 as const

export const vmmKinds = [
  'attestation',
  'provenance',
  'commitment',
  'receipt',
  'consent',
  'identity',
] as const
export type VmmKind = (typeof vmmKinds)[number]

export type VmmPurpose = `verifymymeeting/${VmmKind}`
export type VmmMediatype = `application/vnd.verifymymeeting.${VmmKind}+json`

export const vmmPurposes: Record<VmmKind, VmmPurpose> = {
  attestation: 'verifymymeeting/attestation',
  provenance: 'verifymymeeting/provenance',
  commitment: 'verifymymeeting/commitment',
  receipt: 'verifymymeeting/receipt',
  consent: 'verifymymeeting/consent',
  identity: 'verifymymeeting/identity',
}

export function vmmMediatype(kind: VmmKind): VmmMediatype {
  return `application/vnd.verifymymeeting.${kind}+json`
}

/** Where a VMM document landed in the vCon. */
export type EntryLocator = {
  array: 'dialog' | 'analysis' | 'attachments'
  index: number
}

/** `verifymymeeting/attestation`: one signed attestation (spec section 6). */
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

/** `verifymymeeting/provenance`: a document's declaration and statements. */
export type ProvenanceRecord = {
  v: 1
  /** VMM document id (stable across versions). */
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
 * `verifymymeeting/commitment`: the commit this vCon renders (spec
 * section 12) with its tree of Merkle roots, and optionally the leaf
 * hashes per document so a reader can check segments.
 */
export type CommitmentRecord = {
  v: 1
  hashHex: string
  body: CommitBody
  leaves?: Record<string, Array<string>>
}

/** `verifymymeeting/receipt`: an anchoring receipt (spec section 9). */
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

/** `verifymymeeting/consent`: what a participant disclosed, when, to whom. */
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
 * `verifymymeeting/identity`: the identifiers a participant disclosed at
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

export type VmmPayloadByKind = {
  attestation: AttestationRecord
  provenance: ProvenanceRecord
  commitment: CommitmentRecord
  receipt: ReceiptRecord
  consent: ConsentRecord
  identity: IdentityRecord
}

export function isVmmPurpose(value: unknown): value is VmmPurpose {
  return (
    typeof value === 'string' &&
    (Object.values(vmmPurposes) as Array<string>).includes(value)
  )
}

export function kindOfPurpose(purpose: VmmPurpose): VmmKind {
  return purpose.slice('verifymymeeting/'.length) as VmmKind
}

/** True when the attachment carries a VerifyMyMeeting object. */
export function isVmmAttachment(
  attachment: Attachment,
): attachment is Attachment & { purpose: VmmPurpose } {
  return isVmmPurpose(attachment.purpose)
}

export type VmmAttachmentPlacement = {
  start: DateString
  party: number
  dialog?: number
  session?: number | Array<number>
}

/** Build the attachment for one VMM object. */
export function vmmAttachment<K extends VmmKind>(
  kind: K,
  payload: VmmPayloadByKind[K],
  placement: VmmAttachmentPlacement,
): Attachment & { purpose: VmmPurpose } {
  const attachment: Attachment & { purpose: VmmPurpose } = {
    purpose: vmmPurposes[kind],
    start: placement.start,
    party: placement.party,
    mediatype: vmmMediatype(kind),
    encoding: 'json',
    body: payload,
  }
  if (placement.dialog !== undefined) attachment.dialog = placement.dialog
  else attachment.session = placement.session ?? 0
  return attachment
}

export type VmmAttachmentMatch<K extends VmmKind> = {
  index: number
  attachment: Attachment & { purpose: VmmPurpose }
  payload: VmmPayloadByKind[K]
}

/** The inline JSON payload of a VMM attachment, or null when malformed. */
export function readVmmPayload<K extends VmmKind>(
  attachment: Attachment,
  kind: K,
): VmmPayloadByKind[K] | null {
  if (attachment.purpose !== vmmPurposes[kind]) return null
  if (attachment.encoding === 'json') {
    return attachment.body && typeof attachment.body === 'object'
      ? (attachment.body as VmmPayloadByKind[K])
      : null
  }
  if (attachment.encoding === 'none' && typeof attachment.body === 'string') {
    try {
      return JSON.parse(attachment.body) as VmmPayloadByKind[K]
    } catch {
      return null
    }
  }
  return null
}

/** Every attachment of one VMM kind, in array order, with its payload. */
export function findVmmAttachments<K extends VmmKind>(
  vcon: Pick<Vcon, 'attachments'>,
  kind: K,
): Array<VmmAttachmentMatch<K>> {
  const out: Array<VmmAttachmentMatch<K>> = []
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
  return (vcon.extensions ?? []).includes(VMM_EXTENSION)
}
