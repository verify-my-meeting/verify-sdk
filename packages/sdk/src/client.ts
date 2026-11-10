/**
 * Typed client for the ProofOfMeetProtocol REST API (`/api/v1`).
 *
 * Authenticate with an integrator API key (`pomp_sk_...`) to act as the
 * integrator, or with a consent token (`pomp_ct_...`) to act on behalf of an
 * owner who approved the integrator. Attestation itself is never available
 * through this client: participants attest only in ProofOfMeetProtocol under
 * their own session.
 */
import { PompApiError } from './errors.js'
import { sha256, toBase64Url, utf8 } from './proofs/bytes.js'
import type {
  Attestation,
  Batch,
  BatchList,
  CommitDetail,
  CommitDiff,
  CommitInput,
  CommitSummary,
  ConfirmationCount,
  ConfirmationView,
  ConfirmInput,
  ConfirmResult,
  ConsentScope,
  CreatedInvitation,
  Invitation,
  InvitationInput,
  InvitationPreview,
  KioskFrame,
  Jwks,
  ListResponse,
  Me,
  Participant,
  Participation,
  ReceiptResponse,
  PolicyInput,
  RecordContent,
  RecordInput,
  RecordSummary,
  TokenResponse,
  VconExportResult,
  VconForm,
  VconImportInput,
  VconImportResult,
  VerificationPage,
  Visibility,
  VisibilityResult,
  Workspace,
  WorkspaceAggregate,
  WorkspaceDetail,
  WorkspaceGlimpse,
  WorkspaceInput,
  WorkspaceStatus,
} from './types.js'

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>

export type ClientOptions = {
  /** Origin of the ProofOfMeetProtocol deployment, e.g. `https://proofofmeet.org`. */
  baseUrl: string | URL
  /** `pomp_sk_...` or `pomp_ct_...`. Omit for public reads. */
  token?: string
  fetch?: FetchLike
  /** Extra headers, e.g. a user agent for your integration. */
  headers?: Record<string, string>
}

export type RateLimitInfo = {
  limit: number | null
  remaining: number | null
  resetSeconds: number | null
}

export type PompClient = ReturnType<typeof createClient>

