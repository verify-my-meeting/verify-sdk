# @verifymymeeting/vcon

TypeScript for the IETF vCon conversation container
(`draft-ietf-vcon-vcon-core-05`, syntax version `0.5.0`): types for the
unsigned, signed and encrypted forms, a builder, a structural validator,
`content_hash` helpers, JWS General JSON signing and verification, the
`verifymymeeting` extension, and the VerifyMyMeeting mapping in both
directions (`vmm-vcon-mapping` version 1). Browser-safe: Web Crypto only,
no Node imports outside tests. Apache-2.0.

The draft is a working-group document and still changes between revisions.
This package pins one revision (`DRAFT_REVISION`, `VCON_VERSION`) and will
move with it; the mapping is versioned separately (`VMM_MAPPING_VERSION`) so
an export says which rules produced it. The protocol specification in
`spec/README.md` of this repository documents the extension (section 14) and
the mapping (section 15).

## Reading and validating

```ts
import {
  formOf,
  validateVcon,
  assertKnownCritical,
} from '@verifymymeeting/vcon'

const value = JSON.parse(text)
if (formOf(value) === 'unsigned') {
  const problems = validateVcon(value) // [] when every MUST-level rule holds
  assertKnownCritical(value, ['verifymymeeting']) // throws on unknown critical tokens
}
```

## Building

```ts
import {
  addDialog,
  addParty,
  addSession,
  contentHash,
  createVcon,
  inlineText,
} from '@verifymymeeting/vcon'

const vcon = createVcon({
  subject: 'Interview 7',
  created_at: '2026-11-07T11:00:00Z',
})
const alice = addParty(vcon, { name: 'Alice', uuid: 'Person #1001' })
const text = addDialog(vcon, {
  type: 'text',
  start: '2026-11-07T11:00:00Z',
  parties: [alice],
  ...inlineText('Alice: We start.'),
})
addSession(vcon, {
  start: '2026-11-07T11:00:00Z',
  parties: [alice],
  dialog: [text],
})
const token = await contentHash(bytes) // "sha512-<base64url>"
```

`uuidv5(namespace, name)` and `VMM_VCON_NAMESPACE` give name-based UUIDs;
the draft recommends time-based version 8 UUIDs, which you may supply
instead through `createVcon({ uuid })`.

## Signing and verifying

```ts
import {
  jwkFromRawEd25519,
  resolverFromJwks,
  signVcon,
  unsignedFrom,
  verifyVcon,
} from '@verifymymeeting/vcon'

const signed = await signVcon(vcon, { privateKey, kid: 'vmm-2026-11' })
// { payload, signatures: [{ protected, signature }] }, alg EdDSA, kid, uuid
// and cty in the protected header.

const jwks = await fetch(
  'https://verifymymeeting.com/.well-known/jwks.json',
).then((r) => r.json())
const result = await verifyVcon(signed, resolverFromJwks(jwks))
if (result.ok) console.log(result.vcon.subject, result.kid)

const unverified = await unsignedFrom(signed) // read without verifying
```

`verifyVcon` accepts `EdDSA`, `ES256` and `RS256`, resolves keys by `kid`
(a `CryptoKey` or a JWK), checks the `uuid` header against the payload, and
gunzips a compressed payload. The draft requires `x5c` or `x5u` in the
unprotected header; VerifyMyMeeting serves a JWK Set instead and this
package neither emits nor requires a certificate chain (pass one through
`header` if a partner needs it).

## Exporting and importing VerifyMyMeeting workspaces

```ts
import { toVcon, redactVcon, fromVcon } from '@verifymymeeting/vcon'

const owner = await toVcon(bundle, {
  level: 'owner',
  contentBaseUrl: 'https://verifymymeeting.com/api/v1/workspaces/<id>/content/',
  mappingVersion: 1,
})
const publicView = await redactVcon(owner, 'public')
const plan = await fromVcon(someVcon) // parties, DocumentInputs, preserved sessions/events
```

`toVcon` is deterministic: the same bundle yields byte-identical JSON. The
`verifymymeeting` objects (attestations, provenance declarations with
witness statements, the commitment, receipts, consent and identity records)
travel as attachments found with `attestations(vcon)`, `provenances(vcon)`,
`commitments(vcon)`, `receipts(vcon)`, `consents(vcon)` and
`identities(vcon)`.

## Through the API

With an SDK client (`createClient` from `@verifymymeeting/sdk`), three
helpers wrap the vCon endpoints and keep the document typed:

```ts
import { createClient } from '@verifymymeeting/sdk'
import { exportVcon, importVcon, verifyExport } from '@verifymymeeting/vcon'

const client = createClient({ baseUrl: 'https://verifymymeeting.com', token })

// GET /api/v1/workspaces/:id/vcon, signed; `vcon` is the decoded payload.
const { signed, vcon } = await exportVcon(client, workspaceId, { commit: 3 })

// Verify against the service JWK Set (fetched, or pass `jwks`).
const result = await verifyExport(signed, {
  jwksUrl: 'https://verifymymeeting.com/.well-known/jwks.json',
})
if (!result.ok) throw new Error(result.reason)

// POST /api/v1/vcon/import: a Vcon or SignedVcon, new workspace or commit.
const { workspace, commit, imported } = await importVcon(client, {
  vcon,
  workspaceId,
})
```

`client.vcon.export(id, { form: 'unsigned' | 'gzip' })`,
`client.vcon.exportVerification(key)` (viewer level, by public slug or link
token) and `client.vcon.jwks()` are on the SDK client itself.

## Development

```sh
pnpm --filter @verifymymeeting/sdk build   # the vcon package depends on it
pnpm --filter @verifymymeeting/vcon test
```

`test-fixtures/` holds the draft's appendix B examples, which the tests
parse, validate and serialize back unchanged.
