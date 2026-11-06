import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  commitHashHex,
  textRecordCommitment,
  toHex,
  verifyCommitHash,
} from '@verifymymeeting/sdk'
import type {
  AttestationPayload,
  CommitBody,
  Receipt,
  TreeEntry,
} from '@verifymymeeting/sdk'

import {
  attestations,
  commitments,
  consents,
  identities,
  provenances,
  receipts,
  VMM_EXTENSION,
} from './extension'
import { contentHash, parseContentHash } from './hash'
import {
  jwkFromRawEd25519,
  resolverFromJwks,
  signVcon,
  verifyVcon,
} from './jws'
import { fromVcon, redactVcon, toVcon } from './mapping'
import type { ExportLevel, VmmExportInput } from './mapping'
import type { Vcon } from './types'
import { UnknownCriticalExtensionError, validateVcon } from './validate'
import { vmmVconUuid } from './uuid'

const fixtureDir = fileURLToPath(new URL('../test-fixtures/', import.meta.url))

const transcript = 'Alice: We start.\nBob: Agreed.\nAlice: Done.'
const summary = 'The meeting started and ended.'
const workspaceId = '0f1b7a3e-1111-4c1e-9c3f-000000000001'

async function buildInput(): Promise<VmmExportInput> {
  const transcriptRoot = await textRecordCommitment(transcript)
  const summaryRoot = await textRecordCommitment(summary)
  const linkHashHex = '00'.repeat(32)
  const hashHex = 'ab'.repeat(64)
  const tree1: Array<TreeEntry> = [
    {
      doc: 'doc-transcript',
      kind: 'text',
      label: 'Transcript',
      root: transcriptRoot.rootHex,
      leafCount: transcriptRoot.leafHashes.length,
      segmentation: 'v1',
      provenance: {
        type: 'transcript',
        creators: ['owner'],
        created: 'during',
        ai: 'none',
      },
    },
  ]
  const tree2: Array<TreeEntry> = [
    ...tree1,
    {
      doc: 'doc-summary',
      kind: 'text',
      label: 'AI summary',
      root: summaryRoot.rootHex,
      leafCount: summaryRoot.leafHashes.length,
      segmentation: 'v1',
      provenance: {
        type: 'notes',
        creators: ['owner'],
        created: 'after',
        ai: 'generated',
        aiRole: 'summary',
      },
    },
    {
      doc: 'doc-link',
      kind: 'link',
      label: 'Recording',
      root: linkHashHex,
      leafCount: 1,
      segmentation: null,
      provenance: {
        type: 'recording',
        creators: ['owner'],
        created: 'during',
        ai: 'none',
      },
    },
    {
      doc: 'doc-site',
      kind: 'link',
      label: 'Agenda page',
      root: 'cd'.repeat(64),
      leafCount: 1,
      segmentation: null,
      provenance: {
        type: 'other',
        creators: ['participant'],
        created: 'before',
        ai: 'none',
      },
    },
    {
      doc: 'doc-hash',
      kind: 'hash',
      label: 'Sealed minutes',
      root: hashHex,
      leafCount: 1,
      segmentation: null,
      provenance: {
        type: 'minutes',
        creators: ['owner'],
        created: 'after',
        ai: 'none',
      },
    },
  ]
  const body1: CommitBody = {
    v: 2,
    workspace: workspaceId,
    seq: 1,
    parent: null,
    kind: 'initial',
    author: { role: 'owner', ref: null },
    time: '2026-11-07T11:00:00.000Z',
    message: 'Transcript',
    tree: tree1,
  }
  const hash1 = await commitHashHex(body1)
  const body2: CommitBody = {
    v: 2,
    workspace: workspaceId,
    seq: 2,
    parent: hash1,
    kind: 'add-document',
    author: { role: 'participant', ref: 'Person #1002' },
    time: '2026-11-07T11:30:00.000Z',
    message: 'Summary, recording, agenda, minutes',
    tree: tree2,
  }
  const hash2 = await commitHashHex(body2)

  const score = {
    value: 21,
    schema: 'cubid-v2',
    fetchedAt: '2026-11-07T10:59:00.000Z',
  }
  const approval: AttestationPayload = {
    v: 1,
    workspace: workspaceId,
    handle: 'Person #1001',
    issuedAt: '2026-11-07T12:00:00.000Z',
    score,
    kind: 'record',
    commit: hash2,
    seq: 2,
    approvals: [
      {
        doc: 'doc-transcript',
        root: transcriptRoot.rootHex,
        leaves: 'all',
        witness: 'author',
      },
      {
        doc: 'doc-summary',
        root: summaryRoot.rootHex,
        leaves: 'all',
        witness: 'representative',
      },
      {
        doc: 'doc-link',
        root: linkHashHex,
        leaves: 'all',
        witness: 'witnessed',
      },
      {
        doc: 'doc-site',
        root: 'cd'.repeat(64),
        leaves: 'none',
        witness: 'none',
      },
      { doc: 'doc-hash', root: hashHex, leaves: 'all', witness: 'inspired' },
    ],
  }
  const attendance: AttestationPayload = {
    v: 1,
    workspace: workspaceId,
    handle: 'Person #1002',
    issuedAt: '2026-11-07T11:50:00.000Z',
    score,
    kind: 'attendance',
    mode: 'full',
  }
  const receipt: Receipt = {
    v: 2,
    batch: 'batch-1',
    root: 'ef'.repeat(64),
    index: 0,
    path: [],
    item: { kind: 'commit', id: hash2, leafHash: 'ef'.repeat(64) },
    ledger: {
      kind: 'opentimestamps',
      calendar: 'https://a.pool.opentimestamps.org',
      proof: null,
      status: 'submitted',
      submittedAt: '2026-11-08T00:00:00.000Z',
    },
    service: { keyId: 'svc-1', signature: null },
  }
  return {
    workspace: {
      id: workspaceId,
      title: 'Interview 7',
      scheduledStart: '2026-11-07T11:00:00.000Z',
      actualStart: null,
      durationMinutes: 45,
      createdAt: '2026-11-06T09:00:00.000Z',
    },
    owner: { name: 'Owner Org Research', org: 'Owner Org' },
    participants: [
      {
        id: 'p-2',
        handle: 'Person #1002',
        joinedAt: '2026-11-07T10:50:00.000Z',
        publicKeyHex: '11'.repeat(32),
        profile: { displayName: 'Bob', affiliation: 'Example Inc' },
      },
      {
        id: 'p-1',
        handle: 'Person #1001',
        joinedAt: '2026-11-07T10:45:00.000Z',
        publicKeyHex: '22'.repeat(32),
        profile: {
          displayName: 'A.',
          identifiers: [
            {
              kind: 'email',
              value: 'alice@example.com',
              verifiedBy: 'cubid',
              status: 'verified',
            },
            {
              kind: 'name',
              value: 'Alice Example',
              verifiedBy: 'cubid',
              status: 'verified',
              verifiedAt: '2026-10-01T00:00:00.000Z',
            },
            {
              kind: 'github',
              value: 'alice',
              verifiedBy: 'cubid',
              status: 'verified',
            },
          ],
        },
      },
      {
        id: 'p-3',
        handle: 'Person #1003',
        joinedAt: '2026-11-07T10:55:00.000Z',
        withdrawnAt: '2026-11-07T13:00:00.000Z',
        profile: { displayName: 'Gone' },
      },
    ],
    commits: [
      {
        hashHex: hash2,
        seq: 2,
        parentHashHex: hash1,
        kind: 'add-document',
        author: body2.author,
        message: body2.message,
        committedAt: body2.time,
        tree: tree2,
      },
      {
        hashHex: hash1,
        seq: 1,
        parentHashHex: null,
        kind: 'initial',
        author: body1.author,
        message: body1.message,
        committedAt: body1.time,
        tree: tree1,
      },
    ],
    records: {
      'doc-transcript': {
        documentId: 'doc-transcript',
        kind: 'text',
        label: 'Transcript',
        text: transcript,
        contentVisibility: 'public',
        leafHashes: ['aa'.repeat(64), 'bb'.repeat(64), 'cc'.repeat(64)],
      },
      'doc-summary': {
        documentId: 'doc-summary',
        kind: 'text',
        label: 'AI summary',
        text: summary,
        contentVisibility: 'viewer',
        tool: { vendor: 'Example AI', product: 'Notetaker' },
      },
      'doc-link': {
        documentId: 'doc-link',
        kind: 'link',
        label: 'Recording',
        url: 'https://meet.example/rec/1',
        hashHex: linkHashHex,
        hashAlg: 'sha256',
        mediatype: 'video/x-mp4',
        contentVisibility: 'link',
      },
      'doc-site': {
        documentId: 'doc-site',
        kind: 'link',
        label: 'Agenda page',
        url: 'https://example.com/agenda',
        contentVisibility: 'public',
      },
      'doc-hash': {
        documentId: 'doc-hash',
        kind: 'hash',
        label: 'Sealed minutes',
        hashHex,
        hashAlg: 'sha512',
        contentVisibility: 'viewer',
      },
    },
    attestations: [
      {
        id: 'att-2',
        workspaceId,
        participantId: 'p-1',
        kind: 'record',
        commitId: 'c-2',
        payload: approval,
        payloadHashHex: '33'.repeat(64),
        signatureB64: 'AAAA',
        keyId: 'k1',
        score,
        supersedesId: null,
        createdAt: '2026-11-07T12:00:00.000Z',
        tombstonedAt: null,
        publicKeyHex: '22'.repeat(32),
      },
      {
        id: 'att-1',
        workspaceId,
        participantId: 'p-2',
        kind: 'attendance',
        commitId: null,
        payload: attendance,
        payloadHashHex: '44'.repeat(64),
        signatureB64: 'BBBB',
        keyId: 'k2',
        score,
        supersedesId: null,
        createdAt: '2026-11-07T11:50:00.000Z',
        tombstonedAt: null,
        publicKeyHex: '11'.repeat(32),
      },
      {
        id: 'att-3',
        workspaceId,
        participantId: 'p-3',
        kind: 'attendance',
        commitId: null,
        payload: null,
        payloadHashHex: null,
        signatureB64: null,
        keyId: null,
        score: null,
        supersedesId: null,
        createdAt: '2026-11-07T11:55:00.000Z',
        tombstonedAt: '2026-11-07T13:00:00.000Z',
      },
      {
        id: 'att-0',
        workspaceId,
        participantId: 'p-1',
        kind: 'record',
        commitId: 'c-1',
        payload: {
          ...approval,
          commit: hash1,
          seq: 1,
          approvals: [approval.approvals[0]!],
        },
        payloadHashHex: '55'.repeat(64),
        signatureB64: 'CCCC',
        keyId: 'k1',
        score,
        supersedesId: null,
        createdAt: '2026-11-07T11:10:00.000Z',
        tombstonedAt: null,
      },
    ],
    receipts: [receipt],
    consents: [
      {
        participantId: 'p-1',
        entries: [
          {
            scope: 'profile:viewer',
            to: 'viewer',
            at: '2026-11-07T10:46:00.000Z',
            fields: ['displayName', 'email', 'name', 'github'],
          },
        ],
      },
    ],
    serviceKeyId: 'svc-1',
    renderedAt: '2026-11-08T08:00:00.000Z',
  }
}

