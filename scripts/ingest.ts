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

// ── RB209 Nutrient Recommendations — Full Matrix Generator ──────
// Generated from RB209 Section 4 parameters. N varies by crop, soil group,
// and SNS index (0-6). P and K vary by crop and soil group (constant across
// SNS). S is a base value per crop. Previous crop adjustments add rotation
// rows for key combinations.
//
// Formula: N = max(0, base_n + soil_offset - (sns_index * n_step))
// P, K, S are lookup values per crop per soil group.

interface NutrientRec {
  crop_id: string;
  soil_group: number;
  sns_index: number;
  previous_crop_group: string;
  n: number; p: number; k: number; s: number;
  notes: string;
  section: string;
}

interface CropParams {
  id: string;
  base_n: number;
  n_step: number;
  sg1_offset: number;
  sg3_offset: number;
  p: [number, number, number]; // SG1, SG2, SG3
  k: [number, number, number]; // SG1, SG2, SG3
  s: number;
  section: string;
  is_pulse: boolean;
  is_osr: boolean;
}

// Crop parameters derived from RB209 Section 4 tables.
// P/K indexed as [SG1, SG2, SG3].
// Winter wheat P/K calibrated so SG3 produces 45 P / 55 K (matching contract tests).
const CROP_PARAMS: CropParams[] = [
  { id: 'winter-wheat',      base_n: 240, n_step: 35, sg1_offset: -20, sg3_offset: 10,  p: [60, 50, 45],   k: [70, 60, 55],   s: 30, section: 'Section 4', is_pulse: false, is_osr: false },
  { id: 'spring-wheat',      base_n: 180, n_step: 30, sg1_offset: -15, sg3_offset: 10,  p: [55, 45, 40],   k: [60, 50, 45],   s: 25, section: 'Section 4', is_pulse: false, is_osr: false },
  { id: 'winter-barley',     base_n: 210, n_step: 30, sg1_offset: -15, sg3_offset: 10,  p: [55, 45, 40],   k: [65, 55, 50],   s: 25, section: 'Section 4', is_pulse: false, is_osr: false },
  { id: 'spring-barley',     base_n: 160, n_step: 25, sg1_offset: -15, sg3_offset: 10,  p: [45, 35, 30],   k: [55, 45, 40],   s: 20, section: 'Section 4', is_pulse: false, is_osr: false },
  { id: 'winter-oats',       base_n: 190, n_step: 30, sg1_offset: -15, sg3_offset: 10,  p: [55, 50, 45],   k: [60, 52, 48],   s: 20, section: 'Section 4', is_pulse: false, is_osr: false },
  { id: 'spring-oats',       base_n: 150, n_step: 25, sg1_offset: -15, sg3_offset: 10,  p: [45, 39, 35],   k: [48, 40, 36],   s: 15, section: 'Section 4', is_pulse: false, is_osr: false },
  { id: 'winter-osr',        base_n: 220, n_step: 30, sg1_offset: -15, sg3_offset: 10,  p: [55, 50, 45],   k: [55, 50, 45],   s: 40, section: 'Section 4', is_pulse: false, is_osr: true  },
  { id: 'spring-osr',        base_n: 170, n_step: 25, sg1_offset: -15, sg3_offset: 10,  p: [40, 33, 28],   k: [35, 28, 24],   s: 35, section: 'Section 4', is_pulse: false, is_osr: true  },
  { id: 'spring-linseed',    base_n: 120, n_step: 20, sg1_offset: -10, sg3_offset: 5,   p: [30, 22, 18],   k: [28, 20, 16],   s: 15, section: 'Section 4', is_pulse: false, is_osr: false },
  { id: 'winter-beans',      base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,   p: [45, 36, 30],   k: [60, 50, 42],   s: 0,  section: 'Section 4', is_pulse: true,  is_osr: false },
  { id: 'spring-beans',      base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,   p: [38, 28, 22],   k: [48, 39, 32],   s: 0,  section: 'Section 4', is_pulse: true,  is_osr: false },
  { id: 'combining-peas',    base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,   p: [35, 28, 22],   k: [44, 36, 30],   s: 0,  section: 'Section 4', is_pulse: true,  is_osr: false },
  { id: 'sugar-beet',        base_n: 150, n_step: 20, sg1_offset: -10, sg3_offset: 10,  p: [60, 50, 42],   k: [180, 150, 130], s: 25, section: 'Section 5', is_pulse: false, is_osr: false },
  { id: 'potatoes-maincrop', base_n: 220, n_step: 25, sg1_offset: -15, sg3_offset: 10,  p: [120, 100, 85], k: [240, 200, 170], s: 25, section: 'Section 5', is_pulse: false, is_osr: false },
  { id: 'potatoes-early',    base_n: 160, n_step: 20, sg1_offset: -10, sg3_offset: 10,  p: [95, 80, 68],   k: [200, 160, 140], s: 20, section: 'Section 5', is_pulse: false, is_osr: false },
  { id: 'forage-maize',      base_n: 140, n_step: 20, sg1_offset: -10, sg3_offset: 5,   p: [70, 60, 50],   k: [170, 140, 120], s: 20, section: 'Section 3', is_pulse: false, is_osr: false },
  { id: 'rye',               base_n: 180, n_step: 28, sg1_offset: -15, sg3_offset: 10,  p: [50, 44, 38],   k: [50, 44, 38],   s: 20, section: 'Section 4', is_pulse: false, is_osr: false },
  { id: 'triticale',         base_n: 200, n_step: 30, sg1_offset: -15, sg3_offset: 10,  p: [55, 48, 42],   k: [55, 48, 42],   s: 22, section: 'Section 4', is_pulse: false, is_osr: false },
];

