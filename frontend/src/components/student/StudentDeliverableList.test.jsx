import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { StudentDeliverableList } from './StudentDeliverableList.jsx';

function renderList(rows, scope = {}) {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <StudentDeliverableList rows={rows} workspaceKey="it-it411" studentNumber="26-0001" {...scope} />
    </MantineProvider>
  );
}

function baseRow(overrides = {}) {
  return {
    deliverable: { id: 'd1', slug: 'srs', shortTitle: 'SRS', title: 'SRS Submission', dueAt: '2026-09-30T23:59:00+08:00', trackerColumn: 'SRS' },
    response: { id: 'r1', values: {} },
    recorded: true,
    status: 'Submitted',
    savedAt: '2026-09-19T08:00:00+08:00',
    teamProgress: { submitted: 1, expected: 1 },
    feedback: null,
    fileCheck: { label: 'File accessible', summary: 'Readable.', tone: 'success' },
    ...overrides
  };
}

describe('StudentDeliverableList artifacts', () => {
  it('uses compact explicit accessible filter buttons for all/to-submit/submitted, with no segmented slider', () => {
    const submitted = baseRow();
    const missing = baseRow({
      deliverable: { id: 'd2', slug: 'sdd', shortTitle: 'SDD', title: 'SDD Submission', dueAt: '2026-10-10T23:59:00+08:00', trackerColumn: 'SDD' },
      status: 'Not submitted', recorded: false, response: null, savedAt: '', link: '',
      fileCheck: { label: 'Not submitted', summary: 'No response has been recorded.', tone: 'neutral' }
    });
    const secondSubmitted = baseRow({
      deliverable: { id: 'd3', slug: 'spmp', shortTitle: 'SPMP', title: 'SPMP Submission', dueAt: '2026-10-12T23:59:00+08:00', trackerColumn: 'SPMP' }
    });
    renderList([submitted, missing, secondSubmitted]);
    const filter = screen.getByRole('group', { name: 'Filter deliverables' });
    expect(filter).not.toHaveTextContent('Show deliverables');
    expect(filter.querySelector('.mantine-SegmentedControl-root')).not.toBeInTheDocument();
    expect(within(filter).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('list', { name: 'Your deliverables' })).getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(within(filter).getByRole('button', { name: 'To submit' }));
    expect(within(filter).getByRole('button', { name: 'To submit' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(filter).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(screen.getByRole('list', { name: 'Your deliverables' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('SDD Submission')).toBeInTheDocument();
    fireEvent.click(within(filter).getByRole('button', { name: 'Submitted' }));
    expect(within(filter).getByRole('button', { name: 'Submitted' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('list', { name: 'Your deliverables' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('SDD Submission')).not.toBeInTheDocument();
  });

  it('opens team progress with only not-submitted teammates and no peer files or account data', async () => {
    renderList([baseRow({ teamProgress: { submitted: 2, expected: 4,
      members: [
        { studentNumber: '26-0001', name: 'Alice', submitted: true },
        { studentNumber: '26-0002', name: 'Brandon', submitted: false, email: 'private@school.edu', link: 'https://drive.google.com/file/d/secret/view' },
        { studentNumber: '26-0003', name: 'Cora', submitted: true },
        { studentNumber: '26-0004', name: 'Dario', submitted: false }
      ] } } )]);
    const progressButton = screen.getByRole('button', { name: /2 of 4 team members submitted.*view teammates not submitted/i });
    expect(progressButton).toHaveTextContent('2 of 4 team members submitted');
    fireEvent.click(progressButton);
    const modal = await screen.findByRole('dialog', { name: 'Team submission progress' });
    expect(within(modal).getByText('SRS Submission')).toBeInTheDocument();
    expect(within(modal).getByText('Teammates who have not submitted')).toBeInTheDocument();
    expect(within(modal).getByText('Brandon')).toBeInTheDocument();
    expect(within(modal).getByText('Dario')).toBeInTheDocument();
    expect(within(modal).queryByText('Alice')).not.toBeInTheDocument();
    expect(within(modal).queryByText('Cora')).not.toBeInTheDocument();
    expect(modal).toHaveTextContent('Submission means a response was recorded');
    expect(modal.textContent).not.toMatch(/private@school\.edu|26-0002|26-0004|drive\.google\.com|secret/);
    expect(within(modal).queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: 'Close team submission progress' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Team submission progress' })).not.toBeInTheDocument());
  });

  it('does not offer a teammate modal when all team members submitted or no safe scoped roster is available', () => {
    const complete = baseRow({ teamProgress: { submitted: 2, expected: 2, members: [
      { studentNumber: '26-0001', name: 'Alice', submitted: true },
      { studentNumber: '26-0002', name: 'Brandon', submitted: true }
    ] } });
    const legacy = baseRow({ deliverable: { ...complete.deliverable, id: 'd2', title: 'Legacy deliverable' },
      teamProgress: { submitted: 1, expected: 2 } });
    renderList([complete, legacy]);
    expect(screen.getByText('All 2 team members submitted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view teammates not submitted/i })).not.toBeInTheDocument();
  });

  it('closes old teammate details when the student or workspace changes without exposing the old team', async () => {
    const previous = baseRow({ teamProgress: { submitted: 0, expected: 2, members: [
      { studentNumber: '26-0001', name: 'Old student', submitted: false },
      { studentNumber: '26-0002', name: 'Old teammate', submitted: false }
    ] } });
    const view = renderList([previous], { workspaceId: 'workspace-old' });
    fireEvent.click(screen.getByRole('button', { name: /view teammates not submitted/i }));
    expect(await screen.findByRole('dialog', { name: 'Team submission progress' })).toHaveTextContent('Old teammate');
    view.rerender(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <StudentDeliverableList rows={[baseRow({ teamProgress: { submitted: 1, expected: 2, members: [
        { studentNumber: '27-0001', name: 'New student', submitted: true },
        { studentNumber: '27-0002', name: 'New teammate', submitted: false }
      ] } })]} workspaceId="workspace-new" workspaceKey="new-workspace" studentNumber="27-0001" />
    </MantineProvider>);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Team submission progress' })).not.toBeInTheDocument());
    expect(screen.queryByText('Old teammate')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /view teammates not submitted/i }));
    expect(await screen.findByRole('dialog', { name: 'Team submission progress' })).toHaveTextContent('New teammate');
    expect(screen.queryByText('Old teammate')).not.toBeInTheDocument();
  });

  it('removes duplicate due-date tracker suffix and effective submission but retains Saved and lateness badge', () => {
    renderList([baseRow({ response: { id: 'r1', values: {}, timing: {
      effectiveSubmittedAt: '2026-09-20T08:00:00+08:00', effectiveReason: 'Initial submission',
      late: true, daysLate: 1
    } } })]);
    expect(screen.getByText('Due Sep 30, 2026')).toBeInTheDocument();
    expect(screen.queryByText(/Due Sep 30, 2026\s*\|/)).not.toBeInTheDocument();
    expect(screen.getByText(/Saved Sep 19, 2026/)).toBeInTheDocument();
    expect(screen.getByText('1 day late')).toBeInTheDocument();
    expect(screen.queryByText(/Effective submission/)).not.toBeInTheDocument();
  });

  it('hides redundant readable/template-upload advice only for accessible files while retaining actionable warnings', () => {
    const success = baseRow({ fileCheck: { label: 'File accessible', tone: 'success',
      summary: 'The PDF is readable. Upload an official template to enable instruction and template comparison.' } });
    const warning = baseRow({ deliverable: { ...success.deliverable, id: 'd2', title: 'Attention deliverable' },
      fileCheck: { label: 'File needs attention', tone: 'warning',
        summary: 'The PDF is unreadable; please correct the sharing permissions.' } });
    const meaningful = baseRow({ deliverable: { ...success.deliverable, id: 'd3', title: 'Useful detail deliverable' },
      fileCheck: { label: 'File accessible', tone: 'success',
        summary: 'The PDF is readable. The template comparison detected missing required sections.' } });
    renderList([success, warning, meaningful]);
    expect(screen.getAllByText('File accessible')).toHaveLength(2);
    expect(screen.queryByText(/Upload an official template/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^The PDF is readable\./)).not.toBeInTheDocument();
    expect(screen.getByText('The PDF is unreadable; please correct the sharing permissions.')).toBeInTheDocument();
    expect(screen.getByText('The template comparison detected missing required sections.')).toBeInTheDocument();
  });

  it('keeps single-artifact Open file and View Document Check row actions', () => {
    renderList([baseRow({
      link: 'https://drive.google.com/file/d/single/view',
      documentCheck: { summary: 'Readable.' },
      artifacts: [{ key: 'pdf', label: 'SRS PDF', typeLabel: 'Google Drive PDF', value: 'https://drive.google.com/file/d/single/view', reviewablePdf: true, documentCheck: { summary: 'Readable.' }, documentCheckStatus: 'Ready for review' }]
    })]);

    expect(screen.getByRole('link', { name: 'Open file' })).toHaveAttribute('href', 'https://drive.google.com/file/d/single/view');
    expect(screen.getByRole('button', { name: 'View Document Check' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View submitted artifacts' })).not.toBeInTheDocument();
  });

  it('replaces row-level file/check actions with one multi-artifact modal trigger', async () => {
    renderList([baseRow({
      link: '',
      documentCheck: null,
      fileCheck: { label: 'Checks pending', summary: 'One or more checks are pending.', tone: 'neutral' },
      artifacts: [
        { key: 'form', label: 'Validation Instrument', typeLabel: 'Google Form', value: 'docs.google.com/forms/d/e/example/viewform', reviewablePdf: false, documentCheck: null, documentCheckStatus: 'Not applicable' },
        { key: 'pdf', label: 'Framework / Model', typeLabel: 'Google Drive PDF', value: 'https://drive.google.com/file/d/framework/view', reviewablePdf: true, documentCheck: { summary: 'The PDF is readable. Upload an official template to enable instruction and template comparison.' }, documentCheckStatus: 'Ready for review' }
      ]
    })]);

    expect(screen.queryByRole('link', { name: 'Open file' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View Document Check' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View submitted artifacts' }));

    const modal = await screen.findByRole('dialog', { name: 'Submitted artifacts' });
    expect(within(modal).getByRole('group', { name: 'Validation Instrument artifact' })).toHaveTextContent('Google Form');
    expect(within(modal).getByRole('link', { name: 'Open Validation Instrument' })).toHaveAttribute('href', 'https://docs.google.com/forms/d/e/example/viewform');
    const pdf = within(modal).getByRole('group', { name: 'Framework / Model artifact' });
    expect(within(pdf).getByRole('link', { name: 'Open Framework / Model' })).toHaveAttribute('href', 'https://drive.google.com/file/d/framework/view');
    expect(within(pdf).getByRole('button', { name: 'View Document Check' })).toBeInTheDocument();
    expect(pdf).not.toHaveTextContent('Upload an official template');
    expect(pdf).not.toHaveTextContent('The PDF is readable');
  });
});
