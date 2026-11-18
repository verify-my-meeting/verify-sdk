# 2026-11-18: five-minute integrator walkthrough

proofofmeet#62 (doc 15 goal D2). README gains "Five-minute integration":
key on `/developers`, install from a packed tarball until npm publish
(verify-sdk#2), client, workspace, record with provenance, invitation,
attestations and grade via the verification page, receipt and commitment
checks offline, and one paragraph on the MCP server. Each step names the
SDK call and its REST endpoint; spec 2.0 and the OpenAPI contract are
linked, not copied.

Base URLs move to `https://www.proofofmeet.org` (README, OpenAPI
`servers` plus dev, doc comments in sdk, vcon, mcp) because the apex
redirects and the redirect drops the bearer token.

Verified: the walkthrough code typechecks against a packed
`proofofmeet-sdk-0.4.0.tgz` installed with npm; the installed client
reads `GET /api/v1/batches` and `/.well-known/jwks.json` on
dev.proofofmeet.org and gets 401 `unauthorized` on an unauthenticated
workspace list; the MCP server built from source answers `initialize`
and `tools/list`. Not exercised: the authenticated steps against the
hosted API (no key issued from this session) and a real receipt (dev has
no anchored batches yet). No publish, no version bump.

Decisions: `agent-context/decisions.md`.
