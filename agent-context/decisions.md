# Decisions

Assumptions made while building, recorded instead of asked. Newest last.

## 2026-11-18: integrator walkthrough (proofofmeet#62, goal D2)

- The walkthrough lives in the root `README.md` as "Five-minute
  integration", ahead of the per-package reference, so the GitHub landing
  page is the walkthrough. It links `spec/README.md` and
  `spec/openapi.yaml` instead of copying them.
- It targets `https://dev.proofofmeet.org` (Stripe sandbox) and names
  `https://www.proofofmeet.org` for production. The apex
  `proofofmeet.org` answers 308 to `www`, and `fetch` drops the
  `Authorization` header on a cross-origin redirect, so every base URL in
  the README, the OpenAPI `servers`, and doc comments now uses `www`.
  The spec text (section on the JWKS location) is left as is: a GET of a
  public document survives the redirect, and the spec is versioned.
- Install until npm publish (verify-sdk#2): clone, build
  `packages/sdk`, `pnpm pack`, `npm install` the tarball. This is the
  path the two apps already use (`vendor/proofofmeet-sdk-0.4.0.tgz`);
  there are no GitHub releases to point at. The MCP server is run from
  the built workspace with `node packages/mcp/dist/bin.js`, since its
  tarball depends on unpublished `@proofofmeet/sdk` and `vcon`.
- The old first README example omitted the now-required `provenance` on
  `records.create`; it was folded into the walkthrough with a valid
  declaration rather than kept twice.
- Step 7 reads the grade from `GET /api/v1/verify/{workspaceId}` (owner
  level), which already returns `documents[].grade`; there is no separate
  grade endpoint, and recomputing with `gradeDocument` is shown.
