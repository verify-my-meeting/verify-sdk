/**
 * Structural validation of the unsigned form against
 * draft-ietf-vcon-vcon-core-05. Returns a list of problems rather than
 * throwing so a reader can decide what to tolerate. Only MUST-level rules
 * of the draft are reported as problems; SHOULD-level rules are not
 * checked here (a transcript-less dialog is legal in a redacted vCon).
 */
import { isContentHashToken } from './hash.js'
import type {
  Analysis,
  Attachment,
  Dialog,
  Event,
  Session,
  Vcon,
} from './types.js'
import { encodings, VCON_VERSION } from './types.js'

export type Problem = {
  /** JSON pointer-like path, e.g. `/dialog/0/content_hash`. */
  path: string
  message: string
}

const rfc3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function checkDate(
  problems: Array<Problem>,
  path: string,
  value: unknown,
  required: boolean,
): void {
  if (value === undefined) {
    if (required) problems.push({ path, message: 'is required' })
    return
  }
  if (typeof value !== 'string' || !rfc3339.test(value)) {
    problems.push({ path, message: 'must be an RFC 3339 date-time string' })
  }
}

function checkIndexList(
  problems: Array<Problem>,
  path: string,
  value: unknown,
  count: number,
  what: string,
): void {
  if (value === undefined) return
  const list = Array.isArray(value) ? value : [value]
  for (const [i, index] of list.entries()) {
    if (!isIndex(index) || index >= count) {
      problems.push({
        path: Array.isArray(value) ? `${path}/${i}` : path,
        message: `must be an index into ${what} (0..${count - 1})`,
      })
    }
  }
}

function checkContentHash(
  problems: Array<Problem>,
  path: string,
  value: unknown,
): void {
  if (value === undefined) return
  const tokens = Array.isArray(value) ? value : [value]
  if (tokens.length === 0) {
    problems.push({ path, message: 'must hold at least one token' })
  }
  for (const [i, token] of tokens.entries()) {
    if (!isContentHashToken(token)) {
      problems.push({
        path: Array.isArray(value) ? `${path}/${i}` : path,
        message: 'must be "<alg>-<base64url digest>"',
      })
    }
  }
}

function checkContent(
  problems: Array<Problem>,
  path: string,
  object: Record<string, unknown>,
): void {
  const hasBody = object.body !== undefined && object.body !== ''
  if (hasBody && object.encoding === undefined) {
    problems.push({
      path: `${path}/encoding`,
      message: 'is required when body is present',
    })
  }
  if (object.encoding !== undefined) {
    if (typeof object.encoding !== 'string') {
      problems.push({ path: `${path}/encoding`, message: 'must be a string' })
    } else if (
      (encodings as ReadonlyArray<string>).includes(object.encoding) &&
      object.encoding !== 'json' &&
      hasBody &&
      typeof object.body !== 'string'
    ) {
      problems.push({
        path: `${path}/body`,
        message: `must be a string for encoding "${object.encoding}"`,
      })
    }
  }
  if (object.url !== undefined) {
    if (typeof object.url !== 'string') {
      problems.push({ path: `${path}/url`, message: 'must be a string' })
    }
    if (object.content_hash === undefined) {
      problems.push({
        path: `${path}/content_hash`,
        message: 'is required when url is present',
      })
    }
  }
  checkContentHash(problems, `${path}/content_hash`, object.content_hash)
  if (object.mediatype !== undefined && typeof object.mediatype !== 'string') {
    problems.push({ path: `${path}/mediatype`, message: 'must be a string' })
  }
}

