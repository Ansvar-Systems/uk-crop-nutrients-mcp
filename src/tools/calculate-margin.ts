import { buildMeta } from '../metadata.js';
import { validateJurisdiction } from '../jurisdiction.js';
import type { Database } from '../db.js';

interface MarginArgs {
  crop: string;
  yield_t_ha: number;
  price_per_tonne?: number;
  input_costs?: number;
  jurisdiction?: string;
}

export function handleCalculateMargin(db: Database, args: MarginArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  let pricePerTonne = args.price_per_tonne;
  let priceSource = 'user_provided';

  if (pricePerTonne === undefined) {
    const price = db.get<{ price_per_tonne: number; price_source: string; published_date: string }>(
      `SELECT cp.price_per_tonne, cp.price_source, cp.published_date
       FROM commodity_prices cp JOIN crops c ON cp.crop_id = c.id
       WHERE (cp.crop_id = ? OR LOWER(c.name) = LOWER(?)) AND cp.jurisdiction = ?
       ORDER BY cp.published_date DESC LIMIT 1`,
      [args.crop, args.crop, jv.jurisdiction]
    );

    if (!price) {
      return {
        error: 'no_price_data',
        message: `No price data available for '${args.crop}'. Provide price_per_tonne manually.`,
      };
    }

    pricePerTonne = price.price_per_tonne;
    priceSource = price.price_source;
  }

  const revenue = args.yield_t_ha * pricePerTonne;
  const inputCosts = args.input_costs ?? 0;
  const grossMargin = revenue - inputCosts;

  return {
    crop: args.crop,
    yield_t_ha: args.yield_t_ha,
    price_per_tonne: pricePerTonne,
    price_source: priceSource,
    currency: 'GBP',
    revenue_per_ha: Math.round(revenue * 100) / 100,
    input_costs_per_ha: inputCosts,
    gross_margin_per_ha: Math.round(grossMargin * 100) / 100,
    jurisdiction: jv.jurisdiction,
    _meta: buildMeta(),
  };
}
