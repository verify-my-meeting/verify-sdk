# 2026-11-05: SDK client, proofs, MCP server, spec

- `@verifymymeeting/sdk` 0.1.0: `createClient` covering every `/api/v1`
  endpoint available to integrators (attestation and withdrawal are
  session-only and omitted), `VmmApiError`, rate-limit header capture,
  `buildAuthorizeUrl`, `createPkcePair`, `createState`, hand-written `types.ts`.
  `proofs/`: Web Crypto mirrors of the server's RFC 8785 canonicalization,
  RFC 6962 Merkle tree, segmentation v1, receipt verification, plus an
  Ed25519 `verifySignature`. Hashing is async (Web Crypto).
- `@verifymymeeting/mcp` 0.1.0: `createVmmMcpServer` with seven tools over
  the SDK client, `verifymymeeting-mcp` stdio binary, env config
  `VMM_BASE_URL` / `VMM_TOKEN`. Tested through an in-memory transport.
- `spec/openapi.yaml` (OpenAPI 3.1), `spec/README.md` (protocol v1),
  `spec/vectors/{canonicalize,merkle,segmentation}.json` shared with the
  server.
- Tooling: prettier (no semicolons, single quotes), vitest 5, tsc builds to
  `dist` with declarations; root scripts build the sdk before typecheck/test
  so the mcp package resolves it.
- `@verifymymeeting/react` left as the v1.x placeholder.
