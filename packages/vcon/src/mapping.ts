/**
 * `vmm-vcon-mapping` version 1 (protocol spec section 15): the
 * deterministic projection of one VerifyMyMeeting commit onto a vCon at a
 * viewer level (`toVcon`), the level redaction of an owner-level document
 * (`redactVcon`), and the import plan a vCon yields (`fromVcon`).
 *
 * The input is a plain data bundle the VMM server (or any holder of the
 * verification JSON) assembles; nothing here reaches the network. The
 * same input renders byte-identical JSON: arrays are sorted here, object
 * keys are written in a fixed order, and the uuid is a version 5 UUID of
 * the commit hash.
 */
import { normalizeTree, provenanceTypes, utf8 } from '@verifymymeeting/sdk'
import type {
  Attestation,
  CommitAuthor,
  CommitBody,
  CommitKind,
  ContentVisibility,
  Creator,
  DocumentInput,
  DocumentKind,
  HashAlg,
  Provenance,
  ProvenanceType,
  Receipt,
  TreeEntry,
} from '@verifymymeeting/sdk'

import {
  attestations as findAttestations,
  commitments as findCommitments,
  provenances as findProvenances,
  VMM_EXTENSION,
  VMM_MAPPING_VERSION,
  vmmAttachment,
  isVmmAttachment,
} from './extension.js'
import type {
  AttestationRecord,
  CommitmentRecord,
  ConsentEntry,
  EntryLocator,
  IdentityRecord,
  ProvenanceRecord,
  VerifiedIdentifier,
  WitnessStatement,
} from './extension.js'
import {
  contentHash,
  contentHashFromDigest,
  preferredContentHash,
} from './hash.js'
import type {
  Analysis,
  Attachment,
  ContentHash,
  ContentHashes,
  Dialog,
  Event,
  Party,
  RedactedString,
  Session,
  Vcon,
} from './types.js'
import { VCON_VERSION } from './types.js'
import { uuidv5, VMM_VCON_NAMESPACE, vmmVconUuid } from './uuid.js'
import { assertKnownCritical } from './validate.js'

export type ExportLevel = 'owner' | 'viewer' | 'link' | 'public'

/** Party `uuid` of the workspace owner and of the service. */
export const OWNER_PARTY_UUID = 'owner'
export const SERVICE_PARTY_UUID = 'verifymymeeting.com'
export const SERVICE_PARTY_NAME = 'VerifyMyMeeting'
/** `validation` token on every party VerifyMyMeeting vouches for. */
export const VMM_VALIDATION = 'verifymymeeting'
/** Media type of a hash-less link document, carried inline as its URL. */
export const URI_LIST_MEDIATYPE = 'text/uri-list'

/** What a participant disclosed at the rendered level. */
export type DisclosedProfile = {
  /** Self-declared, unverified. */
  displayName?: string
  affiliation?: string
  /** Cubid-verified identifiers the participant chose to disclose. */
  identifiers?: Array<VerifiedIdentifier>
}

export type ParticipantInput = {
  id: string
  handle: string
  joinedAt: string
  withdrawnAt?: string | null
  keyId?: string | null
  publicKeyHex?: string | null
  /** The profile for the chosen level, already filtered by the server. */
  profile?: DisclosedProfile | null
}

export type RecordInput = {
  /** Record (version) id. */
  id?: string
  documentId: string
  kind: DocumentKind
  label: string
  url?: string | null
  /** Owner-supplied digest, hex, for `link` and `hash` records. */
  hashHex?: string | null
  hashAlg?: HashAlg | null
  /** Inline text of a `text` record, when disclosed and small enough. */
  text?: string | null
  /** SHA-512 (hex) of the text bytes when `text` is not inlined. */
  contentHashHex?: string | null
  mediatype?: string | null
  filename?: string | null
  contentVisibility: ContentVisibility
  /** Merkle leaf hashes (hex) for the commitment attachment, optional. */
  leafHashes?: Array<string> | null
  /** Software that produced an AI document; rendered on `analysis`. */
  tool?: { vendor: string; product?: string; schema?: string } | null
  createdAt?: string | null
}

export type CommitInput = {
  id?: string
  hashHex: string
  seq: number
  parentHashHex: string | null
  kind: CommitKind
  author: CommitAuthor
  message: string
  committedAt: string
  tree: Array<TreeEntry>
}

export type AttestationInput = Attestation & {
  /** Raw Ed25519 public key, hex, of the signing participant key. */
  publicKeyHex?: string | null
}

export type ConsentInput = {
  participantId: string
  entries: Array<ConsentEntry>
}

export type WorkspaceInput = {
  id: string
  title: string
  description?: string | null
  scheduledStart?: string | null
  actualStart?: string | null
  durationMinutes?: number | null
  createdAt: string
}

