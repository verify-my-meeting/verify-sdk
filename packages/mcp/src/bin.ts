#!/usr/bin/env node
/**
 * `verifymymeeting-mcp`: run the MCP server over stdio.
 *
 *   VMM_BASE_URL=https://verifymymeeting.com VMM_TOKEN=vmm_sk_... verifymymeeting-mcp
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
