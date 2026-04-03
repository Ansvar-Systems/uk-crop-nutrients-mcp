export interface Meta {
  disclaimer: string;
  data_age: string;
  source_url: string;
  copyright: string;
  server: string;
  version: string;
}

const DISCLAIMER =
  'This data is provided for informational purposes only. It does not constitute professional ' +
  'agricultural advice. Always consult a qualified agronomist or FACTS-qualified advisor before ' +
  'making nutrient management decisions. Data sourced from AHDB RB209, DEFRA, and other UK ' +
  'government publications under Open Government Licence.';

export function buildMeta(overrides?: Partial<Meta>): Meta {
  return {
    disclaimer: DISCLAIMER,
    data_age: overrides?.data_age ?? 'unknown',
    source_url: overrides?.source_url ?? 'https://ahdb.org.uk/nutrient-management-guide',
    copyright: 'Data: Crown Copyright and AHDB. Server: Apache-2.0 Ansvar Systems.',
    server: 'crop-nutrients-mcp',
    version: '0.1.0',
    ...overrides,
  };
}

export function buildStalenessWarning(publishedDate: string): string | undefined {
  const published = new Date(publishedDate);
  const now = new Date();
  const daysSincePublished = Math.floor(
    (now.getTime() - published.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSincePublished > 14) {
    return `Price data is ${daysSincePublished} days old (published ${publishedDate}). Check current market rates before making decisions.`;
  }
  return undefined;
}