export type OwnerInput = {
  name?: string | null
  org?: string | null
}

/** The data bundle `toVcon` renders. */
export type VmmExportInput = {
  workspace: WorkspaceInput
  owner?: OwnerInput | null
  participants: Array<ParticipantInput>
  /** The chain in order, seq 1..n. */
  commits: Array<CommitInput>
  /** The record version of each document at the rendered commit. */
  records: Record<string, RecordInput>
  attestations: Array<AttestationInput>
  receipts: Array<Receipt>
  consents: Array<ConsentInput>
  /** Service signing key id (receipts and the JWS `kid`). */
  serviceKeyId: string
  /** `updated_at`: when this document was rendered. */
  renderedAt: string
}

export type ToVconOptions = {
  level: ExportLevel
  /** Defaults to the last commit. */
  commitSeq?: number
  /** Base of the access-controlled content endpoint for `url` entries. */
  contentBaseUrl: string
  mappingVersion: typeof VMM_MAPPING_VERSION
  /** Owner level: where the previous commit's signed document is. */
  previous?: { url?: string; content_hash?: ContentHashes } | null
  /** Lower levels: where this commit's owner-level document is. */
  source?: { url?: string; content_hash?: ContentHashes } | null
}

export class MappingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MappingError'
  }
}

const levelRank: Record<ExportLevel, number> = {
  public: 0,
  link: 1,
  viewer: 2,
  owner: 3,
}
const visibilityRank: Record<ContentVisibility, number> = {
  public: 0,
  link: 1,
  viewer: 2,
}

/** True when content with `visibility` is shown at `level`. */
export function disclosedAt(
  visibility: ContentVisibility,
  level: ExportLevel,
): boolean {
  return visibilityRank[visibility] <= levelRank[level]
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function omitUndefined<T extends object>(value: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item
  }
  return out as T
}

function contentUrl(base: string, documentId: string): string {
  return `${base.replace(/\/+$/u, '')}/${encodeURIComponent(documentId)}`
}

/** Where one document goes: the vCon array and the entry type. */
export type Placement =
  | { array: 'dialog'; type: 'text' | 'recording' }
  | { array: 'analysis'; type: 'transcript' | 'summary' }
  | { array: 'attachments'; purpose: ProvenanceType }

export function placementOf(provenance: Provenance): Placement {
  if (provenance.type === 'transcript') return { array: 'dialog', type: 'text' }
  if (provenance.type === 'recording') {
    return { array: 'dialog', type: 'recording' }
  }
  if (
    (provenance.type === 'minutes' || provenance.type === 'notes') &&
    provenance.ai !== 'none'
  ) {
    return {
      array: 'analysis',
      type: provenance.aiRole === 'verbatim' ? 'transcript' : 'summary',
    }
  }
  return { array: 'attachments', purpose: provenance.type }
}

type Content = {
  body?: string
  encoding?: 'none'
  url?: string
  content_hash?: ContentHash
  mediatype?: string
  filename?: string
}

/** Content parameters of one record at one level (spec section 15). */
async function contentOf(
  record: RecordInput,
  level: ExportLevel,
  contentBaseUrl: string,
): Promise<Content> {
  const disclosed = disclosedAt(record.contentVisibility, level)
  const out: Content = {}
  if (record.kind === 'text') {
    let hash: ContentHash | undefined
    if (typeof record.text === 'string') {
      hash = await contentHash(utf8(record.text))
    } else if (record.contentHashHex) {
      hash = contentHashFromDigest(record.contentHashHex, 'sha512')
    }
    if (disclosed && typeof record.text === 'string') {
      out.body = record.text
      out.encoding = 'none'
      out.mediatype = record.mediatype ?? 'text/plain'
    } else if (disclosed && hash) {
      out.url = contentUrl(contentBaseUrl, record.documentId)
      out.mediatype = record.mediatype ?? 'text/plain'
    }
    if (hash) out.content_hash = hash
  } else if (record.kind === 'link') {
    if (!record.url)
      throw new MappingError(`Link ${record.documentId} has no url.`)
    if (record.hashHex) {
      out.content_hash = contentHashFromDigest(
        record.hashHex,
        record.hashAlg ?? 'sha512',
      )
      if (disclosed) {
        out.url = record.url
        if (record.mediatype) out.mediatype = record.mediatype
      }
    } else if (disclosed) {
      out.body = record.url
      out.encoding = 'none'
      out.mediatype = URI_LIST_MEDIATYPE
    } else {
      out.content_hash = await contentHash(utf8(record.url))
    }
  } else {
    if (!record.hashHex)
      throw new MappingError(`Hash ${record.documentId} has no digest.`)
    out.content_hash = contentHashFromDigest(
      record.hashHex,
      record.hashAlg ?? 'sha512',
    )
  }
  if (disclosed && record.filename) out.filename = record.filename
  return out
}

