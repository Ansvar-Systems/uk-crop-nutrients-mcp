import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { handleSearchCropRequirements } from '../../src/tools/search-crop-requirements.js';
import { createSeededDatabase } from '../helpers/seed-db.js';
import type { Database } from '../../src/db.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = 'tests/test-search-crop.db';

describe('search_crop_requirements tool', () => {
  let db: Database;

  beforeAll(() => {
    db = createSeededDatabase(TEST_DB);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('returns results for nitrogen query', () => {
    const result = handleSearchCropRequirements(db, { query: 'nitrogen' });
    expect(result).toHaveProperty('results_count');
    expect((result as { results_count: number }).results_count).toBeGreaterThan(0);
  });

  test('respects crop_group filter', () => {
    const result = handleSearchCropRequirements(db, { query: 'nitrogen', crop_group: 'cereals' });
    expect((result as { results: unknown[] }).results.length).toBeGreaterThan(0);
  });

  test('rejects unsupported jurisdiction', () => {
    const result = handleSearchCropRequirements(db, { query: 'nitrogen', jurisdiction: 'FR' });
    expect(result).toHaveProperty('error', 'jurisdiction_not_supported');
  });
});
