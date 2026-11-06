# 2026-11-07: vCon export, import and JWKS in the SDK, vcon package and MCP

Sprint step 4 client side (`verify-private-docs/14-questions-vmm-vcon.md`
Q6, Q8, Q9; PRD VMM-06-13-82 to 85). The server endpoints are being built
in `verifymymeeting` by another session; this records the contract as
decided and documents it in `spec/openapi.yaml` and `spec/README.md`
section 11.

- `@verifymymeeting/sdk` 0.3.0: `client.vcon.export(workspaceId, { commit?,
  form? })`, `client.vcon.exportVerification(key, { form? })` (signed and
  unsigned return the parsed JSON, `gzip` returns a `Uint8Array`; `Accept`
  is set per form and `form` is also sent as a query parameter when given),
  `client.vcon.import(input)` (`{ vcon, workspaceId?, message? }` as JSON,
  or `{ email, mbox?, workspaceId?, message? }` as a raw `message/rfc822` /
  `application/mbox` body with query parameters), `client.vcon.jwks()`.
  `request()` was split into `send()` (headers, rate limit, errors) and the
  JSON parser so non-JSON responses and raw bodies share the path. Types:
  `VconDocument`, `SignedVconDocument`, `VconForm`, `VconExportResult`,
  `VconImportInput`, `VconImportResult`, `Jwk`, `Jwks`; error code
  `unsupported_extension`. `ProfileFields` lost `contact` and
  `linkIdentity` and gained `identifiers` (`DisclosedIdentifier`: `kind`,
  `value`, `status: 'verified'`, `verifiedBy: 'cubid'`, `syncedAt`). The
  SDK still imports nothing from the vcon package.
- `@verifymymeeting/vcon` 0.1.0: new `src/client.ts` with `exportVcon(client,
  workspaceId, { commit? })` → `{ signed, vcon }`, `verifyExport(signed, {
  jwks? | jwksUrl?, fetch? })` → `VerifyResult` through `resolverFromJwks`,
  and `importVcon(client, { vcon, workspaceId?, message? })`. Existing API
  untouched.
- `@verifymymeeting/mcp` 0.3.0: tools `vmm_export_vcon` (`workspaceId`,
  `commit?` seq or 128-hex, `verify?`, `raw?`; returns the unsigned
  document plus `signature: verified | invalid | unverified`, `kid`/`alg`
  or `reason`, and the JWS only under `raw`) and `vmm_import_vcon` (`vcon`
  object or `email` text, `mbox?`, `workspaceId?`, `message?`; exactly one
  of `vcon`/`email`). The package now depends on `@verifymymeeting/vcon`,
  so the root `typecheck`/`test` scripts build `@verifymymeeting/vcon...`
  (sdk then vcon) first.
- `spec/openapi.yaml`: `GET /api/v1/workspaces/{id}/vcon`, `GET
/api/v1/verify/{key}/vcon`, `POST /api/v1/vcon/import`, `GET
/.well-known/jwks.json`; parameters `VconCommit`, `VconForm`; schemas
  `Vcon`, `SignedVcon`, `VconImportInput`, `VconImportResult`, `Jwk`,
  `Jwks`, `DisclosedIdentifier`; `ProfileFields` updated; error code
  `unsupported_extension`; tag `vcon`.
- `spec/README.md`: section 6 attestation payload example back to `"v": 1`
  with a sentence that payloads stayed at 1 (only commit bodies and
  receipts moved to 2); section 11 lists the endpoints, SDK methods and
  tools; 15.5, 15.6 and 15.7 reference the export, verification and import
  surfaces. Root README and `packages/vcon/README.md` updated.

Decisions made here, not in the brief: the MCP tools keep the `vmm_`
prefix of the existing tools (`vmm_export_vcon`, `vmm_import_vcon`); a
JWKS fetch failure under `verify: true` reports `unverified` with a
`reason` rather than failing the tool; `SDK_VERSION` and
`MCP_PACKAGE_VERSION` constants were still `0.2.0` while the manifests said
`0.3.0`, and now match. Noticed, left alone: the OpenAPI `CommitHash`
parameter and the receipt path description still say 64 hex, and
`vmm_get_history.diffOf` still validates 64 hex, although commit hashes are
SHA-512 (128 hex) since protocol 2.0.

Validation: `pnpm format`, `pnpm check`, `pnpm typecheck`, `pnpm test`
(sdk 21, vcon 39, mcp 6), `pnpm build` all clean.
