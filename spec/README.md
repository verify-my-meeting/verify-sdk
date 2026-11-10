# ProofOfMeetProtocol protocol specification

Version 2.0, 2026-11-07: SHA-512 is the protocol hash throughout (commit
body and receipt version 2; owner-supplied SHA-256 digests still accepted
with a declared algorithm). Version 1.1 of 2026-11-06 added the commit
chain, provenance and grade to version 1 of 2026-11-05; no content was
ever committed under version 1, so there is no migration. Normative where
it says "must". The reference
implementation of every computation here is `@proofofmeet/sdk`
(`packages/sdk/src/proofs`), and `vectors/` holds the shared test vectors
that both the server and the SDK are tested against.

- `openapi.yaml`: the REST API contract (OpenAPI 3.1).
- `vectors/`: canonicalization, Merkle, segmentation, commit, and grade
  vectors.

## 1. Objects

- **Workspace**: one meeting. Owned by an account. Visibility `private`,
  `link`, or `public`; status `draft`, `open`, or `closed`.
- **Document**: one entry of the workspace's record package, identified by a
  stable `documentId`. Its content at a commit is a **record** (one version):
  a `link` (URL plus optional digest), a `hash` (digest only), or `text`
  (uploaded transcript). An owner-supplied digest is SHA-512 by default or
  SHA-256 when declared (`hashAlg`). Every record has an RFC 6962 Merkle root. Every
  document carries a provenance declaration (section 13).
- **Commit**: one step of the workspace's linear, append-only history
  (section 12): a tree of documents, the parent hash, author, time,
  message, and kind.
- **Participant**: an account's membership in one workspace, shown as a
  per-workspace handle (`Person #NNNN`) that is unlinkable across workspaces.
  Each participant has its own Ed25519 key pair; the public key appears on
  the verification page.
- **Attestation**: a signed statement by a participant: `attendance`,
  `record` approval (of one commit, with a witness statement per document),
  or `disclosure`; or the organiser's `confirmed` statement about an
  attendance attestation (section 6.1). Append-only; a newer attestation
  of the same kind supersedes the older for display.
- **Batch**: an anchoring run over new attestation hashes and commit hashes.
- **Receipt**: the inclusion proof of one item in one batch.

## 2. Canonicalization

Attestation payloads are canonicalized with the JSON Canonicalization Scheme
(RFC 8785): keys sorted by UTF-16 code units, no whitespace, ECMAScript
number serialization. `canonicalize()` in the SDK implements this and must
produce the strings in `vectors/canonicalize.json`.

## 3. Hashing and Merkle trees

SHA-512 throughout: every hash this specification defines (leaf and node
hashes, roots, commit hashes, payload hashes, profile hashes, batch roots,
key ids) is SHA-512, 64 bytes, hex encoded. The one exception is an
owner-supplied digest of external content (section 4), which may be
SHA-256 when declared. Trees follow RFC 6962:

```
leafHash(leaf)        = SHA-512(0x00 || leaf)
nodeHash(left, right) = SHA-512(0x01 || left || right)
root([])              = SHA-512("")
root([h])             = h
root(hashes)          = nodeHash(root(hashes[0:k]), root(hashes[k:]))
                        where k is the largest power of two < n
```

Audit paths are lists of `{ hash, side }` from the leaf upward, `side`
naming where the sibling sits. `vectors/merkle.json` holds the RFC vectors.

## 4. Record commitments

- `link` and `hash` records are single-leaf trees: the leaf is the raw
  digest the owner supplied, 64 bytes for `sha512` (the default) or 32
  bytes for `sha256`; the record states the algorithm as `hashAlg`. A
  `link` without a digest commits to the UTF-8 bytes of the URL as its
  single leaf.
- `text` records are segmented (section 5). Leaf `i` is the UTF-8 bytes of
  `"<i>" 0x1f "<version>" 0x1f <segment>` where `<i>` is the decimal index
  and `<version>` is the segmentation version (`v1`).

A third party holding the original text recomputes the root with
`textRecordCommitment(text)` and compares it with `rootHex` on the record.

## 5. Segmentation v1

1. Normalize line endings to `\n`.
2. If at least 60 percent of non-empty lines match `^[^:\n]{1,60}:\s`
   (a speaker label), split at those lines: each segment runs from a speaker
   line to the next speaker line.
