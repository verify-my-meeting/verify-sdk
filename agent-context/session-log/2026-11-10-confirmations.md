# 2026-11-10: confirmed attestation kind in types, client and spec

- `AttestationKind` gains `confirmed`; `ConfirmationPayload`,
  `ConfirmerRef`, `ConfirmationMode`, `ConfirmationCount`,
  `ConfirmationView`, `ConfirmInput`, `ConfirmResult`; verification
  participants carry `confirmation`, pages carry `counts`; aggregates
  carry `confirmedAttendance` and `confirmation`.
- Client: `confirmations.list/confirm/withdraw`; `workspaces.aggregate`
  takes `{ confirmation }`.
- Spec section 6.1 and OpenAPI paths/schemas for confirmations.
- Tarballs repacked into both apps' `vendor/`.
