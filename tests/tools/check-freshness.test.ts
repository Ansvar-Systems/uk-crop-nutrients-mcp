import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { handleCheckFreshness } from '../../src/tools/check-freshness.js';
import { createDatabase, type Database } from '../../src/db.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = 'tests/test-check-freshness.db';

describe('check_data_freshness tool', () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(TEST_DB);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('returns unknown when no ingest date', () => {
    const result = handleCheckFreshness(db);
    expect(result.status).toBe('unknown');
    expect(result.days_since_ingest).toBeNull();
  });

  test('returns fresh when recently ingested', () => {
    const today = new Date().toISOString().split('T')[0];
    db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('last_ingest', ?)", [today]);

    const result = handleCheckFreshness(db);
    expect(result.status).toBe('fresh');
    expect(result.days_since_ingest).toBeLessThanOrEqual(1);
  });

  test('returns stale when old ingest', () => {
    db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('last_ingest', '2025-01-01')", []);

    const result = handleCheckFreshness(db);
    expect(result.status).toBe('stale');
    expect(result.days_since_ingest).toBeGreaterThan(90);
  });

  test('includes refresh command', () => {
    const result = handleCheckFreshness(db);
    expect(result.refresh_command).toContain('gh workflow run');
  });

  test('includes schema_version', () => {
    const result = handleCheckFreshness(db);
    expect(result.schema_version).toBe('1.0');
  });
});
