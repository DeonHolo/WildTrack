import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { DocumentCheckDialog, documentCheckStatus } from './DocumentCheckDialog.jsx';
vi.mock('../../lib/api.js', async importOriginal => ({ ...(await importOriginal()),
  getWorkTaskDismissals: vi.fn().mockResolvedValue([]), dismissWorkTask: vi.fn().mockResolvedValue(null) }));

vi.mock('../../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => ({ session: { authenticated: true, email: 'admin@example.test', roles: ['ADMIN'] } })
}));

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { expect(fetchMock).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

const fileLink = 'https://drive.google.com/file/d/this-submitted-pdf/view';
const target = { workspaceId: 'workspace-it', responseId: 'response-1', fieldId: 'pdf-field-1' };
const response = {
  id: 'response-1',
  submittedAt: '2026-09-19T08:00:00+08:00',
  updatedAt: '2026-09-19T08:00:00+08:00',
  documentCheck: {
    status: 'Current', checkedAt: '2026-09-19T09:00:00+08:00',
    sourceResponseUpdatedAt: '2026-09-19T08:00:00+08:00',
    metadata: { name: 'Submitted SRS.pdf', mimeType: 'application/pdf', canDownload: true },
    document: { readable: true, pageCount: 10 }
  }
};
const observedHistory = { observations: [{
  changeType: 'CONTENT_CHANGED',
  firstObservedAt: '2026-09-19T11:00:00+08:00',
  driveCreatedTime: '2026-09-18T10:00:00+08:00',
  driveOwner: 'Recorded Owner (owner.secret@example.test)',
  modifiedBy: 'Recorded Editor (editor.secret@example.test)'
}, {
  changeType: 'FIRST_OBSERVED',
  firstObservedAt: '2026-09-19T09:00:00+08:00'
}] };

function show(props = {}) {
  return render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
    <DocumentCheckDialog response={response} fileLink={fileLink} historyTarget={target}
      open onClose={vi.fn()} allowRecheck={false} {...props} />
  </MantineProvider>);
}
function identityFact(dialog, label) {
  return within(dialog).getByText(label).closest('.document-check-fact--identity');
}

