import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createDatabase, type Database } from './db.js';
import { handleAbout } from './tools/about.js';
import { handleListSources } from './tools/list-sources.js';
import { handleCheckFreshness } from './tools/check-freshness.js';
import { handleSearchCropRequirements } from './tools/search-crop-requirements.js';
import { handleGetNutrientPlan } from './tools/get-nutrient-plan.js';
import { handleGetSoilClassification } from './tools/get-soil-classification.js';
import { handleListCrops } from './tools/list-crops.js';
import { handleGetCropDetails } from './tools/get-crop-details.js';
import { handleGetCommodityPrice } from './tools/get-commodity-price.js';
import { handleCalculateMargin } from './tools/calculate-margin.js';

const SERVER_NAME = 'crop-nutrients-mcp';
const SERVER_VERSION = '0.1.0';
const PORT = parseInt(process.env.PORT ?? '3000', 10);

const SearchArgsSchema = z.object({
  query: z.string(),
  crop_group: z.string().optional(),
  jurisdiction: z.string().optional(),
  limit: z.number().optional(),
});

const NutrientPlanArgsSchema = z.object({
  crop: z.string(),
  soil_type: z.string(),
  sns_index: z.number().optional(),
  previous_crop: z.string().optional(),
  jurisdiction: z.string().optional(),
});

const SoilArgsSchema = z.object({
  soil_type: z.string().optional(),
  texture: z.string().optional(),
  jurisdiction: z.string().optional(),
});

const ListCropsArgsSchema = z.object({
  crop_group: z.string().optional(),
  jurisdiction: z.string().optional(),
});

const CropDetailsArgsSchema = z.object({
  crop: z.string(),
  jurisdiction: z.string().optional(),
});

const PriceArgsSchema = z.object({
  crop: z.string(),
  market: z.string().optional(),
  jurisdiction: z.string().optional(),
});

const MarginArgsSchema = z.object({
  crop: z.string(),
  yield_t_ha: z.number(),
  price_per_tonne: z.number().optional(),
  input_costs: z.number().optional(),
  jurisdiction: z.string().optional(),
});

const TOOLS = [
  {
    name: 'about',
    description: 'Get server metadata: name, version, coverage, data sources, and links.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'list_sources',
    description: 'List all data sources with authority, URL, license, and freshness info.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'check_data_freshness',
    description: 'Check when data was last ingested, staleness status, and how to trigger a refresh.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'search_crop_requirements',
    description: 'Search crop nutrient requirements, soil data, and recommendations. Use for broad queries about crops and nutrients.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Free-text search query' },
        crop_group: { type: 'string', description: 'Filter by crop group (e.g. cereals, oilseeds)' },
        jurisdiction: { type: 'string', description: 'ISO 3166-1 alpha-2 code (default: GB)' },
        limit: { type: 'number', description: 'Max results (default: 20, max: 50)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_nutrient_plan',
    description: 'Get NPK fertiliser recommendation for a specific crop and soil type. Based on AHDB RB209.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        crop: { type: 'string', description: 'Crop ID or name (e.g. winter-wheat)' },
        soil_type: { type: 'string', description: 'Soil type ID or name (e.g. heavy-clay)' },
        sns_index: { type: 'number', description: 'Soil Nitrogen Supply index (0-6)' },
        previous_crop: { type: 'string', description: 'Previous crop group for rotation adjustment' },
        jurisdiction: { type: 'string', description: 'ISO 3166-1 alpha-2 code (default: GB)' },
      },
      required: ['crop', 'soil_type'],
    },
  },
  {
    name: 'get_soil_classification',
    description: 'Get soil group, characteristics, and drainage class for a soil type or texture.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        soil_type: { type: 'string', description: 'Soil type ID or name' },
        texture: { type: 'string', description: 'Soil texture (e.g. clay, sand, loam)' },
        jurisdiction: { type: 'string', description: 'ISO 3166-1 alpha-2 code (default: GB)' },
      },
    },
  },
  {
    name: 'list_crops',
    description: 'List all crops in the database, optionally filtered by crop group.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        crop_group: { type: 'string', description: 'Filter by crop group (e.g. cereals)' },
        jurisdiction: { type: 'string', description: 'ISO 3166-1 alpha-2 code (default: GB)' },
      },
    },
  },
  {
    name: 'get_crop_details',
    description: 'Get full profile for a crop: nutrient offtake, typical yields, growth stages.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        crop: { type: 'string', description: 'Crop ID or name' },
        jurisdiction: { type: 'string', description: 'ISO 3166-1 alpha-2 code (default: GB)' },
      },
      required: ['crop'],
    },
  },
  {
    name: 'get_commodity_price',
    description: 'Get latest commodity price for a crop with source attribution. Warns if data is stale (>14 days).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        crop: { type: 'string', description: 'Crop ID or name' },
        market: { type: 'string', description: 'Market type (e.g. ex-farm, delivered)' },
        jurisdiction: { type: 'string', description: 'ISO 3166-1 alpha-2 code (default: GB)' },
      },
      required: ['crop'],
    },
  },
  {
    name: 'calculate_margin',
    description: 'Estimate gross margin for a crop. Uses current commodity price if price_per_tonne not provided.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        crop: { type: 'string', description: 'Crop ID or name' },
        yield_t_ha: { type: 'number', description: 'Expected yield in tonnes per hectare' },
        price_per_tonne: { type: 'number', description: 'Override price (GBP/t). If omitted, uses latest market price.' },
        input_costs: { type: 'number', description: 'Total input costs per hectare (GBP). Default: 0' },
        jurisdiction: { type: 'string', description: 'ISO 3166-1 alpha-2 code (default: GB)' },
      },
      required: ['crop', 'yield_t_ha'],
    },
  },
];

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true };
}

