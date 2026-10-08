import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { AiReviewReport } from './AiReviewReport.jsx';
import { AiReviewReportDialog } from './AiReviewReportDialog.jsx';
import { AdviserViewPage } from '../../pages/AdviserViewPage.jsx';

const pageMocks = vi.hoisted(() => ({
  state: null,
  workspaceId: 'workspace-it',
  session: { authenticated: true, email: 'adviser@school.edu' },
  staffIdentity: null,
  runDocumentCheck: vi.fn(),
  runDocumentChecks: vi.fn()
}));

vi.mock('../../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => ({ activeWorkspaceId: pageMocks.workspaceId, session: pageMocks.session })
}));

vi.mock('../../app/StaffIdentity.jsx', () => ({
  useStaffIdentity: () => ({ data: pageMocks.staffIdentity, status: 'ready', error: '', reload: vi.fn() })
}));

vi.mock('../../hooks/useWorkspaceResource.js', () => ({
  useWorkspaceResource: () => ({ data: pageMocks.state, setData: vi.fn(), status: 'ready', error: '' })
}));

vi.mock('../../lib/reviewDeskClient.js', () => ({
  emptyReviewDesk: () => ({}),
  loadReviewDesk: vi.fn(),
  applyReviewMutation: (response, mutation) => ({ ...response, ...mutation }),
  applyDocumentCheck: (response, report) => ({ ...response, documentCheck: report }),
  acceptResponse: vi.fn(),
  revokeAcceptance: vi.fn(),
  saveFeedback: vi.fn(),
  runDocumentCheck: (...args) => pageMocks.runDocumentCheck(...args),
  runDocumentChecks: (...args) => pageMocks.runDocumentChecks(...args)
}));

const TEAM_A = '2526-sem2-it332-01';
const TEAM_B = '2526-sem2-it332-02';
const SOURCE_FRAMEWORK = 'https://drive.google.com/file/d/framework-pdf/view';
const SOURCE_HIGHLIGHTS = 'https://drive.google.com/file/d/highlights-pdf/view';

function report(issue) {
  return {
    findings: [{ source: 'DOCUMENT', issue, evidence: `${issue} evidence` }],
    missingRequiredSections: [],
    limitations: []
  };
}

function renderReport(reportValue) {
  return render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light"><AiReviewReport report={reportValue} /></MantineProvider>);
}

function renderDialog(review, reportValue = null) {
  return render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
    <AiReviewReportDialog opened onClose={vi.fn()} report={reportValue} review={review} fieldLabel="SRS PDF" />
  </MantineProvider>);
}

function createPageState() {
  const fields = [
    { definitionId: 'field-framework', id: 'frameworkModel', label: 'Framework / Model', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true },
    { definitionId: 'field-highlights', id: 'validationHighlights', label: 'MVP Validation Highlights', type: 'drive', pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true }
  ];
  const deliverable = {
    id: 'deliv-mvp-validation', slug: 'mvp-validation', shortTitle: 'MVP Validation', title: 'MVP Validation',
    trackerColumn: 'MVPValidation', status: 'Published', fields
  };
  const response = (id, teamCode, studentNumber, studentName, frameworkUrl = SOURCE_FRAMEWORK) => ({
    id, deliverableId: deliverable.id, studentNumber, studentName, teamCode,
    submittedAt: '2026-04-17T09:00:00+08:00', updatedAt: '2026-04-17T09:00:00+08:00', reviewStatus: 'Received',
    values: { frameworkModel: frameworkUrl, validationHighlights: SOURCE_HIGHLIGHTS },
    artifactChecks: {
      'field-framework': { fieldId: 'field-framework', status: 'Current', sourceUrl: frameworkUrl, summary: 'Framework PDF is readable.' },
      'field-highlights': { fieldId: 'field-highlights', status: 'Current', sourceUrl: SOURCE_HIGHLIGHTS, summary: 'Highlights PDF is readable.' }
    },
    artifactAiReviews: {
      'field-framework': { fieldId: 'field-framework', status: 'COMPLETED', generatedAt: '2026-04-17T10:30:00+08:00', sourceUrl: frameworkUrl, report: report('Framework finding') },
      'field-highlights': { fieldId: 'field-highlights', status: 'COMPLETED', generatedAt: '2026-04-17T10:31:00+08:00', sourceUrl: SOURCE_HIGHLIGHTS, report: report('Highlights finding') }
    },
    feedback: []
  });
  return {
    scopeTeamCodes: [TEAM_A, TEAM_B],
    students: [
      { studentNumber: '22-1001-001', name: 'ALPHA, ANA', teamCode: TEAM_A, memberNumber: 1, adviser: 'Dr. Elena Mercado' },
      { studentNumber: '22-2001-001', name: 'GAMMA, GIO', teamCode: TEAM_B, memberNumber: 1, adviser: 'Prof. Adrian Flores' }
    ],
    projectMetadata: [
      { groupCode: TEAM_A, projectTitle: 'Accessible Learning Hub', softwareName: 'AccessHub', adviserName: 'Dr. Elena Mercado' },
      { groupCode: TEAM_B, projectTitle: 'Campus Queue Monitor', softwareName: 'QueueWatch', adviserName: 'Prof. Adrian Flores' }
    ],
    deliverables: [deliverable],
    attempts: [response('response-a', TEAM_A, '22-1001-001', 'ALPHA, ANA'), response('response-b', TEAM_B, '22-2001-001', 'GAMMA, GIO')]
  };
}

