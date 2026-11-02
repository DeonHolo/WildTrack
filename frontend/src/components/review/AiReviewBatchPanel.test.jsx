import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AiReviewBatchPanel } from './AiReviewBatchPanel.jsx';

it('shows a calm automatic waiting state and leaves the stop control available', () => {
  const stop = vi.fn();
  const batch = { state: 'RUNNING', entries: [], selectedDocuments: 18, completedDocuments: 4, totalPdfs: 21,
    message: 'Reviewing', providerWait: { reason: 'MINUTE_BUDGET', retryAt: '2026-11-03T14:00:00Z', inputTokens: 132000 } };
  render(<MantineProvider><AiReviewBatchPanel batch={batch} onStop={stop} /></MantineProvider>);
  expect(screen.getByText('AI Review waiting')).toBeVisible();
  expect(screen.getByText(/batch will continue automatically/)).toBeVisible();
  expect(screen.getByText(/Next attempt after/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Stop after current document' }));
  expect(stop).toHaveBeenCalledOnce();
  expect(screen.queryByText('AI Review paused')).not.toBeInTheDocument();
});
