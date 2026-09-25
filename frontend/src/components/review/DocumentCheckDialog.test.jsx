import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { DocumentCheckDialog, documentCheckStatus } from './DocumentCheckDialog.jsx';

const getSubmittedFileHistory = vi.fn();
vi.mock('../../lib/api.js', () => ({
  getSubmittedFileHistory: (...args) => getSubmittedFileHistory(...args),
  startDriveHistoryConsent: vi.fn()
}));

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
const sharedHistory = {
  status: 'AVAILABLE',
  revisions: [{ id: 'revision-1', modifiedTime: '2026-09-19T11:00:00+08:00', mimeType: 'application/pdf', size: 1024, modifiedBy: 'Staff Editor', modifiedByEmail: 'editor.secret@example.test' }],
  fileMetadata: {
    createdTime: '2026-09-18T10:00:00+08:00',
    driveOwner: 'Private Owner (owner.secret@example.test)',
    lastModifiedTime: '2026-09-19T11:00:00+08:00',
    lastModifiedBy: 'Staff Editor (editor.secret@example.test)'
  },
  historyMayBeIncomplete: true
};

function show(props = {}) {
  return render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
    <DocumentCheckDialog response={response} fileLink={fileLink} historyTarget={target}
      open onClose={vi.fn()} allowRecheck={false} {...props} />
  </MantineProvider>);
}

function identityFact(dialog, label) {
  return within(dialog).getByText(label).closest('.document-check-fact--identity');
}