function partyOfParticipant(participant: ParticipantInput): Party {
  const profile = participant.withdrawnAt ? null : participant.profile
  const identifiers = profile?.identifiers ?? []
  const verified = (kind: string) =>
    identifiers.find((item) => item.kind === kind && item.status === 'verified')
  const kycName = verified('name')
  const party: Party = {
    uuid: participant.handle,
    type: 'person',
    validation: VMM_VALIDATION,
    name: kycName?.value ?? profile?.displayName ?? 'anonymous',
  }
  const email = verified('email')
  if (email) party.mailto = email.value
  const phone = verified('phone')
  if (phone) party.tel = phone.value
  if (profile?.affiliation) party.org = profile.affiliation
  return party
}

function identityOf(participant: ParticipantInput): IdentityRecord | null {
  const profile = participant.withdrawnAt ? null : participant.profile
  if (!profile) return null
  const identifiers = [...(profile.identifiers ?? [])].sort(
    (a, b) => compare(a.kind, b.kind) || compare(a.value, b.value),
  )
  if (
    identifiers.length === 0 &&
    !profile.displayName &&
    !profile.affiliation
  ) {
    return null
  }
  const record: IdentityRecord = {
    v: 1,
    handle: participant.handle,
    identifiers: identifiers.map((item) =>
      omitUndefined({
        kind: item.kind,
        value: item.value,
        verifiedBy: 'cubid' as const,
        verifiedAt: item.verifiedAt,
        status: item.status,
      }),
    ),
  }
  if (profile.displayName) record.displayName = profile.displayName
  if (profile.affiliation) record.affiliation = profile.affiliation
  return record
}

function commitBodyOf(workspaceId: string, commit: CommitInput): CommitBody {
  return {
    v: 2,
    workspace: workspaceId,
    seq: commit.seq,
    parent: commit.parentHashHex ? commit.parentHashHex.toLowerCase() : null,
    kind: commit.kind,
    author: { role: commit.author.role, ref: commit.author.ref },
    time: commit.committedAt,
    message: commit.message,
    tree: normalizeTree(commit.tree),
  }
}

