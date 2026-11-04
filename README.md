# verify-sdk

Public SDK, embeddable React component, MCP server, and protocol spec for
VerifyMyMeeting. Apache-2.0.

VerifyMyMeeting lets a group of people prove that they met, for how long, and
which version of the record each of them endorses, with participants
identified by an anonymized handle and a Cubid humanity score by default.

| Package | Purpose |
| --- | --- |
| `@verifymymeeting/sdk` | Typed API client and protocol types |
| `@verifymymeeting/react` | Embeddable sign-up and attestation component |
| `@verifymymeeting/mcp` | MCP server exposing workspaces, records, invitations, and verification lookups as tools |
| `spec/` | Protocol specification: attestation format, Merkle commitment, anchoring receipts, API contract |

Status: pre-release scaffolding. Nothing is published to npm yet. Pin nothing
from here until a release is tagged.

## Development

```sh
pnpm install
pnpm -r typecheck
pnpm -r test
```
