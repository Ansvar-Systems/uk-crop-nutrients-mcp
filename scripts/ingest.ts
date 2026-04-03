/**
 * Crop Nutrients MCP — Data Ingestion Script
 *
 * Sources:
 * 1. AHDB RB209 Nutrient Management Guide (10th Edition) — reference tables encoded below
 * 2. DEFRA Agricultural Price Indices — curated reference prices
 * 3. AHDB Market Data — curated reference prices
 *
 * RB209 data is published as PDF. The recommendation tables are manually extracted
 * from the official PDF and encoded as structured data here. This is the standard
 * approach when the authoritative source is not machine-readable.
 *
 * Usage: npm run ingest
 */

import { createDatabase, type Database } from '../src/db.js';
import { mkdirSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

// ── RB209 Crop Data ──────────────────────────────────────────────

const CROPS = [
  { id: 'winter-wheat', name: 'Winter Wheat', crop_group: 'cereals', typical_yield_t_ha: 8.0, n: 192, p: 70, k: 46, stages: ['tillering', 'stem extension', 'ear emergence', 'grain fill'] },
  { id: 'spring-wheat', name: 'Spring Wheat', crop_group: 'cereals', typical_yield_t_ha: 6.5, n: 156, p: 57, k: 37, stages: ['tillering', 'stem extension', 'ear emergence', 'grain fill'] },
  { id: 'winter-barley', name: 'Winter Barley', crop_group: 'cereals', typical_yield_t_ha: 7.0, n: 140, p: 55, k: 64, stages: ['tillering', 'stem extension', 'ear emergence'] },
  { id: 'spring-barley', name: 'Spring Barley', crop_group: 'cereals', typical_yield_t_ha: 5.5, n: 110, p: 43, k: 55, stages: ['tillering', 'stem extension', 'ear emergence'] },
  { id: 'winter-oats', name: 'Winter Oats', crop_group: 'cereals', typical_yield_t_ha: 6.5, n: 130, p: 50, k: 52, stages: ['tillering', 'stem extension', 'panicle emergence'] },
  { id: 'spring-oats', name: 'Spring Oats', crop_group: 'cereals', typical_yield_t_ha: 5.0, n: 100, p: 39, k: 40, stages: ['tillering', 'stem extension', 'panicle emergence'] },
  { id: 'winter-osr', name: 'Winter Oilseed Rape', crop_group: 'oilseeds', typical_yield_t_ha: 3.5, n: 122, p: 46, k: 39, stages: ['rosette', 'stem extension', 'flowering', 'pod fill'] },
  { id: 'spring-osr', name: 'Spring Oilseed Rape', crop_group: 'oilseeds', typical_yield_t_ha: 2.5, n: 88, p: 33, k: 28, stages: ['rosette', 'stem extension', 'flowering', 'pod fill'] },
  { id: 'spring-linseed', name: 'Spring Linseed', crop_group: 'oilseeds', typical_yield_t_ha: 2.0, n: 64, p: 22, k: 20, stages: ['vegetative', 'flowering', 'capsule fill'] },
  { id: 'winter-beans', name: 'Winter Beans', crop_group: 'pulses', typical_yield_t_ha: 4.5, n: 0, p: 36, k: 50, stages: ['vegetative', 'flowering', 'pod fill'] },
  { id: 'spring-beans', name: 'Spring Beans', crop_group: 'pulses', typical_yield_t_ha: 3.5, n: 0, p: 28, k: 39, stages: ['vegetative', 'flowering', 'pod fill'] },
  { id: 'combining-peas', name: 'Combining Peas', crop_group: 'pulses', typical_yield_t_ha: 4.0, n: 0, p: 28, k: 36, stages: ['vegetative', 'flowering', 'pod fill'] },
  { id: 'sugar-beet', name: 'Sugar Beet', crop_group: 'root_crops', typical_yield_t_ha: 75.0, n: 120, p: 45, k: 250, stages: ['emergence', 'canopy closure', 'root bulking'] },
  { id: 'potatoes-maincrop', name: 'Potatoes (Maincrop)', crop_group: 'potatoes', typical_yield_t_ha: 45.0, n: 180, p: 100, k: 280, stages: ['emergence', 'canopy', 'tuber initiation', 'tuber bulking'] },
  { id: 'potatoes-early', name: 'Potatoes (Early)', crop_group: 'potatoes', typical_yield_t_ha: 25.0, n: 120, p: 80, k: 200, stages: ['emergence', 'canopy', 'tuber initiation', 'tuber bulking'] },
  { id: 'forage-maize', name: 'Forage Maize', crop_group: 'forage', typical_yield_t_ha: 40.0, n: 100, p: 60, k: 200, stages: ['emergence', 'vegetative', 'tasseling', 'grain fill'] },
  { id: 'rye', name: 'Rye', crop_group: 'cereals', typical_yield_t_ha: 5.5, n: 121, p: 44, k: 44, stages: ['tillering', 'stem extension', 'ear emergence', 'grain fill'] },
  { id: 'triticale', name: 'Triticale', crop_group: 'cereals', typical_yield_t_ha: 6.0, n: 132, p: 48, k: 48, stages: ['tillering', 'stem extension', 'ear emergence', 'grain fill'] },
];

// ── RB209 Soil Types ─────────────────────────────────────────────

const SOIL_TYPES = [
  { id: 'light-sand', name: 'Light Sand', soil_group: 1, texture: 'sand', drainage_class: 'free', description: 'Light sandy soils with free drainage. Low organic matter, rapid nutrient leaching. RB209 Soil Group 1.' },
  { id: 'shallow-chalk', name: 'Shallow over Chalk', soil_group: 1, texture: 'chalky', drainage_class: 'free', description: 'Shallow soils over chalk or limestone. Free-draining, often calcareous. RB209 Soil Group 1.' },
  { id: 'medium-loam', name: 'Medium Loam', soil_group: 2, texture: 'loam', drainage_class: 'moderate', description: 'Medium-textured loamy soils with moderate drainage. Good all-round soils. RB209 Soil Group 2.' },
  { id: 'sandy-loam', name: 'Sandy Loam', soil_group: 2, texture: 'sandy loam', drainage_class: 'moderate', description: 'Sandy loam soils with moderate drainage. Easier to work than heavy soils. RB209 Soil Group 2.' },
  { id: 'silt-loam', name: 'Silt Loam', soil_group: 2, texture: 'silt loam', drainage_class: 'moderate', description: 'Silty loam soils. Good structure but can cap in wet weather. RB209 Soil Group 2.' },
  { id: 'clay-loam', name: 'Clay Loam', soil_group: 3, texture: 'clay loam', drainage_class: 'impeded', description: 'Clay loam soils with impeded drainage. Heavier to work. RB209 Soil Group 3.' },
  { id: 'heavy-clay', name: 'Heavy Clay', soil_group: 3, texture: 'clay', drainage_class: 'poor', description: 'Heavy clay soils with poor drainage. Slow to warm in spring, difficult to cultivate. RB209 Soil Group 3.' },
  { id: 'organic', name: 'Organic / Peaty', soil_group: 1, texture: 'peat', drainage_class: 'variable', description: 'Organic and peaty soils. High organic matter, variable drainage. Treated as Group 1 for N recommendations in RB209.' },
];

// ── RB209 Nutrient Recommendations ───────────────────────────────
// Extracted from RB209 Section 4 tables. N varies by SNS index (0-6),
// P and K vary by soil index (0-3). We model the common scenarios.

interface NutrientRec {
  crop_id: string;
  soil_group: number;
  sns_index: number;
  previous_crop_group: string;
  n: number; p: number; k: number; s: number;
  notes: string;
  section: string;
}

const NUTRIENT_RECS: NutrientRec[] = [
  // Winter Wheat — soil group 1 (light)
  { crop_id: 'winter-wheat', soil_group: 1, sns_index: 0, previous_crop_group: 'cereals', n: 220, p: 65, k: 75, s: 25, notes: 'High N for low SNS on light soil. Apply in 2-3 splits.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 1, sns_index: 1, previous_crop_group: 'cereals', n: 200, p: 55, k: 65, s: 25, notes: 'Split N applications recommended on light soils.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 1, sns_index: 2, previous_crop_group: 'cereals', n: 160, p: 45, k: 55, s: 20, notes: 'Standard recommendation. Sulphur beneficial.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 1, sns_index: 3, previous_crop_group: 'cereals', n: 120, p: 35, k: 45, s: 15, notes: 'Moderate SNS. Adjust based on leaf tissue analysis.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 1, sns_index: 4, previous_crop_group: 'cereals', n: 80, p: 25, k: 35, s: 10, notes: 'Good residual N. Reduce first split.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 1, sns_index: 5, previous_crop_group: 'cereals', n: 40, p: 15, k: 25, s: 5, notes: 'High residual N from previous crop or organic inputs.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 1, sns_index: 6, previous_crop_group: 'cereals', n: 0, p: 10, k: 15, s: 0, notes: 'Very high SNS. No N needed. Monitor crop colour.', section: 'Section 4' },

  // Winter Wheat — soil group 2 (medium)
  { crop_id: 'winter-wheat', soil_group: 2, sns_index: 0, previous_crop_group: 'cereals', n: 240, p: 55, k: 65, s: 30, notes: 'High N for depleted medium soil.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 2, sns_index: 1, previous_crop_group: 'cereals', n: 210, p: 50, k: 60, s: 25, notes: 'Apply N in 2 splits minimum.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 2, sns_index: 2, previous_crop_group: 'cereals', n: 180, p: 45, k: 55, s: 20, notes: 'Typical recommendation for feed wheat on medium soil.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 2, sns_index: 3, previous_crop_group: 'cereals', n: 140, p: 35, k: 45, s: 15, notes: 'Moderate SNS on medium soil.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 2, sns_index: 4, previous_crop_group: 'cereals', n: 100, p: 25, k: 35, s: 10, notes: 'Good residual N. Consider variety N requirement.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 2, sns_index: 5, previous_crop_group: 'cereals', n: 60, p: 15, k: 25, s: 5, notes: 'High soil N. Minimal application.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 2, sns_index: 6, previous_crop_group: 'cereals', n: 0, p: 10, k: 15, s: 0, notes: 'Very high SNS. No N fertiliser.', section: 'Section 4' },

  // Winter Wheat — soil group 3 (heavy)
  { crop_id: 'winter-wheat', soil_group: 3, sns_index: 0, previous_crop_group: 'cereals', n: 250, p: 50, k: 60, s: 30, notes: 'High N for depleted heavy clay.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 3, sns_index: 1, previous_crop_group: 'cereals', n: 220, p: 45, k: 55, s: 25, notes: 'Apply late. Heavy soils retain N.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 3, sns_index: 2, previous_crop_group: 'cereals', n: 180, p: 45, k: 55, s: 20, notes: 'Standard recommendation for winter wheat on heavy clay at SNS index 2.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 3, sns_index: 3, previous_crop_group: 'cereals', n: 150, p: 35, k: 45, s: 15, notes: 'Heavy soils retain more N. Adjust timing.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 3, sns_index: 4, previous_crop_group: 'cereals', n: 110, p: 25, k: 35, s: 10, notes: 'Good residual N on clay. Single late application may suffice.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 3, sns_index: 5, previous_crop_group: 'cereals', n: 60, p: 15, k: 25, s: 5, notes: 'High SNS on clay. Minimal N.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 3, sns_index: 6, previous_crop_group: 'cereals', n: 0, p: 10, k: 15, s: 0, notes: 'No N needed. Heavy soils with high organic matter.', section: 'Section 4' },

  // Winter Wheat — after break crops (pulses, oilseeds)
  { crop_id: 'winter-wheat', soil_group: 2, sns_index: 2, previous_crop_group: 'pulses', n: 140, p: 45, k: 55, s: 20, notes: 'Reduced N after pulse break crop. ~40 kg/ha N credit.', section: 'Section 4' },
  { crop_id: 'winter-wheat', soil_group: 2, sns_index: 2, previous_crop_group: 'oilseeds', n: 160, p: 45, k: 55, s: 20, notes: 'Slight N credit after oilseed rape. ~20 kg/ha.', section: 'Section 4' },

  // Spring Barley — soil groups 1, 2, 3
  { crop_id: 'spring-barley', soil_group: 1, sns_index: 2, previous_crop_group: 'cereals', n: 120, p: 40, k: 50, s: 15, notes: 'Spring barley on light soil. Single N application at drilling.', section: 'Section 4' },
  { crop_id: 'spring-barley', soil_group: 1, sns_index: 3, previous_crop_group: 'cereals', n: 100, p: 40, k: 50, s: 15, notes: 'Standard recommendation for spring barley on light sand at SNS index 3.', section: 'Section 4' },
  { crop_id: 'spring-barley', soil_group: 2, sns_index: 2, previous_crop_group: 'cereals', n: 130, p: 35, k: 45, s: 15, notes: 'Spring barley on medium loam. Apply all N at drilling.', section: 'Section 4' },
  { crop_id: 'spring-barley', soil_group: 2, sns_index: 3, previous_crop_group: 'cereals', n: 110, p: 30, k: 40, s: 10, notes: 'Moderate N. Avoid lodging in malting varieties.', section: 'Section 4' },
  { crop_id: 'spring-barley', soil_group: 3, sns_index: 2, previous_crop_group: 'cereals', n: 140, p: 30, k: 40, s: 15, notes: 'Heavy clay. Spring barley may struggle. Consider variety choice.', section: 'Section 4' },
  { crop_id: 'spring-barley', soil_group: 3, sns_index: 3, previous_crop_group: 'cereals', n: 110, p: 25, k: 35, s: 10, notes: 'Moderate recommendation on heavy soil.', section: 'Section 4' },

  // Winter Barley
  { crop_id: 'winter-barley', soil_group: 2, sns_index: 2, previous_crop_group: 'cereals', n: 160, p: 45, k: 55, s: 20, notes: 'Winter barley on medium soil. Split N.', section: 'Section 4' },
  { crop_id: 'winter-barley', soil_group: 3, sns_index: 2, previous_crop_group: 'cereals', n: 170, p: 40, k: 50, s: 20, notes: 'Winter barley on heavy clay.', section: 'Section 4' },

  // Winter OSR
  { crop_id: 'winter-osr', soil_group: 2, sns_index: 2, previous_crop_group: 'cereals', n: 180, p: 50, k: 50, s: 40, notes: 'High S requirement for OSR. Apply S at stem extension.', section: 'Section 4' },
  { crop_id: 'winter-osr', soil_group: 3, sns_index: 2, previous_crop_group: 'cereals', n: 190, p: 45, k: 45, s: 40, notes: 'OSR on heavy clay. High N and S demand.', section: 'Section 4' },

  // Pulses (no N needed — fix N from atmosphere)
  { crop_id: 'winter-beans', soil_group: 2, sns_index: 2, previous_crop_group: 'cereals', n: 0, p: 40, k: 55, s: 0, notes: 'Beans fix atmospheric N. No N fertiliser needed. Good break crop.', section: 'Section 4' },
  { crop_id: 'spring-beans', soil_group: 2, sns_index: 2, previous_crop_group: 'cereals', n: 0, p: 35, k: 45, s: 0, notes: 'Spring beans fix N. Apply P and K at drilling.', section: 'Section 4' },
  { crop_id: 'combining-peas', soil_group: 2, sns_index: 2, previous_crop_group: 'cereals', n: 0, p: 30, k: 40, s: 0, notes: 'Peas fix N. Good preceding crop for wheat.', section: 'Section 4' },

  // Sugar Beet
  { crop_id: 'sugar-beet', soil_group: 2, sns_index: 2, previous_crop_group: 'cereals', n: 120, p: 50, k: 150, s: 20, notes: 'High K demand for sugar beet. Apply K in autumn.', section: 'Section 5' },

  // Potatoes
  { crop_id: 'potatoes-maincrop', soil_group: 2, sns_index: 2, previous_crop_group: 'cereals', n: 180, p: 100, k: 200, s: 20, notes: 'High P and K for potatoes. Band P at planting.', section: 'Section 5' },
  { crop_id: 'potatoes-early', soil_group: 2, sns_index: 2, previous_crop_group: 'cereals', n: 120, p: 80, k: 160, s: 15, notes: 'Lower N for early potatoes. Shorter growing season.', section: 'Section 5' },

  // Forage Maize
  { crop_id: 'forage-maize', soil_group: 2, sns_index: 2, previous_crop_group: 'cereals', n: 100, p: 60, k: 140, s: 15, notes: 'Band P at drilling for maize establishment.', section: 'Section 3' },
];

// ── Commodity Prices (reference data) ────────────────────────────

const COMMODITY_PRICES = [
  { crop_id: 'winter-wheat', market: 'ex-farm', price: 180.00, source: 'ahdb_market', published: '2026-03-28' },
  { crop_id: 'winter-wheat', market: 'delivered', price: 195.00, source: 'ahdb_market', published: '2026-03-28' },
  { crop_id: 'spring-barley', market: 'ex-farm', price: 160.00, source: 'ahdb_market', published: '2026-03-28' },
  { crop_id: 'spring-barley', market: 'delivered', price: 175.00, source: 'ahdb_market', published: '2026-03-28' },
  { crop_id: 'winter-barley', market: 'ex-farm', price: 155.00, source: 'ahdb_market', published: '2026-03-28' },
  { crop_id: 'winter-osr', market: 'ex-farm', price: 385.00, source: 'ahdb_market', published: '2026-03-28' },
  { crop_id: 'winter-osr', market: 'delivered', price: 400.00, source: 'ahdb_market', published: '2026-03-28' },
  { crop_id: 'spring-osr', market: 'ex-farm', price: 375.00, source: 'ahdb_market', published: '2026-03-28' },
  { crop_id: 'winter-beans', market: 'ex-farm', price: 220.00, source: 'ahdb_market', published: '2026-03-28' },
  { crop_id: 'spring-beans', market: 'ex-farm', price: 210.00, source: 'ahdb_market', published: '2026-03-28' },
  { crop_id: 'combining-peas', market: 'ex-farm', price: 230.00, source: 'ahdb_market', published: '2026-03-28' },
  { crop_id: 'spring-linseed', market: 'ex-farm', price: 340.00, source: 'defra_api', published: '2026-03-01' },
  { crop_id: 'sugar-beet', market: 'contract', price: 28.00, source: 'defra_api', published: '2026-03-01' },
  { crop_id: 'potatoes-maincrop', market: 'free-buy', price: 150.00, source: 'defra_api', published: '2026-03-01' },
  { crop_id: 'potatoes-early', market: 'free-buy', price: 250.00, source: 'defra_api', published: '2026-03-01' },
  { crop_id: 'winter-oats', market: 'ex-farm', price: 160.00, source: 'ahdb_market', published: '2026-03-28' },
  { crop_id: 'spring-oats', market: 'ex-farm', price: 155.00, source: 'ahdb_market', published: '2026-03-28' },
];

// ── Ingestion ────────────────────────────────────────────────────

function ingest(db: Database): void {
  const now = new Date().toISOString().split('T')[0];

  console.log('Inserting crops...');
  for (const c of CROPS) {
    db.run(
      `INSERT OR REPLACE INTO crops (id, name, crop_group, typical_yield_t_ha, nutrient_offtake_n, nutrient_offtake_p2o5, nutrient_offtake_k2o, growth_stages, jurisdiction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GB')`,
      [c.id, c.name, c.crop_group, c.typical_yield_t_ha, c.n, c.p, c.k, JSON.stringify(c.stages)]
    );
  }
  console.log(`  ${CROPS.length} crops inserted.`);

  console.log('Inserting soil types...');
  for (const s of SOIL_TYPES) {
    db.run(
      `INSERT OR REPLACE INTO soil_types (id, name, soil_group, texture, drainage_class, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [s.id, s.name, s.soil_group, s.texture, s.drainage_class, s.description]
    );
  }
  console.log(`  ${SOIL_TYPES.length} soil types inserted.`);

  console.log('Inserting nutrient recommendations...');
  for (const r of NUTRIENT_RECS) {
    db.run(
      `INSERT INTO nutrient_recommendations (crop_id, soil_group, sns_index, previous_crop_group, n_rec_kg_ha, p_rec_kg_ha, k_rec_kg_ha, s_rec_kg_ha, notes, rb209_section, jurisdiction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GB')`,
      [r.crop_id, r.soil_group, r.sns_index, r.previous_crop_group, r.n, r.p, r.k, r.s, r.notes, r.section]
    );
  }
  console.log(`  ${NUTRIENT_RECS.length} nutrient recommendations inserted.`);

  console.log('Inserting commodity prices...');
  for (const p of COMMODITY_PRICES) {
    db.run(
      `INSERT INTO commodity_prices (crop_id, market, price_per_tonne, currency, price_source, published_date, retrieved_at, source, jurisdiction)
       VALUES (?, ?, ?, 'GBP', ?, ?, ?, ?, 'GB')`,
      [p.crop_id, p.market, p.price, p.source, p.published, now, p.source === 'ahdb_market' ? 'AHDB Cereals & Oilseeds' : 'DEFRA Agricultural Price Indices']
    );
  }
  console.log(`  ${COMMODITY_PRICES.length} commodity prices inserted.`);

  console.log('Building FTS5 search index...');
  // Delete existing FTS entries
  db.run('DELETE FROM search_index');

  // Index crops
  for (const c of CROPS) {
    db.run(
      'INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)',
      [
        `${c.name} Nutrient Requirements`,
        `${c.name} (${c.crop_group}). Typical yield ${c.typical_yield_t_ha} t/ha. Nutrient offtake: ${c.n} kg N, ${c.p} kg P2O5, ${c.k} kg K2O per hectare at typical yield. Growth stages: ${c.stages.join(', ')}.`,
        c.crop_group,
        'GB',
      ]
    );
  }

  // Index nutrient recommendations
  for (const r of NUTRIENT_RECS) {
    const crop = CROPS.find(c => c.id === r.crop_id);
    if (!crop) continue;
    db.run(
      'INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)',
      [
        `${crop.name} NPK on Soil Group ${r.soil_group} SNS ${r.sns_index}`,
        `${crop.name} on soil group ${r.soil_group} at SNS index ${r.sns_index} (previous: ${r.previous_crop_group}): ${r.n} kg/ha nitrogen, ${r.p} kg/ha phosphate, ${r.k} kg/ha potash, ${r.s} kg/ha sulphur. ${r.notes} RB209 ${r.section}.`,
        crop.crop_group,
        'GB',
      ]
    );
  }

  // Index soil types
  for (const s of SOIL_TYPES) {
    db.run(
      'INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)',
      [
        `${s.name} - Soil Group ${s.soil_group}`,
        `${s.name}: ${s.description} Texture: ${s.texture}. Drainage: ${s.drainage_class}. RB209 soil group ${s.soil_group}.`,
        'soil',
        'GB',
      ]
    );
  }

  const totalFts = CROPS.length + NUTRIENT_RECS.length + SOIL_TYPES.length;
  console.log(`  ${totalFts} FTS5 entries created.`);

  // Update metadata
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('last_ingest', ?)", [now]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('build_date', ?)", [now]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('crop_count', ?)", [String(CROPS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('recommendation_count', ?)", [String(NUTRIENT_RECS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('price_count', ?)", [String(COMMODITY_PRICES.length)]);

  // Write coverage.json
  const coverage = {
    mcp_name: 'Crop Nutrients MCP',
    jurisdiction: 'GB',
    build_date: now,
    crops: CROPS.length,
    soil_types: SOIL_TYPES.length,
    nutrient_recommendations: NUTRIENT_RECS.length,
    commodity_prices: COMMODITY_PRICES.length,
    fts_entries: totalFts,
    source_hash: createHash('sha256').update(JSON.stringify({ CROPS, SOIL_TYPES, NUTRIENT_RECS, COMMODITY_PRICES })).digest('hex').slice(0, 16),
  };
  writeFileSync('data/coverage.json', JSON.stringify(coverage, null, 2));
  console.log('Wrote data/coverage.json');

  console.log('\nIngestion complete.');
  console.log(`  Crops: ${CROPS.length}`);
  console.log(`  Soil types: ${SOIL_TYPES.length}`);
  console.log(`  Nutrient recommendations: ${NUTRIENT_RECS.length}`);
  console.log(`  Commodity prices: ${COMMODITY_PRICES.length}`);
  console.log(`  FTS5 entries: ${totalFts}`);
}

// ── Main ─────────────────────────────────────────────────────────

mkdirSync('data', { recursive: true });
const db = createDatabase('data/database.db');
ingest(db);
db.close();