/** Render one commit of a workspace as an unsigned vCon. */
export async function toVcon(
  input: VmmExportInput,
  options: ToVconOptions,
): Promise<Vcon> {
  if (options.mappingVersion !== VMM_MAPPING_VERSION) {
    throw new MappingError(
      `Unsupported mapping version ${options.mappingVersion}.`,
    )
  }
  const { level } = options
  const commits = [...input.commits].sort((a, b) => a.seq - b.seq)
  const commit =
    options.commitSeq === undefined
      ? commits[commits.length - 1]
      : commits.find((item) => item.seq === options.commitSeq)
  if (!commit) throw new MappingError('No commit to render.')
  const history = commits.filter((item) => item.seq <= commit.seq)
  const workspace = input.workspace

  const participants = [...input.participants].sort(
    (a, b) => compare(a.handle, b.handle) || compare(a.id, b.id),
  )
  const parties: Array<Party> = []
  const ownerParty: Party = omitUndefined({
    uuid: OWNER_PARTY_UUID,
    type: 'person',
    validation: VMM_VALIDATION,
    name: input.owner?.name ?? undefined,
    org: input.owner?.org ?? undefined,
  })
  parties.push(ownerParty)
  const partyOf = new Map<string, number>()
  const handleOf = new Map<string, string>()
  for (const participant of participants) {
    partyOf.set(participant.id, parties.length)
    handleOf.set(participant.id, participant.handle)
    parties.push(partyOfParticipant(participant))
  }
  const serviceIndex = parties.length
  parties.push({
    uuid: SERVICE_PARTY_UUID,
    type: 'organization',
    name: SERVICE_PARTY_NAME,
    org: SERVICE_PARTY_NAME,
  })
  const participantIndices = participants.map(
    (p) => partyOf.get(p.id) as number,
  )

  const authorParty = (author: CommitAuthor): number => {
    if (author.role === 'participant' && author.ref) {
      const byId = partyOf.get(author.ref)
      if (byId !== undefined) return byId
      const byHandle = participants.find((p) => p.handle === author.ref)
      if (byHandle) return partyOf.get(byHandle.id) as number
    }
    return 0
  }
  const adderOf = (entry: TreeEntry): number => {
    for (const past of history) {
      const match = past.tree.find(
        (item) =>
          item.doc === entry.doc &&
          item.root.toLowerCase() === entry.root.toLowerCase(),
      )
      if (match) return authorParty(past.author)
    }
    return authorParty(commit.author)
  }

  const recordAttestations = input.attestations.filter(
    (item) =>
      item.kind === 'record' &&
      item.payload !== null &&
      typeof item.payload === 'object' &&
      !Array.isArray(item.payload) &&
      (item.payload as { commit?: unknown }).commit === commit.hashHex,
  )
  const includedAttestations = [...input.attestations]
    .filter(
      (item) =>
        item.kind !== 'record' ||
        item.payload === null ||
        recordAttestations.includes(item),
    )
    .sort((a, b) => compare(a.createdAt, b.createdAt) || compare(a.id, b.id))

  const witnessesOf = (doc: string): Array<WitnessStatement> => {
    const out: Array<WitnessStatement> = []
    for (const attestation of recordAttestations) {
      const payload = attestation.payload as {
        handle: string
        approvals?: Array<{
          doc: string
          leaves: WitnessStatement['leaves']
          witness: WitnessStatement['witness']
        }>
      }
      const approval = payload.approvals?.find((item) => item.doc === doc)
      if (approval) {
        out.push({
          handle: payload.handle,
          witness: approval.witness,
          leaves: approval.leaves,
        })
      }
    }
    return out.sort((a, b) => compare(a.handle, b.handle))
  }

  const tree = normalizeTree(commit.tree)
  const placements = tree.map((entry) => placementOf(entry.provenance))
  const dialogCount = placements.filter((p) => p.array === 'dialog').length
  const dialogIndices = Array.from({ length: dialogCount }, (_, i) => i)
  const dialog: Array<Dialog> = []
  const analysis: Array<Analysis> = []
  const attachments: Array<Attachment> = []
  const entries: Array<{
    entry: TreeEntry
    locator: EntryLocator
    party: number
    record: RecordInput
  }> = []

  for (const [i, entry] of tree.entries()) {
    const record = input.records[entry.doc]
    if (!record) throw new MappingError(`No record for document ${entry.doc}.`)
    const party = adderOf(entry)
    const content = await contentOf(record, level, options.contentBaseUrl)
    const placement = placements[i] as Placement
    const start = record.createdAt ?? commit.committedAt
    if (placement.array === 'dialog') {
      const item: Dialog = omitUndefined({
        type: placement.type,
        start,
        parties: participantIndices,
        mediatype: content.mediatype,
        filename: content.filename,
        body: content.body,
        encoding: content.encoding,
        url: content.url,
        content_hash: content.content_hash,
      })
      dialog.push(item)
      entries.push({
        entry,
        locator: { array: 'dialog', index: dialog.length - 1 },
        party,
        record,
      })
    } else if (placement.array === 'analysis') {
      const item: Analysis = omitUndefined({
        type: placement.type,
        dialog: dialogCount > 0 ? dialogIndices : undefined,
        sessions: dialogCount > 0 ? undefined : 0,
        mediatype: content.mediatype,
        filename: content.filename,
        vendor: record.tool?.vendor ?? 'unknown',
        product: record.tool?.product,
        schema: record.tool?.schema,
        body: content.body,
        encoding: content.encoding,
        url: content.url,
        content_hash: content.content_hash,
      })
      analysis.push(item)
      entries.push({
        entry,
        locator: { array: 'analysis', index: analysis.length - 1 },
        party,
        record,
      })
    } else {
      const item: Attachment = omitUndefined({
        purpose: placement.purpose,
        start,
        party,
        session: 0,
        mediatype: content.mediatype,
        filename: content.filename,
        body: content.body,
        encoding: content.encoding,
        url: content.url,
        content_hash: content.content_hash,
      })
      attachments.push(item)
      entries.push({
        entry,
        locator: { array: 'attachments', index: attachments.length - 1 },
        party,
        record,
      })
    }
  }

  const sessionStart =
    workspace.actualStart ?? workspace.scheduledStart ?? commit.committedAt
  const session: Session = omitUndefined({
    start: sessionStart,
    duration:
      typeof workspace.durationMinutes === 'number'
        ? workspace.durationMinutes * 60
        : undefined,
    parties: [0, ...participantIndices],
    dialog: dialog.length > 0 ? dialog.map((_, index) => index) : undefined,
  })

  // VMM attachments, in a fixed order: provenance per document, the
  // commitment, attestations, receipts, consents, identities.
  for (const { entry, locator, party, record } of entries) {
    const payload: ProvenanceRecord = {
      v: 1,
      doc: entry.doc,
      label: entry.label,
      kind: entry.kind,
      contentVisibility: record.contentVisibility,
      entry: locator,
      provenance: entry.provenance,
      witnesses: witnessesOf(entry.doc),
    }
    attachments.push(
      vmmAttachment('provenance', payload, {
        start: commit.committedAt,
        party,
        ...(locator.array === 'dialog'
          ? { dialog: locator.index }
          : { session: 0 }),
      }),
    )
  }

  const commitment: CommitmentRecord = {
    v: 1,
    hashHex: commit.hashHex.toLowerCase(),
    body: commitBodyOf(workspace.id, commit),
  }
  if (levelRank[level] >= levelRank.viewer) {
    const leaves: Record<string, Array<string>> = {}
    for (const entry of tree) {
      const record = input.records[entry.doc]
      if (record?.leafHashes?.length) leaves[entry.doc] = [...record.leafHashes]
    }
    if (Object.keys(leaves).length > 0) commitment.leaves = leaves
  }
  attachments.push(
    vmmAttachment('commitment', commitment, {
      start: commit.committedAt,
      party: authorParty(commit.author),
      session: 0,
    }),
  )

  for (const attestation of includedAttestations) {
    const party = partyOf.get(attestation.participantId)
    if (party === undefined) {
      throw new MappingError(
        `Attestation ${attestation.id} names an unknown participant.`,
      )
    }
    const payload: AttestationRecord = {
      v: 1,
      id: attestation.id,
      kind: attestation.kind,
      payload: attestation.payload as AttestationRecord['payload'],
      payloadHashHex: attestation.payloadHashHex,
      signatureB64: attestation.signatureB64,
      keyId: attestation.keyId,
      publicKeyHex: attestation.publicKeyHex ?? null,
      score: attestation.score,
      supersedesId: attestation.supersedesId,
      createdAt: attestation.createdAt,
      tombstonedAt: attestation.tombstonedAt,
    }
    attachments.push(
      vmmAttachment('attestation', payload, {
        start: attestation.createdAt,
        party,
        session: 0,
      }),
    )
  }

  const receipts = [...input.receipts].sort(
    (a, b) =>
      compare(a.item.kind, b.item.kind) ||
      compare(a.item.id, b.item.id) ||
      compare(a.batch, b.batch),
  )
  for (const receipt of receipts) {
    attachments.push(
      vmmAttachment('receipt', receipt, {
        start: receipt.ledger.submittedAt ?? input.renderedAt,
        party: serviceIndex,
        session: 0,
      }),
    )
  }

  if (levelRank[level] >= levelRank.viewer) {
    const consents = [...input.consents]
      .filter((item) => partyOf.has(item.participantId))
      .sort((a, b) =>
        compare(
          handleOf.get(a.participantId) as string,
          handleOf.get(b.participantId) as string,
        ),
      )
    for (const consent of consents) {
      const entriesSorted = [...consent.entries].sort(
        (a, b) =>
          compare(a.at, b.at) ||
          compare(a.scope, b.scope) ||
          compare(a.to, b.to),
      )
      const participant = participants.find(
        (p) => p.id === consent.participantId,
      ) as ParticipantInput
      attachments.push(
        vmmAttachment(
          'consent',
          { v: 1, handle: participant.handle, entries: entriesSorted },
          {
            start: entriesSorted[0]?.at ?? participant.joinedAt,
            party: partyOf.get(consent.participantId) as number,
            session: 0,
          },
        ),
      )
    }
  }

  for (const participant of participants) {
    const identity = identityOf(participant)
    if (!identity) continue
    attachments.push(
      vmmAttachment('identity', identity, {
        start: participant.joinedAt,
        party: partyOf.get(participant.id) as number,
        session: 0,
      }),
    )
  }

  const vcon: Vcon = {
    vcon: VCON_VERSION,
    uuid: await vmmVconUuid(commit.hashHex, level),
    extensions: [VMM_EXTENSION],
    created_at: commit.committedAt,
    updated_at: input.renderedAt,
    subject: workspace.title,
  }
  if (level !== 'owner') {
    // Lower levels are redactions of the owner-level document (spec 15),
    // which in turn carries the amendment chain.
    vcon.redacted_from = redactedFromOwner(
      await vmmVconUuid(commit.hashHex, 'owner'),
      level,
      options.source,
    )
  } else if (commit.parentHashHex) {
    const amended: NonNullable<Vcon['amended_from']> = {
      uuid: await vmmVconUuid(commit.parentHashHex, 'owner'),
    }
    if (options.previous?.url) amended.url = options.previous.url
    if (options.previous?.content_hash) {
      amended.content_hash = options.previous.content_hash
    }
    vcon.amended_from = amended
  }
  vcon.sessions = [session]
  vcon.parties = parties
  if (dialog.length > 0) vcon.dialog = dialog
  if (analysis.length > 0) vcon.analysis = analysis
  vcon.attachments = attachments
  return vcon
}

