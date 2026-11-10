/**
 * @verifymymeeting/mcp
 *
 * MCP server exposing ProofOfMeetProtocol as tools, so notetaker agents and
 * research agents can produce verified meetings as a side effect of their
 * normal work. Wraps `@verifymymeeting/sdk`; authenticate with an
 * integrator API key or a consent token.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  VmmApiError,
  aiInvolvements,
  aiRoles,
  createClient,
  createdWhen,
  creators,
  provenanceTypes,
} from '@verifymymeeting/sdk'
import type { Provenance, VmmClient } from '@verifymymeeting/sdk'
import {
  resolverFromJwks,
  unsignedFrom,
  verifyVcon,
} from '@verifymymeeting/vcon'
import type { SignedVcon } from '@verifymymeeting/vcon'
import { z } from 'zod'

export const MCP_PACKAGE_VERSION = '0.3.0'

export type VmmMcpOptions = {
  baseUrl: string | URL
  token?: string
  /** For tests: inject a client instead of building one. */
  client?: VmmClient
}

const hex64 = z
  .string()
  .regex(/^[0-9a-f]{64}$/iu, 'Expected a SHA-256 hex digest')
const hex128 = z
  .string()
  .regex(/^[0-9a-f]{128}$/iu, 'Expected a SHA-512 hex digest')
/** Owner-supplied digest: SHA-512 (default) or SHA-256, declared by `hashAlg`. */
const ownerDigest = z.union([hex128, hex64])

const contentVisibility = z
  .enum(['public', 'link', 'viewer'])
  .describe(
    'Who may read the record content: public, link holders, or workspace viewers',
  )

const provenanceSchema = z
  .object({
    type: z.enum(provenanceTypes).describe('What the document is'),
    creators: z
      .array(z.enum(creators))
      .min(1)
      .describe('Who made it: the owner, a participant, another person'),
    created: z
      .enum(createdWhen)
      .describe('Made before, during, or after the meeting'),
    ai: z
      .enum(aiInvolvements)
      .describe('none, assisted (a human made it with AI help), or generated'),
    aiRole: z
      .enum(aiRoles)
      .optional()
      .describe(
        'Required unless ai=none: verbatim (exact transcript or notes), summary (not embellished), enhanced',
      ),
    evidenceDocId: z
      .string()
      .uuid()
      .optional()
      .describe(
        'For a verified prior artefact: the evidence document in the same package',
      ),
    note: z.string().max(280).optional(),
  })
  .describe(
    'Provenance declaration, committed with the document and shown to readers',
  )

const documentSchema = z.object({
  kind: z.enum(['link', 'hash', 'text']),
  label: z.string().max(200).optional(),
  url: z.string().url().optional().describe('Required for kind=link'),
  hashHex: ownerDigest
    .optional()
    .describe('Required for kind=hash; optional for kind=link'),
  hashAlg: z
    .enum(['sha512', 'sha256'])
    .optional()
    .describe(
      'Algorithm of hashHex; sha512 (128 hex) by default, sha256 (64 hex)',
    ),
  text: z
    .string()
    .optional()
    .describe('Required for kind=text (plain text or Markdown)'),
  contentVisibility: contentVisibility.optional(),
  documentId: z
    .string()
    .uuid()
    .optional()
    .describe('Replace this existing document with a new version'),
  provenance: provenanceSchema,
})

