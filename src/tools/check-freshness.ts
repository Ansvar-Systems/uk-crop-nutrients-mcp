import { buildMeta } from '../metadata.js';
import type { Database } from '../db.js';

interface FreshnessResult {
  status: 'fresh' | 'stale' | 'unknown';
  last_ingest: string | null;
  build_date: string | null;
  schema_version: string | null;
  days_since_ingest: number | null;
  staleness_threshold_days: number;
  refresh_command: string;
  _meta: ReturnType<typeof buildMeta>;
}

const STALENESS_THRESHOLD_DAYS = 90;

export function handleCheckFreshness(db: Database): FreshnessResult {
  const lastIngest = db.get<{ value: string }>('SELECT value FROM db_metadata WHERE key = ?', ['last_ingest']);
  const buildDate = db.get<{ value: string }>('SELECT value FROM db_metadata WHERE key = ?', ['build_date']);
  const schemaVersion = db.get<{ value: string }>('SELECT value FROM db_metadata WHERE key = ?', ['schema_version']);

  let status: 'fresh' | 'stale' | 'unknown' = 'unknown';
  let daysSinceIngest: number | null = null;

  if (lastIngest?.value) {
    const ingestDate = new Date(lastIngest.value);
    const now = new Date();
    daysSinceIngest = Math.floor((now.getTime() - ingestDate.getTime()) / (1000 * 60 * 60 * 24));
    status = daysSinceIngest <= STALENESS_THRESHOLD_DAYS ? 'fresh' : 'stale';
  }

  return {
    status,
    last_ingest: lastIngest?.value ?? null,
    build_date: buildDate?.value ?? null,
    schema_version: schemaVersion?.value ?? null,
    days_since_ingest: daysSinceIngest,
    staleness_threshold_days: STALENESS_THRESHOLD_DAYS,
    refresh_command: 'gh workflow run ingest.yml -R ansvar-systems/crop-nutrients-mcp',
    _meta: buildMeta(),
  };
}
