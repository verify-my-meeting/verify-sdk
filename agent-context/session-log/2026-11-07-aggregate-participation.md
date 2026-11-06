# 2026-11-07: aggregate and participation calls

For VerifyMyResearch v0.1 (`verify-private-docs/13-questions-vmr-build.md`
Q4), still at SDK version 0.2.0:

- `ConsentScope` gains `participant:read`.
- `workspaces.aggregate(workspaceIds)` → `POST /api/v1/workspaces/aggregate`,
  typed `WorkspaceAggregate`.
- `participation()` → `GET /api/v1/me/workspaces`, typed `Participation`.
- `spec/openapi.yaml` documents both paths inline.

VerifyMyResearch consumes the package through `link:../verify-sdk/packages/sdk`
until it is published; `dist/` must be built (`pnpm --filter
@verifymymeeting/sdk build`) for the link to resolve.
