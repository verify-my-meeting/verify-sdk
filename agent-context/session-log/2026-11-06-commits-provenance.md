# 2026-11-06: commit chain, provenance, grade (protocol 1.1)

- `spec/README.md` sections 12 (commits: body, normalization, hashing,
  chain rules) and 13 (provenance declaration, witness statements, grade
  rule); objects, attestation payload, anchoring, and MCP sections updated.
- `spec/vectors/commit.json` and `spec/vectors/grade.json`: shared vectors
  generated independently (Python JCS + SHA-256), tested here and in the
  server.
- `@verifymymeeting/sdk` 0.2.0: `proofs/commit.ts` (normalize, canonical,
  hash, `verifyCommitHash`, `verifyChain`), `proofs/grade.ts`
  (`declarationCap`, `gradeDocument`, `suggestWitness`); types for
  provenance, commits, diffs, approvals with witness statements; client
  `commits.list/create/get/diff/verify`; `records.create` requires
  provenance and returns the commit; receipts by `commit` id or hash.
- `@verifymymeeting/mcp` 0.2.0: `vmm_attach_record` takes the declaration,
  new `vmm_commit_records` and `vmm_get_history`.
- `openapi.yaml` 1.1: commits endpoints and schemas, record input/summary,
  attestation payload, verification page (head, commits, documents with
  grades).