3. Otherwise split on blank lines (paragraphs).
4. Trim ASCII whitespace (space, tab, CR, LF) from both ends of each segment
   as bytes; drop empty segments; index from 0.

Byte offsets are into the normalized UTF-8 text. `vectors/segmentation.json`
holds the vectors.

## 6. Attestation payloads

Every payload carries:

```json
{
  "v": 1,
  "workspace": "<workspace uuid>",
  "handle": "Person #4821",
  "issuedAt": "<ISO 8601 UTC>",
  "score": { "value": 18, "schema": "<cubid scoring schema>", "fetchedAt": "<ISO 8601>" },
  "kind": "attendance" | "record" | "disclosure"
}
```

(`confirmed` payloads differ; see 6.1.)

Kind-specific fields:

- `attendance`: `mode: "full"`, or `mode: "range"` with `from` and `to`.
- `record`: `commit` (hash hex), `seq`, and `approvals`: one entry per
  document of that commit, in tree order, each `{ doc, root, leaves,
witness }` where `leaves` is `"all"`, `"none"` (explicit exclusion), or an
  array of inclusive `[start, end]` leaf index ranges, and `witness` is a
  statement from section 13. An approval must list every document of the
  commit, so the signed payload is complete.
- `disclosure`: `public` and `viewer`, each the SHA-512 (hex) of the
  canonicalized profile fields for that level. The fields themselves are
  not in the payload.

Attestation payloads stay at version 1: protocol 2.0 moved only commit
bodies (section 12) and receipts (section 9) to `"v": 2`, since those are
where the hash algorithm appears. A payload's hashes (`root`, `commit`,
`public`, `viewer`) are SHA-512 since 2.0 and are told apart by length.

The humanity score is the value Cubid served at signing time. Later score
changes never alter a stored attestation.

### 6.1 Confirmations

The participant speaks first; the organiser confirms second, never
first. A `confirmed` attestation is written on the participant's row, can
only name an attendance attestation that exists, and is signed by the
organiser's side rather than the participant:

```json
{
  "v": 1,
  "kind": "confirmed",
  "workspace": "<workspace uuid>",
  "handle": "Person #4821",
  "issuedAt": "<ISO 8601 UTC>",
  "attestation": { "id": "<attendance attestation uuid>", "hash": "<its payloadHashHex>" },
  "mode": "automatic" | "manual",
  "confirmer": { "kind": "service", "role": "owner", "account": "<owner account id>" }
}
```

- No `score`: the statement is the organiser's, not the participant's.
- `mode` is `automatic` when the service confirmed as the attendance
  landed (the workspace default, which an organiser may turn off) and
  `manual` when the organiser confirmed by hand, in bulk or one at a time.
- `confirmer.kind` names the signer. Today it is `service`: the service
  key (the one in `/.well-known/jwks.json`, also the batch and vCon
  signer) signs on behalf of the owner whose account id is given, so
  `keyId` on the row is the service key id. A future `kind` for an
  owner-held key changes nothing else in the row or the payload.
- A confirmation is _current_ when its `attestation.id` and `hash` match
  the participant's current attendance attestation; a re-attestation
  makes the earlier confirmation stale until a new one is written.
  Withdrawal tombstones it like any other kind.
- Outward claims (section 11) count only confirmed attendance and say
  which mode they accepted: `automatic-accepted` (both) or
  `manual-required`. The verification page keeps showing unconfirmed
  attestations, marked as such.

## 7. Signatures

```
message   = SHA-512(canonicalize(payload))
signature = Ed25519.sign(participantPrivateKey, message)
```

Stored and served: `payload`, `payloadHashHex` (hex of `message`),
`signatureB64` (base64 of the 64-byte signature), `keyId` (first 16 hex
characters of SHA-512 over the raw public key). Verify with
`verifySignature(canonicalize(payload), signatureB64, publicKeyHex)`.

Keys are held server-side in version one (whitepaper 5.5). Participant-held
keys are planned and will use the same payload and message construction.

## 8. Supersession and tombstones

A participant may attest again; the new attestation names the previous one
in `supersedesId`. Both remain readable. When a participant withdraws, each
of their attestations becomes a tombstone: `payload`, `canonical`,
`signatureB64`, `payloadHashHex`, `keyId`, and `score` are nulled and
`tombstonedAt` is set. Verification pages show tombstones as a count only.

## 9. Anchoring and receipts

