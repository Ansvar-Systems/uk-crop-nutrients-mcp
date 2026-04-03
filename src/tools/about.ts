import { buildMeta } from '../metadata.js';
import { SUPPORTED_JURISDICTIONS } from '../jurisdiction.js';

export function handleAbout() {
  return {
    name: 'Crop Nutrients MCP',
    description:
      'UK crop nutrient recommendations based on AHDB RB209. Provides NPK planning, ' +
      'soil classification, crop requirements, and commodity pricing for agricultural decision-making.',
    version: '0.1.0',
    jurisdiction: [...SUPPORTED_JURISDICTIONS],
    data_sources: ['AHDB RB209', 'DEFRA Agricultural Price Indices', 'AHDB Market Data'],
    tools_count: 11,
    links: {
      homepage: 'https://ansvar.eu/open-agriculture',
      repository: 'https://github.com/ansvar-systems/crop-nutrients-mcp',
      mcp_network: 'https://ansvar.ai/mcp',
    },
    _meta: buildMeta(),
  };
}