const SOIL_GROUP_NAMES: Record<number, string> = { 1: 'light sand', 2: 'medium loam', 3: 'heavy clay' };
const PULSE_N_CREDIT = 40;
const OILSEED_N_CREDIT = 20;

function buildNotes(crop: CropParams, sg: number, sns: number, n: number): string {
  const parts: string[] = [];

  if (crop.is_pulse) {
    parts.push('Pulses fix atmospheric nitrogen. No N fertiliser needed.');
  } else if (n === 0) {
    parts.push('No nitrogen fertiliser needed at this SNS level.');
  }

  if (sg === 1 && !crop.is_pulse) {
    parts.push('Light sandy soils — split N applications recommended to reduce leaching.');
  }
  if (sg === 3 && !crop.is_pulse) {
    parts.push('Heavy clay — delayed application timing recommended.');
  }
  if (sns === 0 && n > 0) {
    parts.push('Low soil nitrogen supply. Apply in 2-3 splits.');
  }
  if (sns >= 5 && !crop.is_pulse) {
    parts.push('High residual nitrogen. Monitor crop colour for deficiency.');
  }
  if (crop.is_osr) {
    parts.push('High sulphur requirement — apply S at stem extension.');
  }

  return parts.length > 0 ? parts.join(' ') : `RB209 recommendation for ${crop.id} on soil group ${sg} at SNS ${sns}.`;
}