A batch is a Merkle tree (section 3) whose leaves are, in creation order,
the `payloadHashHex` bytes of every live attestation and the `hashHex` bytes
of every commit not previously anchored (batches made before 2026-11-06
carried record roots instead; their receipts stay valid). A commit's receipt
plus the chain proves the whole package history existed by the batch time. The batch root is submitted as a
64-byte digest to an OpenTimestamps calendar (`POST /digest`; the public
calendars accept digests up to 64 bytes); the returned pending proof is
stored and served as base64. ProofOfMeetProtocol also signs
`"pomp-batch:<batchId>:<rootHex>:<leafCount>"` (message = SHA-512 of that
string) with a service Ed25519 key published at `GET /api/v1/batches`.

Receipt:

```json
{
  "v": 2,
  "batch": "<batch uuid>",
  "root": "<batch root hex>",
  "index": 3,
  "path": [{ "hash": "<hex>", "side": "right" }],
  "item": { "kind": "attestation", "id": "<uuid>", "leafHash": "<hex>" },
  "ledger": {
    "kind": "opentimestamps",
    "calendar": "https://a.pool.opentimestamps.org",
    "proof": "<base64 .ots bytes>",
    "status": "submitted" | "confirmed" | "pending" | "failed",
    "submittedAt": "<ISO 8601>"
  },
  "service": { "keyId": "<hex16>", "signature": "<base64>" }
}
```

`verifyReceipt(receipt)` recomputes the root from `item.leafHash` and
`path`: `invalid` if it does not match `root`; `valid` if it matches and the
ledger status is `confirmed`; otherwise `pending`. The stored `.ots` proof
can be upgraded and verified independently with the standard OpenTimestamps
tooling once the calendar has aggregated it into Bitcoin.

## 10. Handles

`handle_number = 1000 + (HMAC-SHA256(handleKey, participantAccount || "|" || workspace || "|" || attempt)[0:4] mod 9000)`
with `attempt` incremented on collision inside the workspace. The key is
server-side; handles are unlinkable across workspaces by construction.

## 11. API and MCP

See `openapi.yaml`. The MCP server (`@proofofmeet/mcp`) exposes
`pomp_list_workspaces`, `pomp_create_workspace`, `pomp_get_workspace`,
`pomp_attach_record`, `pomp_commit_records`, `pomp_get_history`,
`pomp_create_invitation`, `pomp_get_verification`, `pomp_get_receipt`,
`pomp_export_vcon`, and `pomp_import_vcon`, each a thin wrapper over the
corresponding endpoint.

The vCon endpoints (sections 14 and 15):

- `GET /api/v1/workspaces/:id/vcon`: the owner-level document of one commit
  (`?commit=` sequence number or hash, head by default). Owner session,
  integrator API key, or consent token with `workspaces:read`.
- `GET /api/v1/verify/:key/vcon`: the document at the key's viewer level
  (public slug or link token, resolved as `GET /api/v1/verify/:key`), a
  `redacted_from` of the owner-level document. No credentials beyond the
  key.
- Both take `Accept` or `?form=`: `application/jose+json` (`signed`, the
  default: JWS General JSON Serialization by the service key),
  `application/vcon+json` (`unsigned`), `application/gzip` (`gzip`: the
  signed JSON compressed), and answer with `Content-Disposition:
attachment; filename="<workspace-slug>-<seq>.vcon.jws"` (`.vcon.json`,
  `.vcon.jws.gz`).
- `POST /api/v1/vcon/import`: a JSON body `{ vcon, workspaceId?, message? }`
  (unsigned object or signed JWS), or a raw body under `application/vcon+json`,
  `application/jose+json`, `message/rfc822` (one `.eml`) or
  `application/mbox` (a thread) with `?workspaceId=&message=`. Session, API
  key, or consent token with `workspaces:write`. Without `workspaceId` a
  workspace is created from the document; otherwise its documents are
  committed onto the workspace. Returns `{ workspace, commit, imported: {
parties, documents, signature: verified | unverified | none } }`. An
  unknown `critical` token is a 400 with code `unsupported_extension`.
- `GET /.well-known/jwks.json`: the service keys as a JWK Set, `{ keys: [{
kty: "OKP", crv: "Ed25519", x, kid, use: "sig", alg: "EdDSA" }] }`, the
  current key and any retired keys.