function registerTools(server: Server, db: Database): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case 'about':
          return textResult(handleAbout());
        case 'list_sources':
          return textResult(handleListSources(db));
        case 'check_data_freshness':
          return textResult(handleCheckFreshness(db));
        case 'search_crop_requirements':
          return textResult(handleSearchCropRequirements(db, SearchArgsSchema.parse(args)));
        case 'get_nutrient_plan':
          return textResult(handleGetNutrientPlan(db, NutrientPlanArgsSchema.parse(args)));
        case 'get_soil_classification':
          return textResult(handleGetSoilClassification(db, SoilArgsSchema.parse(args)));
        case 'list_crops':
          return textResult(handleListCrops(db, ListCropsArgsSchema.parse(args)));
        case 'get_crop_details':
          return textResult(handleGetCropDetails(db, CropDetailsArgsSchema.parse(args)));
        case 'get_commodity_price':
          return textResult(handleGetCommodityPrice(db, PriceArgsSchema.parse(args)));
        case 'calculate_margin':
          return textResult(handleCalculateMargin(db, MarginArgsSchema.parse(args)));
        default:
          return errorResult(`Unknown tool: ${name}`);
      }
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });
}

const db = createDatabase();
const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

function createMcpServer(): Server {
  const mcpServer = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );
  registerTools(mcpServer, db);
  return mcpServer;
}

async function handleMCPRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
    return;
  }

  if (req.method === 'GET' || req.method === 'DELETE') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or missing session ID' }));
    return;
  }

  const mcpServer = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  await mcpServer.connect(transport);

  transport.onclose = () => {
    if (transport.sessionId) {
      sessions.delete(transport.sessionId);
    }
    mcpServer.close().catch(() => {});
  };

  await transport.handleRequest(req, res);

  if (transport.sessionId) {
    sessions.set(transport.sessionId, { transport, server: mcpServer });
  }
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', server: SERVER_NAME, version: SERVER_VERSION }));
    return;
  }

  if (url.pathname === '/mcp' || url.pathname === '/') {
    try {
      await handleMCPRequest(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }));
      }
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

httpServer.listen(PORT, () => {
  console.log(`${SERVER_NAME} v${SERVER_VERSION} listening on port ${PORT}`);
});
