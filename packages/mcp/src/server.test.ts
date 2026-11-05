import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createClient } from '@verifymymeeting/sdk'
import { describe, expect, it } from 'vitest'

import { createVmmMcpServer, optionsFromEnv, toolNames } from './index.js'

async function connected(handler: (url: URL, init: RequestInit) => Response) {
  const client = createClient({
    baseUrl: 'https://vmm.example',
    token: 'vmm_sk_test',
    fetch: async (input: string | URL, init: RequestInit = {}) =>
      handler(new URL(String(input)), init),
  })
  const server = createVmmMcpServer({ baseUrl: 'https://vmm.example', client })
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
      tools.find((t) => t.name === 'vmm_attach_record')?.inputSchema.properties,
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
      name: 'vmm_create_workspace',
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
      name: 'vmm_get_verification',
      arguments: { key: 'missing' },
    })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('not_found')
  })

  it('reads configuration from the environment', () => {
    expect(() => optionsFromEnv({})).toThrow()
    expect(
      optionsFromEnv({ VMM_BASE_URL: 'https://x', VMM_TOKEN: '' }),
    ).toEqual({
      baseUrl: 'https://x',
      token: undefined,
    })
  })
})
