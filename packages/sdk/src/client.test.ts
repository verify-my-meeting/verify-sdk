import { describe, expect, it } from 'vitest'

import {
  VmmApiError,
  buildAuthorizeUrl,
  createClient,
  createPkcePair,
} from './index'

function fakeFetch(
  handler: (request: { url: URL; init: RequestInit }) => Response,
) {
  const calls: Array<{ url: URL; init: RequestInit }> = []
  const fetchLike = async (input: string | URL, init: RequestInit = {}) => {
    const call = { url: new URL(String(input)), init }
    calls.push(call)
    return handler(call)
  }
  return { calls, fetchLike }
}

describe('createClient', () => {
  it('sends bearer auth, JSON bodies, and parses responses', async () => {
    const { calls, fetchLike } = fakeFetch(
      () =>
        new Response(JSON.stringify({ id: 'w1', title: 'Interview' }), {
          headers: {
            'content-type': 'application/json',
            'ratelimit-limit': '600',
            'ratelimit-remaining': '599',
          },
        }),
    )
    const client = createClient({
      baseUrl: 'https://vmm.example',
      token: 'vmm_sk_test',
      fetch: fetchLike,
    })
    const workspace = await client.workspaces.create({ title: 'Interview' })
    expect(workspace.id).toBe('w1')
    expect(calls[0]!.url.href).toBe('https://vmm.example/api/v1/workspaces')
    expect(calls[0]!.init.method).toBe('POST')
    expect(
      (calls[0]!.init.headers as Record<string, string>).authorization,
    ).toBe('Bearer vmm_sk_test')
    expect(calls[0]!.init.body).toBe('{"title":"Interview"}')
    expect(client.rateLimit.remaining).toBe(599)
  })

  it('maps error bodies to VmmApiError', async () => {
    const { fetchLike } = fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            error: { code: 'standing_required', message: 'Not allowed yet.' },
          }),
          { status: 402, headers: { 'x-request-id': 'req-1' } },
        ),
    )
    const client = createClient({
      baseUrl: 'https://vmm.example',
      fetch: fetchLike,
    })
    const error = await client.workspaces.list().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(VmmApiError)
    const apiError = error as VmmApiError
    expect(apiError.status).toBe(402)
    expect(apiError.code).toBe('standing_required')
    expect(apiError.requestId).toBe('req-1')
  })

  it('form-encodes the token exchange and builds query strings', async () => {
    const { calls, fetchLike } = fakeFetch(
      () =>
        new Response(
          '{"access_token":"vmm_ct_x","token_type":"Bearer","scope":"workspaces:read"}',
        ),
    )
    const client = createClient({
      baseUrl: 'https://vmm.example',
      fetch: fetchLike,
    })
    await client.oauth.exchangeCode({
      code: 'vmm_ac_1',
      codeVerifier: 'v'.repeat(43),
      clientId: 'c',
      redirectUri: 'https://app.example/cb',
    })
    expect(
      (calls[0]!.init.headers as Record<string, string>)['content-type'],
    ).toBe('application/x-www-form-urlencoded')
    expect(String(calls[0]!.init.body)).toContain(
      'grant_type=authorization_code',
    )
    await client.records.get('w', 'r', 'lnk_abc')
    expect(calls[1]!.url.search).toBe('?key=lnk_abc')
  })

  it('builds authorize URLs and PKCE pairs', async () => {
    const pkce = await createPkcePair()
    expect(pkce.codeVerifier).toHaveLength(43)
    expect(pkce.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    const url = new URL(
      buildAuthorizeUrl({
        baseUrl: 'https://vmm.example',
        clientId: 'client',
        redirectUri: 'https://app.example/cb',
        state: 's',
        codeChallenge: pkce.codeChallenge,
        scope: ['workspaces:read', 'invitations:write'],
      }),
    )
    expect(url.pathname).toBe('/connect/authorize')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toBe(
      'workspaces:read invitations:write',
    )
  })
})
