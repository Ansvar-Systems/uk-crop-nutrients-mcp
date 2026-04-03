import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { handleCalculateMargin } from '../../src/tools/calculate-margin.js';
import { createSeededDatabase } from '../helpers/seed-db.js';
import type { Database } from '../../src/db.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = 'tests/test-calc-margin.db';

describe('calculate_margin tool', () => {
  let db: Database;

  beforeAll(() => {
    db = createSeededDatabase(TEST_DB);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('calculates gross margin using DB price', () => {
    const result = handleCalculateMargin(db, { crop: 'spring-barley', yield_t_ha: 5.5 });
    expect(result).toHaveProperty('revenue_per_ha');
    // 5.5 * 165.0 = 907.50
    expect((result as { revenue_per_ha: number }).revenue_per_ha).toBe(907.50);
    expect((result as { price_source: string }).price_source).toBe('ahdb_market');
  });

  test('uses provided price when given', () => {
    const result = handleCalculateMargin(db, { crop: 'spring-barley', yield_t_ha: 5.5, price_per_tonne: 200 });
    // 5.5 * 200 = 1100
    expect((result as { revenue_per_ha: number }).revenue_per_ha).toBe(1100);
    expect((result as { price_source: string }).price_source).toBe('user_provided');
  });

  test('returns error when no price data and no override', () => {
    const result = handleCalculateMargin(db, { crop: 'turnips', yield_t_ha: 30 });
    expect(result).toHaveProperty('error', 'no_price_data');
  });

  test('subtracts input costs', () => {
    const result = handleCalculateMargin(db, { crop: 'winter-wheat', yield_t_ha: 8.0, input_costs: 500 });
    // 8.0 * 195 = 1560, 1560 - 500 = 1060
    expect((result as { gross_margin_per_ha: number }).gross_margin_per_ha).toBe(1060);
  });
});