function redactedFromOwner(
  ownerUuid: string,
  level: Exclude<ExportLevel, 'owner'>,
  source: { url?: string; content_hash?: ContentHashes } | null | undefined,
): NonNullable<Vcon['redacted_from']> {
  const out: NonNullable<Vcon['redacted_from']> = {
    uuid: ownerUuid,
    type: levelRank[level] < levelRank.viewer ? 'CONTACT_INFO' : 'UNSPECIFIED',
  }
  if (source?.url) out.url = source.url
  if (source?.content_hash) out.content_hash = source.content_hash
  return out
}

export type RedactOptions = {
  /** What each handle still discloses at the target level. */
  disclosed?: Record<string, DisclosedProfile>
  /** Where the owner-level document is, for `redacted_from`. */
  source?: { url?: string; content_hash?: ContentHashes } | null
}

function isParticipantParty(party: Party): boolean {
  return (
    party.validation === VMM_VALIDATION &&
    party.type === 'person' &&
    party.uuid !== OWNER_PARTY_UUID
  )
}

/**
 * Derive the document for a lower level from the owner-level document,
 * by omission: parties collapse to `anonymous` (or what `disclosed` says),
 * undisclosed documents keep only their `content_hash`, identity and
 * consent attachments and leaf hashes are dropped. `redacted_strings` is
 * never used.
 */