export function createClient(options: ClientOptions) {
  const base = new URL(String(options.baseUrl))
  const fetchImpl: FetchLike =
    options.fetch ?? ((input, init) => fetch(input, init))
  let lastRateLimit: RateLimitInfo = {
    limit: null,
    remaining: null,
    resetSeconds: null,
  }

  type SendInit = {
    /** Form-encode an object body (the token exchange). */
    form?: boolean
    query?: Record<string, string | undefined>
    /** Overrides the default `application/json`. */
    accept?: string
    /** Send `body` as is (a string or bytes) under this media type. */
    contentType?: string
  }

  async function send(
    method: string,
    path: string,
    body?: unknown,
    init: SendInit = {},
  ): Promise<Response> {
    const url = new URL(path, base)
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value)
    }
    const headers: Record<string, string> = {
      accept: init.accept ?? 'application/json',
      ...options.headers,
    }
    if (options.token) headers.authorization = `Bearer ${options.token}`
    let payload: BodyInit | undefined
    if (body !== undefined) {
      if (init.contentType) {
        headers['content-type'] = init.contentType
        payload = body as BodyInit
      } else if (init.form) {
        headers['content-type'] = 'application/x-www-form-urlencoded'
        payload = new URLSearchParams(body as Record<string, string>).toString()
      } else {
        headers['content-type'] = 'application/json'
        payload = JSON.stringify(body)
      }
    }
    const response = await fetchImpl(url, { method, headers, body: payload })
    lastRateLimit = {
      limit: numberHeader(response, 'ratelimit-limit'),
      remaining: numberHeader(response, 'ratelimit-remaining'),
      resetSeconds: numberHeader(response, 'ratelimit-reset'),
    }
    if (!response.ok) throw await PompApiError.fromResponse(response)
    return response
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    init: SendInit = {},
  ): Promise<T> {
    const response = await send(method, path, body, init)
    return (await response.json()) as T
  }

  const workspaces = {
    list: () => request<ListResponse<Workspace>>('GET', '/api/v1/workspaces'),
    create: (input: WorkspaceInput) =>
      request<Workspace>('POST', '/api/v1/workspaces', input),
    /** Owners get the full detail; others get a glimpse at their level. */
    get: (id: string, linkKey?: string) =>
      request<WorkspaceDetail | WorkspaceGlimpse>(
        'GET',
        `/api/v1/workspaces/${id}`,
        undefined,
        { query: { key: linkKey } },
      ),
    update: (id: string, input: Partial<WorkspaceInput>) =>
      request<Workspace>('PATCH', `/api/v1/workspaces/${id}`, input),
    delete: (id: string) =>
      request<{ deleted: true }>('DELETE', `/api/v1/workspaces/${id}`),
    setStatus: (id: string, status: WorkspaceStatus) =>
      request<Workspace>('POST', `/api/v1/workspaces/${id}/status`, { status }),
    /**
     * Public requires the acknowledgement text exactly as the server
     * states it: "I understand that public pages are permanent".
     */
    setVisibility: (
      id: string,
      visibility: Visibility,
      acknowledgement?: string,
    ) =>
      request<VisibilityResult>('POST', `/api/v1/workspaces/${id}/visibility`, {
        visibility,
        acknowledgement,
      }),
    rotateLink: (id: string) =>
      request<{ linkToken: string }>('POST', `/api/v1/workspaces/${id}/link`),
    /** Merge a policy change; a null value clears that condition. */
    updatePolicy: (id: string, input: PolicyInput) =>
      request<Workspace>('PATCH', `/api/v1/workspaces/${id}/policy`, input),
    /**
     * Counts across workspaces the caller owns: distinct participants by
     * POMP's internal identity, lowest score, withdrawals. Handles never
     * cross; integrators use this for study-level lines.
     */
    aggregate: (
      workspaceIds: Array<string>,
      options: { confirmation?: ConfirmationCount } = {},
    ) =>
      request<WorkspaceAggregate>('POST', '/api/v1/workspaces/aggregate', {
        workspaceIds,
        ...(options.confirmation ? { confirmation: options.confirmation } : {}),
      }),
  }

  const records = {
    /** Documents at the head commit (owner). */
    list: (workspaceId: string) =>
      request<ListResponse<RecordSummary>>(
        'GET',
        `/api/v1/workspaces/${workspaceId}/records`,
      ),
    /** One document as one commit; `provenance` is required. */
    create: (workspaceId: string, input: RecordInput) =>
      request<RecordSummary & { commit: CommitSummary }>(
        'POST',
        `/api/v1/workspaces/${workspaceId}/records`,
        input,
      ),
    get: (workspaceId: string, recordId: string, linkKey?: string) =>
      request<RecordContent>(
        'GET',
        `/api/v1/workspaces/${workspaceId}/records/${recordId}`,
        undefined,
        { query: { key: linkKey } },
      ),
    /**
     * The current text of a document by document id, at the caller's
     * level: plain text for text records; for links and digests the
     * record summary as JSON (`{ record }`).
     */
    content: async (
      workspaceId: string,
      documentId: string,
      linkKey?: string,
    ): Promise<{ text: string } | { record: RecordSummary }> => {
      const response = await send(
        'GET',
        `/api/v1/workspaces/${workspaceId}/documents/${documentId}`,
        undefined,
        { query: { key: linkKey }, accept: 'text/plain, application/json' },
      )
      if (response.headers.get('content-type')?.startsWith('text/plain')) {
        return { text: await response.text() }
      }
      return (await response.json()) as { record: RecordSummary }
    },
  }

  const commits = {
    list: (workspaceId: string, linkKey?: string) =>
      request<ListResponse<CommitSummary>>(
        'GET',
        `/api/v1/workspaces/${workspaceId}/commits`,
        undefined,
        { query: { key: linkKey } },
      ),
    /** Add, replace, or remove documents in one new commit. */
    create: (workspaceId: string, input: CommitInput) =>
      request<CommitSummary>(
        'POST',
        `/api/v1/workspaces/${workspaceId}/commits`,
        input,
      ),
    get: (hashHex: string, linkKey?: string) =>
      request<CommitDetail>('GET', `/api/v1/commits/${hashHex}`, undefined, {
        query: { key: linkKey },
      }),
    diff: (hashHex: string, linkKey?: string) =>
      request<CommitDiff>('GET', `/api/v1/commits/${hashHex}/diff`, undefined, {
        query: { key: linkKey },
      }),
    /** Fetch a commit and recompute its hash locally. */
    verify: async (hashHex: string, linkKey?: string) => {
      const detail = await request<CommitDetail>(
        'GET',
        `/api/v1/commits/${hashHex}`,
        undefined,
        { query: { key: linkKey } },
      )
      const { verifyCommitHash } = await import('./proofs/commit.js')
      return {
        commit: detail,
        valid: await verifyCommitHash(detail.body, detail.hashHex),
      }
    },
  }

  const invitations = {
    list: (workspaceId: string) =>
      request<ListResponse<Invitation>>(
        'GET',
        `/api/v1/workspaces/${workspaceId}/invitations`,
      ),
    create: (workspaceId: string, input: InvitationInput) =>
      request<CreatedInvitation>(
        'POST',
        `/api/v1/workspaces/${workspaceId}/invitations`,
        input,
      ),
    revoke: (workspaceId: string, invitationId: string) =>
      request<Invitation>(
        'DELETE',
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}`,
      ),
    /** What an invitation link shows before sign-in. */
    preview: (token: string) =>
      request<InvitationPreview>('GET', `/api/v1/invitations/${token}`),
    /** Give an open invitation a three-word code (`invitations:write`). */
    setCode: (workspaceId: string, invitationId: string) =>
      request<{ code: string }>(
        'POST',
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/code`,
      ),
    clearCode: (workspaceId: string, invitationId: string) =>
      request<{ ok: true }>(
        'DELETE',
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/code`,
      ),
    /** One kiosk frame: a thirty-second join token as URL and SVG. */
    kiosk: (workspaceId: string, invitationId: string) =>
      request<KioskFrame>(
        'GET',
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/kiosk`,
      ),
    /** The same frame as an SVG document, for direct embedding. */
    qr: async (workspaceId: string, invitationId: string) => {
      const response = await send(
        'GET',
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/qr`,
        undefined,
        { accept: 'image/svg+xml' },
      )
      return {
        svg: await response.text(),
        expiresAt: response.headers.get('x-kiosk-expires-at'),
      }
    },
  }

  const participants = {
    list: (workspaceId: string) =>
      request<ListResponse<Participant>>(
        'GET',
        `/api/v1/workspaces/${workspaceId}/participants`,
      ),
  }

  const attestations = {
    list: (workspaceId: string) =>
      request<ListResponse<Attestation>>(
        'GET',
        `/api/v1/workspaces/${workspaceId}/attestations`,
      ),
  }

  /** Organiser confirmations of attendance (owner; spec section 6.1). */
  const confirmations = {
    list: (workspaceId: string) =>
      request<ListResponse<ConfirmationView>>(
        'GET',
        `/api/v1/workspaces/${workspaceId}/confirmations`,
      ),
    /** Bulk or per participant; pass `preview: true` first to see the list. */
    confirm: (workspaceId: string, input: ConfirmInput = {}) =>
      request<ConfirmResult>(
        'POST',
        `/api/v1/workspaces/${workspaceId}/confirmations`,
        input,
      ),
    withdraw: (workspaceId: string, participantId: string) =>
      request<{ withdrawn: number }>(
        'DELETE',
        `/api/v1/workspaces/${workspaceId}/confirmations/${participantId}`,
      ),
  }

  const batches = {
    list: () => request<BatchList>('GET', '/api/v1/batches'),
    get: (id: string) => request<Batch>('GET', `/api/v1/batches/${id}`),
  }

  const oauth = {
    /** Exchange an authorization code for a consent token (`pomp_ct_...`). */
    exchangeCode: (input: {
      code: string
      codeVerifier: string
      clientId: string
      redirectUri: string
    }) =>
      request<TokenResponse>(
        'POST',
        '/api/v1/oauth/token',
        {
          grant_type: 'authorization_code',
          code: input.code,
          code_verifier: input.codeVerifier,
          client_id: input.clientId,
          redirect_uri: input.redirectUri,
        },
        { form: true },
      ),
  }

  async function exportVcon<F extends VconForm>(
    path: string,
    options: { commit?: string | number; form?: F },
  ): Promise<VconExportResult<F>> {
    const form: VconForm = options.form ?? 'signed'
    const response = await send('GET', path, undefined, {
      accept: vconAccept[form],
      query: {
        commit:
          options.commit === undefined ? undefined : String(options.commit),
        form: options.form,
      },
    })
    if (form === 'gzip') {
      return new Uint8Array(await response.arrayBuffer()) as VconExportResult<F>
    }
    return (await response.json()) as VconExportResult<F>
  }

  const vcon = {
    /**
     * The workspace as an IETF vCon at owner level: signed (a JWS General
     * JSON Serialization, the default), unsigned, or gzip of the signed
     * JSON as bytes. `commit` selects a version by sequence number or hash;
     * the head is the default. Verify and read the signed form with
     * `@proofofmeet/vcon` (`verifyVcon`, `unsignedFrom`).
     */
    export: <F extends VconForm = 'signed'>(
      workspaceId: string,
      options: { commit?: string | number; form?: F } = {},
    ) => exportVcon<F>(`/api/v1/workspaces/${workspaceId}/vcon`, options),
    /**
     * The vCon a verification key (public slug or link token) shows,
     * rendered at that key's level as a `redacted_from` of the owner-level
     * document. No credentials needed beyond the key.
     */
    exportVerification: <F extends VconForm = 'signed'>(
      key: string,
      options: { form?: F } = {},
    ) => exportVcon<F>(`/api/v1/verify/${key}/vcon`, options),
    /**
     * Import a vCon (signed or unsigned) or an email thread (`.eml`, or
     * mbox with `mbox: true`). Without `workspaceId` a new workspace is
     * created from the document; with it, the documents are committed onto
     * that workspace. Unknown `critical` extension tokens are rejected with
     * `unsupported_extension`.
     */
    import: (input: VconImportInput) => {
      if ('email' in input) {
        return send('POST', '/api/v1/vcon/import', input.email, {
          contentType: input.mbox ? 'application/mbox' : 'message/rfc822',
          query: { workspaceId: input.workspaceId, message: input.message },
        }).then((response) => response.json() as Promise<VconImportResult>)
      }
      return request<VconImportResult>('POST', '/api/v1/vcon/import', {
        vcon: input.vcon,
        workspaceId: input.workspaceId,
        message: input.message,
      })
    },
    /** The service public keys that sign exports (`/.well-known/jwks.json`). */
    jwks: () => request<Jwks>('GET', '/.well-known/jwks.json'),
  }

  return {
    workspaces,
    records,
    commits,
    invitations,
    participants,
    attestations,
    confirmations,
    batches,
    oauth,
    vcon,
    /** Verification page by public slug, link token, or workspace id. */
    verify: (key: string) =>
      request<VerificationPage>('GET', `/api/v1/verify/${key}`),
    /**
     * The share card of a verification page as SVG (`/verify/:key/card`),
     * at the caller's level like the page itself.
     */
    shareCard: async (key: string) => {
      const response = await send(
        'GET',
        `/api/v1/verify/${key}/card`,
        undefined,
        { accept: 'image/svg+xml' },
      )
      return response.text()
    },
    /** Inclusion receipt for an attestation or commit (by id or hash), if anchored. */
    receipt: (kind: 'attestation' | 'commit', id: string) =>
      request<ReceiptResponse>('GET', `/api/v1/receipts/${kind}/${id}`),
    me: () => request<Me>('GET', '/api/v1/me'),
    /** Workspaces the consenting account attested in (`participant:read`). */
    participation: () =>
      request<ListResponse<Participation>>('GET', '/api/v1/me/workspaces'),
    /** Rate-limit headers from the most recent response. */
    get rateLimit(): RateLimitInfo {
      return lastRateLimit
    },
  }
}

const vconAccept: Record<VconForm, string> = {
  signed: 'application/jose+json',
  unsigned: 'application/vcon+json',
  gzip: 'application/gzip',
}

function numberHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name)
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Build the URL that sends an owner to ProofOfMeetProtocol to approve access. */
export function buildAuthorizeUrl(input: {
  baseUrl: string | URL
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  scope?: Array<ConsentScope>
}): string {
  const url = new URL('/connect/authorize', String(input.baseUrl))
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  if (input.scope?.length) url.searchParams.set('scope', input.scope.join(' '))
  return url.toString()
}

/** PKCE S256 pair for the consent flow. */
export async function createPkcePair(): Promise<{
  codeVerifier: string
  codeChallenge: string
}> {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const codeVerifier = toBase64Url(bytes)
  const codeChallenge = toBase64Url(await sha256(utf8(codeVerifier)))
  return { codeVerifier, codeChallenge }
}

export function createState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}
