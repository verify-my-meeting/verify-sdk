# verify-sdk

Public SDK, MCP server, and protocol spec for VerifyMyMeeting. Apache-2.0.

VerifyMyMeeting lets a group of people prove that they met, for how long, and
which version of the record each of them endorses, with participants
identified by an anonymized handle and a Cubid humanity score by default.

| Package                  | Purpose                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `@verifymymeeting/sdk`   | Typed API client, protocol types, and browser-safe proof verification                   |
| `@verifymymeeting/mcp`   | MCP server exposing workspaces, records, invitations, and verification lookups as tools |
| `@verifymymeeting/react` | Embeddable sign-up and attestation component (planned, placeholder)                     |
| `spec/`                  | Protocol specification, OpenAPI contract, and shared test vectors                       |

Status: pre-release. Nothing is published to npm yet; the `@verifymymeeting`
scope is registered at first publish.

## `@verifymymeeting/sdk`

```ts
import { createClient } from '@verifymymeeting/sdk'

const vmm = createClient({
  baseUrl: 'https://verifymymeeting.com',
  token: process.env.VMM_TOKEN, // vmm_sk_... or vmm_ct_...
})

const workspace = await vmm.workspaces.create({
  title: 'Interview 7',
  scheduledStart: '2026-11-12T14:00:00Z',
  durationMinutes: 60,
})
await vmm.workspaces.setStatus(workspace.id, 'open')
const record = await vmm.records.create(workspace.id, {
  kind: 'text',
  label: 'Transcript',
  text: transcript,
})
const { url } = await vmm.invitations.create(workspace.id, { kind: 'slot' })
// Share `url` with the participant. They sign in with Cubid and attest there.
```

Errors throw `VmmApiError` with `status`, `code`, `message`, `details`, and
`requestId`. `vmm.rateLimit` holds the last response's rate-limit headers.

### Verifying proofs offline

Everything under `@verifymymeeting/sdk/proofs` runs in browsers, Node 22+,
and workers using Web Crypto, so the hashing functions are asynchronous.

```ts
import {
  canonicalize,
  textRecordCommitment,
  verifyReceipt,
  verifySignature,
} from '@verifymymeeting/sdk'

// Does this transcript match the committed record?
const { rootHex } = await textRecordCommitment(originalText)
console.log(rootHex === record.rootHex)

// Was this attestation anchored?
const { receipt } = await vmm.receipt('attestation', attestation.id)
if (receipt) console.log(await verifyReceipt(receipt)) // { verdict, inclusion }

// Did this participant sign this payload?
const ok = await verifySignature(
  canonicalize(attestation.payload),
  attestation.signatureB64,
  participant.publicKeyHex,
)
```

### Integrator consent (OAuth 2.1 with PKCE)

```ts
import {
  buildAuthorizeUrl,
  createPkcePair,
  createState,
} from '@verifymymeeting/sdk'

const pkce = await createPkcePair()
const state = createState()
// store pkce.codeVerifier and state in the session, then redirect to:
const url = buildAuthorizeUrl({
  baseUrl: 'https://verifymymeeting.com',
  clientId: INTEGRATOR_ID,
  redirectUri: 'https://app.example/vmm/callback',
  state,
  codeChallenge: pkce.codeChallenge,
})
// on callback:
const token = await vmm.oauth.exchangeCode({
  code,
  codeVerifier: pkce.codeVerifier,
  clientId: INTEGRATOR_ID,
  redirectUri: 'https://app.example/vmm/callback',
})
// token.access_token is a vmm_ct_... consent token bound to that owner.
```

## `@verifymymeeting/mcp`

Run over stdio with an API key or consent token:

```sh
VMM_BASE_URL=https://verifymymeeting.com VMM_TOKEN=vmm_sk_... npx -y @verifymymeeting/mcp
```

Claude Desktop, Claude Code, or Codex configuration:

```json
{
  "mcpServers": {
    "verifymymeeting": {
      "command": "npx",
      "args": ["-y", "@verifymymeeting/mcp"],
      "env": {
        "VMM_BASE_URL": "https://verifymymeeting.com",
        "VMM_TOKEN": "vmm_sk_..."
      }
    }
  }
}
```

Tools: `vmm_list_workspaces`, `vmm_create_workspace`, `vmm_get_workspace`,
`vmm_attach_record`, `vmm_create_invitation`, `vmm_get_verification`,
`vmm_get_receipt`. Embed the server in your own process with
`createVmmMcpServer({ baseUrl, token })` and any MCP transport.

## Development

```sh
pnpm install
pnpm typecheck   # builds the sdk first so mcp can resolve it
pnpm test
pnpm build
pnpm check       # prettier
```

The server in the private `verifymymeeting` repository carries a copy of the
proof code and is tested against the same `spec/vectors`; a drift between
the two fails a test on the server side.
