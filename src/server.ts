#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createDatabase } from './db.js';
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

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true };
}

const db = createDatabase();

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});
