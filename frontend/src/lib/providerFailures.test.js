import { describe, expect, it } from 'vitest';
import { providerFailureLabel, providerRetryAdvice } from './providerFailures.js';

describe('provider failure wording', () => {
  it('keeps the row label short and uses the upstream HTTP status', () => {
    expect(providerFailureLabel({ provider: 'drive', httpStatus: 403, reasonCode: 'UPSTREAM_ERROR' })).toBe('Drive HTTP 403');
    expect(providerFailureLabel({ provider: 'gemini', httpStatus: 429, reasonCode: 'RATE_LIMITED' })).toBe('Gemini HTTP 429');
    expect(providerFailureLabel({ upstreamStatus: 404 }, null, 'Google Drive')).toBe('Drive HTTP 404');
  });
  it('shows a saved code without inventing an HTTP status for old failures', () => {
    expect(providerFailureLabel({ provider: 'gemini', reasonCode: 'INVALID_RESPONSE' })).toBe('Gemini · INVALID_RESPONSE');
    expect(providerFailureLabel(null)).toBe('');
  });
  it('distinguishes confirmed rate limits from an unexplained Drive 403', () => {
    expect(providerRetryAdvice({ provider: 'drive', httpStatus: 403, reasonCode: 'RATE_LIMIT' })).toBe('Drive rate limit reached. Try again later.');
    expect(providerRetryAdvice({ provider: 'drive', httpStatus: 403, reasonCode: 'UPSTREAM_ERROR' })).toContain('temporary limits may apply');
    expect(providerRetryAdvice({ provider: 'drive', httpStatus: 403, reasonCode: 'UPSTREAM_ERROR' })).not.toContain('rate limit reached');
    expect(providerRetryAdvice({ provider: 'gemini', httpStatus: 429 })).toBe('Gemini rate limit reached. Try again later.');
  });
  it('does not describe access, configuration or invalid-output failures as rate limits', () => {
    for (const diagnostic of [
      { provider: 'drive', httpStatus: 403, reasonCode: 'ACCESS_DENIED' },
      { provider: 'drive', httpStatus: 403, reasonCode: 'CONFIGURATION_ERROR' },
      { provider: 'gemini', httpStatus: 400, reasonCode: 'REQUEST_PARAMETER_REJECTED' },
      { provider: 'gemini', reasonCode: 'INVALID_RESPONSE' }
    ]) expect(providerRetryAdvice(diagnostic)).toBe('');
  });
});
