/**
 * Types for the IETF vCon container, unsigned form, as defined by
 * draft-ietf-vcon-vcon-core-05 (31 October 2026), syntax version "0.5.0".
 * Parameter names follow the draft exactly (snake case). The draft is a
 * working-group document and still changes; `DRAFT_REVISION` records which
 * revision these types were written against.
 *
 * Section references in comments are to the draft.
 */

export const DRAFT_REVISION = 'draft-ietf-vcon-vcon-core-05'
export const VCON_VERSION = '0.5.0'

/** Media type of the JSON form (section 7.1) and its gzip form (7.2). */
export const VCON_MEDIATYPE = 'application/vcon'
export const VCON_GZIP_MEDIATYPE = 'application/vcon+gzip'

/** RFC 3339 date-time string (section 2.2, "Date"). */
export type DateString = string

/** `type/subtype`, optionally with parameters (section 2.2, "Mediatype"). */
export type Mediatype = string

/**
 * `<alg>-<base64url digest>` (section 2.2, "ContentHash"): the algorithm
 * name in lowercase letters without hyphens, a hyphen, then the Base64url
 * digest without padding. `sha512` must be supported; other algorithms
 * recommended in the IANA COSE registry may appear (`sha256`).
 */
export type ContentHash = `${string}-${string}`

/** One token or several, when more than one algorithm is given (2.4.2). */
export type ContentHashes = ContentHash | Array<ContentHash>

/** Tokens for inline `encoding` (section 2.3.2). Extensions may add more. */
export type Encoding = 'base64url' | 'json' | 'none'
export const encodings: ReadonlyArray<Encoding> = ['base64url', 'json', 'none']

/** Inline content (section 2.3): `body` with its `encoding`. */
export type InlineContent = {
  body?: unknown
  encoding?: Encoding | string
}

/** External content (section 2.4): `url` with its `content_hash`. */
export type ExternalContent = {
  url?: string
  content_hash?: ContentHashes
}

/** Section 2.2, "SessionId". */
export type SessionId = { local: string; remote: string }

/** Civic address (section 4.4.9), parameter names lowercased. */
export type Civicaddress = Partial<
  Record<
    | 'country'
    | 'a1'
    | 'a2'
    | 'a3'
    | 'a4'
    | 'a5'
    | 'a6'
    | 'prd'
    | 'pod'
    | 'sts'
    | 'hno'
    | 'hns'
    | 'lmk'
    | 'loc'
    | 'flr'
    | 'nam'
    | 'pc',
    string
  >
>

export type PartyType = 'person' | 'bot' | 'organization'

/** Party Object (section 4.4). Every parameter is optional; `{}` is valid. */
export type Party = {
  tel?: string
  sip?: string
  stir?: string
  mailto?: string
  name?: string
  did?: string
  /** Domain-defined token naming the validation method; never the data. */
  validation?: string
  gmlpos?: string
  civicaddress?: Civicaddress
  /** Free-form unique participant identifier; not constrained to RFC 9562. */
  uuid?: string
  type?: PartyType | string
  org?: string
  dept?: string
}

export type DialogType = 'recording' | 'text' | 'incomplete'
export const dialogTypes: ReadonlyArray<DialogType> = [
  'recording',
  'text',
  'incomplete',
]

export type Disposition =
  | 'no-answer'
  | 'congestion'
  | 'failed'
  | 'busy'
  | 'hung-up'
  | 'voicemail-no-message'

/**
 * Contributors of a dialog (section 4.5.4): one index, a list, or a per
 * channel list whose entries are an index, a list, or null.
 */
export type DialogParties =
  number | Array<number> | Array<number | Array<number> | null>

export type RedactedSegment = {
  start: DateString
  end: DateString
  parties?: Array<number>
}

/**
 * Dialog Object (section 4.5). An empty object `{}` holds a position in the
 * array; otherwise `type` is required.
 */
export type Dialog = InlineContent &
  ExternalContent & {
    type?: DialogType | string
    start?: DateString
    /** Seconds. */
    duration?: number
    parties?: DialogParties
    mediatype?: Mediatype
    filename?: string
    disposition?: Disposition | string
    session_id?: SessionId | Array<SessionId | null>
    application?: string
    message_id?: string
    redacted_segments?: Array<RedactedSegment>
  }

export type AnalysisType =
  'report' | 'sentiment' | 'summary' | 'transcript' | 'translation' | 'tts'

/** Analysis Object (section 4.7). `type` and `vendor` are required. */
export type Analysis = InlineContent &
  ExternalContent & {
    type: AnalysisType | string
    dialog?: number | Array<number>
    sessions?: number | Array<number>
    attachment?: number | Array<number>
    analysis?: number | Array<number>
    mediatype?: Mediatype
    filename?: string
    vendor: string
    product?: string
    schema?: string
  }

/**
 * Attachment Object (section 4.6). `start` and `party` are required and at
 * least one of `dialog` or `session` must be present.
 */
export type Attachment = InlineContent &
  ExternalContent & {
    purpose?: string
    start: DateString
    party: number
    dialog?: number
    session?: number | Array<number>
    mediatype?: Mediatype
    filename?: string
  }

export type SessionReferenceType = 'child' | 'peer' | 'precursor' | 'breakout'

export type SessionReference = {
  session: number
  type: SessionReferenceType | string
  description?: string
}

