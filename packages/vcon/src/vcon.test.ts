import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  addAttachment,
  addDialog,
  addParty,
  addSession,
  createVcon,
  inlineText,
} from './build'
import {
  contentHash,
  contentHashFromDigest,
  parseContentHash,
  parseContentHashes,
  verifyContentHash,
} from './hash'
import { formOf, DRAFT_REVISION, VCON_VERSION } from './types'
import type { Vcon } from './types'
import {
  bytesToUuid,
  DNS_NAMESPACE,
  uuidToBytes,
  uuidv5,
  VMM_VCON_NAMESPACE,
} from './uuid'
import {
  assertKnownCritical,
  UnknownCriticalExtensionError,
  validateVcon,
} from './validate'

const fixtureDir = fileURLToPath(new URL('../test-fixtures/', import.meta.url))

function fixture(name: string): string {
  return readFileSync(`${fixtureDir}${name}`, 'utf8')
}

const unsignedFixtures = readdirSync(fixtureDir).filter(
  (name) => name.endsWith('.vcon') && !/signed|encrypted/u.test(name),
)

describe('draft appendix examples', () => {
  it('pins the draft revision', () => {
    expect(DRAFT_REVISION).toBe('draft-ietf-vcon-vcon-core-05')
    expect(VCON_VERSION).toBe('0.5.0')
  })

  it.each(unsignedFixtures)(
    '%s parses, validates and re-serializes',
    (name) => {
      const text = fixture(name)
      const parsed = JSON.parse(text) as Vcon
      expect(formOf(parsed)).toBe('unsigned')
      expect(parsed.vcon).toBe(VCON_VERSION)
      expect(validateVcon(parsed)).toEqual([])
      // The fixtures are 2-space indented JSON; serializing the parsed object
      // yields the same bytes, so a read-write cycle changes nothing.
      expect(JSON.stringify(parsed, null, 2)).toBe(text.trim())
    },
  )

  it('classifies the signed and encrypted examples', () => {
    expect(formOf(JSON.parse(fixture('ab_call_ext_rec_signed.vcon')))).toBe(
      'signed',
    )
    expect(formOf(JSON.parse(fixture('ab_call_ext_rec_encrypted.vcon')))).toBe(
      'encrypted',
    )
    expect(formOf([])).toBe('unknown')
    expect(formOf({ uuid: 'x', created_at: 'y' })).toBe('unsigned')
  })

  it('reads the external recording hash of the B.4 example', () => {
    const parsed = JSON.parse(fixture('ab_call_ext_rec.vcon')) as Vcon
    const token = parsed.dialog?.[0]?.content_hash as string
    const hash = parseContentHash(token)
    expect(hash.algorithm).toBe('sha512')
    expect(hash.digest.length).toBe(64)
  })
})

describe('validateVcon', () => {
  it('reports the MUST-level rules', () => {
    const problems = validateVcon({
      vcon: '0.4.0',
      created_at: 'yesterday',
      critical: ['x'],
      redacted_from: { type: 'CONTACT_INFO' },
      amended_from: { uuid: 'a' },
      parties: [{}],
      dialog: [{ type: 'text', parties: [3], body: 'hi' }],
      analysis: [{ type: 'summary', analysis: 0 }],
      attachments: [{ party: 9, url: 'https://x', content_hash: 'bad' }],
    })
    const paths = problems.map((p) => p.path)
    expect(paths).toContain('/vcon')
    expect(paths).toContain('/uuid')
    expect(paths).toContain('/created_at')
    expect(paths).toContain('/critical')
    expect(paths).toContain('')
    expect(paths).toContain('/sessions')
    expect(paths).toContain('/dialog/0/parties/0')
    expect(paths).toContain('/dialog/0/encoding')
    expect(paths).toContain('/dialog/0/mediatype')
    expect(paths).toContain('/analysis/0/vendor')
    expect(paths).toContain('/analysis/0/analysis')
    expect(paths).toContain('/attachments/0/start')
    expect(paths).toContain('/attachments/0/party')
    expect(paths).toContain('/attachments/0')
    expect(paths).toContain('/attachments/0/content_hash')
  })

  it('accepts an incomplete dialog and rejects content on it', () => {
    const base = createVcon({ uuid: 'u', created_at: '2026-01-01T00:00:00Z' })
    addSession(base, { parties: [], dialog: [0] })
    addDialog(base, { type: 'incomplete', disposition: 'no-answer' })
    expect(validateVcon(base)).toEqual([])
    addDialog(base, { type: 'incomplete', body: 'x' })
    const paths = validateVcon(base).map((p) => p.path)
    expect(paths).toContain('/dialog/1/disposition')
    expect(paths).toContain('/dialog/1/body')
  })

  it('rejects unknown critical tokens and accepts known ones', () => {
    const vcon = { critical: ['verifymymeeting', 'other'] }
    expect(() => assertKnownCritical(vcon, ['verifymymeeting'])).toThrow(
      UnknownCriticalExtensionError,
    )
    expect(() =>
      assertKnownCritical(vcon, ['verifymymeeting', 'other']),
    ).not.toThrow()
    expect(() => assertKnownCritical({}, [])).not.toThrow()
  })
})