export async function redactVcon(
  owner: Vcon,
  level: Exclude<ExportLevel, 'owner'>,
  options: RedactOptions = {},
): Promise<Vcon> {
  if ((level as string) === 'owner')
    throw new MappingError('Nothing to redact at owner level.')
  const out = JSON.parse(JSON.stringify(owner)) as Vcon
  const commitment = findCommitments(owner)[0]?.payload
  out.uuid = commitment
    ? await vmmVconUuid(commitment.hashHex, level)
    : await uuidv5(VMM_VCON_NAMESPACE, `${owner.uuid}:${level}`)
  delete out.amended_from
  const redactedFrom = redactedFromOwner(owner.uuid, level, options.source)
  // Key order: references come right after subject, as toVcon writes them.
  const {
    sessions,
    parties,
    events,
    dialog,
    analysis,
    attachments,
    redacted_strings,
    ...head
  } = out
  const ordered: Vcon = { ...head, redacted_from: redactedFrom }
  if (sessions) ordered.sessions = sessions
  if (parties) ordered.parties = parties
  if (events) ordered.events = events
  if (dialog) ordered.dialog = dialog
  if (analysis) ordered.analysis = analysis
  if (attachments) ordered.attachments = attachments
  if (redacted_strings) ordered.redacted_strings = redacted_strings

  const belowViewer = levelRank[level] < levelRank.viewer
  if (belowViewer) {
    ordered.parties = (ordered.parties ?? []).map((party) => {
      if (!isParticipantParty(party)) return party
      const profile = party.uuid ? options.disclosed?.[party.uuid] : undefined
      return partyOfParticipant({
        id: party.uuid as string,
        handle: party.uuid as string,
        joinedAt: '',
        profile: profile ?? null,
      })
    })
  }

  // Undisclosed documents lose their content.
  for (const { payload } of findProvenances(ordered)) {
    if (!payload.entry || disclosedAt(payload.contentVisibility, level))
      continue
    const list = ordered[payload.entry.array] as
      Array<Record<string, unknown>> | undefined
    const item = list?.[payload.entry.index]
    if (!item) continue
    const original = owner[payload.entry.array]?.[payload.entry.index]
    if (
      item.mediatype === URI_LIST_MEDIATYPE &&
      typeof original?.body === 'string'
    ) {
      // The URL was the content; its hash stands in for it.
      item.content_hash = await contentHash(utf8(original.body))
    }
    for (const key of ['body', 'encoding', 'url', 'filename', 'mediatype']) {
      delete item[key]
    }
  }

  if (belowViewer) {
    ordered.attachments = (ordered.attachments ?? []).filter(
      (item) =>
        !isVmmAttachment(item) ||
        (item.purpose !== 'verifymymeeting/identity' &&
          item.purpose !== 'verifymymeeting/consent'),
    )
    for (const { payload } of findCommitments(ordered)) delete payload.leaves
    for (const [index, party] of (ordered.parties ?? []).entries()) {
      if (!isParticipantParty(party) || !party.uuid) continue
      const profile = options.disclosed?.[party.uuid]
      if (!profile) continue
      const identity = identityOf({
        id: party.uuid,
        handle: party.uuid,
        joinedAt: '',
        profile,
      })
      if (!identity) continue
      ordered.attachments.push(
        vmmAttachment('identity', identity, {
          start: owner.created_at,
          party: index,
          session: 0,
        }),
      )
    }
  }
  return ordered
}

