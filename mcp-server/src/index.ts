/**
 * AgentPay MCP server entry point.
 *
 * Exposes 6 tools that let any MCP-compatible AI agent discover and autonomously
 * pay for APIs on the AgentPay marketplace using x402 micropayments on Casper.
 *
 * Day 8 tools (implemented): search_apis, get_api_details, call_api
 * Day 9 tools (stubs):       check_balance, get_transaction_history, compare_providers
 *
 * Transport: StdioServerTransport — this process communicates with the agent
 * (e.g. Claude Desktop) via stdin/stdout, not HTTP. The agent launcher starts
 * this process and speaks the MCP protocol over stdio.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

// Tools — Day 8
import { searchApisTool, handleSearchApis } from './tools/search_apis.js';
import { getApiDetailsTool, handleGetApiDetails } from './tools/get_api_details.js';
import { callApiTool, handleCallApi } from './tools/call_api.js';

dotenv.config({ quiet: true });

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'agentpay', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// ---------------------------------------------------------------------------
// ListTools — tells the agent what tools are available
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    searchApisTool,
    getApiDetailsTool,
    callApiTool,
    // TODO Day 9: add check_balance, get_transaction_history, compare_providers
  ],
}));

// ---------------------------------------------------------------------------
// CallTool — routes incoming tool invocations to the correct handler
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_apis':
        return await handleSearchApis(args);

      case 'get_api_details':
        return await handleGetApiDetails(args);

      case 'call_api':
        return await handleCallApi(args);

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    // Surface errors as tool responses rather than crashing the server process.
    // This keeps the MCP connection alive so the agent can retry or use other tools.
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Tool error in ${name}: ${message}` }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