const baseOptions = {
  contentBaseUrl: 'https://verifymymeeting.com/api/v1/workspaces/w/content/',
  mappingVersion: 1 as const,
}

function entryByDoc(vcon: Vcon, doc: string) {
  const record = provenances(vcon).find((p) => p.payload.doc === doc)
  if (!record?.payload.entry) throw new Error(`no entry for ${doc}`)
  const { array, index } = record.payload.entry
  return (vcon[array] as Array<Record<string, unknown>>)[index]!
}

describe('toVcon', () => {
  it('renders a valid, deterministic owner-level document', async () => {
    const input = await buildInput()
    const a = await toVcon(input, { ...baseOptions, level: 'owner' })
    const b = await toVcon(JSON.parse(JSON.stringify(input)), {
      ...baseOptions,
      level: 'owner',
    })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(validateVcon(a)).toEqual([])

    const head = input.commits.find((c) => c.seq === 2)!
    expect(a.uuid).toBe(await vmmVconUuid(head.hashHex, 'owner'))
    expect(a.amended_from).toEqual({
      uuid: await vmmVconUuid(head.parentHashHex!, 'owner'),
    })
    expect(a.redacted_from).toBeUndefined()
    expect(a.created_at).toBe(head.committedAt)
    expect(a.updated_at).toBe(input.renderedAt)
    expect(a.subject).toBe('Interview 7')
    expect(a.extensions).toEqual([VMM_EXTENSION])
    expect(a.critical).toBeUndefined()
    expect(a.sessions).toEqual([
      {
        start: '2026-11-07T11:00:00.000Z',
        duration: 2700,
        parties: [0, 1, 2, 3],
        dialog: [0, 1],
      },
    ])

    // Parties: owner, participants by handle, service.
    expect(a.parties?.map((p) => p.uuid)).toEqual([
      'owner',
      'Person #1001',
      'Person #1002',
      'Person #1003',
      'verifymymeeting.com',
    ])
    expect(a.parties?.[0]).toEqual({
      uuid: 'owner',
      type: 'person',
      validation: 'verifymymeeting',
      name: 'Owner Org Research',
      org: 'Owner Org',
    })
    expect(a.parties?.[1]).toEqual({
      uuid: 'Person #1001',
      type: 'person',
      validation: 'verifymymeeting',
      name: 'Alice Example',
      mailto: 'alice@example.com',
    })
    expect(a.parties?.[2]).toEqual({
      uuid: 'Person #1002',
      type: 'person',
      validation: 'verifymymeeting',
      name: 'Bob',
      org: 'Example Inc',
    })
    expect(a.parties?.[3]).toEqual({
      uuid: 'Person #1003',
      type: 'person',
      validation: 'verifymymeeting',
      name: 'anonymous',
    })
    expect(a.parties?.[4]?.type).toBe('organization')

    // Documents: transcript and recording as dialog, AI summary as analysis,
    // agenda link and sealed minutes as attachments.
    expect(a.dialog).toHaveLength(2)
    const transcriptEntry = entryByDoc(a, 'doc-transcript')
    expect(transcriptEntry).toMatchObject({
      type: 'text',
      body: transcript,
      encoding: 'none',
      mediatype: 'text/plain',
      parties: [1, 2, 3],
    })
    expect(transcriptEntry.content_hash).toBe(
      await contentHash(new TextEncoder().encode(transcript)),
    )
    const recording = entryByDoc(a, 'doc-link')
    expect(recording).toMatchObject({
      type: 'recording',
      url: 'https://meet.example/rec/1',
      mediatype: 'video/x-mp4',
    })
    expect(parseContentHash(recording.content_hash as string)).toMatchObject({
      algorithm: 'sha256',
      hex: '00'.repeat(32),
    })
    const summaryEntry = entryByDoc(a, 'doc-summary')
    expect(summaryEntry).toMatchObject({
      type: 'summary',
      dialog: [0, 1],
      vendor: 'Example AI',
      product: 'Notetaker',
      body: summary,
    })
    const site = entryByDoc(a, 'doc-site')
    expect(site).toMatchObject({
      purpose: 'other',
      party: 2,
      body: 'https://example.com/agenda',
      encoding: 'none',
      mediatype: 'text/uri-list',
      session: 0,
    })
    const sealed = entryByDoc(a, 'doc-hash')
    expect(sealed).toMatchObject({ purpose: 'minutes', party: 2 })
    expect(parseContentHash(sealed.content_hash as string).hex).toBe(
      'ab'.repeat(64),
    )
    expect(sealed.url).toBeUndefined()

    // Extension attachments.
    const prov = provenances(a)
    expect(prov.map((p) => p.payload.doc)).toEqual([
      'doc-hash',
      'doc-link',
      'doc-site',
      'doc-summary',
      'doc-transcript',
    ])
    expect(
      prov.find((p) => p.payload.doc === 'doc-transcript')?.payload.witnesses,
    ).toEqual([{ handle: 'Person #1001', witness: 'author', leaves: 'all' }])
    // Tree order is by document id: the recording link is dialog 0.
    expect(
      prov.find((p) => p.payload.doc === 'doc-transcript')?.attachment.dialog,
    ).toBe(1)
    expect(
      prov.find((p) => p.payload.doc === 'doc-link')?.attachment.dialog,
    ).toBe(0)
    const commitment = commitments(a)[0]!.payload
    expect(commitment.hashHex).toBe(head.hashHex)
    expect(await verifyCommitHash(commitment.body, commitment.hashHex)).toBe(
      true,
    )
    expect(commitment.leaves).toEqual({
      'doc-transcript': ['aa'.repeat(64), 'bb'.repeat(64), 'cc'.repeat(64)],
    })
    expect(commitments(a)[0]!.attachment.party).toBe(2)
    // Attendance and this commit's approval, the tombstone, not commit 1's approval.
    expect(attestations(a).map((x) => x.payload.id)).toEqual([
      'att-1',
      'att-3',
      'att-2',
    ])
    expect(attestations(a).map((x) => x.attachment.party)).toEqual([2, 3, 1])
    expect(receipts(a)).toHaveLength(1)
    expect(receipts(a)[0]!.attachment.party).toBe(4)
    expect(consents(a).map((x) => x.payload.handle)).toEqual(['Person #1001'])
    expect(identities(a).map((x) => x.payload.handle)).toEqual([
      'Person #1001',
      'Person #1002',
    ])
    expect(identities(a)[0]!.payload.identifiers.map((i) => i.kind)).toEqual([
      'email',
      'github',
      'name',
    ])
    expect(a.attachments?.every((att) => typeof att.start === 'string')).toBe(
      true,
    )
  })

  it('renders the first commit when asked', async () => {
    const input = await buildInput()
    const first = await toVcon(input, {
      ...baseOptions,
      level: 'owner',
      commitSeq: 1,
    })
    expect(validateVcon(first)).toEqual([])
    expect(first.amended_from).toBeUndefined()
    expect(first.dialog).toHaveLength(1)
    expect(attestations(first).map((x) => x.payload.id)).toEqual([
      'att-0',
      'att-1',
      'att-3',
    ])
  })

  it('redacts lower levels by omission, agreeing with a direct render', async () => {
    const input = await buildInput()
    const owner = await toVcon(input, { ...baseOptions, level: 'owner' })
    const source = {
      url: 'https://verifymymeeting.com/x.vcon.jws',
      content_hash: await contentHash(
        new TextEncoder().encode(JSON.stringify(owner)),
      ),
    }
    for (const level of [
      'viewer',
      'link',
      'public',
    ] as const satisfies ReadonlyArray<ExportLevel>) {
      const redacted = await redactVcon(owner, level, { source })
      expect(validateVcon(redacted)).toEqual([])
      const stripped: VmmExportInput = {
        ...input,
        participants: input.participants.map((p) => ({
          ...p,
          profile: level === 'viewer' ? p.profile : null,
        })),
      }
      const direct = await toVcon(stripped, { ...baseOptions, level, source })
      expect(JSON.stringify(redacted)).toBe(JSON.stringify(direct))
      expect(redacted.redacted_from).toEqual({
        uuid: owner.uuid,
        type: level === 'viewer' ? 'UNSPECIFIED' : 'CONTACT_INFO',
        ...source,
      })
      expect(redacted.amended_from).toBeUndefined()
      expect(redacted.uuid).not.toBe(owner.uuid)
      expect(redacted.redacted_strings).toBeUndefined()
    }

    const pub = await redactVcon(owner, 'public')
    expect(pub.parties?.[1]).toEqual({
      uuid: 'Person #1001',
      type: 'person',
      validation: 'verifymymeeting',
      name: 'anonymous',
    })
    expect(entryByDoc(pub, 'doc-transcript')).toMatchObject({
      type: 'text',
      body: transcript,
    })
    const summaryEntry = entryByDoc(pub, 'doc-summary')
    expect(summaryEntry.body).toBeUndefined()
    expect(summaryEntry.url).toBeUndefined()
    expect(summaryEntry.content_hash).toBe(
      await contentHash(new TextEncoder().encode(summary)),
    )
    const recording = entryByDoc(pub, 'doc-link')
    expect(recording.url).toBeUndefined()
    expect(recording.mediatype).toBeUndefined()
    expect(parseContentHash(recording.content_hash as string).algorithm).toBe(
      'sha256',
    )
    expect(identities(pub)).toHaveLength(0)
    expect(consents(pub)).toHaveLength(0)
    expect(commitments(pub)[0]!.payload.leaves).toBeUndefined()
    expect(attestations(pub)).toHaveLength(3)

    const link = await redactVcon(owner, 'link', {
      disclosed: { 'Person #1002': { displayName: 'Bob' } },
    })
    expect(link.parties?.[2]?.name).toBe('Bob')
    expect(entryByDoc(link, 'doc-link').url).toBe('https://meet.example/rec/1')
    expect(identities(link).map((x) => x.payload.handle)).toEqual([
      'Person #1002',
    ])
  })

  it('imports its own export back into the same documents', async () => {
    const input = await buildInput()
    const owner = await toVcon(input, { ...baseOptions, level: 'owner' })
    const plan = await fromVcon(owner)
    expect(plan.title).toBe('Interview 7')
    expect(plan.vmm?.commitHashHex).toBe(input.commits[0]!.hashHex)
    expect(plan.vmm?.attestations).toBe(3)
    expect(plan.parties.map((p) => p.role)).toEqual([
      'owner',
      'participant',
      'participant',
      'participant',
      'service',
    ])
    expect(plan.parties[1]).toMatchObject({
      handle: 'Person #1001',
      name: 'Alice Example',
      mailto: 'alice@example.com',
    })
    expect(plan.parties[3]).toMatchObject({
      handle: 'Person #1003',
      name: null,
    })
    expect(plan.preserved.sessions).toEqual(owner.sessions)

    const byId = Object.fromEntries(
      plan.documents.map((d) => [d.documentId, d]),
    )
    expect(Object.keys(byId).sort()).toEqual([
      'doc-hash',
      'doc-link',
      'doc-site',
      'doc-summary',
      'doc-transcript',
    ])
    expect(byId['doc-transcript']).toMatchObject({
      kind: 'text',
      text: transcript,
      label: 'Transcript',
      provenance: input.commits[0]!.tree[0]!.provenance,
    })
    expect(byId['doc-summary']).toMatchObject({
      kind: 'text',
      text: summary,
      provenance: { type: 'notes', ai: 'generated', aiRole: 'summary' },
    })
    expect(byId['doc-link']).toMatchObject({
      kind: 'link',
      url: 'https://meet.example/rec/1',
      hashHex: '00'.repeat(32),
      hashAlg: 'sha256',
      label: 'Recording',
    })
    expect(byId['doc-site']).toMatchObject({
      kind: 'link',
      url: 'https://example.com/agenda',
    })
    expect((byId['doc-site'] as { hashHex?: string }).hashHex).toBeUndefined()
    expect(byId['doc-hash']).toMatchObject({
      kind: 'hash',
      hashHex: 'ab'.repeat(64),
      hashAlg: 'sha512',
      label: 'Sealed minutes',
    })

    // Through the signed form.
    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
      'sign',
      'verify',
    ])
    const raw = new Uint8Array(
      await crypto.subtle.exportKey('raw', pair.publicKey),
    )
    const signed = await signVcon(owner, {
      privateKey: pair.privateKey,
      kid: input.serviceKeyId,
    })
    const verified = await verifyVcon(
      signed,
      resolverFromJwks({ keys: [jwkFromRawEd25519(raw, 'svc-1')] }),
    )
    expect(verified.ok).toBe(true)
    if (verified.ok) {
      expect(JSON.stringify(await fromVcon(verified.vcon))).toBe(
        JSON.stringify(plan),
      )
    }
  })

  it('imports a plain vCon from the draft and derives provenance', async () => {
    const email = JSON.parse(
      readFileSync(
        `${fixtureDir}ab_email_prob_followup_text_thread.vcon`,
        'utf8',
      ),
    ) as Vcon
    const plan = await fromVcon(email)
    expect(plan.vmm).toBeNull()
    expect(plan.title).toBe('Account issue followup')
    expect(plan.parties.map((p) => p.role)).toEqual(['unknown', 'unknown'])
    expect(plan.parties[0]).toMatchObject({
      name: 'Alice',
      mailto: 'a@example.com',
    })
    expect(plan.documents).toHaveLength(3)
    expect(plan.documents[0]).toMatchObject({
      kind: 'text',
      source: { array: 'dialog', index: 0 },
      provenance: {
        type: 'transcript',
        creators: ['other-human'],
        created: 'during',
        ai: 'none',
      },
    })
    expect(
      (plan.documents[0] as { text: string }).text.startsWith('Hi Bob:'),
    ).toBe(true)

    const analysed = JSON.parse(
      readFileSync(`${fixtureDir}ab_call_ext_rec_analysis.vcon`, 'utf8'),
    ) as Vcon
    const plan2 = await fromVcon(analysed)
    expect(plan2.documents.map((d) => d.kind)).toEqual(['link', 'text'])
    expect(plan2.documents[0]).toMatchObject({
      kind: 'link',
      hashAlg: 'sha512',
      provenance: { type: 'recording' },
    })
    expect((plan2.documents[0] as { hashHex: string }).hashHex).toHaveLength(
      128,
    )
    expect(plan2.documents[1]).toMatchObject({
      provenance: {
        type: 'transcript',
        ai: 'generated',
        aiRole: 'verbatim',
        note: 'deepgram transcription deepgram_prerecorded',
      },
    })

    const inline = JSON.parse(
      readFileSync(`${fixtureDir}ab_call_int_rec.vcon`, 'utf8'),
    ) as Vcon
    const plan3 = await fromVcon(inline)
    expect(plan3.documents[0]).toMatchObject({
      kind: 'hash',
      hashAlg: 'sha512',
      label: 'ab_call.wav',
    })
    expect(plan3.preserved.events).toHaveLength(4)
  })

  it('rejects unknown critical extensions', async () => {
    const vcon: Vcon = {
      uuid: 'u',
      created_at: '2026-01-01T00:00:00Z',
      extensions: ['x'],
      critical: ['x'],
    }
    await expect(fromVcon(vcon)).rejects.toThrow(UnknownCriticalExtensionError)
    await expect(fromVcon(vcon, { known: ['x'] })).resolves.toMatchObject({
      documents: [],
    })
    const ours: Vcon = {
      ...vcon,
      extensions: [VMM_EXTENSION],
      critical: [VMM_EXTENSION],
    }
    await expect(fromVcon(ours)).resolves.toBeTruthy()
  })

  it('refuses a mismatched mapping version and missing records', async () => {
    const input = await buildInput()
    await expect(
      toVcon(input, {
        ...baseOptions,
        level: 'owner',
        mappingVersion: 2 as unknown as 1,
      }),
    ).rejects.toThrow('mapping version')
    const { 'doc-hash': _dropped, ...records } = input.records
    await expect(
      toVcon({ ...input, records }, { ...baseOptions, level: 'owner' }),
    ).rejects.toThrow('doc-hash')
    expect(toHex(new Uint8Array([1]))).toBe('01')
  })
})
