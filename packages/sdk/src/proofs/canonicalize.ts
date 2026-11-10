/**
 * JSON Canonicalization Scheme (RFC 8785).
 *
 * Object keys are sorted by UTF-16 code units, whitespace is removed, and
 * numbers use the ECMAScript serialization (what JSON.stringify produces).
 * `undefined` values are dropped from objects, as in JSON.stringify.
 *
 * Mirrors `src/lib/proofs/canonicalize.ts` in the ProofOfMeetProtocol server.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | Array<JsonValue>
  | { [key: string]: JsonValue | undefined }

export function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('Cannot canonicalize a non-finite number.')
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`
  }
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort((a, b) => compareUtf16(a, b))
  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalize(value[key] as JsonValue)}`,
    )
    .join(',')}}`
}

function compareUtf16(a: string, b: string): number {
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    const diff = a.charCodeAt(i) - b.charCodeAt(i)
    if (diff !== 0) return diff
  }
  return a.length - b.length
}
