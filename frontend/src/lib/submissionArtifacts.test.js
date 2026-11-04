import { expect, it } from 'vitest';
import { savedRetiredArtifactFields } from './submissionArtifacts.js';

it('keeps an earlier submitted link available after its form field is retired', () => {
  const previous = { id: 'legacy', type: 'url', label: 'Submission Link', active: false };
  const current = { id: 'current-pdf', type: 'drive', pdfRequired: true, active: true };
  const deliverable = { fields: [current, previous], retiredFields: [previous] };
  expect(savedRetiredArtifactFields(deliverable, { values: {
    legacy: 'https://drive.google.com/file/d/earlier-file/view', 'current-pdf': ''
  } })).toEqual([previous]);
  expect(savedRetiredArtifactFields(deliverable, { values: { legacy: '' } })).toEqual([]);
  expect(savedRetiredArtifactFields(deliverable, { values: { legacy: 'javascript:alert(1)' } })).toEqual([]);
});
