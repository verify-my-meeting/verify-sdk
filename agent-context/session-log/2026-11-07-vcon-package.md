# 2026-11-07: @verifymymeeting/vcon 0.1.0

New public package `packages/vcon` for `verify-private-docs/14-questions-vmm-vcon.md`
(sprint step 1, Q2, Q3, Q4, Q5, Q6, Q7, Q9, Q10, Q11, Q12): IETF vCon
`draft-ietf-vcon-vcon-core-05` (syntax `0.5.0`) types, builder, validator,
`content_hash` helpers, UUIDv5, JWS General JSON sign/verify, the
`verifymymeeting` extension, and the `vmm-vcon-mapping` 1 projection in both
directions. Types were written against the draft text and its JSON schema
(appendix C), not from memory; the draft's unformatted appendix B examples
are in `packages/vcon/test-fixtures/` and round-trip in the tests.

- `spec/README.md`: section 14 (extension) and 15 (mapping). Root README
  lists the package. Nothing under `packages/sdk` or `packages/mcp` changed.
- `VMM_VCON_NAMESPACE = 07ff0c10-f61d-519d-8e6b-b08721f96097`
  (`uuidv5(DNS, "verifymymeeting.com/vcon")`).

Where the draft contradicted the question doc, the draft won:

- A Session Object MUST exist when `dialog` is non-empty, and an Attachment
  Object needs `start`, `party` and one of `dialog`/`session`. Exports
  therefore carry exactly one session (owner first as originator, all
  dialog indices); VMM attachments without a dialog use `session: 0`.
  `events` are still never generated.
- The signed form MUST carry `x5c` or `x5u` in the unprotected header; per
  Q6 none is emitted (JWK Set at `/.well-known/jwks.json` instead), the
  option `header` passes one through, and `verifyVcon` does not require it.
  `alg`, `kid`, `uuid` and `cty` sit in the protected header.
- `redacted_from.type` is required; levels use `UNSPECIFIED` (viewer) and
  `CONTACT_INFO` (link, public). A lower-level export carries
  `redacted_from` (owner-level uuid) and not `amended_from`, since the two
  are mutually exclusive; the chain lives on the owner-level documents.
- Analysis `vendor` is required; the record input has an optional `tool`
  and `vendor: "unknown"` is the fallback (provenance declarations carry no
  vendor).
- The draft recommends version 8 UUIDs (SHOULD); version 5 over the commit
  hash is used for stability, as decided.

Assumptions: a hash-less `link` document is rendered inline as
`text/uri-list` (the URL is what the record commits to); human-written
minutes and notes are attachments with `purpose` = the declaration type;
witness statements are read from the `record` attestations rather than
passed separately; the owner party uses `uuid: "owner"` and the service
`uuid: "verifymymeeting.com"`. The task brief quoted the RFC UUIDv5
example as `...95e3-e2cd3d9f4ae5`; the value computed here and by Python's
`uuid5` is `2ed6657d-e927-568b-95e1-2665a8aea6a2`, which the test asserts.
