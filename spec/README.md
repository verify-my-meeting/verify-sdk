# VerifyMyMeeting protocol specification

Version 1.1, 2026-11-06 (commit chain, provenance, grade added to version 1
of 2026-11-05). Normative where it says "must". The reference
implementation of every computation here is `@verifymymeeting/sdk`
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
  a `link` (URL plus optional SHA-256), a `hash` (SHA-256 only), or `text`
  (uploaded transcript). Every record has an RFC 6962 Merkle root. Every
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
  or `disclosure`. Append-only; a newer attestation of the same kind
  supersedes the older for display.
- **Batch**: an anchoring run over new attestation hashes and commit hashes.
- **Receipt**: the inclusion proof of one item in one batch.

## 2. Canonicalization

Attestation payloads are canonicalized with the JSON Canonicalization Scheme
(RFC 8785): keys sorted by UTF-16 code units, no whitespace, ECMAScript
number serialization. `canonicalize()` in the SDK implements this and must
produce the strings in `vectors/canonicalize.json`.

## 3. Hashing and Merkle trees

SHA-256 throughout. Trees follow RFC 6962:

```
leafHash(leaf)        = SHA-256(0x00 || leaf)
nodeHash(left, right) = SHA-256(0x01 || left || right)
root([])              = SHA-256("")
root([h])             = h
root(hashes)          = nodeHash(root(hashes[0:k]), root(hashes[k:]))
                        where k is the largest power of two < n
```

Audit paths are lists of `{ hash, side }` from the leaf upward, `side`
naming where the sibling sits. `vectors/merkle.json` holds the RFC vectors.

## 4. Record commitments

- `link` and `hash` records are single-leaf trees: the leaf is the raw
  32-byte digest the owner supplied. A `link` without a digest commits to
  the UTF-8 bytes of the URL as its single leaf (changed 2026-11-05; earlier
  drafts said leaf count 0 and the empty root).
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

Kind-specific fields:

- `attendance`: `mode: "full"`, or `mode: "range"` with `from` and `to`.
- `record`: `commit` (hash hex), `seq`, and `approvals`: one entry per
  document of that commit, in tree order, each `{ doc, root, leaves,
witness }` where `leaves` is `"all"`, `"none"` (explicit exclusion), or an
  array of inclusive `[start, end]` leaf index ranges, and `witness` is a
  statement from section 13. An approval must list every document of the
  commit, so the signed payload is complete.
- `disclosure`: `public` and `viewer`, each the SHA-256 (hex) of the
  canonicalized profile fields for that level. The fields themselves are
  not in the payload.

The humanity score is the value Cubid served at signing time. Later score
changes never alter a stored attestation.

## 7. Signatures

```
message   = SHA-256(canonicalize(payload))
signature = Ed25519.sign(participantPrivateKey, message)
```

Stored and served: `payload`, `payloadHashHex` (hex of `message`),
`signatureB64` (base64 of the 64-byte signature), `keyId` (first 16 hex
characters of SHA-256 over the raw public key). Verify with
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
32-byte digest to an OpenTimestamps calendar (`POST /digest`); the returned
pending proof is stored and served as base64. VerifyMyMeeting also signs
`"vmm-batch:<batchId>:<rootHex>:<leafCount>"` (message = SHA-256 of that
string) with a service Ed25519 key published at `GET /api/v1/batches`.

Receipt:

```json
{
  "v": 1,
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

See `openapi.yaml`. The MCP server (`@verifymymeeting/mcp`) exposes
`vmm_list_workspaces`, `vmm_create_workspace`, `vmm_get_workspace`,
`vmm_attach_record`, `vmm_commit_records`, `vmm_get_history`,
`vmm_create_invitation`, `vmm_get_verification`, and `vmm_get_receipt`, each
a thin wrapper over the corresponding endpoint.

## 12. Commits

Each workspace has exactly one chain. A commit body is:

```json
{
  "v": 1,
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
hashHex   = hex(SHA-256(utf8(canonical)))
```

Rules a verifier checks (`verifyChain()` in the SDK): `seq` runs 1..n with
no gaps; `parent` of commit n is the hash of commit n-1 (null for the
first); every commit hashes to its stated `hashHex`. The chain is linear:
no branches, no rewrites. Document content may change freely between
commits; the server stores every record version and computes the diff.
`vectors/commit.json` holds two commits, an unsorted input that must hash to
the same value, and a broken-parent case.

The export of a chain as a git repository whose commit messages carry these
hashes is planned; the VMM hash, not a git hash, is what attestations name.

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
