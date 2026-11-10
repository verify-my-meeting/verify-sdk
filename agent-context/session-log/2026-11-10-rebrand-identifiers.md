# 2026-11-10: machine identifiers renamed to proofofmeet / POMP / pomp

Second pass of the rebrand, on Hubert's instruction, now covering the
identifiers the first pass left alone:

- npm scope `@verifymymeeting/*` is `@proofofmeet/*` (sdk 0.3.0, vcon
  0.1.0, mcp 0.3.0, react 0.0.0; versions unchanged, nothing published
  yet).
- `VMM_*` constants are `POMP_*`; `Vmm*` types are `Pomp*`; `vmm_*`
  tool names, key and token prefixes (`pomp_sk_`, `pomp_ct_`) and the
  vCon extension name and namespace key `verifymymeeting` are
  `proofofmeet`.
- The vCon UUID namespace is derived from the DNS namespace and the
  product name, so it changed from `71a32ea6-…` to `07ff0c10-f61d-519d-
  8e6b-b08721f96097`; the test, the spec and the docs carry the new
  value. Pre-launch, no exported vCon exists outside local tests.
- GitHub org `verify-my-meeting` kept; the `verifymymeeting` repo is
  renamed `proofofmeet` on GitHub and in repository URLs.

Build, typecheck, 66 tests and Prettier pass. Tarballs repacked for the
apps as `proofofmeet-sdk-0.3.0.tgz` and `proofofmeet-vcon-0.1.0.tgz`.
