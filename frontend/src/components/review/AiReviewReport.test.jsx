import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AiReviewReport } from './AiReviewReport.jsx';

function show(report) { render(<MantineProvider><AiReviewReport report={report} /></MantineProvider>); }

it('summarizes a completed one-instruction template without an artificial coverage warning', () => {
  show({ outcome: 'NO_ISSUES_IN_CHECKED_AREAS', findings: [], verificationNotes: [], verifiedChecks: [],
    coverage: { omittedCriteria: 0, criteria: [{ id: 'T1', title: 'Describe project responsibilities',
      requirement: 'Describe project responsibilities.', source: 'OFFICIAL_TEMPLATE', assessment: 'APPEARS_ADDRESSED',
      explanation: 'The manager assigns responsibilities to team members.',
      documentEvidence: 'The project manager assigns and tracks team responsibilities.', location: { page: 4 } }] } });
  expect(screen.getByRole('status')).toHaveTextContent('1 template instruction assessed');
  expect(screen.queryByText(/Too little supported evidence/)).not.toBeInTheDocument();
  expect(screen.getByText('Appears addressed (1)')).toBeVisible();
});
function openSupportingText() {
  screen.getAllByText(/View supporting text/).forEach(item => fireEvent.click(item));
}

it('shows a neutral document overview before the review without inferring a mismatch from weak content', () => {
  show({ documentOverview: { text: 'This plan describes the project schedule and responsibilities.', actualDocumentType: 'a management plan', wrongDocument: false },
    findings: [glossaryFinding('MVP')], missingRequiredSections: [{ section: 'Risks', source: 'OFFICIAL_TEMPLATE', requirement: 'Risks' }] });
  const overview = screen.getByRole('region', { name: 'Document overview' });
  const checklist = screen.getByRole('region', { name: 'Review checklist' });
  expect(overview.compareDocumentPosition(checklist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText(/This is not the required document/)).not.toBeInTheDocument();
});

it('emphasizes a supported mismatch without hiding the review checklist', () => {
  render(<MantineProvider><AiReviewReport deliverableTitle="Software Requirements Specification" report={{
    documentOverview: { text: 'This questionnaire collects participant feedback.', actualDocumentType: 'a survey questionnaire', wrongDocument: true },
    findings: [{ issue: 'Confirm the submitted file.', evidence: 'Participant feedback questionnaire' }]
  }} /></MantineProvider>);
  const overview = screen.getByRole('region', { name: 'Document overview' });
  expect(within(overview).getByRole('status')).toHaveTextContent('This is a survey questionnaire, NOT the required Software Requirements Specification.');
  expect(within(overview).getByText('NOT').tagName).toBe('STRONG');
  expect(screen.getByRole('region', { name: 'Review checklist' })).toBeVisible();
  expect(screen.getByText('Confirm the submitted file.')).toBeVisible();
});

it('does not relabel the old review-result summary as a document overview', () => {
  show({ summary: 'This is not the required document.', findings: [] });
  expect(screen.queryByRole('region', { name: 'Document overview' })).not.toBeInTheDocument();
  expect(screen.queryByText('This is not the required document.')).not.toBeInTheDocument();
});
it('combines diagram presence checks while retaining locations, excerpts and each requirement once', () => {
  const value = { verificationNotes: ['Add entry', 'Archive entry'].map((context, index) => ({
    title: 'Verify Use Case Diagram',
    issue: `Text extraction could not verify 'Use Case Diagram' in transaction '${context}'. Its label was not located in the extracted transaction.`,
    source: 'OFFICIAL_TEMPLATE', requirement: 'Use Case Diagram',
    evidence: index ? 'Archive entry has a confirmation step.' : '',
    location: { page: index + 12 }
  })) };
  const original = JSON.stringify(value);
  show(value);
  expect(screen.getByText('1 item to check')).toBeVisible();
  expect(screen.getAllByRole('heading', { name: 'Check diagrams in the PDF' })).toHaveLength(1);
  expect(screen.queryByText(/Original artifact observations/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Text extraction could not verify/)).not.toBeInTheDocument();
  const locations = screen.getByText('See locations to check (2)');
  expect(screen.getByText('Archive entry')).not.toBeVisible();
  fireEvent.click(locations);
  expect(screen.getByText('Archive entry')).toBeVisible();
  expect(screen.getByText('PDF page 13', { exact: false })).toBeVisible();
  expect(screen.getByRole('blockquote', { name: 'Evidence excerpt' })).toHaveTextContent('Archive entry has a confirmation step.');
  expect(screen.queryByText('View requirement', { exact: true })).not.toBeInTheDocument();
  expect(screen.getAllByText('Reference · Official template')).toHaveLength(1);
  expect(screen.getAllByText('Use Case Diagram', { exact: true })).toHaveLength(1);
  expect(JSON.stringify(value)).toBe(original);
});

it('keeps multiple diagram types in one check and a single affected location visible', () => {
  render(<MantineProvider><AiReviewReport pdfUrl="https://drive.google.com/file/d/source/view" report={{
    verificationNotes: ['Use Case Diagram', 'Activity Diagram', 'Wireframe'].map(artifact => ({
      issue: `Text extraction could not verify '${artifact}' in transaction '1.3 Live tracker'. Its label is present; inspect the original PDF because text cannot establish graphical completeness.`,
      source: 'OFFICIAL_TEMPLATE', requirement: artifact, location: { page: 20 }, evidence: `${artifact}:`
    }))
  }} /></MantineProvider>);
  expect(screen.getAllByRole('heading', { name: 'Check diagrams in the PDF' })).toHaveLength(1);
  expect(screen.getByText('1.3 Live tracker')).toBeVisible();
  expect(screen.getByText('Use Case Diagram, Activity Diagram, Wireframe', { exact: false })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open PDF and check page 20' })).toHaveAttribute('href', 'https://drive.google.com/file/d/source/view');
  expect(screen.getByText('1 item to check')).toBeVisible();
});

it('does not combine a specific diagram-content concern with automatic presence checks', () => {
  show({ findings: [{ issue: 'The approval diagram contradicts the stated adviser role.', evidence: 'Only the student may approve.' }],
    verificationNotes: [
      { issue: "Text extraction could not verify 'Activity Diagram' in transaction '1.1 Submit'. Its label was not located in the extracted transaction." },
      { title: 'Check diagram labels', issue: 'The approval arrow could not be read.', evidence: 'Approval' }
    ] });
  expect(screen.getByText('The approval diagram contradicts the stated adviser role.')).toBeVisible();
  expect(screen.getByText('Check diagram labels')).toBeVisible();
  expect(screen.getByText('1 concern · 2 items to check')).toBeVisible();
});

const checks = [
  { aspect: 'Scope identifies users', source: 'DELIVERABLE_REQUIREMENTS', documentEvidence: 'Scope: students and advisers.', requirement: 'Identify intended users.' },
  { aspect: 'Submission workflow exists', source: 'OFFICIAL_TEMPLATE', documentEvidence: 'FR-01: submit PDF.', requirement: '3.2 Functional requirements' }
];
const glossaryFinding = (term, overrides = {}) => ({
  issue: `The acronym ${term} is used in the submitted PDF but is not defined in section 1.3 Definitions, Acronyms and Abbreviations.`,
  source: 'OFFICIAL_TEMPLATE', requirement: '1.3 Definitions, Acronyms and Abbreviations',
  evidence: `${term} submitted passage`, ...overrides
});

it('shows the concern and action first, with the exact quote and source expandable in place', () => {
  show({ outcome: 'ISSUES_IDENTIFIED', findings: [{ title: 'Missing constraints detail', issue: 'The constraints section is incomplete.', nextAction: 'Add the offline requirement.', evidence: 'Section 2.4 passage', requirement: '2.4 Constraints', location: { page: 4, section: 'Constraints' } }] });
  expect(screen.getByRole('region', { name: 'Review checklist' })).toBeVisible();
  expect(screen.getByText('Missing constraints detail')).toBeVisible();
  expect(screen.getByText('Add the offline requirement.')).toBeVisible();
  expect(screen.getByRole('blockquote', { name: 'Evidence excerpt', hidden: true })).not.toBeVisible();
  fireEvent.click(screen.getByText('View supporting text · PDF page 4 · Constraints'));
  expect(screen.getByRole('blockquote', { name: 'Evidence excerpt' })).toHaveTextContent('Section 2.4 passage');
  expect(screen.getByText('Reference: 2.4 Constraints')).toBeVisible();
});

it('keeps full long quotes available without filling the initial checklist with them', () => {
  show({ findings: [{ issue: 'Long evidence', evidence: 'A '.repeat(240), requirement: 'A '.repeat(100) }] });
  openSupportingText();
  expect(screen.getAllByRole('blockquote', { name: 'Evidence excerpt' })).toHaveLength(1);
  fireEvent.click(screen.getAllByRole('button', { name: 'View full passage' })[0]);
  expect(screen.getByRole('blockquote', { name: 'Evidence excerpt' }).textContent).toBe('A '.repeat(240));
});

it('puts manual questions in the visible checklist and does not turn them into a green approval', () => {
  show({ outcome: 'NO_ISSUES_IN_CHECKED_AREAS', verifiedChecks: checks, verificationNotes: [{ title: 'Check the sequence diagram', issue: 'Image-only diagram cannot be verified.', evidence: 'Page 8 image', requirement: 'Diagram requirement' }] });
  expect(screen.getByText('Check the sequence diagram')).toBeVisible();
  expect(screen.getByText('Check in PDF', { selector: '.wt-ai-review-item-label' })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Check in PDF');
  expect(screen.getByRole('status')).not.toHaveTextContent('No actionable issues');
});

it('does not render an arbitrary checked-items list for legacy reports', () => {
  show({ outcome: 'NO_ISSUES_IN_CHECKED_AREAS', verifiedChecks: checks });
  expect(screen.getByRole('status')).toHaveTextContent('No actionable issues identified in the checked areas');
  expect(screen.queryByText(/Other checked items/)).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Template and instruction assessment' })).not.toBeInTheDocument();
});

it('renders a valid assessed finding once through the instruction row', () => {
  const finding = { issue: 'Retry rule needs a final-state decision.', source: 'OFFICIAL_TEMPLATE', evidence: 'Retry is available.', requirement: 'Describe retry behavior.' };
  show({ findings: [finding], coverage: { criteria: [{ id: 'C1', requirement: 'Describe retry behavior.', source: 'OFFICIAL_TEMPLATE', assessment: 'NEEDS_ATTENTION', explanation: 'The final state is not specified.', documentEvidence: finding.evidence, location: { page: 8 }, findingIndexes: [0] }] } });
  expect(screen.getAllByText('Retry is available.')).toHaveLength(1);
  expect(screen.getAllByText('The final state is not specified.', { exact: false }).find(element => element.closest('summary'))).toBeVisible();
  expect(screen.getByText('1 concern')).toBeVisible();
  expect(screen.queryByText('No actionable issues identified in the checked areas')).not.toBeInTheDocument();
  expect(screen.getByText('Retry rule needs a final-state decision.')).not.toBeVisible();
});

it('does not hide a global finding when an assessment reference is out of bounds or mismatched', () => {
  const finding = { issue: 'Untrusted linked concern remains visible.', source: 'OFFICIAL_TEMPLATE', evidence: 'Original concern quote.', requirement: 'Different requirement.' };
  show({ findings: [finding], coverage: { criteria: [{ id: 'C1', requirement: 'Canonical requirement.', source: 'OFFICIAL_TEMPLATE', assessment: 'NEEDS_ATTENTION', explanation: 'Review the canonical requirement.', documentEvidence: 'Assessment quote.', location: { page: 8 }, findingIndexes: [9] }] } });
  expect(screen.getByText('Untrusted linked concern remains visible.')).toBeVisible();
  expect(screen.getAllByText('Canonical requirement.').length).toBeGreaterThanOrEqual(1);
});

it('deduplicates repeated findings while keeping the full evidence once', () => {
  show({ findings: [
    { issue: 'Wrong section', source: 'DOCUMENT', evidence: 'A full submitted passage with exact wording.' },
    { issue: 'Wrong section', source: 'DOCUMENT', evidence: 'A full submitted passage with exact wording.' }
  ] });
  expect(screen.getAllByText('Wrong section')).toHaveLength(1);
  expect(screen.getAllByText('A full submitted passage with exact wording.')).toHaveLength(1);
});

it('makes glossary feedback one minor item and removes the original-observations section', () => {
  const value = { findings: ['MVP', 'OCR', 'MAY'].map(term => glossaryFinding(term)) };
  const saved = JSON.stringify(value);
  show(value);
  expect(screen.getAllByRole('heading', { name: 'Review glossary definitions' })).toHaveLength(1);
  expect(screen.getByText('Minor check')).toBeVisible();
  expect(screen.getByText('Confirm whether MVP, OCR, MAY need definitions in section 1.3.')).toBeVisible();
  expect(screen.getByText('1 minor check')).toBeVisible();
  expect(screen.queryByText(/Original glossary observations/)).not.toBeInTheDocument();
  for (const term of ['MVP', 'OCR', 'MAY']) expect(screen.queryByText(`${term} submitted passage`)).not.toBeInTheDocument();
  expect(screen.getAllByText('Reference: Official template · 1.3 Definitions, Acronyms and Abbreviations')).toHaveLength(1);
  expect(JSON.stringify(value)).toBe(saved);
});

it('keeps glossary sources and distinct requirement operators separate', () => {
  show({ findings: [glossaryFinding('MVP', { requirement: 'Glossary <= 10 terms' }),
    glossaryFinding('OCR', { requirement: 'Glossary >= 10 terms' }),
    glossaryFinding('MAY', { source: 'DELIVERABLE_REQUIREMENTS' })] });
  expect(screen.getByText(/3 minor checks/)).toBeVisible();
});

it('puts substantive concerns and manual questions ahead of minor glossary feedback', () => {
  show({ findings: [glossaryFinding('MVP'), { title: 'Conflicting states', issue: 'Two acceptance states conflict.', evidence: 'pending or accepted' }],
    verificationNotes: [{ title: 'Check diagram labels', issue: 'Diagram text could not be read.' }] });
  const headings = within(screen.getByRole('region', { name: 'Review checklist' })).getAllByRole('heading').map(item => item.textContent);
  expect(headings).toEqual(['Review checklist', 'Conflicting states', 'Check diagram labels', 'Review glossary definitions']);
});

it('does not add glossary feedback to an unrelated document report', () => {
  show({ findings: [{ title: 'Check the attendance limit', issue: 'The same event has two capacity limits.' }] });
  expect(screen.queryByText(/glossary/i)).not.toBeInTheDocument();
});

it('groups missing section names into one manual checklist item with their requirements intact', () => {
  show({ missingRequiredSections: [
    { section: '1. Introduction', requirement: '1. Introduction', source: 'OFFICIAL_TEMPLATE' },
    { section: '2. Overall Description', requirement: 'Include the product context.', source: 'DELIVERABLE_REQUIREMENTS' }
  ] });
  expect(screen.getAllByRole('heading', { name: 'Check section coverage' })).toHaveLength(1);
  expect(screen.getByText('Reference: Deliverable requirements · Include the product context.')).toBeInTheDocument();
  expect(screen.getByText('2 concerns')).toBeVisible();
});

it('preserves uncertain section evidence without counting it as a supported concern', () => {
  show({ verifiedChecks: checks, verificationNotes: [
    { issue: 'The required section “1. Introduction” could not be located.', requirement: '1. Introduction', source: 'OFFICIAL_TEMPLATE', evidence: 'Original introduction observation' },
    { issue: 'The required section “2. Overall Description” could not be located.', requirement: '2. Overall Description', source: 'OFFICIAL_TEMPLATE', evidence: 'Original context observation' }
  ] });
  expect(screen.getByRole('status')).toHaveTextContent('Check in PDF');
  expect(screen.getByText('2 items to check')).toBeVisible();
  expect(screen.getByText('Original introduction observation')).toBeInTheDocument();
  expect(screen.getByText('Original context observation')).toBeInTheDocument();
});

it('does not duplicate generic next-step copy for older findings', () => {
  const issue = 'The workflow has contradictory acceptance states.';
  show({ findings: [{ issue, nextAction: 'Review the cited evidence and decide whether a revision is needed.' }] });
  expect(screen.getAllByText(issue)).toHaveLength(1);
  expect(screen.queryByText(/Review the cited evidence/)).not.toBeInTheDocument();
});

it('groups repeated artifact locations and preserves their supporting details', () => {
  show({ verifiedChecks: checks, verificationNotes: ['1.2 Upload receipt', '2.1 Review draft'].map(context => ({
    issue: `Text extraction could not verify 'Use Case Description' in transaction '${context}'. Its label was not located in the extracted transaction.`,
    source: 'OFFICIAL_TEMPLATE', requirement: 'Use Case Description', evidence: `${context} original observation`
  })) });
  expect(screen.getByRole('status')).toHaveTextContent('Check in PDF');
  expect(screen.getAllByRole('heading', { name: 'Verify Use Case Description in the PDF' })).toHaveLength(1);
  expect(screen.getByText("transaction '1.2 Upload receipt'")).toBeVisible();
  expect(screen.getByText('1.2 Upload receipt original observation')).toBeInTheDocument();
  expect(screen.getByText('2.1 Review draft original observation')).toBeInTheDocument();
});

it('keeps artifact verification groups separate across requirement sources', () => {
  show({ verificationNotes: ['OFFICIAL_TEMPLATE', 'DELIVERABLE_REQUIREMENTS'].map(source => ({
    issue: "Text extraction could not verify 'Use Case Description' in transaction '1.2'. Its label was not located in the extracted transaction.",
    source, requirement: 'Use Case Description'
  })) });
  expect(screen.getAllByRole('heading', { name: 'Verify Use Case Description in the PDF' })).toHaveLength(2);
});

it('does not claim a clean result from an empty or sparse saved review', () => {
  show({ summary: 'The PDF satisfies all requirements.', outcome: 'INCONCLUSIVE', findings: [],
    verifiedChecks: [{ ...checks[0], location: { page: 12 } }] });
  expect(screen.getByRole('status')).toHaveTextContent('Limited review coverage');
  expect(screen.getByRole('status')).toHaveTextContent('This does not mean the PDF is empty or incorrect.');
  expect(screen.queryByText(/Other checked items/)).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Template and instruction assessment' })).not.toBeInTheDocument();
  expect(screen.queryByText('No actionable issues identified in the checked areas')).not.toBeInTheDocument();
});
