import { describe, test, expect } from 'vitest';
import { handleAbout } from '../../src/tools/about.js';

describe('about tool', () => {
  test('returns server metadata', () => {
    const result = handleAbout();
    expect(result.name).toBe('Crop Nutrients MCP');
    expect(result.description).toContain('nutrient');
    expect(result.jurisdiction).toEqual(['GB']);
    expect(result.tools_count).toBeGreaterThan(0);
    expect(result.links).toHaveProperty('homepage');
    expect(result._meta).toHaveProperty('disclaimer');
  });
});
