import { buildMeta } from '../metadata.js';
import { validateJurisdiction } from '../jurisdiction.js';
import type { Database } from '../db.js';

interface NutrientPlanArgs {
  crop: string;
  soil_type: string;
  sns_index?: number;
  previous_crop?: string;
  jurisdiction?: string;
}

export function handleGetNutrientPlan(db: Database, args: NutrientPlanArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  // Look up soil group from soil_types table
  const soil = db.get<{ soil_group: number }>(
    'SELECT soil_group FROM soil_types WHERE id = ? OR LOWER(name) = LOWER(?)',
    [args.soil_type, args.soil_type]
  );

  if (!soil) {
    return {
      error: 'not_found',
      message: `Soil type '${args.soil_type}' not found. Use get_soil_classification or list with soil type IDs.`,
    };
  }

  // Check crop exists
  const crop = db.get<{ id: string; name: string }>(
    'SELECT id, name FROM crops WHERE id = ? OR LOWER(name) = LOWER(?)',
    [args.crop, args.crop]
  );

  if (!crop) {
    return {
      error: 'not_found',
      message: `Crop '${args.crop}' not found. Use list_crops to see available crops.`,
    };
  }

  // Build query for nutrient recommendation
  let sql = `SELECT * FROM nutrient_recommendations WHERE crop_id = ? AND soil_group = ? AND jurisdiction = ?`;
  const params: unknown[] = [crop.id, soil.soil_group, jv.jurisdiction];

  if (args.sns_index !== undefined) {
    sql += ' AND sns_index = ?';
    params.push(args.sns_index);
  }

  if (args.previous_crop) {
    sql += ' AND (previous_crop_group = ? OR previous_crop_group IS NULL)';
    params.push(args.previous_crop);
  }

  sql += ' LIMIT 1';

  const rec = db.get<{
    n_rec_kg_ha: number;
    p_rec_kg_ha: number;
    k_rec_kg_ha: number;
    s_rec_kg_ha: number;
    sns_index: number;
    previous_crop_group: string;
    notes: string;
    rb209_section: string;
  }>(sql, params);

  if (!rec) {
    return {
      error: 'not_found',
      message: `No nutrient recommendation found for ${crop.name} on soil group ${soil.soil_group}` +
        (args.sns_index !== undefined ? ` at SNS index ${args.sns_index}` : '') + '.',
    };
  }

  return {
    crop: crop.name,
    crop_id: crop.id,
    soil_type: args.soil_type,
    soil_group: soil.soil_group,
    sns_index: rec.sns_index,
    previous_crop: rec.previous_crop_group,
    jurisdiction: jv.jurisdiction,
    recommendation: {
      nitrogen_kg_ha: rec.n_rec_kg_ha,
      phosphate_kg_ha: rec.p_rec_kg_ha,
      potash_kg_ha: rec.k_rec_kg_ha,
      sulphur_kg_ha: rec.s_rec_kg_ha,
    },
    rb209_section: rec.rb209_section,
    notes: rec.notes,
    _meta: buildMeta({ source_url: 'https://ahdb.org.uk/nutrient-management-guide' }),
  };
}