function toDocumentInput(doc: z.infer<typeof documentSchema>) {
  const shared = {
    label: doc.label,
    contentVisibility: doc.contentVisibility,
    documentId: doc.documentId,
    provenance: doc.provenance as Provenance,
  }
  if (doc.kind === 'link') {
    if (!doc.url) throw new Error('url is required for kind=link')
    return {
      kind: 'link' as const,
      url: doc.url,
      hashHex: doc.hashHex,
      hashAlg: doc.hashAlg,
      ...shared,
    }
  }
  if (doc.kind === 'hash') {
    if (!doc.hashHex) throw new Error('hashHex is required for kind=hash')
    return {
      kind: 'hash' as const,
      hashHex: doc.hashHex,
      hashAlg: doc.hashAlg,
      ...shared,
      label: doc.label ?? 'Document',
    }
  }
  if (!doc.text) throw new Error('text is required for kind=text')
  return { kind: 'text' as const, text: doc.text, ...shared }
}

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
      title: 'Add a document to a workspace',
      description:
        'Add one document (a recording link with an optional digest, a hash-only commitment, or transcript text segmented into Merkle leaves) as one commit on the workspace chain, with its provenance declaration. Digests are SHA-512 by default; pass hashAlg sha256 for a SHA-256 digest. Pass documentId to replace an existing document. Returns the record with its Merkle root and the commit.',
      inputSchema: {
        workspaceId: z.string().uuid(),
        ...documentSchema.shape,
        message: z.string().max(500).optional().describe('Commit message'),
      },
    },
    ({ workspaceId, message, ...doc }) =>
      run(() =>
        client.records.create(workspaceId, {
          ...toDocumentInput(doc),
          message,
        }),
      ),
  )

  server.registerTool(
    'vmm_commit_records',
    {
      title: 'Commit several document changes',
      description:
        'Create one commit that adds or replaces several documents and/or removes documents from the package. Every added or replaced document needs a provenance declaration. Commits are append-only; participants approve a specific commit.',
      inputSchema: {
        workspaceId: z.string().uuid(),
        message: z.string().max(500).optional(),
        documents: z.array(documentSchema).optional(),
        remove: z
          .array(z.string().uuid())
          .optional()
          .describe('Document ids to drop from the package'),
      },
    },
    ({ workspaceId, message, documents, remove }) =>
      run(() =>
        client.commits.create(workspaceId, {
          message,
          documents: (documents ?? []).map(toDocumentInput),
          remove,
        }),
      ),
  )

  server.registerTool(
    'vmm_get_history',
    {
      title: 'Get the commit history of a workspace',
      description:
        'List the commits of a workspace package in order (sequence, hash, kind, author, message, tree of documents with their roots and provenance). Optionally include the diff of one commit against its parent.',
      inputSchema: {
        workspaceId: z.string().uuid(),
        linkKey: z
          .string()
          .optional()
          .describe('Link token for link-visible workspaces'),
        diffOf: z
          .string()
          .regex(/^[0-9a-f]{128}$/iu)
          .optional()
          .describe('Also return the diff of this commit hash'),
      },
    },
    ({ workspaceId, linkKey, diffOf }) =>
      run(async () => {
        const history = await client.commits.list(workspaceId, linkKey)
        const diff = diffOf ? await client.commits.diff(diffOf, linkKey) : null
        return { ...history, diff }
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
        'Read the verification page for a public slug, a link token, or a workspace id: participants with handles and score snapshots, the commit each approved, documents at the head commit with declarations, witness statements and human-involvement grades, and anchoring status.',
      inputSchema: { key: z.string().min(1) },
    },
    ({ key }) => run(() => client.verify(key)),
  )

  server.registerTool(
    'vmm_get_receipt',
    {
      title: 'Get an anchoring receipt',
      description:
        'Fetch the inclusion receipt for an attestation or commit and the server-side verdict (valid, pending, invalid).',
      inputSchema: {
        kind: z.enum(['attestation', 'commit']),
        id: z.string().describe('Attestation id, commit id, or commit hash'),
      },
    },
    ({ kind, id }) => run(() => client.receipt(kind, id)),
  )

  server.registerTool(
    'vmm_export_vcon',
    {
      title: 'Export a workspace as a vCon',
      description:
        'Export a workspace (head commit by default, or one commit by sequence number or hash) as an IETF vCon at owner level: parties, dialog and analysis entries for the documents, and the verifymymeeting attachments (attestations, provenance, commitment, receipts). Returns the unsigned document. With verify=true the service signature is checked against the keys at /.well-known/jwks.json and reported as verified, invalid or unverified. Pass raw=true to also get the signed JWS as served.',
      inputSchema: {
        workspaceId: z.string().uuid(),
        commit: z
          .union([
            z.number().int().positive(),
            z.string().regex(/^(\d+|[0-9a-f]{128})$/iu),
          ])
          .optional()
          .describe(
            'Commit sequence number or SHA-512 commit hash; head by default',
          ),
        verify: z
          .boolean()
          .optional()
          .describe(
            'Verify the service signature against the published JWK Set',
          ),
        raw: z
          .boolean()
          .optional()
          .describe('Also return the signed JWS General JSON as served'),
      },
    },
    ({ workspaceId, commit, verify, raw }) =>
      run(async () => {
        const signed = (await client.vcon.export(workspaceId, {
          commit,
        })) as SignedVcon
        const vcon = await unsignedFrom(signed)
        let signature: 'verified' | 'invalid' | 'unverified' = 'unverified'
        let verification: Record<string, unknown> = {}
        if (verify) {
          try {
            const jwks = await client.vcon.jwks()
            const result = await verifyVcon(signed, resolverFromJwks(jwks))
            signature = result.ok ? 'verified' : 'invalid'
            verification = result.ok
              ? { kid: result.kid, alg: result.alg }
              : { kid: result.kid, reason: result.reason }
          } catch (error) {
            verification = { reason: `jwks: ${errorText(error)}` }
          }
        }
        return {
          vcon,
          signature,
          ...verification,
          ...(raw ? { raw: signed } : {}),
        }
      }),
  )

  server.registerTool(
    'vmm_import_vcon',
    {
      title: 'Import a vCon or an email thread',
      description:
        'Import an IETF vCon (unsigned, or signed as a JWS General JSON) or an email thread (one RFC 5322 message, or an mbox with mbox=true) into ProofOfMeetProtocol. Without workspaceId a new workspace is created from the document (title from its subject); with workspaceId the parties and documents are committed onto that workspace. Parties become participant slots, dialog and analysis entries become documents with derived provenance. Unknown critical extension tokens are rejected.',
      inputSchema: {
        vcon: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('The vCon object, unsigned or signed'),
        email: z
          .string()
          .optional()
          .describe('Raw email text (.eml), or an mbox when mbox=true'),
        mbox: z.boolean().optional().describe('email is an mbox thread'),
        workspaceId: z.string().uuid().optional(),
        message: z.string().max(500).optional().describe('Commit message'),
      },
    },
    ({ vcon, email, mbox, workspaceId, message }) =>
      run(async () => {
        if ((vcon === undefined) === (email === undefined)) {
          throw new Error('Pass exactly one of vcon or email.')
        }
        if (email !== undefined) {
          return client.vcon.import({ email, mbox, workspaceId, message })
        }
        return client.vcon.import({ vcon: vcon!, workspaceId, message })
      }),
  )

  return server
}

function errorText(error: unknown): string {
  if (error instanceof VmmApiError) return `${error.code}: ${error.message}`
  return error instanceof Error ? error.message : String(error)
}

export const toolNames = [
  'vmm_list_workspaces',
  'vmm_create_workspace',
  'vmm_get_workspace',
  'vmm_attach_record',
  'vmm_commit_records',
  'vmm_get_history',
  'vmm_create_invitation',
  'vmm_get_verification',
  'vmm_get_receipt',
  'vmm_export_vcon',
  'vmm_import_vcon',
] as const

export function optionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): VmmMcpOptions {
  const baseUrl = env.VMM_BASE_URL?.trim()
  if (!baseUrl)
    throw new Error('Set VMM_BASE_URL to the ProofOfMeetProtocol origin.')
  return { baseUrl, token: env.VMM_TOKEN?.trim() || undefined }
}