export type PartyRole = 'owner' | 'participant' | 'service' | 'unknown'

export type ImportParty = {
  index: number
  role: PartyRole
  /** The VMM handle when the party came from VerifyMyMeeting. */
  handle: string | null
  name: string | null
  org: string | null
  mailto: string | null
  tel: string | null
}

export type ImportDocument = DocumentInput & {
  /** Which vCon entry the document came from. */
  source: EntryLocator
  /** The VMM document id when the vCon is a VerifyMyMeeting export. */
  documentId?: string
}

export type ImportPlan = {
  uuid: string
  title: string | null
  createdAt: string
  /** Set when the vCon declares the `verifymymeeting` extension. */
  vmm: { commitHashHex: string | null; attestations: number } | null
  parties: Array<ImportParty>
  documents: Array<ImportDocument>
  /** Carried into the stored document unchanged, never interpreted. */
  preserved: {
    sessions?: Array<Session>
    events?: Array<Event>
    redacted_strings?: Array<RedactedString>
  }
  extensions: Array<string>
}

export type FromVconOptions = {
  /** Critical extension tokens this importer supports. */
  known?: Array<string>
}

function roleOf(party: Party): PartyRole {
  if (party.uuid === SERVICE_PARTY_UUID) return 'service'
  if (party.validation !== VMM_VALIDATION) return 'unknown'
  return party.uuid === OWNER_PARTY_UUID ? 'owner' : 'participant'
}

function creatorsOf(roles: Array<PartyRole>): Array<Creator> {
  const set = new Set<Creator>()
  for (const role of roles) {
    if (role === 'owner') set.add('owner')
    else if (role === 'participant') set.add('participant')
    else if (role === 'unknown') set.add('other-human')
  }
  if (set.size === 0) set.add('other-human')
  return [...set].sort()
}

