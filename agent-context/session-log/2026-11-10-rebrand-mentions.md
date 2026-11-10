# 2026-11-10: mentions renamed to ProofOfMeetProtocol / POMP

Hubert asked for `VerifyMyMeeting` → `ProofOfMeetProtocol`, `VMM` →
`POMP` and `verifymymeeting.firebelly.xyz` → `proofofmeet.org` across
all four repos. Rule applied (logged in the app repos' decisions):
human-readable mentions change; machine identifiers stay. Here that
means package descriptions, README, spec README and OpenAPI title,
comments and JSDoc changed; the `@verifymymeeting` scope, the
`verifymymeeting` vCon extension name and namespace, `VMM_*` constants
and type names did not. 27 files, 64 lines. Build, typecheck, tests
and Prettier pass; the apps re-vendor the repacked tarballs.
