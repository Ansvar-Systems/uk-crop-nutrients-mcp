import { buildMeta } from '../metadata.js';
import { validateJurisdiction } from '../jurisdiction.js';
import { ftsSearch, type Database } from '../db.js';

interface SearchArgs {
  query: string;
  crop_group?: string;
  jurisdiction?: string;
  limit?: number;
}

export function handleSearchCropRequirements(db: Database, args: SearchArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  const limit = Math.min(args.limit ?? 20, 50);
  let results = ftsSearch(db, args.query, limit);

  if (args.crop_group) {
    results = results.filter(r => r.crop_group.toLowerCase() === args.crop_group!.toLowerCase());
  }

  return {
    query: args.query,
    jurisdiction: jv.jurisdiction,
    results_count: results.length,
    results: results.map(r => ({
      title: r.title,
      body: r.body,
      crop_group: r.crop_group,
      relevance_rank: r.rank,
    })),
    _meta: buildMeta(),
  };
}