/** Session Object (section 4.2): the scope of dialog and events. */
export type Session = {
  start?: DateString
  /** Seconds. */
  duration?: number
  /** Receivers of the dialog; the first is the originator unless set. */
  parties?: Array<number>
  originator?: number
  session_id?: SessionId
  sessions?: Array<SessionReference>
  dialog?: Array<number>
}

export type EventType =
  | 'join'
  | 'drop'
  | 'hold'
  | 'unhold'
  | 'mute'
  | 'unmute'
  | 'keydown'
  | 'keyup'
  | 'consultation-start'
  | 'blind-transfer'
  | 'consultative-transfer'
  | 'transfer-abandoned'
  | 'channel-contributors'

/** Event Object (section 4.3). Which parameters apply depends on `type`. */
export type Event = {
  type: EventType | string
  time: DateString
  sessions?: number | Array<number>
  party?: number
  dialog?: number
  channel?: number
  contributors?: number | Array<number> | null
  button?: string
  transferee?: number
  transfer_target?: number
  consultation?: number
  target_session?: number
}

export type RedactedStringType =
  | 'GOVT_ID_NUM'
  | 'FIN_ID_NUM'
  | 'MED_ID_NUM'
  | 'BIOMETRIC'
  | 'AUTH_DATA'
  | 'CONTACT_INFO'
  | 'LOC_INFO'
  | 'EMPL_INFO'
  | 'BELIEF_INFO'
  | 'UNSPECIFIED'

/** Redacted_string Object (section 4.8). */
export type RedactedString = {
  ref: number
  type?: RedactedStringType | string
  orig?: string
}

/**
 * Amended_from Object (section 4.1.9.1): the prior instance version. `uuid`
 * is optional only when `url` and `content_hash` are given.
 */
export type AmendedFrom = {
  uuid?: string
  url?: string
  content_hash?: ContentHashes
}

/**
 * Redacted_from Object (section 4.1.8.1): the less redacted instance
 * version. `type` names what was redacted (same values as
 * `RedactedString.type`, or a free string); an absent `uuid` means the less
 * redacted version is unavailable.
 */
export type RedactedFrom = {
  uuid?: string
  type: RedactedStringType | string
  url?: string
  content_hash?: ContentHashes
}

/** A reference to another instance version: the shape shared by both. */
export type Reference = AmendedFrom | RedactedFrom

/** `extensions` and `critical` (sections 4.1.3 and 4.1.4). */
export type Extensions = Array<string>

/** The unsigned form of a vCon (section 4). */
export type Vcon = {
  /** Deprecated at RFC publication; `"0.5.0"` for this draft. */
  vcon?: string
  uuid: string
  extensions?: Extensions
  critical?: Extensions
  created_at: DateString
  updated_at?: DateString
  subject?: string
  redacted_from?: RedactedFrom
  amended_from?: AmendedFrom
  sessions?: Array<Session>
  parties?: Array<Party>
  events?: Array<Event>
  dialog?: Array<Dialog>
  analysis?: Array<Analysis>
  attachments?: Array<Attachment>
  redacted_strings?: Array<RedactedString>
  /** Parameters defined by extensions. */
  [extension: string]: unknown
}

/** JWS header parameters a signed vCon uses (section 6.2.2, RFC 7515). */
export type JwsHeader = {
  alg?: string
  kid?: string
  /** Registered by the draft (section 7.5): the uuid of the payload vCon. */
  uuid?: string
  typ?: string
  cty?: string
  x5c?: Array<string>
  x5u?: string
  jku?: string
  jwk?: JsonWebKey
  [parameter: string]: unknown
}

/** One entry of `signatures` (section 6.2.1). */
export type JwsSignature = {
  /** Base64url of the JWS Protected Header; present when not empty. */
  protected?: string
  /** The unprotected Header Object. */
  header?: JwsHeader
  signature: string
}

/**
 * The signed form (section 6.2): JWS General JSON Serialization (RFC 7515
 * section 7.2.1). `payload` is the Base64url of the unsigned form, or of
 * its gzip.
 */
export type SignedVcon = {
  payload: string
  signatures: Array<JwsSignature>
}

/** Unprotected Object of the encrypted form (section 6.3.1). */
export type JweUnprotected = {
  cty?: string
  enc?: string
  alg?: string
  uuid?: string
  [parameter: string]: unknown
}

export type JweRecipient = {
  header?: { alg?: string; [parameter: string]: unknown }
  encrypted_key?: string
}

/**
 * The encrypted form (section 6.3): JWE General JSON Serialization around
 * the signed form. Type only; this package does not encrypt or decrypt.
 */
export type EncryptedVcon = {
  protected?: string
  unprotected?: JweUnprotected
  recipients: Array<JweRecipient>
  iv: string
  ciphertext: string
  tag: string
  aad?: string
}

export type VconForm = 'unsigned' | 'signed' | 'encrypted' | 'unknown'

/** Which form a parsed JSON object is in (section 6.4). */
export function formOf(value: unknown): VconForm {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'unknown'
  }
  const o = value as Record<string, unknown>
  if ('payload' in o && 'signatures' in o) return 'signed'
  if ('ciphertext' in o && 'recipients' in o) return 'encrypted'
  const markers = [
    'parties',
    'dialog',
    'analysis',
    'attachments',
    'sessions',
    'events',
  ]
  if (markers.some((key) => key in o)) return 'unsigned'
  if ('uuid' in o && 'created_at' in o) return 'unsigned'
  return 'unknown'
}