function flattenParties(value: Dialog['parties']): Array<number> {
  if (value === undefined) return []
  const list = Array.isArray(value) ? value : [value]
  const out: Array<number> = []
  for (const item of list) {
    if (item === null) continue
    if (Array.isArray(item)) out.push(...item)
    else out.push(item)
  }
  return out
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function isTextual(mediatype: string | undefined): boolean {
  if (!mediatype) return false
  const type = mediatype.split(';')[0]?.trim().toLowerCase() ?? ''
  return (
    type.startsWith('text/') ||
    type === 'application/json' ||
    type.endsWith('+json') ||
    type.endsWith('+xml')
  )
}

type Shared = {
  label: string
  provenance: Provenance
  source: EntryLocator
  documentId?: string
}

/** One entry's content as a VMM document input, or null when empty. */
async function documentOf(
  entry: Dialog | Analysis | Attachment,
  shared: Shared,
): Promise<ImportDocument | null> {
  const mediatype = entry.mediatype
  const hasBody = entry.body !== undefined && entry.body !== ''
  if (hasBody) {
    if (
      mediatype?.split(';')[0]?.trim().toLowerCase() === URI_LIST_MEDIATYPE &&
      typeof entry.body === 'string'
    ) {
      const url = entry.body
        .split(/\r?\n/u)
        .find((line) => line && !line.startsWith('#'))
      if (url) return { ...shared, kind: 'link', url }
    }
    if (entry.encoding === 'json') {
      return {
        ...shared,
        kind: 'text',
        text: JSON.stringify(entry.body, null, 2),
      }
    }
    if (entry.encoding === 'base64url' && typeof entry.body === 'string') {
      const bytes = decodeBase64Url(entry.body)
      if (isTextual(mediatype)) {
        return {
          ...shared,
          kind: 'text',
          text: new TextDecoder().decode(bytes),
        }
      }
      const hash = await contentHash(bytes)
      return {
        ...shared,
        kind: 'hash',
        hashHex: preferredContentHash(hash)?.hex as string,
        hashAlg: 'sha512',
      }
    }
    if (typeof entry.body === 'string') {
      return { ...shared, kind: 'text', text: entry.body }
    }
    return {
      ...shared,
      kind: 'text',
      text: JSON.stringify(entry.body, null, 2),
    }
  }
  const hash = preferredContentHash(entry.content_hash)
  if (entry.url) {
    const doc: ImportDocument = { ...shared, kind: 'link', url: entry.url }
    if (hash) {
      doc.hashHex = hash.hex
      doc.hashAlg = hash.algorithm
    }
    return doc
  }
  if (hash) {
    return {
      ...shared,
      kind: 'hash',
      hashHex: hash.hex,
      hashAlg: hash.algorithm,
    }
  }
  return null
}

/**
 * Plan the import of a vCon into VerifyMyMeeting: parties become
 * participant slots, dialog, analysis and attachments become documents
 * with a provenance declaration, and sessions and events are preserved
 * untouched. Throws `UnknownCriticalExtensionError` for a critical
 * extension this importer does not support.
 */
export async function fromVcon(
  vcon: Vcon,
  options: FromVconOptions = {},
): Promise<ImportPlan> {
  assertKnownCritical(vcon, options.known ?? [VMM_EXTENSION])
  const parties: Array<ImportParty> = (vcon.parties ?? []).map(
    (party, index) => {
      const role = roleOf(party)
      return {
        index,
        role,
        handle: role === 'participant' ? (party.uuid ?? null) : null,
        name: party.name && party.name !== 'anonymous' ? party.name : null,
        org: party.org ?? null,
        mailto: party.mailto ?? null,
        tel: party.tel ?? null,
      }
    },
  )
  const roleAt = (index: number): PartyRole => parties[index]?.role ?? 'unknown'
  const isVmm = (vcon.extensions ?? []).includes(VMM_EXTENSION)
  const declared = new Map<string, ProvenanceRecord>()
  if (isVmm) {
    for (const { payload } of findProvenances(vcon)) {
      if (payload.entry) {
        declared.set(`${payload.entry.array}/${payload.entry.index}`, payload)
      }
    }
  }
  const documents: Array<ImportDocument> = []
  const push = async (
    entry: Dialog | Analysis | Attachment,
    source: EntryLocator,
    fallbackLabel: string,
    provenance: Provenance,
  ): Promise<void> => {
    const known = declared.get(`${source.array}/${source.index}`)
    const shared: Shared = {
      label: known?.label ?? entry.filename ?? fallbackLabel,
      provenance: known?.provenance ?? provenance,
      source,
    }
    if (known) shared.documentId = known.doc
    const doc = await documentOf(entry, shared)
    if (doc) documents.push(doc)
  }

  for (const [index, entry] of (vcon.dialog ?? []).entries()) {
    if (Object.keys(entry).length === 0 || entry.type === 'incomplete') continue
    const type: ProvenanceType =
      entry.type === 'recording' ? 'recording' : 'transcript'
    await push(
      entry,
      { array: 'dialog', index },
      `${entry.type ?? 'dialog'} ${index + 1}`,
      {
        type,
        creators: creatorsOf(flattenParties(entry.parties).map(roleAt)),
        created: 'during',
        ai: 'none',
      },
    )
  }
  for (const [index, entry] of (vcon.analysis ?? []).entries()) {
    const verbatim = entry.type === 'transcript'
    const provenance: Provenance = {
      type: verbatim ? 'transcript' : 'notes',
      creators: ['other-human'],
      created: 'after',
      ai: 'generated',
      aiRole: verbatim
        ? 'verbatim'
        : entry.type === 'summary'
          ? 'summary'
          : 'enhanced',
    }
    const note = [entry.vendor, entry.product, entry.schema]
      .filter(Boolean)
      .join(' ')
    if (note) provenance.note = note.slice(0, 280)
    await push(
      entry,
      { array: 'analysis', index },
      `${entry.type} ${index + 1}`,
      provenance,
    )
  }
  for (const [index, entry] of (vcon.attachments ?? []).entries()) {
    if (isVmmAttachment(entry)) continue
    const purpose = entry.purpose
    const type: ProvenanceType = (
      provenanceTypes as ReadonlyArray<string>
    ).includes(purpose ?? '')
      ? (purpose as ProvenanceType)
      : entry.mediatype?.toLowerCase().startsWith('image/')
        ? 'image'
        : 'other'
    await push(
      entry,
      { array: 'attachments', index },
      purpose ?? `attachment ${index + 1}`,
      {
        type,
        creators: creatorsOf([roleAt(entry.party)]),
        created: 'during',
        ai: 'none',
      },
    )
  }

  const preserved: ImportPlan['preserved'] = {}
  if (vcon.sessions) preserved.sessions = vcon.sessions
  if (vcon.events) preserved.events = vcon.events
  if (vcon.redacted_strings) preserved.redacted_strings = vcon.redacted_strings
  const commitment = isVmm ? findCommitments(vcon)[0]?.payload : undefined
  return {
    uuid: vcon.uuid,
    title: vcon.subject ?? null,
    createdAt: vcon.created_at,
    vmm: isVmm
      ? {
          commitHashHex: commitment?.hashHex ?? null,
          attestations: findAttestations(vcon).length,
        }
      : null,
    parties,
    documents,
    preserved,
    extensions: vcon.extensions ?? [],
  }
}
