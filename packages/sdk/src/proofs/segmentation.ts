/**
 * Deterministic segmentation of transcript text into Merkle leaves,
 * version `v1`. Mirrors `src/lib/proofs/segmentation.ts` in the
 * VerifyMyMeeting server so a third party can recompute a text record's
 * root from the original text.
 *
 * Line endings are normalized to `\n`. If at least 60 percent of non-empty
 * lines look like speaker turns (`Name: text`, label up to 60 characters
 * without a colon), the text is split at those lines. Otherwise it is split
 * on blank lines. Each leaf is `index 0x1f version 0x1f segment` in UTF-8.
 */
import { concat, utf8 } from './bytes'
import { leafHash, rootFromLeafHashes } from './merkle'

export const segmentationVersion = 'v1'

export type Segment = { index: number; byteStart: number; byteEnd: number }

const speakerLine = /^[^:\n]{1,60}:\s/u

export function normalizeText(text: string): string {
  return text.replace(/\r\n?/gu, '\n')
}

export function segmentText(normalized: string): Array<Segment> {
  const lines = normalized.split('\n')
  const nonEmpty = lines.filter((line) => line.trim().length > 0)
  const speakerCount = nonEmpty.filter((line) => speakerLine.test(line)).length
  const bySpeaker = nonEmpty.length > 0 && speakerCount / nonEmpty.length >= 0.6
  const boundaries: Array<[number, number]> = []

  let cursor = 0
  let start = -1
  const lineStarts: Array<number> = []
  for (const line of lines) {
    lineStarts.push(cursor)
    cursor += utf8(line).length + 1
  }
  const bytes = utf8(normalized)
  const totalBytes = bytes.length

  lines.forEach((line, i) => {
    const lineStart = lineStarts[i] as number
    const isBlank = line.trim().length === 0
    const startsSegment = bySpeaker ? speakerLine.test(line) : !isBlank
    if (bySpeaker) {
      if (startsSegment) {
        if (start >= 0) boundaries.push([start, lineStart])
        start = lineStart
      } else if (start < 0 && !isBlank) {
        start = lineStart
      }
    } else if (isBlank) {
      if (start >= 0) boundaries.push([start, lineStart])
      start = -1
    } else if (start < 0) {
      start = lineStart
    }
  })
  if (start >= 0) boundaries.push([start, totalBytes])

  return boundaries
    .map(([byteStart, byteEnd]) => trimSegment(bytes, byteStart, byteEnd))
    .filter((segment) => segment.byteEnd > segment.byteStart)
    .map((segment, index) => ({ ...segment, index }))
}

function trimSegment(
  bytes: Uint8Array,
  byteStart: number,
  byteEnd: number,
): { byteStart: number; byteEnd: number } {
  let s = byteStart
  let e = byteEnd
  while (s < e && isWhitespace(bytes[s] as number)) s += 1
  while (e > s && isWhitespace(bytes[e - 1] as number)) e -= 1
  return { byteStart: s, byteEnd: e }
}

function isWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x0a || byte === 0x09 || byte === 0x0d
}

export function segmentBytes(normalized: string, segment: Segment): Uint8Array {
  return utf8(normalized).subarray(segment.byteStart, segment.byteEnd)
}

export function segmentString(normalized: string, segment: Segment): string {
  return new TextDecoder().decode(segmentBytes(normalized, segment))
}

/** The leaf bytes committed for one segment. */
export function leafBytes(
  normalized: string,
  segment: Segment,
  version = segmentationVersion,
): Uint8Array {
  return concat(
    utf8(`${segment.index}\u001f${version}\u001f`),
    segmentBytes(normalized, segment),
  )
}

/** Recompute the commitment of a text record from its original text. */
export async function textRecordCommitment(text: string): Promise<{
  normalized: string
  segments: Array<Segment>
  leafHashes: Array<Uint8Array>
  rootHex: string
}> {
  const normalized = normalizeText(text)
  const segments = segmentText(normalized)
  const leafHashes = await Promise.all(
    segments.map((segment) => leafHash(leafBytes(normalized, segment))),
  )
  const root = await rootFromLeafHashes(leafHashes)
  let rootHex = ''
  for (const byte of root) rootHex += byte.toString(16).padStart(2, '0')
  return { normalized, segments, leafHashes, rootHex }
}
