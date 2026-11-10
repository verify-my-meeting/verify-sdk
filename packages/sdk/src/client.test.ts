import { describe, expect, it } from 'vitest'

import {
  PompApiError,
  buildAuthorizeUrl,
  commitCanonical,
  commitHashHex,
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
      baseUrl: 'https://pomp.example',
      token: 'pomp_sk_test',
      fetch: fetchLike,
    })
    const workspace = await client.workspaces.create({ title: 'Interview' })
    expect(workspace.id).toBe('w1')
    expect(calls[0]!.url.href).toBe('https://pomp.example/api/v1/workspaces')
    expect(calls[0]!.init.method).toBe('POST')
    expect(
      (calls[0]!.init.headers as Record<string, string>).authorization,
    ).toBe('Bearer pomp_sk_test')
    expect(calls[0]!.init.body).toBe('{"title":"Interview"}')
    expect(client.rateLimit.remaining).toBe(599)
  })

  it('maps error bodies to PompApiError', async () => {
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
      baseUrl: 'https://pomp.example',
      fetch: fetchLike,
    })
    const error = await client.workspaces.list().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PompApiError)
    const apiError = error as PompApiError
    expect(apiError.status).toBe(402)
    expect(apiError.code).toBe('standing_required')
    expect(apiError.requestId).toBe('req-1')
  })

  it('form-encodes the token exchange and builds query strings', async () => {
    const { calls, fetchLike } = fakeFetch(
      () =>
        new Response(
          '{"access_token":"pomp_ct_x","token_type":"Bearer","scope":"workspaces:read"}',
        ),
    )
    const client = createClient({
      baseUrl: 'https://pomp.example',
      fetch: fetchLike,
    })
    await client.oauth.exchangeCode({
      code: 'pomp_ac_1',
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
        baseUrl: 'https://pomp.example',
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

  it('exposes commit endpoints and verifies a fetched commit', async () => {
    const body = {
      v: 2 as const,
      workspace: 'c0000000-0000-4000-8000-000000000003',
      seq: 1,
      parent: null,
      kind: 'initial' as const,
      author: { role: 'owner' as const, ref: null },
      time: '2026-11-06T10:00:00.000Z',
      message: '',
      tree: [],
    }
    const hashHex = await commitHashHex(body)
    const { calls, fetchLike } = fakeFetch(({ url }) => {
      if (url.pathname.endsWith('/diff')) {
        return new Response(JSON.stringify({ documents: [] }))
      }
      return new Response(
        JSON.stringify({ hashHex, body, canonical: commitCanonical(body) }),
      )
    })
    const client = createClient({
      baseUrl: 'https://pomp.example',
      fetch: fetchLike,
    })
    const verified = await client.commits.verify(hashHex)
    expect(verified.valid).toBe(true)
    await client.commits.diff(hashHex, 'lnk_x')
    expect(calls[0]!.url.pathname).toBe(`/api/v1/commits/${hashHex}`)
    expect(calls[1]!.url.search).toBe('?key=lnk_x')
  })

  it('exports vCons in the three forms with the matching Accept header', async () => {
    const signed = {
      payload: 'eyJ2Y29uIjoiMC41LjAifQ',
      signatures: [{ protected: 'eyJhbGciOiJFZERTQSJ9', signature: 'c2ln' }],
    }
    const gzipBytes = new Uint8Array([0x1f, 0x8b, 8, 0, 1, 2, 3])
    const { calls, fetchLike } = fakeFetch(({ init }) => {
      const accept = (init.headers as Record<string, string>).accept
      if (accept === 'application/gzip') {
        return new Response(gzipBytes, {
          headers: { 'content-type': 'application/gzip' },
        })
      }
      if (accept === 'application/vcon+json') {
        return new Response('{"vcon":"0.5.0","uuid":"u"}', {
          headers: { 'content-type': 'application/vcon+json' },
        })
      }
      return new Response(JSON.stringify(signed), {
        headers: { 'content-type': 'application/jose+json' },
      })
    })
    const client = createClient({
      baseUrl: 'https://pomp.example',
      token: 'pomp_ct_test',
      fetch: fetchLike,
    })
    const head = await client.vcon.export('w1')
    expect(head).toEqual(signed)
    expect(calls[0]!.url.pathname).toBe('/api/v1/workspaces/w1/vcon')
    expect(calls[0]!.url.search).toBe('')
    expect((calls[0]!.init.headers as Record<string, string>).accept).toBe(
      'application/jose+json',
    )
    expect(calls[0]!.init.body).toBeUndefined()

    const unsigned = await client.vcon.export('w1', {
      commit: 3,
      form: 'unsigned',
    })
    expect(unsigned.uuid).toBe('u')
    expect(calls[1]!.url.search).toBe('?commit=3&form=unsigned')
    expect((calls[1]!.init.headers as Record<string, string>).accept).toBe(
      'application/vcon+json',
    )

    const gz = await client.vcon.exportVerification('my-meeting', {
      form: 'gzip',
    })
    expect(gz).toBeInstanceOf(Uint8Array)
    expect(Array.from(gz)).toEqual(Array.from(gzipBytes))
    expect(calls[2]!.url.pathname).toBe('/api/v1/verify/my-meeting/vcon')
    expect(calls[2]!.url.search).toBe('?form=gzip')
    expect((calls[2]!.init.headers as Record<string, string>).accept).toBe(
      'application/gzip',
    )
    expect(
      (calls[2]!.init.headers as Record<string, string>).authorization,
    ).toBe('Bearer pomp_ct_test')
  })

  it('imports a vCon as JSON and an email thread as a raw body', async () => {
    const result = {
      workspace: { id: 'w2', title: 'Thread' },
      commit: { id: 'c1', seq: 1 },
      imported: { parties: 2, documents: 3, signature: 'none' },
    }
    const { calls, fetchLike } = fakeFetch(
      () => new Response(JSON.stringify(result)),
    )
    const client = createClient({
      baseUrl: 'https://pomp.example',
      token: 'pomp_sk_test',
      fetch: fetchLike,
    })
    const imported = await client.vcon.import({
      vcon: { vcon: '0.5.0', uuid: 'u', subject: 'Thread' },
      message: 'From a partner',
    })
    expect(imported.imported.signature).toBe('none')
    expect(calls[0]!.url.pathname).toBe('/api/v1/vcon/import')
    expect(calls[0]!.init.method).toBe('POST')
    expect(
      (calls[0]!.init.headers as Record<string, string>)['content-type'],
    ).toBe('application/json')
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      vcon: { vcon: '0.5.0', uuid: 'u', subject: 'Thread' },
      message: 'From a partner',
    })

    await client.vcon.import({
      email: 'From: a@example.com\r\nSubject: Hi\r\n\r\nHello',
      workspaceId: 'w2',
    })
    expect(calls[1]!.url.search).toBe('?workspaceId=w2')
    expect(
      (calls[1]!.init.headers as Record<string, string>)['content-type'],
    ).toBe('message/rfc822')
    expect(String(calls[1]!.init.body)).toContain('Subject: Hi')

    const mbox = new TextEncoder().encode('From a@example.com Thu Nov  6\n')
    await client.vcon.import({ email: mbox, mbox: true, message: 'm' })
    expect(calls[2]!.url.search).toBe('?message=m')
    expect(
      (calls[2]!.init.headers as Record<string, string>)['content-type'],
    ).toBe('application/mbox')
    expect(calls[2]!.init.body).toBe(mbox)
  })

  it('fetches the JWK Set from the well-known path', async () => {
    const jwks = {
      keys: [
        {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'AAAA',
          kid: 'pomp-1',
          use: 'sig',
          alg: 'EdDSA',
        },
      ],
    }
    const { calls, fetchLike } = fakeFetch(
      () => new Response(JSON.stringify(jwks)),
    )
    const client = createClient({
      baseUrl: 'https://pomp.example/',
      fetch: fetchLike,
    })
    expect(await client.vcon.jwks()).toEqual(jwks)
    expect(calls[0]!.url.href).toBe(
      'https://pomp.example/.well-known/jwks.json',
    )
    expect(calls[0]!.init.headers).not.toHaveProperty('authorization')
  })
})
