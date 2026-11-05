/**
 * @verifymymeeting/mcp
 *
 * MCP server exposing VerifyMyMeeting as tools, so notetaker agents and
 * research agents can produce verified meetings as a side effect of their
 * normal work. Wraps `@verifymymeeting/sdk`; authenticate with an
 * integrator API key or a consent token.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { VmmApiError, createClient } from '@verifymymeeting/sdk'
import type { VmmClient } from '@verifymymeeting/sdk'
import { z } from 'zod'

export const MCP_PACKAGE_VERSION = '0.1.0'

export type VmmMcpOptions = {
  baseUrl: string | URL
  token?: string
  /** For tests: inject a client instead of building one. */
  client?: VmmClient
}

const hex64 = z
  .string()
  .regex(/^[0-9a-f]{64}$/iu, 'Expected a SHA-256 hex digest')

const contentVisibility = z
  .enum(['public', 'link', 'viewer'])
  .describe(
    'Who may read the record content: public, link holders, or workspace viewers',
  )

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  }
}

function fail(error: unknown) {
  let message: string
  if (error instanceof VmmApiError) {
    message = `${error.code} (${error.status}): ${error.message}`
  } else if (error instanceof Error) {
    message = error.message
  } else {
    message = String(error)
  }
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

async function run(fn: () => Promise<unknown>) {
  try {
    return ok(await fn())
  } catch (error: unknown) {
    return fail(error)
  }
}

export function createVmmMcpServer(options: VmmMcpOptions): McpServer {
  const client =
    options.client ??
    createClient({ baseUrl: options.baseUrl, token: options.token })
  const server = new McpServer({
    name: 'verifymymeeting',
    version: MCP_PACKAGE_VERSION,
  })

  server.registerTool(
    'vmm_list_workspaces',
    {
      title: 'List meeting workspaces',
      description:
        'List the meeting workspaces owned by the authenticated owner or integrator.',
      inputSchema: {},
    },
    () => run(() => client.workspaces.list()),
  )

  server.registerTool(
    'vmm_create_workspace',
    {
      title: 'Create a meeting workspace',
      description:
        'Create a workspace for one meeting. It starts private and in draft; open it with vmm_get_workspace after attaching records and creating invitations.',
      inputSchema: {
        title: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        purpose: z.string().max(1000).optional(),
        scheduledStart: z.string().datetime({ offset: true }).optional(),
        actualStart: z.string().datetime({ offset: true }).optional(),
        durationMinutes: z.number().int().positive().optional(),
        timezone: z.string().optional(),
        minScore: z
          .number()
          .min(0)
          .optional()
          .describe('Minimum humanity score required to attest'),
        open: z
          .boolean()
          .optional()
          .describe('Also move the workspace to open so invitations work'),
      },
    },
    ({ open, ...input }) =>
      run(async () => {
        const workspace = await client.workspaces.create(input)
        return open
          ? client.workspaces.setStatus(workspace.id, 'open')
          : workspace
      }),
  )

  server.registerTool(
    'vmm_get_workspace',
    {
      title: 'Get a meeting workspace',
      description:
        'Read a workspace with its records, participants, invitations, and attestations (owners), or a glimpse at the caller level.',
      inputSchema: {
        workspaceId: z.string().uuid(),
        status: z
          .enum(['open', 'closed'])
          .optional()
          .describe('Optionally move the workspace to this status first'),
      },
    },
    ({ workspaceId, status }) =>
      run(async () => {
        if (status) await client.workspaces.setStatus(workspaceId, status)
        return client.workspaces.get(workspaceId)
      }),
  )

  server.registerTool(
    'vmm_attach_record',
    {
      title: 'Attach a record to a workspace',
      description:
        'Attach a recording link (with optional SHA-256), a hash-only commitment, or transcript text that VerifyMyMeeting segments into Merkle leaves. Returns the record with its Merkle root.',
      inputSchema: {
        workspaceId: z.string().uuid(),
        kind: z.enum(['link', 'hash', 'text']),
        label: z.string().max(200).optional(),
        url: z.string().url().optional().describe('Required for kind=link'),
        hashHex: hex64
          .optional()
          .describe('Required for kind=hash; optional for kind=link'),
        text: z
          .string()
          .optional()
          .describe('Required for kind=text (plain text or Markdown)'),
        contentVisibility: contentVisibility.optional(),
        supersedesRecordId: z.string().uuid().optional(),
      },
    },
    ({
      workspaceId,
      kind,
      label,
      url,
      hashHex,
      text,
      contentVisibility: cv,
      supersedesRecordId,
    }) =>
      run(async () => {
        const shared = { label, contentVisibility: cv, supersedesRecordId }
        if (kind === 'link') {
          if (!url) throw new Error('url is required for kind=link')
          return client.records.create(workspaceId, {
            kind,
            url,
            hashHex,
            ...shared,
          })
        }
        if (kind === 'hash') {
          if (!hashHex) throw new Error('hashHex is required for kind=hash')
          return client.records.create(workspaceId, {
            kind,
            hashHex,
            label: label ?? 'Document',
            contentVisibility: cv,
            supersedesRecordId,
          })
        }
        if (!text) throw new Error('text is required for kind=text')
        return client.records.create(workspaceId, { kind, text, ...shared })
      }),
  )

  server.registerTool(
    'vmm_create_invitation',
    {
      title: 'Create an invitation link',
      description:
        'Create a per-slot link (one participant), an open link with a cap, or a viewer link. The returned URL is shown once; share it with the participant.',
      inputSchema: {
        workspaceId: z.string().uuid(),
        kind: z.enum(['slot', 'open', 'viewer']).default('slot'),
        label: z
          .string()
          .max(200)
          .optional()
          .describe('Owner-only label, e.g. the expected participant'),
        maxUses: z.number().int().positive().optional(),
      },
    },
    ({ workspaceId, ...input }) =>
      run(() => client.invitations.create(workspaceId, input)),
  )

  server.registerTool(
    'vmm_get_verification',
    {
      title: 'Get a verification page',
      description:
        'Read the verification page for a public slug, a link token, or a workspace id: participants with handles and score snapshots, attestations, records with approvals, and anchoring status.',
      inputSchema: { key: z.string().min(1) },
    },
    ({ key }) => run(() => client.verify(key)),
  )

  server.registerTool(
    'vmm_get_receipt',
    {
      title: 'Get an anchoring receipt',
      description:
        'Fetch the inclusion receipt for an attestation or record and the server-side verdict (valid, pending, invalid).',
      inputSchema: {
        kind: z.enum(['attestation', 'record']),
        id: z.string().uuid(),
      },
    },
    ({ kind, id }) => run(() => client.receipt(kind, id)),
  )

  return server
}

export const toolNames = [
  'vmm_list_workspaces',
  'vmm_create_workspace',
  'vmm_get_workspace',
  'vmm_attach_record',
  'vmm_create_invitation',
  'vmm_get_verification',
  'vmm_get_receipt',
] as const

export function optionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): VmmMcpOptions {
  const baseUrl = env.VMM_BASE_URL?.trim()
  if (!baseUrl)
    throw new Error('Set VMM_BASE_URL to the VerifyMyMeeting origin.')
  return { baseUrl, token: env.VMM_TOKEN?.trim() || undefined }
}
