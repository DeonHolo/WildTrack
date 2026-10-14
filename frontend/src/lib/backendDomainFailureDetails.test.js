import { describe, expect, it } from 'vitest';
import { applyFileCheck, applyFieldChecks } from './backendDomain.js';

const failureDetails = { stage: 'download', code: 'TIMEOUT', reason: 'The request timed out.' };
const report = { id: 'check-1', status: 'BLOCKED', checkedAt: '2026-10-14T13:15:00Z',
  sourceUrl: 'https://drive.google.com/file/d/pdf/view', failureDetails };

describe('Document Check failure status through domain mapping', () => {
  it('preserves the original blocked result and diagnostics through legacy mapping and remapping', () => {
    const first = applyFileCheck({}, report);
    expect(first.documentCheck.status).toBe('Current');
    expect(first.documentCheck.resultStatus).toBe('BLOCKED');
    expect(first.documentCheck.failureDetails).toEqual(failureDetails);
    const second = applyFileCheck({}, first.documentCheck);
    expect(second.documentCheck.resultStatus).toBe('BLOCKED');
  });

  it('preserves blocked result details on each field without changing check freshness status', () => {
    const response = applyFieldChecks({}, { 'field-1': report });
    expect(response.artifactChecks['field-1'].status).toBe('Current');
    expect(response.artifactChecks['field-1'].resultStatus).toBe('BLOCKED');
    expect(response.artifactChecks['field-1'].failureDetails).toEqual(failureDetails);
  });
});