describe('content_hash', () => {
  const abc = new TextEncoder().encode('abc')
  const sha512Abc = createHash('sha512').update('abc').digest()
  const sha256Abc = createHash('sha256').update('abc').digest()

  it('produces sha512-<base64url> and verifies it', async () => {
    const token = await contentHash(abc)
    expect(token).toBe(`sha512-${sha512Abc.toString('base64url')}`)
    expect(token).toBe(
      'sha512-3a81oZNherrMQXNJriBBMRLm-k6JqX6iCp7u5ktV05ohkpkqJ0_BqDa6PCOj_uu9RU1EI2Q86A4qmslPpUyknw',
    )
    expect(await verifyContentHash(abc, token)).toBe(true)
    expect(
      await verifyContentHash(new TextEncoder().encode('abd'), token),
    ).toBe(false)
  })

  it('accepts sha256 tokens on verification and arrays of tokens', async () => {
    const sha256Token = contentHashFromDigest(
      sha256Abc.toString('hex'),
      'sha256',
    )
    expect(sha256Token.startsWith('sha256-')).toBe(true)
    expect(await verifyContentHash(abc, sha256Token)).toBe(true)
    const both = [await contentHash(abc), sha256Token]
    expect(await verifyContentHash(abc, both)).toBe(true)
    expect(parseContentHashes(both).map((h) => h.algorithm)).toEqual([
      'sha512',
      'sha256',
    ])
    // An unknown algorithm alone cannot be checked; beside a known one it is ignored.
    expect(await verifyContentHash(abc, 'blake3-AAAA')).toBe(false)
    expect(await verifyContentHash(abc, ['blake3-AAAA', sha256Token])).toBe(
      true,
    )
    expect(await verifyContentHash(abc, 'not a token')).toBe(false)
  })

  it('rejects wrong digest lengths', () => {
    expect(() => contentHashFromDigest('00', 'sha512')).toThrow(TypeError)
  })
})

describe('uuidv5', () => {
  function nodeUuidv5(namespace: string, name: string): string {
    const bytes = createHash('sha1')
      .update(Buffer.from(namespace.replace(/-/gu, ''), 'hex'))
      .update(name)
      .digest()
      .subarray(0, 16)
    bytes[6] = ((bytes[6] as number) & 0x0f) | 0x50
    bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80
    const hex = bytes.toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  it('matches the RFC 9562 DNS example for www.example.com', async () => {
    const expected = '2ed6657d-e927-568b-95e1-2665a8aea6a2'
    expect(nodeUuidv5(DNS_NAMESPACE, 'www.example.com')).toBe(expected)
    expect(await uuidv5(DNS_NAMESPACE, 'www.example.com')).toBe(expected)
  })

  it('derives the ProofOfMeetProtocol namespace from the DNS namespace', async () => {
    expect(await uuidv5(DNS_NAMESPACE, 'verifymymeeting.com/vcon')).toBe(
      VMM_VCON_NAMESPACE,
    )
    expect(nodeUuidv5(DNS_NAMESPACE, 'verifymymeeting.com/vcon')).toBe(
      VMM_VCON_NAMESPACE,
    )
  })

  it('round-trips bytes', () => {
    expect(bytesToUuid(uuidToBytes(DNS_NAMESPACE))).toBe(DNS_NAMESPACE)
    expect(() => uuidToBytes('nope')).toThrow(TypeError)
  })
})

describe('builder', () => {
  it('builds a valid vCon with inline text and an attachment', async () => {
    const vcon = createVcon({
      uuid: await uuidv5(VMM_VCON_NAMESPACE, 'builder-test'),
      created_at: '2026-11-07T10:00:00Z',
      subject: 'Builder',
      extensions: ['verifymymeeting'],
    })
    const alice = addParty(vcon, { name: 'Alice', uuid: 'Person #1001' })
    const bob = addParty(vcon, { name: 'Bob', uuid: 'Person #1002' })
    const text = addDialog(vcon, {
      type: 'text',
      start: '2026-11-07T10:00:00Z',
      parties: [alice, bob],
      ...inlineText('Alice: hi\nBob: hello'),
    })
    addSession(vcon, {
      start: '2026-11-07T10:00:00Z',
      parties: [alice, bob],
      dialog: [text],
    })
    addAttachment(vcon, {
      purpose: 'evidence',
      start: '2026-11-07T10:05:00Z',
      party: alice,
      dialog: text,
      url: 'https://example.com/evidence.pdf',
      content_hash: await contentHash(new Uint8Array([1, 2, 3])),
    })
    expect(validateVcon(vcon)).toEqual([])
    expect(vcon.vcon).toBe('0.5.0')
    expect(JSON.parse(JSON.stringify(vcon))).toEqual(vcon)
  })
})