In the SDK these are `client.vcon.export(workspaceId, { commit?, form? })`,
`client.vcon.exportVerification(key, { form? })`, `client.vcon.import(input)`
and `client.vcon.jwks()`; `@proofofmeet/vcon` adds `exportVcon`,
`verifyExport` and `importVcon` over the typed document. The MCP tool
`pomp_export_vcon` returns the unsigned document and, with `verify: true`,
checks the signature against the JWK Set; `pomp_import_vcon` takes a vCon
object or email text.

## 12. Commits

Each workspace has exactly one chain. A commit body is:

```json
{
  "v": 2,
  "workspace": "<workspace uuid>",
  "seq": 2,
  "parent": "<hash hex of commit seq-1, or null for seq 1>",
  "kind": "initial" | "edit" | "comment" | "add-document" | "remove-document",
  "author": { "role": "owner" | "integrator" | "participant", "ref": "<integrator id, handle, or null>" },
  "time": "<ISO 8601 UTC>",
  "message": "<free text>",
  "tree": [
    { "doc": "<document uuid>", "kind": "text", "label": "Transcript",
      "root": "<record root hex>", "leafCount": 3, "segmentation": "v1",
      "provenance": { ... section 13 ... } }
  ]
}
```

Normalization before hashing: `tree` sorted by `doc` (code-unit order),
`root` and `parent` lowercased, `provenance.creators` sorted, and absent
optional provenance fields omitted. Then:

```
canonical = canonicalize(body)          // RFC 8785, section 2
hashHex   = hex(SHA-512(utf8(canonical)))
```

Rules a verifier checks (`verifyChain()` in the SDK): `seq` runs 1..n with
no gaps; `parent` of commit n is the hash of commit n-1 (null for the
first); every commit hashes to its stated `hashHex`. The chain is linear:
no branches, no rewrites. Document content may change freely between
commits; the server stores every record version and computes the diff.
`vectors/commit.json` holds two commits, an unsorted input that must hash to
the same value, and a broken-parent case.

The export of a chain as a git repository whose commit messages carry these
hashes is planned; the POMP hash, not a git hash, is what attestations name.

## 13. Provenance declarations, witness statements, and the grade

A **provenance declaration** is made by whoever adds a document and is part
of the commit tree entry, so it is covered by the commit hash:

| Field           | Values                                                                              |
| --------------- | ----------------------------------------------------------------------------------- |
| `type`          | `transcript`, `minutes`, `notes`, `recording`, `image`, `evidence`, `code`, `other` |
| `creators`      | one or more of `owner`, `participant`, `other-human`                                |
| `created`       | `before`, `during`, `after` (the meeting)                                           |
| `ai`            | `none`, `assisted`, `generated`                                                     |
| `aiRole`        | `verbatim`, `summary`, `enhanced`; required unless `ai` is `none`                   |
| `evidenceDocId` | optional; an `evidence` document in the same commit                                 |
| `note`          | optional, up to 280 characters                                                      |

A **witness statement** is made by each approving participant per document
inside the signed `record` attestation (section 6):

| `witness`             | The participant states                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `author`              | I made or co-made this during the meeting                                                       |
| `witnessed`           | I saw or heard this being made during the meeting                                               |
| `representative`      | It was derived from what happened and I agree it represents it                                  |
| `inspired`            | It was produced from ideas raised in the meeting; I heard them raised but did not see this made |
| `verified-prior`      | I took part in the meeting's verification of this prior artefact                                |
| `told-by-participant` | Another participant said in the meeting that they made this before it                           |
| `told-third-party`    | Another participant said in the meeting that someone else made this                             |
| `none`                | I make no statement about its origin                                                            |

The **human-involvement grade** of a document at a commit is derived, never
stored or signed (`gradeDocument(provenance, witnesses)` in the SDK):

1. `cap(declaration)`: `ungraded` if undeclared; `C` if `created` is
   `before`; otherwise, if `ai` is `none`, or `assisted` with `aiRole`
   `verbatim`: `A` when `created` is `during`, else `B`; otherwise `B`.
2. Each statement's own grade: `author`, `witnessed` → `A`;
   `representative` → `B`; `inspired`, `verified-prior`,
   `told-by-participant`, `told-third-party` → `C`; `none` → `ungraded`.
3. A statement's effective grade is the weaker of its own grade and the
   cap. A statement stronger than a declared cap is a **mismatch**: flagged,
   graded by the declaration.
