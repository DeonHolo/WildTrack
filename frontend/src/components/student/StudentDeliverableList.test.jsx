import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { StudentDeliverableList } from './StudentDeliverableList.jsx';

function renderList(rows) {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <StudentDeliverableList rows={rows} workspaceKey="it-it411" studentNumber="26-0001" />
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
        { key: 'pdf', label: 'Framework / Model', typeLabel: 'Google Drive PDF', value: 'https://drive.google.com/file/d/framework/view', reviewablePdf: true, documentCheck: { summary: 'Framework readable.' }, documentCheckStatus: 'Ready for review' }
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
  });
});
