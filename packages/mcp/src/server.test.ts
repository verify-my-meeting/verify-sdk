import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createClient } from '@proofofmeet/sdk'
import {
  addParty,
  addSession,
  createVcon,
  jwkFromRawEd25519,
  signVcon,
} from '@proofofmeet/vcon'
import { describe, expect, it } from 'vitest'

import { createVmmMcpServer, optionsFromEnv, toolNames } from './index.js'

async function connected(handler: (url: URL, init: RequestInit) => Response) {
  const client = createClient({
    baseUrl: 'https://pomp.example',
    token: 'pomp_sk_test',
    fetch: async (input: string | URL, init: RequestInit = {}) =>
      handler(new URL(String(input)), init),
  })
  const server = createVmmMcpServer({ baseUrl: 'https://pomp.example', client })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const mcp = new Client({ name: 'test', version: '0' })
  await mcp.connect(clientTransport)
  return mcp
}

describe('createVmmMcpServer', () => {
  it('lists every tool', async () => {
    const mcp = await connected(() => new Response('{}'))
    const { tools } = await mcp.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([...toolNames].sort())
    expect(
      tools.find((t) => t.name === 'pomp_attach_record')?.inputSchema
        .properties,
    ).toHaveProperty('text')
  })

  it('calls the API and returns structured content', async () => {
    const seen: Array<string> = []
    const mcp = await connected((url, init) => {
      seen.push(`${init.method} ${url.pathname}`)
      return new Response(
        JSON.stringify({ id: 'w1', title: 'Interview', status: 'draft' }),
      )
    })
    const result = await mcp.callTool({
      name: 'pomp_create_workspace',
      arguments: { title: 'Interview' },
    })
    expect(seen).toEqual(['POST /api/v1/workspaces'])
    expect(result.isError).toBeFalsy()
    expect((result.structuredContent as { id: string }).id).toBe('w1')
  })

  it('reports API errors as tool errors', async () => {
    const mcp = await connected(
      () =>
        new Response(
          JSON.stringify({
            error: { code: 'not_found', message: 'Workspace not found.' },
          }),
          { status: 404 },
        ),
    )
    const result = await mcp.callTool({
      name: 'pomp_get_verification',
      arguments: { key: 'missing' },
    })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('not_found')
  })

  it('reads configuration from the environment', () => {
    expect(() => optionsFromEnv({})).toThrow()
    expect(
      optionsFromEnv({ POMP_BASE_URL: 'https://x', POMP_TOKEN: '' }),
    ).toEqual({
      baseUrl: 'https://x',
      token: undefined,
    })
  })

  it('exports a vCon, verifies it against the JWK Set, and returns the raw JWS on request', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
      'sign',
      'verify',
    ])
    const raw = new Uint8Array(
      await crypto.subtle.exportKey('raw', pair.publicKey),
    )
    const vcon = createVcon({
      uuid: '0a1ef5b3-f353-5995-a562-29895c6a9e87',
      created_at: '2026-11-07T10:00:00Z',
      subject: 'Interview 7',
    })
    addParty(vcon, { name: 'Alice' })
    addSession(vcon, { parties: [0] })
    const signed = await signVcon(vcon, {
      privateKey: pair.privateKey,
      kid: 'pomp-1',
    })
    const seen: Array<string> = []
    const mcp = await connected((url, init) => {
      seen.push(
        `${init.method} ${url.pathname}${url.search} ${(init.headers as Record<string, string>).accept}`,
      )
      if (url.pathname === '/.well-known/jwks.json') {
        return new Response(
          JSON.stringify({ keys: [jwkFromRawEd25519(raw, 'pomp-1')] }),
        )
      }
      return new Response(JSON.stringify(signed), {
        headers: { 'content-type': 'application/jose+json' },
      })
    })
    const workspaceId = 'c0000000-0000-4000-8000-000000000003'
    const plain = await mcp.callTool({
      name: 'pomp_export_vcon',
      arguments: { workspaceId },
    })
    expect(plain.isError).toBeFalsy()
    const plainContent = plain.structuredContent as Record<string, unknown>
    expect(plainContent.vcon).toEqual(vcon)
    expect(plainContent.signature).toBe('unverified')
    expect(plainContent).not.toHaveProperty('raw')

    const verified = await mcp.callTool({
      name: 'pomp_export_vcon',
      arguments: { workspaceId, commit: 2, verify: true, raw: true },
    })
    const content = verified.structuredContent as Record<string, unknown>
    expect(content.signature).toBe('verified')
    expect(content.kid).toBe('pomp-1')
    expect(content.raw).toEqual(signed)
    expect(seen).toEqual([
      `GET /api/v1/workspaces/${workspaceId}/vcon application/jose+json`,
      `GET /api/v1/workspaces/${workspaceId}/vcon?commit=2 application/jose+json`,
      'GET /.well-known/jwks.json application/json',
    ])

    // A key set without the signing key: invalid.
    const other = await connected((url) =>
      url.pathname === '/.well-known/jwks.json'
        ? new Response(JSON.stringify({ keys: [] }))
        : new Response(JSON.stringify(signed)),
    )
    const invalid = await other.callTool({
      name: 'pomp_export_vcon',
      arguments: { workspaceId, verify: true },
    })
    expect(
      (invalid.structuredContent as Record<string, unknown>).signature,
    ).toBe('invalid')
  })

  it('imports a vCon object or an email thread', async () => {
    const seen: Array<{ path: string; type: string; body: string }> = []
    const mcp = await connected((url, init) => {
      seen.push({
        path: `${url.pathname}${url.search}`,
        type: (init.headers as Record<string, string>)['content-type'],
        body: String(init.body),
      })
      return new Response(
        JSON.stringify({
          workspace: { id: 'w2' },
          commit: { seq: 1 },
          imported: { parties: 1, documents: 1, signature: 'none' },
        }),
      )
    })
    const fromVcon = await mcp.callTool({
      name: 'pomp_import_vcon',
      arguments: { vcon: { vcon: '0.5.0', uuid: 'u', subject: 'Thread' } },
    })
    expect(fromVcon.isError).toBeFalsy()
    expect(
      (fromVcon.structuredContent as { imported: { parties: number } }).imported
        .parties,
    ).toBe(1)
    const fromEmail = await mcp.callTool({
      name: 'pomp_import_vcon',
      arguments: {
        email: 'From: a@example.com\r\nSubject: Hi\r\n\r\nHello',
        mbox: true,
        workspaceId: 'c0000000-0000-4000-8000-000000000003',
        message: 'thread',
      },
    })
    expect(fromEmail.isError).toBeFalsy()
    expect(seen).toEqual([
      {
        path: '/api/v1/vcon/import',
        type: 'application/json',
        body: '{"vcon":{"vcon":"0.5.0","uuid":"u","subject":"Thread"}}',
      },
      {
        path: '/api/v1/vcon/import?workspaceId=c0000000-0000-4000-8000-000000000003&message=thread',
        type: 'application/mbox',
        body: 'From: a@example.com\r\nSubject: Hi\r\n\r\nHello',
      },
    ])
    const neither = await mcp.callTool({
      name: 'pomp_import_vcon',
      arguments: {},
    })
    expect(neither.isError).toBe(true)
    expect(JSON.stringify(neither.content)).toContain('exactly one')
  })
})