4. The document grade is the weakest effective grade among the approving
   participants' statements at that commit (`leaves` not `none`); no
   statements gives `ungraded`.

Order: `A` > `B` > `C` > `ungraded`. `vectors/grade.json` holds the cases.
`suggestWitness(declaration)` is the statement the attestation page
pre-fills; it is a convenience, not part of the rule.

## 14. vCon extension `proofofmeet`

ProofOfMeetProtocol exports a workspace as an IETF vCon
(`draft-ietf-vcon-vcon-core-05`, syntax version `0.5.0`; the package
`@proofofmeet/vcon` pins the revision in `DRAFT_REVISION`). The vCon is
the container; this extension is the verification layer inside it. Until
the core draft's registry exists at IANA, this section is the extension's
specification document.

- **Extension name**: `proofofmeet`. It appears in `extensions` of
  every vCon that uses it and never in `critical`.
- **Parameters**: none. The extension defines no new parameters, objects,
  type tokens or encodings. Every ProofOfMeetProtocol object is an Attachment
  Object (draft section 4.6) with a `purpose` from the table below, an
  inline JSON body (`encoding: "json"`), the media type
  `application/vnd.proofofmeet.<kind>+json`, `start`, `party` set to
  the party the object belongs to, and `dialog` pointing at the document
  it is about when that document is a Dialog Object, otherwise `session`.
- **Compatibility**: Compatible under all conditions. A reader that does
  not know the extension sees parties, dialog, analysis, sessions and
  ordinary attachments, and processes the conversation correctly by
  ignoring the attachment bodies. No existing semantics are changed.
- **Privacy**: an attachment body may carry a handle, a humanity-score
  snapshot, and, in `identity` and `consent` records, personal data the
  participant chose to disclose. ProofOfMeetProtocol redacts by omission
  (section 15.5); `redacted_strings` is not used, and a redactor that
  removes an attachment removes the whole object.
- **External references**: none beyond the core `url` + `content_hash`
  pairs of the documents themselves.

| `purpose`                 | Body (`v: 1` unless noted)                                                                                                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proofofmeet/attestation` | `{ id, kind, payload, payloadHashHex, signatureB64, keyId, publicKeyHex, score, supersedesId, createdAt, tombstonedAt }`: one attestation (section 6) with its signature (section 7) and score snapshot. Tombstones carry nulls.                                             |
| `proofofmeet/provenance`  | `{ doc, label, kind, contentVisibility, entry: { array, index } \| null, provenance, witnesses: [{ handle, witness, leaves }] }`: a document's declaration (section 13) and the witness statements of the approving participants, with where the document sits in this vCon. |
| `proofofmeet/commitment`  | `{ hashHex, body, leaves? }`: the commit this vCon renders (section 12), its hashed body with the tree of Merkle roots, and optionally the leaf hashes per document id.                                                                                                      |
| `proofofmeet/receipt`     | A receipt object as in section 9 (`v: 2`).                                                                                                                                                                                                                                   |
| `proofofmeet/consent`     | `{ handle, entries: [{ scope, to, at, fields? }] }`: what the participant disclosed or granted, to whom, and when.                                                                                                                                                           |
| `proofofmeet/identity`    | `{ handle, identifiers: [{ kind, value, verifiedBy: "cubid", verifiedAt?, status }], displayName?, affiliation? }`: Cubid-verified identifiers the participant disclosed at this level, plus self-declared labels.                                                           |

Verification rules a ProofOfMeetProtocol-aware reader applies, each with the
SDK function that implements it:

1. The JWS signature of the signed form verifies against a key in
   `https://proofofmeet.org/.well-known/jwks.json` named by `kid`, and
   the `uuid` header equals the payload's `uuid` (`verifyVcon`).
2. The commitment's `body` hashes to its `hashHex` (`verifyCommitHash`),
   `body.seq`, `body.parent` and `body.workspace` are consistent with the
   `amended_from` chain, and every tree entry has a provenance attachment.
3. Each attestation with a payload verifies with `verifySignature` over
   `canonicalize(payload)` and its `publicKeyHex`; `record` attestations
   name the commitment's `hashHex`; the witness statements in the
   provenance attachments are exactly those approvals.
4. Each receipt verifies with `verifyReceipt`, and its item is an
   attestation or the commit of this vCon.
5. Every document with `url` or inline content verifies against its
   `content_hash` (`verifyContentHash`), and a `text` document's segments
   recompute the Merkle root in the commitment (`textRecordCommitment`).