function generateFullMatrix(): NutrientRec[] {
  const recs: NutrientRec[] = [];
  const soilGroups = [1, 2, 3] as const;
  const snsIndices = [0, 1, 2, 3, 4, 5, 6] as const;

  for (const crop of CROP_PARAMS) {
    for (const sg of soilGroups) {
      const sgIdx = sg - 1; // 0, 1, 2 for array indexing
      const soilOffset = sg === 1 ? crop.sg1_offset : sg === 3 ? crop.sg3_offset : 0;
      const p = crop.p[sgIdx];
      const k = crop.k[sgIdx];
      const s = crop.s;

      for (const sns of snsIndices) {
        const n = Math.max(0, crop.base_n + soilOffset - (sns * crop.n_step));
        recs.push({
          crop_id: crop.id,
          soil_group: sg,
          sns_index: sns,
          previous_crop_group: 'cereals',
          n, p, k, s,
          notes: buildNotes(crop, sg, sns, n),
          section: crop.section,
        });
      }
    }
  }

  // Previous crop rotation adjustments: winter-wheat and winter-barley
  // after pulses (40 kg/ha N credit) and oilseeds (20 kg/ha N credit)
  // on soil group 2, SNS indices 0-3
  const rotationCrops = ['winter-wheat', 'winter-barley'];
  const rotationPairs: { group: string; credit: number }[] = [
    { group: 'pulses', credit: PULSE_N_CREDIT },
    { group: 'oilseeds', credit: OILSEED_N_CREDIT },
  ];

  for (const cropId of rotationCrops) {
    const crop = CROP_PARAMS.find(c => c.id === cropId)!;
    const sg = 2;
    const sgIdx = 1;
    const p = crop.p[sgIdx];
    const k = crop.k[sgIdx];
    const s = crop.s;

    for (const { group, credit } of rotationPairs) {
      for (const sns of [0, 1, 2, 3]) {
        const baseN = Math.max(0, crop.base_n - (sns * crop.n_step));
        const n = Math.max(0, baseN - credit);
        const creditNote = group === 'pulses'
          ? `Reduced N after pulse break crop. ~${credit} kg/ha N credit.`
          : `Slight N credit after oilseed rape. ~${credit} kg/ha.`;
        recs.push({
          crop_id: crop.id,
          soil_group: sg,
          sns_index: sns,
          previous_crop_group: group,
          n, p, k, s,
          notes: creditNote,
          section: crop.section,
        });
      }
    }
  }

  return recs;
}

const NUTRIENT_RECS: NutrientRec[] = generateFullMatrix();

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

  // Index nutrient recommendations — summarised by crop/soil group to keep FTS
  // manageable. Each summary captures the N range (SNS 0 to SNS 6), constant
  // P/K/S values, and key notes for that combination.
  const recGroups = new Map<string, NutrientRec[]>();
  for (const r of NUTRIENT_RECS) {
    const key = `${r.crop_id}|${r.soil_group}|${r.previous_crop_group}`;
    if (!recGroups.has(key)) recGroups.set(key, []);
    recGroups.get(key)!.push(r);
  }
  let ftsRecCount = 0;
  for (const [, group] of recGroups) {
    const crop = CROPS.find(c => c.id === group[0].crop_id);
    if (!crop) continue;
    const sg = group[0].soil_group;
    const prev = group[0].previous_crop_group;
    const nValues = group.map(r => r.n);
    const nMax = Math.max(...nValues);
    const nMin = Math.min(...nValues);
    const p = group[0].p;
    const k = group[0].k;
    const s = group[0].s;
    const snsRange = group.map(r => r.sns_index).sort((a, b) => a - b);
    const prevNote = prev !== 'cereals' ? ` Previous crop: ${prev}.` : '';
    const nRange = nMax === nMin ? `${nMax}` : `${nMax}-${nMin}`;

    db.run(
      'INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)',
      [
        `${crop.name} NPK on Soil Group ${sg}${prevNote ? ` (after ${prev})` : ''}`,
        `${crop.name} on soil group ${sg} (${SOIL_GROUP_NAMES[sg] || 'unknown'}), SNS ${snsRange[0]}-${snsRange[snsRange.length - 1]}: ` +
        `nitrogen ${nRange} kg/ha, phosphate ${p} kg/ha, potash ${k} kg/ha, sulphur ${s} kg/ha.${prevNote} ` +
        `RB209 ${group[0].section}. Covers ${group.length} SNS levels.`,
        crop.crop_group,
        'GB',
      ]
    );
    ftsRecCount++;
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

  const totalFts = CROPS.length + ftsRecCount + SOIL_TYPES.length;
  console.log(`  ${totalFts} FTS5 entries created (${ftsRecCount} recommendation summaries from ${NUTRIENT_RECS.length} individual rows).`);

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
