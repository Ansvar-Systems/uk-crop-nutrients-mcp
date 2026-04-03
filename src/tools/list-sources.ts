import { buildMeta } from '../metadata.js';
import type { Database } from '../db.js';

interface Source {
  name: string;
  authority: string;
  official_url: string;
  retrieval_method: string;
  update_frequency: string;
  license: string;
  coverage: string;
  last_retrieved?: string;
}

export function handleListSources(db: Database): { sources: Source[]; _meta: ReturnType<typeof buildMeta> } {
  const lastIngest = db.get<{ value: string }>('SELECT value FROM db_metadata WHERE key = ?', ['last_ingest']);

  const sources: Source[] = [
    {
      name: 'AHDB RB209 Nutrient Management Guide',
      authority: 'Agriculture and Horticulture Development Board',
      official_url: 'https://ahdb.org.uk/nutrient-management-guide',
      retrieval_method: 'HTML_SCRAPE',
      update_frequency: 'annual',
      license: 'Open Government Licence v3',
      coverage: 'NPK recommendations for all major UK crops by soil type and SNS index',
      last_retrieved: lastIngest?.value,
    },
    {
      name: 'DEFRA Agricultural Price Indices',
      authority: 'Department for Environment, Food and Rural Affairs',
      official_url: 'https://www.gov.uk/government/statistics/agricultural-price-indices',
      retrieval_method: 'BULK_DOWNLOAD',
      update_frequency: 'monthly',
      license: 'Open Government Licence v3',
      coverage: 'UK agricultural commodity prices',
      last_retrieved: lastIngest?.value,
    },
    {
      name: 'AHDB Market Data',
      authority: 'Agriculture and Horticulture Development Board',
      official_url: 'https://ahdb.org.uk/cereals-oilseeds/cereal-and-oilseed-markets',
      retrieval_method: 'HTML_SCRAPE',
      update_frequency: 'weekly',
      license: 'Open Government Licence v3',
      coverage: 'UK delivered and ex-farm cereal and oilseed prices',
      last_retrieved: lastIngest?.value,
    },
  ];

  return {
    sources,
    _meta: buildMeta({ source_url: 'https://ahdb.org.uk/nutrient-management-guide' }),
  };
}
