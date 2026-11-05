# VerifyMyMeeting protocol specification

Version 1, 2026-11-05. Normative where it says "must". The reference
implementation of every computation here is `@verifymymeeting/sdk`
(`packages/sdk/src/proofs`), and `vectors/` holds the shared test vectors
that both the server and the SDK are tested against.

- `openapi.yaml`: the REST API contract (OpenAPI 3.1).
- `vectors/`: canonicalization, Merkle, and segmentation vectors.

## 1. Objects

- **Workspace**: one meeting. Owned by an account. Visibility `private`,
  `link`, or `public`; status `draft`, `open`, or `closed`.
- **Record**: a `link` (URL plus optional SHA-256), a `hash` (SHA-256 only),
  or `text` (uploaded transcript). Every record has an RFC 6962 Merkle root.
- **Participant**: an account's membership in one workspace, shown as a
  per-workspace handle (`Person #NNNN`) that is unlinkable across workspaces.
  Each participant has its own Ed25519 key pair; the public key appears on
  the verification page.
- **Attestation**: a signed statement by a participant: `attendance`,
  `record` approval, or `disclosure`. Append-only; a newer attestation of
  the same kind (and record) supersedes the older for display.
- **Batch**: an anchoring run over new attestation hashes and record roots.
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
  32-byte digest the owner supplied. A `link` without a digest has leaf
  count 0 and the empty root.
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
- `record`: `record` (uuid), `root` (hex), `leaves`: `"all"` or an array
  of inclusive `[start, end]` leaf index ranges the participant approves.
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
the `payloadHashHex` bytes of every live attestation and the `rootHex` bytes
of every record not previously anchored. The batch root is submitted as a
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
`vmm_attach_record`, `vmm_create_invitation`, `vmm_get_verification`, and
`vmm_get_receipt`, each a thin wrapper over the corresponding endpoint.
