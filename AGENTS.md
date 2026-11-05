# verify-sdk

Public, Apache-2.0. Everything here may be read by competitors and integrators;
keep server internals, credentials, and private roadmap out.

- pnpm workspace: `packages/sdk`, `packages/react`, `packages/mcp`, `spec/`.
- Packages are published under the `@verifymymeeting` npm scope; the scope is
  registered at first publish, not before.
- Written against Web `Request`/`Response` and plain TypeScript; no framework
  coupling. `@verifymymeeting/react` depends on React only.
- Record work in `agent-context/session-log/` before each commit.
- Related repos (same org, private): `verifymymeeting`, `verifymyresearch`, `verify-private-docs`.