describe('DocumentCheck saved metadata and recorded history', () => {
  it('shows template findings only when a scoped uploaded template exists', () => {
    const view = show();
    expect(screen.queryByRole('link', { name: 'Open official template' })).not.toBeInTheDocument();
    view.unmount();
    show({ templateFindingsUrl: '/templates/template-one/preview?workspaceId=workspace-it' });
    expect(screen.getByRole('link', { name: 'Open official template' })).toHaveAttribute('href', '/templates/template-one/preview?workspaceId=workspace-it');
  });
  it('keeps the explanation in a keyboard-accessible title tooltip', async () => {
    show({ documentCheck: { ...response.documentCheck, metadata: {
      ...response.documentCheck.metadata, modifiedTime: '2026-09-18T10:00:00+08:00'
    } } });
    const dialog = screen.getByRole('dialog');
    const explanation = 'Document Check verifies file access and readability, then screens whether the PDF appears substantially filled. Template structure is supporting evidence only. It does not grade the submission or replace staff review.';
    expect(within(dialog).getByText('Document Check')).toBeInTheDocument();
    expect(within(dialog).getByText('Last modified (Drive)')).toBeInTheDocument();
    expect(within(dialog).queryByText(explanation)).not.toBeInTheDocument();
    fireEvent.focus(within(dialog).getByRole('button', { name: 'About Document Check' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(explanation);
  });

  it('explains student-facing check scope in the same compact tooltip', async () => {
    show({ audience: 'student' });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText(/It does not grade your work or decide whether it is accepted/)).not.toBeInTheDocument();
    fireEvent.focus(within(dialog).getByRole('button', { name: 'About Document Check' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('It does not grade your work or decide whether it is accepted.');
  });

  it('retains staff metadata from saved checks without requesting Google revisions', () => {
    show({ observedHistory });
    const dialog = screen.getByRole('dialog');
    expect(identityFact(dialog, 'Drive owner')).toHaveTextContent('Recorded Owner');
    expect(identityFact(dialog, 'Drive owner')).toHaveTextContent('owner.secret@example.test');
    expect(identityFact(dialog, 'Last modified by')).toHaveTextContent('Recorded Editor');
    expect(identityFact(dialog, 'Last modified by')).toHaveTextContent('editor.secret@example.test');
    expect(within(dialog).getByText('Created time').parentElement).not.toHaveTextContent('Unavailable');
    expect(within(dialog).queryByText('Latest Drive modified (Google metadata)')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'File history' }));
    expect(within(dialog).getByText('2 entries')).toBeVisible();
    expect(within(dialog).getByRole('list', { name: 'Recorded file checks' })).toHaveTextContent('Content changed');
    expect(within(dialog).queryByRole('region', { name: 'File details' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Google Drive edits|connection needs setup|Legacy Google/)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Connect Drive|Refresh history/ })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Check result' }));
    expect(identityFact(dialog, 'Drive owner')).toHaveTextContent('Recorded Owner');
  });

  it('renders verified student matches as staff-only names and full email rows', () => {
    const ownerEmail = 'very.long.ownername@gmail.com';
    const editorEmail = 'very.long.editorname@university.edu.ph';
    show({ observedHistory: { observations: [{
      ...observedHistory.observations[0],
      driveOwner: 'Untrusted Google Profile Name (unverified@example.test)',
      driveOwnerStudent: { studentName: 'TAGHOY, RON LUIGI F.', email: ownerEmail },
      modifiedBy: 'Other Google Profile (other@example.test)',
      modifiedByStudent: { studentName: 'PACIO, MURIEL D.', email: editorEmail }
    }] } });
    const dialog = screen.getByRole('dialog');
    const owner = identityFact(dialog, 'Drive owner');
    const editor = identityFact(dialog, 'Last modified by');
    expect(owner).toHaveTextContent('TAGHOY, RON LUIGI F.');
    expect(editor).toHaveTextContent('PACIO, MURIEL D.');
    expect(owner).not.toHaveTextContent('Untrusted Google Profile Name');
    expect(editor).not.toHaveTextContent('Other Google Profile');
    expect(owner.querySelector('.document-check-identity-email')).toHaveAttribute('title', ownerEmail);
    expect(editor.querySelector('.document-check-identity-email')).toHaveAttribute('title', editorEmail);
    expect(owner.querySelector('.document-check-identity-email').textContent).toBe('(' + ownerEmail + ')');
    expect(editor.querySelector('.document-check-identity-email').textContent).toBe('(' + editorEmail + ')');
    expect(owner.querySelector('.document-check-identity-email')).toContainHTML('<wbr>');
    expect(editor.querySelector('.document-check-identity-email')).toContainHTML('<wbr>');
  });

  it('does not apply an older observation’s student match to a different current owner/editor', () => {
    show({ observedHistory: { observations: [
      observedHistory.observations[0],
      { ...observedHistory.observations[1], driveOwnerStudent: { studentName: 'OLD OWNER', email: 'former@example.test' },
        modifiedByStudent: { studentName: 'OLD EDITOR', email: 'former.editor@example.test' } }
    ] } });
    const dialog = screen.getByRole('dialog');
    expect(identityFact(dialog, 'Drive owner')).toHaveTextContent('Recorded Owner');
    expect(identityFact(dialog, 'Last modified by')).toHaveTextContent('Recorded Editor');
    expect(identityFact(dialog, 'Drive owner')).not.toHaveTextContent('OLD OWNER');
    expect(identityFact(dialog, 'Last modified by')).not.toHaveTextContent('OLD EDITOR');
  });

  it.each(['staff', 'student'])('retains report dates for %s without delegated metadata', audience => {
    show({ audience, documentCheck: { ...response.documentCheck, metadata: {
      ...response.documentCheck.metadata, createdTime: '2026-09-18T10:00:00+08:00',
      modifiedTime: '2026-09-19T11:00:00+08:00'
    } } });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Created time').parentElement).not.toHaveTextContent('Unavailable');
    expect(within(dialog).getByText('Last modified (Drive)').parentElement).not.toHaveTextContent('Not available');
    expect(within(dialog).queryByText('Latest Drive modified (Google metadata)')).not.toBeInTheDocument();
  });

  it('shows student checks and dates without disclosing any stored owner/editor identities', () => {
    show({ audience: 'student', observedHistory: { observations: [{
      ...observedHistory.observations[0],
      driveOwnerStudent: { studentName: 'PRIVATE OWNER STUDENT', email: 'student.owner@example.test' },
      modifiedByStudent: { studentName: 'PRIVATE EDITOR STUDENT', email: 'student.editor@example.test' }
    }, observedHistory.observations[1]] } });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Created time').parentElement).not.toHaveTextContent('Unavailable');
    expect(within(dialog).queryByText('Drive owner')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Last modified by')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'File history' }));
    expect(within(dialog).getByText('2 entries')).toBeVisible();
    expect(within(dialog).getByRole('list', { name: 'Recorded file checks' })).toHaveTextContent('Content changed');
    expect(within(dialog).queryByText('Technical record details')).not.toBeInTheDocument();
    expect(dialog.innerHTML).not.toMatch(/owner\.secret|editor\.secret|student\.owner|student\.editor|Recorded Owner|Recorded Editor|PRIVATE OWNER|PRIVATE EDITOR|Legacy Google/);
  });

  it.each([false, true])('opens saved file history directly with historyOnly=%s and no Drive request', historyOnly => {
    show({ initialTab: 'history', historyOnly, audience: 'student', observedHistory });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('list', { name: 'Recorded file checks' })).toHaveTextContent('Content changed');
    expect(within(dialog).queryByRole('button', { name: 'Refresh history' })).not.toBeInTheDocument();
    if (historyOnly) expect(within(dialog).queryByRole('tab', { name: 'Check result' })).not.toBeInTheDocument();
  });

  it('shows an empty check history without a Google configuration or consent message', () => {
    show({ initialTab: 'history', audience: 'student' });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('No recorded checks yet. A completed Document Check records the file state here.')).toBeVisible();
    expect(within(dialog).queryByText(/Google Drive edits|connection needs setup|authorize|permission/i)).not.toBeInTheDocument();
  });

  it('replaces stored facts when the selected response changes', () => {
    const view = show({ observedHistory });
    view.rerender(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <DocumentCheckDialog response={{ ...response, id: 'response-2' }} fileLink={fileLink}
        historyTarget={{ ...target, responseId: 'response-2' }} open onClose={vi.fn()} allowRecheck={false}
        observedHistory={{ observations: [{ driveOwner: 'Correct Owner', modifiedBy: 'Correct Editor' }] }} />
    </MantineProvider>);
    const dialog = screen.getByRole('dialog');
    expect(identityFact(dialog, 'Drive owner')).toHaveTextContent('Correct Owner');
    expect(identityFact(dialog, 'Last modified by')).toHaveTextContent('Correct Editor');
    expect(dialog.textContent).not.toMatch(/Recorded Owner|Recorded Editor/);
  });

  it('does not request Google history when closed', () => {
    show({ open: false });
  });
});


describe('DocumentCheck submission substance', () => {

  function report(state, reason, extras = {}) {
    return {
      ...response.documentCheck,
      summary: reason,
      flags: ['PDF Verified'],
      redFlags: [],
      missingSections: [],
      document: { readable: true, pageCount: 10, textBearingPageCount: 10, extractedCharacterCount: 12000 },
      templateComparison: {
        available: true,
        templateCoverage: 0.33,
        addedContentRatio: 0.79,
        expectedTemplateHeadings: ['Introduction', 'Requirements'],
        detectedTemplateHeadings: ['Introduction'],
        sectionEvidence: [
          { expectedHeading: 'Introduction', status: 'DETECTED', matchedLine: '1. Introduction', extractedTextLine: 20 },
          { expectedHeading: 'Requirements', status: 'NOT_DETECTED' }
        ]
      },
      submissionSubstance: {
        state,
        reason,
        reasonCode: state === 'LOOKS_SUBSTANTIALLY_FILLED' ? 'SUBSTANTIAL_CONTENT' : 'SPARSE_CONTENT',
        evidence: { templateAvailable: true, textPageRatio: 1, charactersPerTextBearingPage: 1200 }
      },
      ...extras
    };
  }

  it('uses submission substance as the result even when informational template headings are missing', () => {
    const reason = 'WildTrack found substantial content beyond the official template.';
    const current = report('LOOKS_SUBSTANTIALLY_FILLED', reason, { missingSections: ['Requirements'] });
    show({ documentCheck: current });
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText('Looks substantially filled')).toBeInTheDocument();
    expect(within(dialog).getByText(reason)).toBeInTheDocument();
    expect(documentCheckStatus({ ...response, documentCheck: current })).toBe('Looks substantially filled');
    expect(within(dialog).queryByText('View details')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Official template structure')).toBeVisible();
    expect(within(dialog).getByText('File validation')).toBeVisible();
  });

  it.each([
    ['staff', 'NEEDS_ATTENTION', 'SPARSE_CONTENT', 'Sparse Content'],
    ['student', 'NEEDS_ATTENTION', 'SPARSE_CONTENT', 'Sparse Content'],
    ['staff', 'COULD_NOT_DETERMINE', 'INSUFFICIENT_TEXT_EXTRACTION', 'Substance Inconclusive'],
    ['student', 'COULD_NOT_DETERMINE', 'INSUFFICIENT_TEXT_EXTRACTION', 'Substance Inconclusive']
  ])('groups saved %s %s results under Sparse Content without changing their evidence', (audience, state, reasonCode, flag) => {
    const reason = 'Original saved extraction-specific explanation.';
    const current = report(state, reason, {
      redFlags: [flag],
      submissionSubstance: { state, reason, reasonCode },
      templateComparison: { available: false }
    });
    show({ audience, documentCheck: current });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Needs attention — Sparse Content')).toBeVisible();
    expect(within(dialog).getByText('WildTrack could not confirm that this PDF is substantially filled from its readable text. Open the PDF to check its content.')).toBeVisible();
    expect(within(dialog).getByText('Sparse Content', { exact: true })).toBeVisible();
    expect(dialog).not.toHaveTextContent('Could not determine');
    expect(dialog).not.toHaveTextContent('Substance Inconclusive');
    expect(dialog).not.toHaveTextContent(reason);
    expect(current.submissionSubstance).toEqual({ state, reason, reasonCode });
    expect(current.redFlags).toEqual([flag]);
  });

  it('keeps legacy saved reports on the old flag and missing-section fallback', () => {
    const legacy = { ...response.documentCheck, redFlags: [], missingSections: ['Scope'] };
    expect(documentCheckStatus({ ...response, documentCheck: legacy })).toBe('Needs attention');
  });
});

describe('DocumentCheck saved-source freshness', () => {
  const changedResponse = { ...response, updatedAt: '2026-10-10T08:00:00+08:00',
    documentCheck: { ...response.documentCheck, sourceUrl: fileLink,
      summary: 'The PDF was readable when checked.' } };

  it.each(['staff', 'student'])('keeps the same PDF current after unrelated answer edits for %s', audience => {
    show({ response: changedResponse, audience });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText(/outdated/i)).not.toBeInTheDocument();
    expect(within(dialog).getByText(audience === 'student' ? 'Check complete' : 'Ready for review')).toBeVisible();
    expect(documentCheckStatus(changedResponse, ` ${fileLink} `)).toBe('Ready for review');
  });

  it('explains a changed PDF link with an attention state and clears it after a fresh check', () => {
    const newLink = 'https://drive.google.com/file/d/new-submitted-pdf/view';
    const view = show({ response: changedResponse, fileLink: newLink });
    expect(screen.getByText('Outdated')).toBeVisible();
    const reason = screen.getByText('This saved check belongs to an earlier submission. Check again to refresh it.');
    expect(reason.closest('.document-check-overview')).toHaveClass('attention');
    expect(screen.queryByText('The PDF was readable when checked.')).not.toBeInTheDocument();
    view.rerender(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <DocumentCheckDialog response={changedResponse} fileLink={newLink}
        documentCheck={{ ...changedResponse.documentCheck, sourceUrl: newLink,
          sourceResponseUpdatedAt: changedResponse.updatedAt }} open onClose={vi.fn()} />
    </MantineProvider>);
    expect(screen.queryByText('Outdated')).not.toBeInTheDocument();
    expect(screen.getByText('Ready for review')).toBeVisible();
  });

  it('retains timestamp checks for legacy reports without a saved file URL', () => {
    expect(documentCheckStatus({ ...changedResponse, documentCheck: response.documentCheck }, fileLink)).toBe('Outdated');
    expect(documentCheckStatus(response, fileLink)).toBe('Ready for review');
  });
});
