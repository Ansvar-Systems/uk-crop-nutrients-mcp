import { createDatabase, type Database } from '../../src/db.js';

export function createSeededDatabase(dbPath: string): Database {
  const db = createDatabase(dbPath);

  // Crops
  db.run(
    `INSERT INTO crops (id, name, crop_group, typical_yield_t_ha, nutrient_offtake_n, nutrient_offtake_p2o5, nutrient_offtake_k2o, growth_stages, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['winter-wheat', 'Winter Wheat', 'cereals', 8.0, 192, 70, 46, JSON.stringify(['tillering', 'stem extension', 'ear emergence', 'grain fill']), 'GB']
  );
  db.run(
    `INSERT INTO crops (id, name, crop_group, typical_yield_t_ha, nutrient_offtake_n, nutrient_offtake_p2o5, nutrient_offtake_k2o, growth_stages, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['spring-barley', 'Spring Barley', 'cereals', 5.5, 110, 46, 55, JSON.stringify(['tillering', 'stem extension', 'ear emergence']), 'GB']
  );

  // Soil types
  db.run(
    `INSERT INTO soil_types (id, name, soil_group, texture, drainage_class, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['heavy-clay', 'Heavy Clay', 3, 'clay', 'poor', 'Heavy clay soils with poor drainage. Soil group 3 in RB209.']
  );
  db.run(
    `INSERT INTO soil_types (id, name, soil_group, texture, drainage_class, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['light-sand', 'Light Sand', 1, 'sand', 'free', 'Light sandy soils with free drainage. Soil group 1 in RB209.']
  );

  // Nutrient recommendations
  db.run(
    `INSERT INTO nutrient_recommendations (crop_id, soil_group, sns_index, previous_crop_group, n_rec_kg_ha, p_rec_kg_ha, k_rec_kg_ha, s_rec_kg_ha, notes, rb209_section, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['winter-wheat', 3, 2, 'cereals', 180, 45, 55, 20, 'Standard recommendation for winter wheat on heavy clay at SNS index 2', 'Section 4', 'GB']
  );
  db.run(
    `INSERT INTO nutrient_recommendations (crop_id, soil_group, sns_index, previous_crop_group, n_rec_kg_ha, p_rec_kg_ha, k_rec_kg_ha, s_rec_kg_ha, notes, rb209_section, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['spring-barley', 1, 3, 'cereals', 100, 40, 50, 15, 'Standard recommendation for spring barley on light sand at SNS index 3', 'Section 4', 'GB']
  );

  // Commodity prices
  db.run(
    `INSERT INTO commodity_prices (crop_id, market, price_per_tonne, currency, price_source, published_date, retrieved_at, source, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['winter-wheat', 'ex-farm', 195.0, 'GBP', 'ahdb_market', '2026-03-28', '2026-03-29', 'AHDB Cereals & Oilseeds', 'GB']
  );
  db.run(
    `INSERT INTO commodity_prices (crop_id, market, price_per_tonne, currency, price_source, published_date, retrieved_at, source, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['spring-barley', 'ex-farm', 165.0, 'GBP', 'ahdb_market', '2026-03-28', '2026-03-29', 'AHDB Cereals & Oilseeds', 'GB']
  );

  // FTS5 search index
  db.run(
    `INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)`,
    ['Winter Wheat Nutrient Requirements', 'Winter wheat requires 180 kg/ha nitrogen on heavy clay soils at SNS index 2. RB209 Section 4.', 'cereals', 'GB']
  );
  db.run(
    `INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)`,
    ['Spring Barley Nutrient Requirements', 'Spring barley requires 100 kg/ha nitrogen on light sandy soils at SNS index 3. RB209 Section 4.', 'cereals', 'GB']
  );

  return db;
}
