import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Database } from '../src/db.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = 'tests/test-database.db';

describe('database layer', () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(TEST_DB);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('creates database with db_metadata table', () => {
    const row = db.get<{ key: string; value: string }>(
      'SELECT value FROM db_metadata WHERE key = ?',
      ['schema_version']
    );
    expect(row?.value).toBe('1.0');
  });

  test('FTS5 search_index exists', () => {
    const result = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='search_index'"
    );
    expect(result).toHaveLength(1);
  });

  test('journal mode is DELETE', () => {
    const row = db.get<{ journal_mode: string }>('PRAGMA journal_mode');
    expect(row?.journal_mode).toBe('delete');
  });
});