describe('DocumentCheck shared submitted-file metadata', () => {
  beforeEach(() => { getSubmittedFileHistory.mockReset().mockResolvedValue(sharedHistory); });

  it('keeps the explanation in a keyboard-accessible title tooltip instead of a full-width alert', async () => {
    show({ documentCheck: { ...response.documentCheck, metadata: {
      ...response.documentCheck.metadata, modifiedTime: '2026-09-18T10:00:00+08:00'
    } } });
    const dialog = screen.getByRole('dialog');
    const explanation = 'Document Check verifies file access and readability, then screens whether the PDF appears substantially filled. Template structure is supporting evidence only. It does not grade the submission or replace staff review.';
    expect(within(dialog).getByText('Document Check')).toBeInTheDocument();
    expect(within(dialog).getByText('Last modified (Drive)')).toBeInTheDocument();
    expect(within(dialog).queryByText('Drive modified when checked')).not.toBeInTheDocument();
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

  it('fills unavailable staff facts from newly shared metadata and reuses its first history page', async () => {
    show();
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(identityFact(dialog, 'Last modified by')).toHaveTextContent('editor.secret@example.test'));
    expect(identityFact(dialog, 'Last modified by')).toHaveTextContent('Staff Editor');
    expect(identityFact(dialog, 'Drive owner')).toHaveTextContent('Private Owner');
    expect(identityFact(dialog, 'Drive owner')).toHaveTextContent('owner.secret@example.test');
    expect(getSubmittedFileHistory).toHaveBeenCalledExactlyOnceWith('workspace-it', 'response-1', 'pdf-field-1');
    fireEvent.click(within(dialog).getByRole('tab', { name: 'File history' }));
    expect(await within(dialog).findByRole('group', { name: 'Drive revision 1 on page 1' })).toHaveTextContent('Staff Editor');
    expect(getSubmittedFileHistory).toHaveBeenCalledTimes(1);
  });

  it('renders only backend-verified student matches as separate staff-only name and full unbroken email rows', async () => {
    const ownerEmail = 'very.long.ownername@gmail.com';
    const editorEmail = 'very.long.editorname@university.edu.ph';
    getSubmittedFileHistory.mockResolvedValueOnce({ ...sharedHistory, fileMetadata: {
      ...sharedHistory.fileMetadata,
      driveOwner: 'Untrusted Google Profile Name (unverified@example.test)',
      driveOwnerStudent: { studentName: 'TAGHOY, RON LUIGI F.', email: ownerEmail },
      lastModifiedBy: 'Other Google Profile (other@example.test)',
      lastModifiedByStudent: { studentName: 'PACIO, MURIEL D.', email: editorEmail }
    } });
    show();
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(identityFact(dialog, 'Drive owner')).toHaveTextContent(ownerEmail));

    const owner = identityFact(dialog, 'Drive owner');
    const editor = identityFact(dialog, 'Last modified by');
    expect(owner).toHaveTextContent('TAGHOY, RON LUIGI F.');
    expect(editor).toHaveTextContent('PACIO, MURIEL D.');
    expect(editor).toHaveTextContent(editorEmail);
    expect(owner).not.toHaveTextContent('Untrusted Google Profile Name');
    expect(editor).not.toHaveTextContent('Other Google Profile');
    expect(owner.querySelector('.document-check-identity-email')).toHaveAttribute('title', ownerEmail);
    expect(editor.querySelector('.document-check-identity-email')).toHaveAttribute('title', editorEmail);
    expect(owner.querySelector('.document-check-identity-email').textContent).toBe(`(${ownerEmail})`);
    expect(editor.querySelector('.document-check-identity-email').textContent).toBe(`(${editorEmail})`);
    expect(owner.querySelector('.document-check-identity-email')).toContainHTML('<wbr>');
    expect(editor.querySelector('.document-check-identity-email')).toContainHTML('<wbr>');
    expect(owner).toHaveClass('document-check-fact--identity');
  });

  it('uses same-source observed verified student identity when shared-file metadata does not contain an owner/editor identity', async () => {
    getSubmittedFileHistory.mockResolvedValueOnce({ ...sharedHistory, fileMetadata: {
      createdTime: '2026-09-18T10:00:00+08:00', lastModifiedTime: '2026-09-19T11:00:00+08:00',
      driveOwner: null, lastModifiedBy: null, driveOwnerStudent: null, lastModifiedByStudent: null
    } });
    show({ observedHistory: { observations: [{
      driveOwner: 'Old Provider Owner (old.owner@example.test)',
      modifiedBy: 'Old Provider Editor (old.editor@example.test)',
      driveOwnerStudent: { studentName: 'TAGHOY, RON LUIGI F.', email: 'ron@gmail.com' },
      modifiedByStudent: { studentName: 'PACIO, MURIEL D.', email: 'muriel@gmail.com' }
    }] } });
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(identityFact(dialog, 'Drive owner')).toHaveTextContent('ron@gmail.com'));
    expect(identityFact(dialog, 'Drive owner')).toHaveTextContent('TAGHOY, RON LUIGI F.');
    expect(identityFact(dialog, 'Last modified by')).toHaveTextContent('muriel@gmail.com');
    expect(identityFact(dialog, 'Last modified by')).toHaveTextContent('PACIO, MURIEL D.');
  });

  it('keeps provider-only identity unverified when shared source has no student match, even if an older observed source has one', async () => {
    show({ observedHistory: { observations: [{
      driveOwner: 'Former owner (former@example.test)',
      driveOwnerStudent: { studentName: 'OLD MATCH', email: 'former@example.test' },
      modifiedBy: 'Former editor (former.editor@example.test)',
      modifiedByStudent: { studentName: 'OLD EDITOR', email: 'former.editor@example.test' }
    }] } });
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(identityFact(dialog, 'Drive owner')).toHaveTextContent('owner.secret@example.test'));
    expect(identityFact(dialog, 'Drive owner')).not.toHaveTextContent('OLD MATCH');
    expect(identityFact(dialog, 'Last modified by')).not.toHaveTextContent('OLD EDITOR');
    expect(identityFact(dialog, 'Drive owner')).toHaveTextContent('Private Owner');
    expect(identityFact(dialog, 'Last modified by')).toHaveTextContent('Staff Editor');
  });

  it('shows students created/modified times while preventing owner/editor identity disclosure', async () => {
    show({ audience: 'student' });
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Created time').parentElement).not.toHaveTextContent('Unavailable'));
    expect(within(dialog).getByText('Latest Drive modified (Google metadata)').parentElement).not.toHaveTextContent('Not available');
    expect(within(dialog).queryByText('Drive owner')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Last modified by')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'File history' }));
    expect(await within(dialog).findByRole('group', { name: 'Drive revision 1 on page 1' })).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/owner\.secret@example\.test|editor\.secret@example\.test|Staff Editor|Private Owner/);
    expect(getSubmittedFileHistory).toHaveBeenCalledTimes(1);
  });

  it('never renders matched registered student names or emails in the student-facing result', async () => {
    getSubmittedFileHistory.mockResolvedValueOnce({ ...sharedHistory, fileMetadata: {
      ...sharedHistory.fileMetadata,
      driveOwnerStudent: { studentName: 'PRIVATE OWNER STUDENT', email: 'student.owner@gmail.com' },
      lastModifiedByStudent: { studentName: 'PRIVATE EDITOR STUDENT', email: 'student.editor@gmail.com' }
    } });
    show({ audience: 'student', observedHistory: { observations: [{
      driveOwnerStudent: { studentName: 'OBSERVED OWNER', email: 'observed.owner@gmail.com' },
      modifiedByStudent: { studentName: 'OBSERVED EDITOR', email: 'observed.editor@gmail.com' }
    }] } });
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Created time').parentElement).not.toHaveTextContent('Unavailable'));
    expect(dialog.textContent).not.toMatch(/PRIVATE OWNER STUDENT|PRIVATE EDITOR STUDENT|OBSERVED OWNER|OBSERVED EDITOR|student\.owner@gmail\.com|student\.editor@gmail\.com|observed\.owner@gmail\.com|observed\.editor@gmail\.com/);
    expect(within(dialog).queryByText('Drive owner')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Last modified by')).not.toBeInTheDocument();
  });

  it('opens directly on file history without issuing duplicate first-page requests', async () => {
    show({ initialTab: 'history', audience: 'student' });
    expect(await screen.findByRole('group', { name: 'Drive revision 1 on page 1' })).toBeInTheDocument();
    expect(getSubmittedFileHistory).toHaveBeenCalledExactlyOnceWith('workspace-it', 'response-1', 'pdf-field-1');
  });

  it('discards late shared facts when the selected submitted response changes', async () => {
    let finishOld;
    getSubmittedFileHistory.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ ...sharedHistory, fileMetadata: { createdTime: '2026-09-17T10:00:00+08:00', driveOwner: 'Correct Owner' } });
    const view = show();
    view.rerender(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <DocumentCheckDialog response={{ ...response, id: 'response-2' }} fileLink={fileLink}
        historyTarget={{ ...target, responseId: 'response-2' }} open onClose={vi.fn()} allowRecheck={false} />
    </MantineProvider>);
    expect(await screen.findByText('Correct Owner')).toBeInTheDocument();
    finishOld(sharedHistory);
    expect(screen.queryByText('Private Owner (owner.secret@example.test)')).not.toBeInTheDocument();
  });

  it('refreshes a previously unavailable file after another submitter authorizes Google Drive', async () => {
    getSubmittedFileHistory.mockResolvedValueOnce({ status: 'NOT_CONNECTED', revisions: [], fileMetadata: null })
      .mockResolvedValueOnce(sharedHistory);
    show({ audience: 'student', initialTab: 'history' });
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(/No submitter of this file currently has usable Drive history access/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refresh history' }));
    expect(await within(dialog).findByRole('group', { name: 'Drive revision 1 on page 1' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Check result' }));
    await waitFor(() => expect(within(dialog).getByText('Created time').parentElement).not.toHaveTextContent('Unavailable'));
    expect(dialog.textContent).not.toMatch(/owner\.secret@example\.test|editor\.secret@example\.test|Staff Editor|Private Owner/);
    expect(getSubmittedFileHistory).toHaveBeenCalledTimes(2);
  });

  it('does not prefetch when Document Check is closed', () => {
    show({ open: false });
    expect(getSubmittedFileHistory).not.toHaveBeenCalled();
  });
});

describe('DocumentCheck submission substance', () => {
  beforeEach(() => { getSubmittedFileHistory.mockReset().mockResolvedValue(sharedHistory); });

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
    expect(within(dialog).getByText('View details')).toBeInTheDocument();
    expect(within(dialog).getByText('Official template structure')).not.toBeVisible();

    fireEvent.click(within(dialog).getByText('View details'));
    expect(within(dialog).getByText('Official template structure')).toBeVisible();
    expect(within(dialog).getByText('File validation')).toBeVisible();
  });

  it('shows a concise Needs attention reason without opening detailed evidence', () => {
    const reason = 'The PDF contains too little extractable text across its pages to look substantially filled.';
    show({ documentCheck: report('NEEDS_ATTENTION', reason, {
      redFlags: ['Sparse Content'],
      submissionSubstance: {
        state: 'NEEDS_ATTENTION', reason, reasonCode: 'SPARSE_CONTENT',
        evidence: { templateAvailable: false, textPageRatio: 1, charactersPerTextBearingPage: 120 }
      },
      templateComparison: { available: false }
    }) });
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText('Needs attention')).toBeInTheDocument();
    expect(within(dialog).getByText(reason)).toBeInTheDocument();
    expect(within(dialog).getByText('File validation')).not.toBeVisible();
  });

  it('separates extraction uncertainty from a sparse submission', () => {
    const reason = 'The PDF opens, but there is not enough extractable text to assess whether it is substantially filled.';
    show({ documentCheck: report('COULD_NOT_DETERMINE', reason, {
      redFlags: ['Substance Inconclusive'],
      submissionSubstance: {
        state: 'COULD_NOT_DETERMINE', reason, reasonCode: 'INSUFFICIENT_TEXT_EXTRACTION',
        evidence: { templateAvailable: false, textPageRatio: 0, charactersPerTextBearingPage: 0 }
      },
      templateComparison: { available: false }
    }) });

    expect(within(screen.getByRole('dialog')).getByText('Could not determine')).toBeInTheDocument();
  });

  it('keeps legacy saved reports on the old flag and missing-section fallback', () => {
    const legacy = { ...response.documentCheck, redFlags: [], missingSections: ['Scope'] };
    expect(documentCheckStatus({ ...response, documentCheck: legacy })).toBe('Needs attention');
  });
});
