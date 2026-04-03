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
    INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('mcp_name', 'Crop Nutrients MCP');
    INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('jurisdiction', 'GB');
  `);
}

export function ftsSearch(
  db: Database,
  query: string,
  limit: number = 20
): { title: string; body: string; crop_group: string; jurisdiction: string; rank: number }[] {
  return db.all(
    `SELECT title, body, crop_group, jurisdiction, rank
     FROM search_index
     WHERE search_index MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [query, limit]
  );
}
