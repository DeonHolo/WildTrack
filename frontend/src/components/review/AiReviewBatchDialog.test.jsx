import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AiReviewBatchDialog } from './AiReviewBatchDialog.jsx';

it('lists each affected PDF once with its latest artifact record and preserves separate reviews', () => {
  const entry = (key, file, edited, artifactLabel = 'Main PDF') => ({
    target: { responseId: key, fieldId: key }, phase: 'PREPARED', checkedAt: edited,
    preview: { key, category: 'ISSUES', outdated: true,
      sourceUrl: file, modifiedAt: edited, generatedAt: '2026-10-01T10:00:00Z',
      deliverableTitle: 'SRS', studentName: 'Same student', artifactLabel }
  });
  const plan = { state: 'READY', totalPdfs: 3, entries: [
    entry('older-scope', 'https://drive.google.com/file/d/shared/view', '2026-10-10T10:00:00Z', 'Older artifact'),
    entry('latest-scope', 'https://drive.google.com/open?id=shared', '2026-10-14T10:00:00Z', 'Latest artifact'),
    entry('separate-file', 'https://drive.google.com/file/d/different/view', '2026-10-14T09:00:00Z')
  ] };
  const onStart = vi.fn();
  render(<MantineProvider><AiReviewBatchDialog plan={plan} onStart={onStart} onCancel={vi.fn()} /></MantineProvider>);
  expect(screen.getByText('3 unique reviews to run')).toBeVisible();
  const include = screen.getByRole('checkbox', { name: 'Include updated PDFs (2)' });
  expect(include).toBeChecked();
  fireEvent.click(screen.getByText('See affected PDFs'));
  expect(screen.getByText('SRS · Latest artifact — Same student')).toBeVisible();
  expect(screen.queryByText(/Older artifact/)).not.toBeInTheDocument();
  expect(screen.getByText('2 separate artifact or requirements reviews use this PDF.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Start review' }));
  expect(onStart).toHaveBeenCalledWith({ mode: 'ATTENTION', includeOutdated: true, retryAcknowledged: false });
  fireEvent.click(include);
  expect(screen.getByText('0 unique reviews to run')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Start review' })).toBeDisabled();
});
