import BetterSqlite3 from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface Database {
  get<T>(sql: string, params?: unknown[]): T | undefined;
  all<T>(sql: string, params?: unknown[]): T[];
  run(sql: string, params?: unknown[]): void;
  close(): void;
  readonly instance: BetterSqlite3.Database;
}

export function createDatabase(dbPath?: string): Database {
  const resolvedPath =
    dbPath ??
    join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'database.db');
  const db = new BetterSqlite3(resolvedPath);

  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');

  initSchema(db);

  return {
    get<T>(sql: string, params: unknown[] = []): T | undefined {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    all<T>(sql: string, params: unknown[] = []): T[] {
      return db.prepare(sql).all(...params) as T[];
    },
    run(sql: string, params: unknown[] = []): void {
      db.prepare(sql).run(...params);
    },
    close(): void {
      db.close();
    },
    get instance() {
      return db;
    },
  };
}

function initSchema(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS crops (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      crop_group TEXT NOT NULL,
      typical_yield_t_ha REAL,
      nutrient_offtake_n REAL,
      nutrient_offtake_p2o5 REAL,
      nutrient_offtake_k2o REAL,
      growth_stages TEXT,
      jurisdiction TEXT NOT NULL DEFAULT 'GB'
    );

    CREATE TABLE IF NOT EXISTS soil_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      soil_group INTEGER,
      texture TEXT,
      drainage_class TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS nutrient_recommendations (
      id INTEGER PRIMARY KEY,
      crop_id TEXT REFERENCES crops(id),
      soil_group INTEGER,
      sns_index INTEGER,
      previous_crop_group TEXT,
      n_rec_kg_ha REAL,
      p_rec_kg_ha REAL,
      k_rec_kg_ha REAL,
      s_rec_kg_ha REAL,
      notes TEXT,
      rb209_section TEXT,
      jurisdiction TEXT NOT NULL DEFAULT 'GB'
    );

    CREATE TABLE IF NOT EXISTS commodity_prices (
      id INTEGER PRIMARY KEY,
      crop_id TEXT REFERENCES crops(id),
      market TEXT,
      price_per_tonne REAL,
      currency TEXT DEFAULT 'GBP',
      price_source TEXT NOT NULL,
      published_date TEXT,
      retrieved_at TEXT,
      source TEXT,
      jurisdiction TEXT NOT NULL DEFAULT 'GB'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      title, body, crop_group, jurisdiction
    );

    CREATE TABLE IF NOT EXISTS db_metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('schema_version', '1.0');
    INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('mcp_name', 'UK Crop Nutrients MCP');
    INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('jurisdiction', 'GB');
  `);
}

const FTS_COLUMNS = ['title', 'body', 'crop_group', 'jurisdiction'];

export function ftsSearch(
  db: Database,
  query: string,
  limit: number = 20
): { title: string; body: string; crop_group: string; jurisdiction: string; rank: number }[] {
  const { results } = tieredFtsSearch(db, 'search_index', FTS_COLUMNS, query, limit);
  return results as { title: string; body: string; crop_group: string; jurisdiction: string; rank: number }[];
}

/**
 * Tiered FTS5 search with automatic fallback.
 * Tiers: exact phrase → AND → prefix → stemmed prefix → OR → LIKE
 */
export function tieredFtsSearch(
  db: Database,
  table: string,
  columns: string[],
  query: string,
  limit: number = 20
): { tier: string; results: Record<string, unknown>[] } {
  const sanitized = sanitizeFtsInput(query);
  if (!sanitized.trim()) return { tier: 'empty', results: [] };

  const columnList = columns.join(', ');
  const select = `SELECT ${columnList}, rank FROM ${table}`;
  const order = `ORDER BY rank LIMIT ?`;

  // Tier 1: Exact phrase
  const phrase = `"${sanitized}"`;
  let results = tryFts(db, select, table, order, phrase, limit);
  if (results.length > 0) return { tier: 'phrase', results };

  // Tier 2: AND
  const words = sanitized.split(/\s+/).filter(w => w.length > 1);
  if (words.length > 1) {
    const andQuery = words.join(' AND ');
    results = tryFts(db, select, table, order, andQuery, limit);
    if (results.length > 0) return { tier: 'and', results };
  }

  // Tier 3: Prefix
  const prefixQuery = words.map(w => `${w}*`).join(' AND ');
  results = tryFts(db, select, table, order, prefixQuery, limit);
  if (results.length > 0) return { tier: 'prefix', results };

  // Tier 4: Stemmed prefix
  const stemmed = words.map(w => stemWord(w) + '*');
  const stemmedQuery = stemmed.join(' AND ');
  if (stemmedQuery !== prefixQuery) {
    results = tryFts(db, select, table, order, stemmedQuery, limit);
    if (results.length > 0) return { tier: 'stemmed', results };
  }

  // Tier 5: OR
  if (words.length > 1) {
    const orQuery = words.join(' OR ');
    results = tryFts(db, select, table, order, orQuery, limit);
    if (results.length > 0) return { tier: 'or', results };
  }

  // Tier 6: LIKE fallback — bypasses FTS, searches base table with real column names
  const baseCols = ['name', 'crop_group'];
  const likeConditions = words.map(() =>
    `(${baseCols.map(c => `${c} LIKE ?`).join(' OR ')})`
  ).join(' AND ');
  const likeParams = words.flatMap(w =>
    baseCols.map(() => `%${w}%`)
  );
  try {
    const likeResults = db.all<Record<string, unknown>>(
      `SELECT name as title, COALESCE(growth_stages, '') as body, crop_group, jurisdiction FROM crops WHERE ${likeConditions} LIMIT ?`,
      [...likeParams, limit]
    );
    if (likeResults.length > 0) return { tier: 'like', results: likeResults };
  } catch {
    // LIKE fallback failed
  }

  return { tier: 'none', results: [] };
}

function tryFts(
  db: Database, select: string, table: string,
  order: string, matchExpr: string, limit: number
): Record<string, unknown>[] {
  try {
    return db.all(
      `${select} WHERE ${table} MATCH ? ${order}`,
      [matchExpr, limit]
    );
  } catch {
    return [];
  }
}

function sanitizeFtsInput(query: string): string {
  return query
    .replace(/["""''„‚«»]/g, '"')
    .replace(/[^a-zA-Z0-9\s*"_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stemWord(word: string): string {
  return word
    .replace(/(ies)$/i, 'y')
    .replace(/(ying|tion|ment|ness|able|ible|ous|ive|ing|ers|ed|es|er|ly|s)$/i, '');
}