function checkDialog(
  problems: Array<Problem>,
  path: string,
  dialog: Dialog,
  partyCount: number,
): void {
  const keys = Object.keys(dialog)
  if (keys.length === 0) return
  if (dialog.type === undefined) {
    problems.push({ path: `${path}/type`, message: 'is required' })
  } else if (typeof dialog.type !== 'string') {
    problems.push({ path: `${path}/type`, message: 'must be a string' })
  }
  checkDate(problems, `${path}/start`, dialog.start, false)
  if (dialog.parties !== undefined) {
    const list = Array.isArray(dialog.parties)
      ? dialog.parties
      : [dialog.parties]
    for (const [i, entry] of list.entries()) {
      const inner = entry === null ? [] : Array.isArray(entry) ? entry : [entry]
      for (const index of inner) {
        if (!isIndex(index) || index >= partyCount) {
          problems.push({
            path: `${path}/parties/${i}`,
            message: `must be an index into parties (0..${partyCount - 1})`,
          })
        }
      }
    }
  }
  if (dialog.type === 'incomplete') {
    if (dialog.disposition === undefined) {
      problems.push({
        path: `${path}/disposition`,
        message: 'is required for incomplete dialog',
      })
    }
    for (const forbidden of [
      'mediatype',
      'filename',
      'body',
      'encoding',
      'url',
      'content_hash',
      'message_id',
      'redacted_segments',
    ]) {
      if ((dialog as Record<string, unknown>)[forbidden] !== undefined) {
        problems.push({
          path: `${path}/${forbidden}`,
          message: 'must not be present in incomplete dialog',
        })
      }
    }
    return
  }
  checkContent(problems, path, dialog as Record<string, unknown>)
  if (
    dialog.body !== undefined &&
    dialog.body !== '' &&
    dialog.mediatype === undefined
  ) {
    problems.push({
      path: `${path}/mediatype`,
      message: 'is required for inline dialog content',
    })
  }
}

function checkAnalysis(
  problems: Array<Problem>,
  path: string,
  analysis: Analysis,
  counts: Counts,
  own: number,
): void {
  if (typeof analysis.type !== 'string') {
    problems.push({ path: `${path}/type`, message: 'is required' })
  }
  if (typeof analysis.vendor !== 'string') {
    problems.push({ path: `${path}/vendor`, message: 'is required' })
  }
  checkIndexList(
    problems,
    `${path}/dialog`,
    analysis.dialog,
    counts.dialog,
    'dialog',
  )
  checkIndexList(
    problems,
    `${path}/sessions`,
    analysis.sessions,
    counts.sessions,
    'sessions',
  )
  checkIndexList(
    problems,
    `${path}/attachment`,
    analysis.attachment,
    counts.attachments,
    'attachments',
  )
  checkIndexList(
    problems,
    `${path}/analysis`,
    analysis.analysis,
    counts.analysis,
    'analysis',
  )
  const refs = Array.isArray(analysis.analysis)
    ? analysis.analysis
    : analysis.analysis === undefined
      ? []
      : [analysis.analysis]
  if (refs.includes(own)) {
    problems.push({
      path: `${path}/analysis`,
      message: 'must not reference itself',
    })
  }
  checkContent(problems, path, analysis as Record<string, unknown>)
}

function checkAttachment(
  problems: Array<Problem>,
  path: string,
  attachment: Attachment,
  counts: Counts,
): void {
  checkDate(problems, `${path}/start`, attachment.start, true)
  if (!isIndex(attachment.party) || attachment.party >= counts.parties) {
    problems.push({
      path: `${path}/party`,
      message: `is required and must be an index into parties (0..${counts.parties - 1})`,
    })
  }
  if (attachment.dialog === undefined && attachment.session === undefined) {
    problems.push({
      path,
      message: 'must have at least one of dialog or session',
    })
  }
  checkIndexList(
    problems,
    `${path}/dialog`,
    attachment.dialog,
    counts.dialog,
    'dialog',
  )
  checkIndexList(
    problems,
    `${path}/session`,
    attachment.session,
    counts.sessions,
    'sessions',
  )
  checkContent(problems, path, attachment as Record<string, unknown>)
  if (
    attachment.body !== undefined &&
    attachment.body !== '' &&
    attachment.mediatype === undefined
  ) {
    problems.push({
      path: `${path}/mediatype`,
      message: 'is required for inline attachment content',
    })
  }
}

function checkSession(
  problems: Array<Problem>,
  path: string,
  session: Session,
  counts: Counts,
): void {
  checkDate(problems, `${path}/start`, session.start, false)
  checkIndexList(
    problems,
    `${path}/parties`,
    session.parties,
    counts.parties,
    'parties',
  )
  if (session.originator !== undefined) {
    checkIndexList(
      problems,
      `${path}/originator`,
      session.originator,
      counts.parties,
      'parties',
    )
  }
  checkIndexList(
    problems,
    `${path}/dialog`,
    session.dialog,
    counts.dialog,
    'dialog',
  )
  for (const [i, reference] of (session.sessions ?? []).entries()) {
    if (!isRecord(reference)) {
      problems.push({
        path: `${path}/sessions/${i}`,
        message: 'must be an object',
      })
      continue
    }
    checkIndexList(
      problems,
      `${path}/sessions/${i}/session`,
      reference.session,
      counts.sessions,
      'sessions',
    )
    if (typeof reference.type !== 'string') {
      problems.push({
        path: `${path}/sessions/${i}/type`,
        message: 'is required',
      })
    }
  }
}

