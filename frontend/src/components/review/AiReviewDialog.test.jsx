import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AiReviewDialog } from './AiReviewDialog.jsx';
import { aiReviewStatus } from '../../lib/workflow.js';

const responses = [{ id: 'active', archiveStatus: 'Not Archived' }, { id: 'archived', archiveStatus: 'Archived' }];
function show(props = {}) {
  const onConfirm = vi.fn();
  render(<MantineProvider><AiReviewDialog responses={responses} excludeArchived onCancel={() => {}} {...props} onConfirm={onConfirm} /></MantineProvider>);
  return onConfirm;
}

it('excludes archived submissions from an all-documents review by default', () => {
  const confirm = show();
  expect(screen.getByLabelText('Include archived submissions (1)')).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Start review' }));
  expect(confirm).toHaveBeenCalledWith(['active']);
});

it('includes archived submissions only after an explicit selection', () => {
  const confirm = show();
  fireEvent.click(screen.getByLabelText('Include archived submissions (1)'));
  fireEvent.click(screen.getByRole('button', { name: 'Start review' }));
  expect(confirm).toHaveBeenCalledWith(['active', 'archived']);
});

it('disables an empty batch and allows explicitly including an archived-only batch', () => {
  show({ responses: [responses[1]] });
  expect(screen.getByRole('button', { name: 'Start review' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Include archived submissions (1)'));
  expect(screen.getByRole('button', { name: 'Start review' })).toBeEnabled();
});

it('keeps retries explicit with short footer labels and a visible cost explanation', () => {
  const confirm = show({ retry: true, excludeArchived: false });
  expect(confirm).not.toHaveBeenCalled();
  expect(screen.getByText(/Previous attempts may already have used tokens/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry reviews' }));
  expect(confirm).toHaveBeenCalledWith(['active', 'archived']);
});

it('warns about retry cost in a mixed batch without treating fresh reviews as retries', () => {
  const confirm = show({ excludeArchived: false, retryTokens: { active: 'retry-token' } });
  expect(screen.getByText(/1 review needs an explicit retry/)).toBeInTheDocument();
  expect(screen.getByText(/Other selected responses will start normally/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Start / retry reviews' }));
  expect(confirm).toHaveBeenCalledWith(['active', 'archived']);
});

it('distinguishes uncertain and running reviews without attaching stale state to a changed response', () => {
  expect(aiReviewStatus({ aiReviewState: { status: 'UNCERTAIN' } })).toBe('Retry required');
  expect(aiReviewStatus({ aiReviewState: { status: 'RUNNING' } })).toBe('Reviewing');
  expect(aiReviewStatus({ updatedAt: 'new', aiReviewState: { status: 'UNCERTAIN', sourceResponseUpdatedAt: 'old' } })).toBe('Not reviewed');
});
