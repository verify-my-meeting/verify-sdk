# 2026-11-11: quota_exceeded error code

POMP (doc 19, #103 to #105) now refuses owner actions that exceed an
allowance or an integrator's balance cut-off with HTTP 402 and code
`quota_exceeded`; the body's `details` carries `counter` (`meetings`,
`attestations` or `balance`), the `payer` (`{ kind, id }`), `remaining`
or `balanceCents` and `cutoffCents`, and an `upgradeUrl`. Added to the
OpenAPI error enum and the SDK `ErrorCode` union. Types only; no SDK
version bump, no publish.
