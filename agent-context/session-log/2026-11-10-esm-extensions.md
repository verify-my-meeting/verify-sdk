# 2026-11-10: explicit .js extensions on relative imports

Found while deploying VerifyMyResearch to Vercel. The apps had consumed
the packages through `link:` to this checkout, so Vite resolved the
emitted `dist/*.js` files itself and extensionless relative imports
(`from './client'`) went unnoticed. Installed from a tarball into
`node_modules`, Node's ESM loader refuses them:
`Cannot find module .../dist/client`. Any npm consumer, and the MCP
server run under Node, would have hit the same.

- All 76 relative imports in `packages/*/src` (excluding tests) now
  carry `.js`, or `/index.js` for directory imports, across sdk, vcon,
  mcp and react. `moduleResolution: Bundler` accepts the extensions, so
  no tsconfig change.
- Verified: build, typecheck, tests (sdk 21, vcon 39, mcp 6) and a
  plain `node --input-type=module` import of `sdk`, `sdk/proofs` and
  `vcon` from `dist`.
- The apps vendor `pnpm pack` tarballs under `vendor/` until the first
  npm publish (README: scope registered at first publish).