function renderPage(role = 'adviser') {
  localStorage.setItem('wildtrack.v2.preview-role', role);
  localStorage.setItem('wildtrack.v2.preview-adviser', 'Dr. Elena Mercado');
  return render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light"><ModalsProvider><MemoryRouter initialEntries={['/adviser']}><AdviserViewPage /></MemoryRouter></ModalsProvider></MantineProvider>);
}

describe('AI Review repair acceptance behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    pageMocks.workspaceId = 'workspace-it';
    pageMocks.session = { authenticated: true, email: 'adviser@school.edu' };
    pageMocks.staffIdentity = { adviserName: 'Dr. Elena Mercado', assignments: [{ workspaceId: 'workspace-it', teamCode: TEAM_A }, { workspaceId: 'workspace-it', teamCode: TEAM_B }], workspaces: [{ id: 'workspace-it', name: 'IT Capstone - IT332' }] };
    pageMocks.state = createPageState();
    pageMocks.runDocumentCheck.mockReset();
    pageMocks.runDocumentChecks.mockReset();
  });

  it('moves legacy mapped-template body and artifact advisories to Verify in PDF', () => {
    renderReport({ findings: [
      { source: 'OFFICIAL_TEMPLATE', issue: "Mapped-template body heading 'Validation Results' is absent.", evidence: 'Mapped-template body heading comparison' },
      { source: 'OFFICIAL_TEMPLATE', issue: "Mapped-template transaction artifact 'Validation Form' is absent.", evidence: 'Mapped-template transaction artifact comparison' }
    ], missingRequiredSections: [] });
    expect(screen.getByText('Inconclusive')).toBeInTheDocument();
    expect(screen.getByText('Verify in PDF (2)')).toBeInTheDocument();
    expect(screen.queryByText('Issues to review')).not.toBeInTheDocument();
  });

  it('keeps explicit issues as ISSUES_IDENTIFIED while also exposing verification notes', () => {
    renderReport({ outcome: 'ISSUES_IDENTIFIED', findings: [{ issue: 'Missing acceptance criteria.', source: 'DOCUMENT', evidence: 'Section 4' }], verificationNotes: [{ issue: 'Confirm the template heading in the PDF.', source: 'OFFICIAL_TEMPLATE', evidence: 'Page 2' }], missingRequiredSections: [] });
    expect(screen.getByText('Issues identified')).toBeInTheDocument();
    expect(screen.getByText('Issues to review')).toBeInTheDocument();
    expect(screen.getByText('Verify in PDF (1)')).toBeInTheDocument();
  });

  it('does not render an identical last substantive report twice', () => {
    const saved = report('Only saved finding');
    renderDialog({ status: 'UNCERTAIN', failureCode: 'FINDINGS_FILTERED', previousReport: saved, lastSubstantiveReport: { ...saved }, previousGeneratedAt: '2026-09-21T08:00:00Z', lastSubstantiveGeneratedAt: '2026-09-21T08:00:00Z' });
    const dialog = screen.getByRole('dialog', { name: 'AI Review: SRS PDF' });
    expect(within(dialog).getAllByText('Only saved finding')).toHaveLength(1);
    expect(within(dialog).queryByText(/Earlier substantive review/)).not.toBeInTheDocument();
  });

  it('keeps the latest inconclusive attempt and earlier substantive report separately dated and accessible', () => {
    const earlier = report('Earlier substantive finding');
    const latest = { summary: 'No grounded findings', findings: [], missingRequiredSections: [], outcome: 'INCONCLUSIVE' };
    renderDialog({ status: 'UNCERTAIN', failureCode: 'NO_GROUNDED_FINDINGS', previousReport: earlier, lastSubstantiveReport: earlier, previousGeneratedAt: '2026-09-21T08:00:00Z', lastSubstantiveGeneratedAt: '2026-09-20T08:00:00Z', generatedAt: '2026-09-22T08:00:00Z' }, latest);
    const dialog = screen.getByRole('dialog', { name: 'AI Review: SRS PDF' });
    expect(dialog).toHaveTextContent('Inconclusive AI Review');
    expect(dialog).toHaveTextContent('Reviewed Sep 22, 2026');
    expect(dialog).toHaveTextContent('Earlier substantive review · Sep 20, 2026');
    expect(dialog).toHaveTextContent('Earlier substantive finding');
    expect(dialog).not.toHaveTextContent('No grounded findings');
  });

  it('reveals a long evidence passage exactly once after requesting the full passage', () => {
    const passage = `A long exact source passage ${'with preserved wording '.repeat(30)}`.trim();
    renderReport({ findings: [{ issue: 'Review this source passage.', evidence: passage }], missingRequiredSections: [] });
    fireEvent.click(screen.getByText('View evidence'));
    expect(screen.getByText(`${passage.slice(0, 420).replace(/\s+\S*$/, '')}…`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View full passage' }));
    expect(screen.getAllByText(passage)).toHaveLength(1);
  });

  it.each(['admin', 'adviser'])('opens the same artifact-specific modal for %s without a provider call', (role) => {
    renderPage(role);
    const highlights = screen.getByRole('group', { name: 'MVP Validation Highlights artifact' });
    fireEvent.click(within(highlights).getByRole('button', { name: 'View AI Review' }));
    const dialog = screen.getByRole('dialog', { name: 'AI Review: MVP Validation Highlights' });
    expect(dialog).toHaveTextContent('Highlights finding');
    expect(pageMocks.runDocumentCheck).not.toHaveBeenCalled();
    expect(pageMocks.runDocumentChecks).not.toHaveBeenCalled();
  });

  it('clears an open review when workspace scope changes', () => {
    const view = renderPage('adviser');
    fireEvent.click(within(screen.getByRole('group', { name: 'MVP Validation Highlights artifact' })).getByRole('button', { name: 'View AI Review' }));
    expect(screen.getByRole('dialog', { name: 'AI Review: MVP Validation Highlights' })).toBeInTheDocument();
    pageMocks.workspaceId = 'workspace-cs';
    view.rerender(<MantineProvider theme={wildTrackTheme} forceColorScheme="light"><ModalsProvider><MemoryRouter initialEntries={['/adviser']}><AdviserViewPage /></MemoryRouter></ModalsProvider></MantineProvider>);
    expect(screen.queryByRole('dialog', { name: 'AI Review: MVP Validation Highlights' })).not.toBeInTheDocument();
  });

  it('clears an open review when the adviser changes team', () => {
    renderPage('adviser');
    fireEvent.click(within(screen.getByRole('group', { name: 'MVP Validation Highlights artifact' })).getByRole('button', { name: 'View AI Review' }));
    expect(screen.getByRole('dialog', { name: 'AI Review: MVP Validation Highlights' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(TEAM_B) }));
    expect(screen.queryByRole('dialog', { name: 'AI Review: MVP Validation Highlights' })).not.toBeInTheDocument();
  });

  it('clears an open review when the adviser changes the selected group output', () => {
    pageMocks.state = createPageState();
    const alternate = { ...pageMocks.state.attempts[0], id: 'response-a2', studentNumber: '22-1001-002', studentName: 'BETA, BEN', values: { ...pageMocks.state.attempts[0].values, frameworkModel: 'https://drive.google.com/file/d/alternate-framework/view' } };
    pageMocks.state.students.push({ studentNumber: '22-1001-002', name: 'BETA, BEN', teamCode: TEAM_A, memberNumber: 2, adviser: 'Dr. Elena Mercado' });
    pageMocks.state.attempts.push(alternate);
    renderPage('adviser');
    fireEvent.click(within(screen.getByRole('group', { name: 'MVP Validation Highlights artifact' })).getByRole('button', { name: 'View AI Review' }));
    expect(screen.getByRole('dialog', { name: 'AI Review: MVP Validation Highlights' })).toBeInTheDocument();
    const outputSelect = screen.getByRole('combobox', { name: 'Current group output' });
    const alternateOption = within(outputSelect).getAllByRole('option').find((option) => option.value !== outputSelect.value);
    expect(alternateOption).toBeDefined();
    fireEvent.change(outputSelect, { target: { value: alternateOption.value } });
    expect(screen.queryByRole('dialog', { name: 'AI Review: MVP Validation Highlights' })).not.toBeInTheDocument();
  });
});
