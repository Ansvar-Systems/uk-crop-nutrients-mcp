import { describe, test, expect } from 'vitest';
import { validateJurisdiction, SUPPORTED_JURISDICTIONS } from '../src/jurisdiction.js';

describe('jurisdiction validation', () => {
  test('accepts GB', () => {
    const result = validateJurisdiction('GB');
    expect(result).toEqual({ valid: true, jurisdiction: 'GB' });
  });

  test('defaults to GB when undefined', () => {
    const result = validateJurisdiction(undefined);
    expect(result).toEqual({ valid: true, jurisdiction: 'GB' });
  });

  test('rejects unsupported jurisdiction', () => {
    const result = validateJurisdiction('SE');
    expect(result).toEqual({
      valid: false,
      error: {
        error: 'jurisdiction_not_supported',
        supported: ['GB'],
        message: 'This server currently covers Great Britain. More jurisdictions are planned.',
      },
    });
  });

  test('normalises lowercase input', () => {
    const result = validateJurisdiction('gb');
    expect(result).toEqual({ valid: true, jurisdiction: 'GB' });
  });

  test('SUPPORTED_JURISDICTIONS contains GB', () => {
    expect(SUPPORTED_JURISDICTIONS).toContain('GB');
  });
});
