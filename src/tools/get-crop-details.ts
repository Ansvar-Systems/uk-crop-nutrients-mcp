import { buildMeta } from '../metadata.js';
import { validateJurisdiction } from '../jurisdiction.js';
import type { Database } from '../db.js';

interface CropDetailsArgs {
  crop: string;
  jurisdiction?: string;
}

export function handleGetCropDetails(db: Database, args: CropDetailsArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  const crop = db.get<{
    id: string; name: string; crop_group: string;
    typical_yield_t_ha: number;
    nutrient_offtake_n: number; nutrient_offtake_p2o5: number; nutrient_offtake_k2o: number;
    growth_stages: string; jurisdiction: string;
  }>(
    'SELECT * FROM crops WHERE (id = ? OR LOWER(name) = LOWER(?)) AND jurisdiction = ?',
    [args.crop, args.crop, jv.jurisdiction]
  );

  if (!crop) {
    return { error: 'not_found', message: `Crop '${args.crop}' not found. Use list_crops to see available crops.` };
  }

  return {
    ...crop,
    growth_stages: crop.growth_stages ? JSON.parse(crop.growth_stages) : [],
    nutrient_offtake: {
      nitrogen: crop.nutrient_offtake_n,
      phosphate_p2o5: crop.nutrient_offtake_p2o5,
      potash_k2o: crop.nutrient_offtake_k2o,
      unit: 'kg/ha at typical yield',
    },
    _meta: buildMeta(),
  };
}
