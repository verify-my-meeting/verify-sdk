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

The protocol is specified in [`spec/README.md`](spec/README.md) (version
2.0) and the REST API in [`spec/openapi.yaml`](spec/openapi.yaml)
(OpenAPI 3.1). Both are normative; this README only shows how to use them.

## Five-minute integration

From an API key to a verified receipt against the hosted API. Try it on
`https://dev.proofofmeet.org` (Stripe sandbox, nothing is charged); the
same calls run on `https://www.proofofmeet.org` in production. Every step
names the SDK call and the REST endpoint it sends; with plain HTTP, send
`Authorization: Bearer <key>` and JSON bodies.

### 1. Get an API key

Sign in at [`/developers`](https://dev.proofofmeet.org/developers),
register an integrator, and issue a key on its page. The key
(`pomp_sk_...`) is shown once. Drafts cost nothing; opening a meeting is
metered to your integrator (prices and the free monthly credit:
[`/pricing#developers`](https://www.proofofmeet.org/pricing#developers)).

### 2. Install

Until the packages are on npm, build the SDK from this repository and
install the tarball (Node 22+, pnpm 10):

```sh
git clone https://github.com/verify-my-meeting/verify-sdk.git
pnpm --dir verify-sdk install
pnpm --dir verify-sdk/packages/sdk build
pnpm --dir verify-sdk/packages/sdk pack --pack-destination "$PWD"
npm install ./proofofmeet-sdk-0.4.0.tgz
```

Once the packages are published
([verify-sdk#2](https://github.com/verify-my-meeting/verify-sdk/issues/2)),
this becomes `npm install @proofofmeet/sdk`.

### 3. Create a client

```ts
import { createClient } from '@proofofmeet/sdk'

const pomp = createClient({
  baseUrl: 'https://dev.proofofmeet.org',
  token: process.env.POMP_TOKEN, // pomp_sk_...
})
```

Use the `www` host for production: the apex `proofofmeet.org` redirects,
and the redirect drops the `Authorization` header.

### 4. Create a workspace

A workspace is one meeting. It starts as a draft; participants can join
once it is open.

```ts
const workspace = await pomp.workspaces.create({
  title: 'Interview 7',
  scheduledStart: '2026-11-18T14:00:00Z',
  durationMinutes: 60,
}) // POST /api/v1/workspaces
await pomp.workspaces.setStatus(workspace.id, 'open') // POST /api/v1/workspaces/{id}/status
```

### 5. Commit a record

Every document change is a commit on the workspace's linear chain, and
every document carries a provenance declaration (spec section 13).

```ts
const record = await pomp.records.create(workspace.id, {
  kind: 'text', // or 'link' (URL + digest) or 'hash' (digest only)
  label: 'Transcript',
  text: transcript,
  provenance: {
    type: 'transcript',
    creators: ['owner'],
    created: 'during',
    ai: 'assisted',
    aiRole: 'verbatim',
  },
  message: 'Transcript as recorded',
}) // POST /api/v1/workspaces/{id}/records
// record.rootHex: the Merkle root; record.commit.hashHex: the commit
```

Several documents in one commit: `pomp.commits.create` (`POST
/api/v1/workspaces/{id}/commits`).

### 6. Invite a participant

```ts
const { url } = await pomp.invitations.create(workspace.id, {
  kind: 'slot', // one person; 'open' for a shared link
}) // POST /api/v1/workspaces/{id}/invitations
```

Send `url` to the participant. They sign in with Cubid on
ProofOfMeetProtocol and attest there: attendance, then approval of a
specific commit with a witness statement per document. Attestation is
never available through the API.

### 7. Read attestations and the human-involvement grade

```ts
const { items } = await pomp.attestations.list(workspace.id)
// GET /api/v1/workspaces/{id}/attestations

const page = await pomp.verify(workspace.id) // GET /api/v1/verify/{key}
for (const doc of page.documents) {
  console.log(doc.label, doc.grade.grade, doc.approvals.length) // 'A' | 'B' | 'C' | 'ungraded'
}
```

`verify` takes a workspace id (as its owner), a public slug, or a link
token, and returns what the public verification page shows at that level.
The grade is computed, never stored: recompute it with
`gradeDocument(doc.provenance, doc.approvals.map((a) => a.witness))`.

### 8. Verify a receipt offline

Attestations and commits are anchored in batches. A receipt is an
inclusion proof that checks without trusting the server:

```ts
import { verifyReceipt, textRecordCommitment } from '@proofofmeet/sdk'

const res = await pomp.receipt('attestation', items[0].id)
// GET /api/v1/receipts/{kind}/{id}
if (res.receipt) console.log(await verifyReceipt(res.receipt)) // { verdict, inclusion }

// And the transcript you hold is the one that was committed:
const { rootHex } = await textRecordCommitment(transcript)
console.log(rootHex === record.rootHex)
```

A receipt is `pending` until its batch is anchored. `pomp.commits.verify`
recomputes a commit hash locally; more checks are under
[Verifying proofs offline](#verifying-proofs-offline).

To act for meeting owners who already use ProofOfMeetProtocol, ask for
their consent with OAuth instead of using your own key (see
[Integrator consent](#integrator-consent-oauth-21-with-pkce)).

### MCP server

`@proofofmeet/mcp` exposes the same operations as tools for Claude, Codex
or any MCP client, authenticated with the same key: list and create
workspaces, commit records, invite, read verification pages and receipts,
and export or import vCons. Until it is published, build the workspace
(`pnpm --dir verify-sdk build`) and run
`node verify-sdk/packages/mcp/dist/bin.js` where the configuration
below says `npx -y @proofofmeet/mcp`. Details in
[`@proofofmeet/mcp`](#proofofmeetmcp).

## `@proofofmeet/sdk`

The walkthrough above covers the client. Errors throw `PompApiError` with `status`, `code`, `message`, `details`, and
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
  baseUrl: 'https://www.proofofmeet.org',
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
POMP_BASE_URL=https://www.proofofmeet.org POMP_TOKEN=pomp_sk_... npx -y @proofofmeet/mcp
```

Claude Desktop, Claude Code, or Codex configuration:

```json
{
  "mcpServers": {
    "proofofmeet": {
      "command": "npx",
      "args": ["-y", "@proofofmeet/mcp"],
      "env": {
        "POMP_BASE_URL": "https://www.proofofmeet.org",
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
