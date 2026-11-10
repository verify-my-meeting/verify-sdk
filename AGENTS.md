# verify-sdk

Public, Apache-2.0. Everything here may be read by competitors and integrators;
keep server internals, credentials, and private roadmap out.

- pnpm workspace: `packages/sdk`, `packages/react`, `packages/mcp`, `spec/`.
- Packages are published under the `@proofofmeet` npm scope; the scope is
  registered at first publish, not before.
- Written against Web `Request`/`Response` and plain TypeScript; no framework
  coupling. `@proofofmeet/react` depends on React only.
- Record work in `agent-context/session-log/` before each commit.
- Related repos (same org, private): `proofofmeet`, `verifymyresearch`, `verify-private-docs`.