function checkEvent(
  problems: Array<Problem>,
  path: string,
  event: Event,
  counts: Counts,
): void {
  if (typeof event.type !== 'string') {
    problems.push({ path: `${path}/type`, message: 'is required' })
  }
  checkDate(problems, `${path}/time`, event.time, true)
  checkIndexList(
    problems,
    `${path}/sessions`,
    event.sessions,
    counts.sessions,
    'sessions',
  )
  checkIndexList(
    problems,
    `${path}/party`,
    event.party,
    counts.parties,
    'parties',
  )
  checkIndexList(
    problems,
    `${path}/dialog`,
    event.dialog,
    counts.dialog,
    'dialog',
  )
  if (event.contributors !== null) {
    checkIndexList(
      problems,
      `${path}/contributors`,
      event.contributors,
      counts.parties,
      'parties',
    )
  }
  for (const key of ['transferee', 'transfer_target'] as const) {
    checkIndexList(
      problems,
      `${path}/${key}`,
      event[key],
      counts.parties,
      'parties',
    )
  }
  for (const key of ['consultation', 'target_session'] as const) {
    checkIndexList(
      problems,
      `${path}/${key}`,
      event[key],
      counts.sessions,
      'sessions',
    )
  }
}

type Counts = {
  parties: number
  dialog: number
  analysis: number
  attachments: number
  sessions: number
}

function checkReference(
  problems: Array<Problem>,
  path: string,
  value: unknown,
  requireType: boolean,
): void {
  if (!isRecord(value)) {
    problems.push({ path, message: 'must be an object' })
    return
  }
  if (value.uuid !== undefined && typeof value.uuid !== 'string') {
    problems.push({ path: `${path}/uuid`, message: 'must be a string' })
  }
  if (requireType && typeof value.type !== 'string') {
    problems.push({ path: `${path}/type`, message: 'is required' })
  }
  if (value.url !== undefined) {
    if (typeof value.url !== 'string') {
      problems.push({ path: `${path}/url`, message: 'must be a string' })
    }
    if (value.content_hash === undefined) {
      problems.push({
        path: `${path}/content_hash`,
        message: 'is required when url is present',
      })
    }
  }
  checkContentHash(problems, `${path}/content_hash`, value.content_hash)
  if (!requireType && value.uuid === undefined && value.url === undefined) {
    problems.push({ path, message: 'must have uuid or url' })
  }
}

function checkStringList(
  problems: Array<Problem>,
  path: string,
  value: unknown,
): Array<string> {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    problems.push({ path, message: 'must be an array of strings' })
    return []
  }
  return value as Array<string>
}

