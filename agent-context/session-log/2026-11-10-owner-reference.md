# 2026-11-10: confirmer carries a per-workspace owner reference

Spec change matching proofofmeet: a `confirmed` payload's `confirmer`
is `{ kind, role, ref }`; `ref` is the owner's keyed reference in that
workspace (same on every confirmation there, unrelated across
workspaces), and payloads never carry an account id. README 6.1 and the
three confirmer schemas in `openapi.yaml`. No package code names the
field. Typecheck and Prettier pass.
