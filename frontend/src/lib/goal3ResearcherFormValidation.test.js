import { describe, expect, it } from 'vitest';
import { validateSubmission } from './workflow.js';

// Fictional, isolated form configuration matching the research-only required PDF
// field after Validation Step was removed. This does not read the live student form.
const syntheticForm = {
  fields: [{ id: 'documentPdf', label: 'PDF Drive Link', type: 'drive',
    required: true, pdfRequired: true, active: true }]
};

describe('Goal 3 researcher-only form validation', () => {
  it('R3-01 blocks a missing required PDF before submission', () => {
    const result = validateSubmission({ deliverable: syntheticForm, values: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.documentPdf).toMatch(/PDF Drive Link is required/i);
  });

  it('R3-02 accepts a syntactically valid Drive file URL without pretending to inspect its MIME type', () => {
    const result = validateSubmission({ deliverable: syntheticForm, values: {
      documentPdf: 'https://drive.google.com/file/d/goal3-fictional-docx/view'
    }});
    expect(result.ok).toBe(true);
    expect(result.flags).toContain('Drive link format accepted');
    // A later provider-backed Document Check must verify whether the file is a PDF.
    expect(result.flags).not.toContain('PDF Verified');
  });
});
