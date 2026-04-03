import { buildMeta } from '../metadata.js';
import { validateJurisdiction } from '../jurisdiction.js';
import type { Database } from '../db.js';

interface ListCropsArgs {
  crop_group?: string;
  jurisdiction?: string;
}

export function handleListCrops(db: Database, args: ListCropsArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  let sql = 'SELECT id, name, crop_group, typical_yield_t_ha FROM crops WHERE jurisdiction = ?';
  const params: unknown[] = [jv.jurisdiction];

  if (args.crop_group) {
    sql += ' AND LOWER(crop_group) = LOWER(?)';
    params.push(args.crop_group);
  }

  sql += ' ORDER BY crop_group, name';

  const crops = db.all<{
    id: string; name: string; crop_group: string; typical_yield_t_ha: number;
  }>(sql, params);

  return {
    jurisdiction: jv.jurisdiction,
    results_count: crops.length,
    crops,
    _meta: buildMeta(),
  };
}
