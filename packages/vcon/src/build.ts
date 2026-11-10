/**
 * A small builder for the unsigned form. Each `add*` function appends to
 * the array and returns the new index, which is what other objects use to
 * reference it (the draft references by array index, never by id). The
 * functions mutate the given vCon so that index bookkeeping stays simple;
 * `cloneVcon` gives a deep copy when a snapshot is needed.
 */
import { contentHash } from './hash.js'
import type { HashAlgorithm } from './hash.js'
import type {
  Analysis,
  Attachment,
  ContentHash,
  DateString,
  Dialog,
  Encoding,
  Event,
  Party,
  Session,
  Vcon,
} from './types.js'
import { VCON_VERSION } from './types.js'

export {
  uuidv5,
  VMM_VCON_NAMESPACE,
  DNS_NAMESPACE,
  URL_NAMESPACE,
} from './uuid.js'

export type CreateVconOptions = {
  /** Omit to get a random version 4 UUID from `crypto.randomUUID()`. */
  uuid?: string
  created_at?: DateString
  updated_at?: DateString
  subject?: string
  extensions?: Array<string>
  critical?: Array<string>
  /** Set `vcon: "0.5.0"`; on by default while the draft carries it. */
  version?: boolean
}

/** A new, empty unsigned vCon with `uuid` and `created_at` set. */
export function createVcon(options: CreateVconOptions = {}): Vcon {
  const vcon: Vcon = {
    ...(options.version === false ? {} : { vcon: VCON_VERSION }),
    uuid: options.uuid ?? crypto.randomUUID(),
    created_at: options.created_at ?? new Date().toISOString(),
  }
  if (options.updated_at) vcon.updated_at = options.updated_at
  if (options.subject !== undefined) vcon.subject = options.subject
  if (options.extensions?.length) vcon.extensions = [...options.extensions]
  if (options.critical?.length) vcon.critical = [...options.critical]
  return vcon
}

export function cloneVcon<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function addParty(vcon: Vcon, party: Party): number {
  vcon.parties ??= []
  vcon.parties.push(party)
  return vcon.parties.length - 1
}

export function addDialog(vcon: Vcon, dialog: Dialog): number {
  vcon.dialog ??= []
  vcon.dialog.push(dialog)
  return vcon.dialog.length - 1
}

export function addAnalysis(vcon: Vcon, analysis: Analysis): number {
  vcon.analysis ??= []
  vcon.analysis.push(analysis)
  return vcon.analysis.length - 1
}

export function addAttachment(vcon: Vcon, attachment: Attachment): number {
  vcon.attachments ??= []
  vcon.attachments.push(attachment)
  return vcon.attachments.length - 1
}

export function addSession(vcon: Vcon, session: Session): number {
  vcon.sessions ??= []
  vcon.sessions.push(session)
  return vcon.sessions.length - 1
}

export function addEvent(vcon: Vcon, event: Event): number {
  vcon.events ??= []
  vcon.events.push(event)
  return vcon.events.length - 1
}

/** Add an extension token to `extensions` (and `critical` when asked). */
export function useExtension(vcon: Vcon, name: string, critical = false): void {
  vcon.extensions ??= []
  if (!vcon.extensions.includes(name)) vcon.extensions.push(name)
  if (critical) {
    vcon.critical ??= []
    if (!vcon.critical.includes(name)) vcon.critical.push(name)
  }
}

/** Inline content parameters for a string body (section 2.3). */
export function inlineText(
  body: string,
  mediatype = 'text/plain',
): { body: string; encoding: Encoding; mediatype: string } {
  return { body, encoding: 'none', mediatype }
}

/** Inline content parameters for a JSON value (`encoding: "json"`). */
export function inlineJson(
  body: unknown,
  mediatype = 'application/json',
): { body: unknown; encoding: Encoding; mediatype: string } {
  return { body, encoding: 'json', mediatype }
}

/** Inline content parameters for bytes (`encoding: "base64url"`). */
export function inlineBytes(
  bytes: Uint8Array,
  mediatype: string,
): { body: string; encoding: Encoding; mediatype: string } {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const body = btoa(binary)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '')
  return { body, encoding: 'base64url', mediatype }
}

/**
 * External content parameters (section 2.4) from the bytes at `url`,
 * hashed here, or from a token you already hold.
 */
export async function externalContent(
  url: string,
  content: Uint8Array | ContentHash | Array<ContentHash>,
  algorithm: HashAlgorithm = 'sha512',
): Promise<{ url: string; content_hash: ContentHash | Array<ContentHash> }> {
  const content_hash =
    content instanceof Uint8Array
      ? await contentHash(content, algorithm)
      : content
  return { url, content_hash }
}