/** Validate the unsigned form. An empty list means no MUST-level problem. */
export function validateVcon(value: unknown): Array<Problem> {
  const problems: Array<Problem> = []
  if (!isRecord(value)) {
    return [{ path: '', message: 'must be a JSON object' }]
  }
  const vcon = value as Vcon
  if (vcon.vcon !== undefined && vcon.vcon !== VCON_VERSION) {
    problems.push({
      path: '/vcon',
      message: `must be "${VCON_VERSION}" when present`,
    })
  }
  if (typeof vcon.uuid !== 'string' || vcon.uuid.length === 0) {
    problems.push({ path: '/uuid', message: 'is required' })
  }
  checkDate(problems, '/created_at', vcon.created_at, true)
  checkDate(problems, '/updated_at', vcon.updated_at, false)
  if (vcon.subject !== undefined && typeof vcon.subject !== 'string') {
    problems.push({ path: '/subject', message: 'must be a string' })
  }
  const extensions = checkStringList(problems, '/extensions', vcon.extensions)
  const critical = checkStringList(problems, '/critical', vcon.critical)
  for (const token of critical) {
    if (!extensions.includes(token)) {
      problems.push({
        path: '/critical',
        message: `"${token}" must also be listed in extensions`,
      })
    }
  }
  if (vcon.redacted_from !== undefined && vcon.amended_from !== undefined) {
    problems.push({
      path: '',
      message: 'redacted_from and amended_from are mutually exclusive',
    })
  }
  if (vcon.redacted_from !== undefined) {
    checkReference(problems, '/redacted_from', vcon.redacted_from, true)
  }
  if (vcon.amended_from !== undefined) {
    checkReference(problems, '/amended_from', vcon.amended_from, false)
  }

  for (const key of [
    'parties',
    'dialog',
    'analysis',
    'attachments',
    'sessions',
    'events',
    'redacted_strings',
  ] as const) {
    const list = vcon[key]
    if (list !== undefined && !Array.isArray(list)) {
      problems.push({ path: `/${key}`, message: 'must be an array' })
    } else if (list?.some((item) => !isRecord(item))) {
      problems.push({ path: `/${key}`, message: 'items must be objects' })
    }
  }
  const arrays = (key: keyof Vcon): Array<unknown> =>
    Array.isArray(vcon[key]) ? (vcon[key] as Array<unknown>) : []
  const counts: Counts = {
    parties: arrays('parties').length,
    dialog: arrays('dialog').length,
    analysis: arrays('analysis').length,
    attachments: arrays('attachments').length,
    sessions: arrays('sessions').length,
  }
  if (
    (counts.dialog > 0 || arrays('events').length > 0) &&
    counts.sessions === 0
  ) {
    problems.push({
      path: '/sessions',
      message: 'at least one session is required when dialog or events exist',
    })
  }
  for (const [i, dialog] of arrays('dialog').entries()) {
    if (isRecord(dialog))
      checkDialog(problems, `/dialog/${i}`, dialog as Dialog, counts.parties)
  }
  for (const [i, analysis] of arrays('analysis').entries()) {
    if (isRecord(analysis)) {
      checkAnalysis(problems, `/analysis/${i}`, analysis as Analysis, counts, i)
    }
  }
  for (const [i, attachment] of arrays('attachments').entries()) {
    if (isRecord(attachment)) {
      checkAttachment(
        problems,
        `/attachments/${i}`,
        attachment as Attachment,
        counts,
      )
    }
  }
  for (const [i, session] of arrays('sessions').entries()) {
    if (isRecord(session))
      checkSession(problems, `/sessions/${i}`, session as Session, counts)
  }
  for (const [i, event] of arrays('events').entries()) {
    if (isRecord(event))
      checkEvent(problems, `/events/${i}`, event as Event, counts)
  }
  for (const [i, redacted] of arrays('redacted_strings').entries()) {
    if (isRecord(redacted) && !isIndex(redacted.ref)) {
      problems.push({
        path: `/redacted_strings/${i}/ref`,
        message: 'is required',
      })
    }
  }
  return problems
}

export class VconValidationError extends Error {
  readonly problems: Array<Problem>
  constructor(problems: Array<Problem>) {
    super(
      `Invalid vCon: ${problems.map((p) => `${p.path || '/'} ${p.message}`).join('; ')}`,
    )
    this.name = 'VconValidationError'
    this.problems = problems
  }
}

/** Throw `VconValidationError` when `validateVcon` reports a problem. */
export function assertValidVcon(value: unknown): asserts value is Vcon {
  const problems = validateVcon(value)
  if (problems.length > 0) throw new VconValidationError(problems)
}

export class UnknownCriticalExtensionError extends Error {
  readonly unknown: Array<string>
  constructor(unknown: Array<string>) {
    super(`Unsupported critical vCon extension(s): ${unknown.join(', ')}`)
    this.name = 'UnknownCriticalExtensionError'
    this.unknown = unknown
  }
}

/**
 * Reject a vCon whose `critical` lists an extension this reader does not
 * support (section 2.5: such a vCon MUST NOT be processed except to reject
 * it or report unsupported content).
 */
export function assertKnownCritical(
  vcon: Pick<Vcon, 'critical'>,
  known: Array<string>,
): void {
  const unknown = (vcon.critical ?? []).filter(
    (token) => !known.includes(token),
  )
  if (unknown.length > 0) throw new UnknownCriticalExtensionError(unknown)
}
