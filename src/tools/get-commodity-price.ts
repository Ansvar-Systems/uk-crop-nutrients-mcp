import { buildMeta, buildStalenessWarning } from '../metadata.js';
import { validateJurisdiction } from '../jurisdiction.js';
import type { Database } from '../db.js';

interface PriceArgs {
  crop: string;
  market?: string;
  jurisdiction?: string;
}

export function handleGetCommodityPrice(db: Database, args: PriceArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  let sql = `SELECT cp.*, c.name as crop_name FROM commodity_prices cp
    JOIN crops c ON cp.crop_id = c.id
    WHERE (cp.crop_id = ? OR LOWER(c.name) = LOWER(?)) AND cp.jurisdiction = ?`;
  const params: unknown[] = [args.crop, args.crop, jv.jurisdiction];

  if (args.market) {
    sql += ' AND LOWER(cp.market) = LOWER(?)';
    params.push(args.market);
  }

  sql += ' ORDER BY cp.published_date DESC LIMIT 1';

  const price = db.get<{
    crop_id: string; crop_name: string; market: string;
    price_per_tonne: number; currency: string;
    price_source: string; published_date: string;
    retrieved_at: string; source: string;
  }>(sql, params);

  if (!price) {
    return {
      error: 'not_found',
      message: `No price data found for '${args.crop}'` + (args.market ? ` on ${args.market} market` : '') + '.',
    };
  }

  const stalenessWarning = price.published_date
    ? buildStalenessWarning(price.published_date)
    : undefined;

  return {
    crop: price.crop_name,
    crop_id: price.crop_id,
    market: price.market,
    price_per_tonne: price.price_per_tonne,
    currency: price.currency,
    price_source: price.price_source,
    published_date: price.published_date,
    retrieved_at: price.retrieved_at,
    source_attribution: price.source,
    jurisdiction: jv.jurisdiction,
    ...(stalenessWarning ? { staleness_warning: stalenessWarning } : {}),
    _meta: buildMeta({
      data_age: price.published_date ?? 'unknown',
      source_url: 'https://ahdb.org.uk/cereals-oilseeds/cereal-and-oilseed-markets',
    }),
  };
}