6. Parties with `validation: "proofofmeet"` are vouched for by the
   signing domain only to the extent of their attestations: the identity
   attachment names Cubid as the verifier of each identifier, and `name`
   is a verified name only when the identity record lists a `name`
   identifier with status `verified`.

## 15. vCon mapping (`pomp-vcon-mapping` 1)

The projection of one workspace commit onto a vCon, implemented by
`toVcon`, `redactVcon` and `fromVcon` in `@proofofmeet/vcon`. It is
deterministic: the same input renders byte-identical JSON. Exports state
`POMP_MAPPING_VERSION`; a later revision of the draft or of these rules
increments it.

### 15.1 Identity

- `uuid` is a version 5 UUID (RFC 9562) of the lowercase commit hash under
  the namespace `POMP_VCON_NAMESPACE =
0a1ef5b3-f353-5995-a562-29895c6a9e87`, itself
  `uuidv5(DNS namespace, "proofofmeet.org/vcon")`. A lower level uses
  the name `<commit hash>:<level>`. Re-rendering a commit at a level gives
  the same uuid. (The draft recommends version 8 time-based UUIDs; that is
  a SHOULD, and stability under re-rendering matters more here.)
- `vcon: "0.5.0"`, `extensions: ["proofofmeet"]`, no `critical`.
- `created_at` is the commit time; `updated_at` is the render time;
  `subject` is the workspace title.
- One vCon per commit. At owner level, commit n > 1 carries `amended_from:
{ uuid: <uuid of commit n-1>, url?, content_hash? }` where `content_hash`
  is over the previous commit's signed form when the renderer has it.
  Attestations and receipts do not create versions; the vCon of a commit
  includes every attendance and disclosure attestation, every `record`
  attestation naming that commit, and every receipt known at render time.

### 15.2 Parties and sessions

- `parties[0]` is the owner: `{ uuid: "owner", type: "person",
validation: "proofofmeet", name?, org? }`.
- One party per participant, ordered by handle: `uuid` = handle, `type` =
  `person`, `validation` = `proofofmeet`, `name` = the Cubid-verified
  name when disclosed, else the self-declared display name, else
  `anonymous`; `mailto` and `tel` only from verified, disclosed
  identifiers; `org` from the disclosed affiliation. Social accounts, the
  status of each identifier and the self-declared labels go in the
  `identity` attachment. Withdrawn participants remain as `anonymous`
  parties (their attestations are tombstones).
- The last party is the service: `{ uuid: "proofofmeet.org", type:
"organization", name: "ProofOfMeetProtocol" }`, the `party` of receipts.
- Exactly one Session Object (the draft requires one when `dialog` is
  non-empty): `start` = actual start, else scheduled start, else commit
  time; `duration` = the scheduled minutes in seconds; `parties` = owner
  first (the originator), then the participants; `dialog` = every dialog
  index. `events` are never generated.

### 15.3 Documents

Tree entries are taken in commit-tree order (sorted by document id). Their
placement follows the provenance declaration:

