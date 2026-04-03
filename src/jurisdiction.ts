export const SUPPORTED_JURISDICTIONS = ['GB'] as const;
export type Jurisdiction = (typeof SUPPORTED_JURISDICTIONS)[number];

type ValidationSuccess = { valid: true; jurisdiction: Jurisdiction };
type ValidationFailure = {
  valid: false;
  error: {
    error: string;
    supported: readonly string[];
    message: string;
  };
};
type ValidationResult = ValidationSuccess | ValidationFailure;

export function validateJurisdiction(input: string | undefined): ValidationResult {
  const normalised = (input ?? 'GB').toUpperCase();

  if (SUPPORTED_JURISDICTIONS.includes(normalised as Jurisdiction)) {
    return { valid: true, jurisdiction: normalised as Jurisdiction };
  }

  return {
    valid: false,
    error: {
      error: 'jurisdiction_not_supported',
      supported: SUPPORTED_JURISDICTIONS,
      message: 'This server currently covers Great Britain. More jurisdictions are planned.',
    },
  };
}
