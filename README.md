# verify-sdk

Public SDK, MCP server, and protocol spec for ProofOfMeetProtocol. Apache-2.0.

ProofOfMeetProtocol lets a group of people prove that they met, for how long, and
which version of the record each of them endorses, with participants
identified by an anonymized handle and a Cubid humanity score by default.

| Package              | Purpose                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `@proofofmeet/sdk`   | Typed API client, protocol types, and browser-safe proof verification                            |
| `@proofofmeet/mcp`   | MCP server exposing workspaces, records, invitations, and verification lookups as tools          |
| `@proofofmeet/vcon`  | IETF vCon (draft core-05) types, validator, JWS signing, the `proofofmeet` extension and mapping |
| `@proofofmeet/react` | Embeddable sign-up and attestation component (planned, placeholder)                              |
| `spec/`              | Protocol specification, OpenAPI contract, and shared test vectors                                |

Status: pre-release. Nothing is published to npm yet; the `@proofofmeet`
scope is registered at first publish.

## `@proofofmeet/sdk`

```ts
import { createClient } from '@proofofmeet/sdk'

const pomp = createClient({
  baseUrl: 'https://proofofmeet.com',
  token: process.env.POMP_TOKEN, // pomp_sk_... or pomp_ct_...
})

const workspace = await pomp.workspaces.create({
  title: 'Interview 7',
  scheduledStart: '2026-11-12T14:00:00Z',
  durationMinutes: 60,
})
await pomp.workspaces.setStatus(workspace.id, 'open')
const record = await pomp.records.create(workspace.id, {
  kind: 'text',
  label: 'Transcript',
  text: transcript,
})
const { url } = await pomp.invitations.create(workspace.id, { kind: 'slot' })
// Share `url` with the participant. They sign in with Cubid and attest there.
```

Errors throw `PompApiError` with `status`, `code`, `message`, `details`, and
`requestId`. `pomp.rateLimit` holds the last response's rate-limit headers.

### Verifying proofs offline

Everything under `@proofofmeet/sdk/proofs` runs in browsers, Node 22+,
and workers using Web Crypto, so the hashing functions are asynchronous.

```ts
import {
  canonicalize,
  textRecordCommitment,
  verifyReceipt,
  verifySignature,
} from '@proofofmeet/sdk'

// Does this transcript match the committed record?
const { rootHex } = await textRecordCommitment(originalText)
console.log(rootHex === record.rootHex)

// Was this attestation anchored?
const { receipt } = await pomp.receipt('attestation', attestation.id)
if (receipt) console.log(await verifyReceipt(receipt)) // { verdict, inclusion }

// Did this participant sign this payload?
const ok = await verifySignature(
  canonicalize(attestation.payload),
  attestation.signatureB64,
  participant.publicKeyHex,
)
```

### vCon export and import

Every commit is also an IETF vCon (`draft-ietf-vcon-vcon-core-05`), signed
by the service key. `client.vcon` fetches it in the three forms and imports
documents; `@proofofmeet/vcon` types, verifies and maps it.

```ts
const signed = await pomp.vcon.export(workspace.id) // JWS General JSON (head)
const unsigned = await pomp.vcon.export(workspace.id, {
  commit: 3,
  form: 'unsigned',
})
const bytes = await pomp.vcon.exportVerification('my-meeting', { form: 'gzip' })
const jwks = await pomp.vcon.jwks() // /.well-known/jwks.json

const imported = await pomp.vcon.import({ vcon: unsigned, message: 'From VMR' })
await pomp.vcon.import({ email: emlText, workspaceId: workspace.id })
await pomp.vcon.import({ email: mboxBytes, mbox: true })
// { workspace, commit, imported: { parties, documents, signature } }
```

### Integrator consent (OAuth 2.1 with PKCE)

```ts
import {
  buildAuthorizeUrl,
  createPkcePair,
  createState,
} from '@proofofmeet/sdk'

const pkce = await createPkcePair()
const state = createState()
// store pkce.codeVerifier and state in the session, then redirect to:
const url = buildAuthorizeUrl({
  baseUrl: 'https://proofofmeet.com',
  clientId: INTEGRATOR_ID,
  redirectUri: 'https://app.example/pomp/callback',
  state,
  codeChallenge: pkce.codeChallenge,
})
// on callback:
const token = await pomp.oauth.exchangeCode({
  code,
  codeVerifier: pkce.codeVerifier,
  clientId: INTEGRATOR_ID,
  redirectUri: 'https://app.example/pomp/callback',
})
// token.access_token is a pomp_ct_... consent token bound to that owner.
```

## `@proofofmeet/mcp`

Run over stdio with an API key or consent token:

```sh
POMP_BASE_URL=https://proofofmeet.com POMP_TOKEN=pomp_sk_... npx -y @proofofmeet/mcp
```

Claude Desktop, Claude Code, or Codex configuration:

```json
{
  "mcpServers": {
    "proofofmeet": {
      "command": "npx",
      "args": ["-y", "@proofofmeet/mcp"],
      "env": {
        "POMP_BASE_URL": "https://proofofmeet.com",
        "POMP_TOKEN": "pomp_sk_..."
      }
    }
  }
}
```

Tools: `pomp_list_workspaces`, `pomp_create_workspace`, `pomp_get_workspace`,
`pomp_attach_record`, `pomp_commit_records`, `pomp_get_history`,
`pomp_create_invitation`, `pomp_get_verification`, `pomp_get_receipt`,
`pomp_export_vcon` (unsigned document, `verify: true` checks the service
signature against `/.well-known/jwks.json`, `raw: true` adds the JWS) and
`pomp_import_vcon` (a vCon object or email text). Embed the server in your
own process with `createVmmMcpServer({ baseUrl, token })` and any MCP
transport.

## Development

```sh
pnpm install
pnpm typecheck   # builds sdk and vcon first so mcp can resolve them
pnpm test
pnpm build
pnpm check       # prettier
```

The server in the private `proofofmeet` repository carries a copy of the
proof code and is tested against the same `spec/vectors`; a drift between
the two fails a test on the server side.