| Declaration                             | vCon entry                                                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type: transcript`                      | `dialog` of type `text`, `parties` = all participants                                                                                                                                     |
| `type: recording`                       | `dialog` of type `recording`, `parties` = all participants                                                                                                                                |
| `type: minutes` or `notes`, `ai` ≠ none | `analysis` of type `transcript` (`aiRole: verbatim`) or `summary`, `vendor`/`product`/`schema` from the record's tool (`vendor: "unknown"` when not given), `dialog` = every dialog index |
| anything else                           | `attachments` with `purpose` = the declaration type, `party` = the party whose commit added that document version, `session: 0`                                                           |

`incomplete` dialog is never produced. Content at a level:

- A `text` document disclosed at the level: inline `body` with
  `encoding: "none"` and `mediatype: text/plain` when the text is supplied,
  else `url` = `<contentBaseUrl>/<document id>`; in both cases
  `content_hash` = `sha512-` over the UTF-8 bytes.
- A `link` document with an owner-supplied digest: `url` and
  `content_hash` in the supplied algorithm (`sha512-` or `sha256-`).
  Without a digest the URL is the content: inline `body` = the URL,
  `encoding: "none"`, `mediatype: text/uri-list`, matching the commitment
  to the URL bytes (section 4).
- A `hash` document: `content_hash` only.
- A document not disclosed at the level keeps only its `content_hash` (for
  a hash-less link, `sha512-` over the URL bytes) and no `mediatype`.

### 15.4 Extension attachments

In this order: one `provenance` per tree entry (`party` = the adder,
`dialog` = the entry's index when it is a dialog, else `session: 0`,
`start` = commit time); the `commitment` (`party` = the commit author,
`leaves` only at owner and viewer level); attestations ordered by creation
time then id (`party` = the participant); receipts ordered by item kind,
item id and batch (`party` = the service); consents at owner and viewer
level (`party` = the participant); identities for every participant who
disclosed anything at the level.

### 15.5 Levels and redaction

The owner-level document is rendered and stored at commit time and served
by `GET /api/v1/workspaces/:id/vcon` (section 11). Lower levels (`viewer`,
`link`, `public`) are served by `GET /api/v1/verify/:key/vcon` at the key's
level, derived from the owner-level document by omission, and carry `redacted_from: { uuid: <owner-level uuid>, type, url?, content_hash?
}` instead of `amended_from`; `type` is `UNSPECIFIED` for `viewer` and
`CONTACT_INFO` below it. `redactVcon(owner, level)` and
`toVcon(input, { level })` agree byte for byte:

- `viewer`: nothing else changes (viewer and owner see the same profile
  level and every document).
- `link` and `public`: participant parties collapse to `anonymous` unless
  the level's disclosed profile is supplied; documents whose
  `contentVisibility` is above the level lose `body`, `encoding`, `url`,
  `filename` and `mediatype`; `identity` and `consent` attachments and the
  commitment's `leaves` are dropped. `redacted_strings` is never used.

### 15.6 Signing

Every export is signed by the service key as a JWS General JSON
Serialization: protected header `{ alg: "EdDSA", kid, uuid, cty:
"application/vcon" }` (`application/vcon+gzip` for a compressed payload),
no unprotected header. Keys are published at `/.well-known/jwks.json` as
`{ kty: "OKP", crv: "Ed25519", x, kid, alg: "EdDSA", use: "sig" }`. The
draft requires `x5c` or `x5u`; neither is emitted until an interoperability
partner needs a certificate chain, which can be added to the unprotected
header without changing a signature. The unsigned form is available for
reading and diffing, and the gzip form for large exports; the export
endpoints choose by `Accept` or `?form=` (section 11). `verifyExport` in
`@proofofmeet/vcon` resolves the `kid` against the JWK Set and
verifies offline. No JWE.

### 15.7 Import

`POST /api/v1/vcon/import` (section 11) accepts a vCon, signed or
unsigned, or an email thread (`.eml` or mbox, converted by the email
adapter into a vCon with `parties` from the headers and one text `dialog`
entry per message), and creates a workspace or, with `workspaceId`, a
commit on an existing one. The server and `fromVcon` apply the same rules:
unknown `critical` tokens are rejected (`unsupported_extension`) and the
document becomes a plan:

- `subject` → workspace title; `parties` → participant slots with the
  disclosed `name`, `org`, `mailto` and `tel`; a party with `validation:
"proofofmeet"` is recognized as the owner (`uuid: "owner"`), a
  participant (`uuid` = handle) or the service.
- Each non-empty, non-`incomplete` `dialog`, each `analysis` and each
  non-extension `attachments` entry becomes a `DocumentInput`: inline
  string content → `text`; inline `text/uri-list` → `link` without a
  digest; inline binary → `hash` of the decoded bytes; `url` +
  `content_hash` → `link` with `hashHex`/`hashAlg` from the first
  supported token; `content_hash` alone → `hash`.
- The provenance declaration comes from the `provenance` attachment when
  the vCon is a ProofOfMeetProtocol export (with the original document id and
  label); otherwise it is derived: `dialog` `text` → `transcript`,
  `recording` → `recording`, both `created: during`, `ai: none`, creators
  from the party roles of `parties` (`other-human` when unknown);
  `analysis` `transcript` → `transcript` with `ai: generated`, `aiRole:
verbatim`, other types → `notes` with `aiRole: summary` (for `summary`)
  or `enhanced`, `note` = vendor, product and schema; attachments →
  the `purpose` when it is a declaration type, else `image` for `image/*`,
  else `other`.
- `sessions`, `events` and `redacted_strings` are preserved as given and
  not interpreted.
