import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const server = new Server(
  { name: 'agentpay', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// TODO (Phase 3): register search_apis, get_api_details, call_api,
// check_balance, get_transaction_history, compare_providers
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  throw new Error(`Unknown tool: ${request.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
