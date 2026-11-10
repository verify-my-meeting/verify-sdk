#!/usr/bin/env node
/**
 * `proofofmeet-mcp`: run the MCP server over stdio.
 *
 *   POMP_BASE_URL=https://proofofmeet.com POMP_TOKEN=pomp_sk_... proofofmeet-mcp
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { createVmmMcpServer, optionsFromEnv } from './index.js'

async function main() {
  const server = createVmmMcpServer(optionsFromEnv())
  await server.connect(new StdioServerTransport())
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
