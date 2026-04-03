import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { handleGetCommodityPrice } from '../../src/tools/get-commodity-price.js';
import { createSeededDatabase } from '../helpers/seed-db.js';
import type { Database } from '../../src/db.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = 'tests/test-commodity-price.db';

describe('get_commodity_price tool', () => {
  let db: Database;

  beforeAll(() => {
    db = createSeededDatabase(TEST_DB);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('returns price for winter wheat', () => {
    const result = handleGetCommodityPrice(db, { crop: 'winter-wheat' });
    expect(result).toHaveProperty('price_per_tonne', 195.0);
    expect(result).toHaveProperty('currency', 'GBP');
    expect(result).toHaveProperty('price_source', 'ahdb_market');
  });

  test('returns not_found for unknown crop', () => {
    const result = handleGetCommodityPrice(db, { crop: 'quinoa' });
    expect(result).toHaveProperty('error', 'not_found');
  });

  test('includes source attribution', () => {
    const result = handleGetCommodityPrice(db, { crop: 'spring-barley' });
    expect(result).toHaveProperty('source_attribution');
  });
});
