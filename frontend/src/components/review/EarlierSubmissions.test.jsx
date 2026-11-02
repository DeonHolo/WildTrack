import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EarlierSubmissions } from './EarlierSubmissions.jsx';
const api = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ getEarlierSubmissions: (...args) => api.history(...args) }));
it('loads earlier accounts only when expanded and makes their original answers available', async () => {
  api.history.mockResolvedValue([{ id: 'old', googleEmail: 'old@test.invalid', updatedAt: '2026-09-19T00:16:51Z',
    valuesJson: JSON.stringify({ pdf: 'https://drive.google.com/file/d/old/view', note: 'Earlier answer' }) }]);
  render(<MantineProvider><EarlierSubmissions workspaceId="workspace" responseId="latest" fields={[{ id: 'pdf', label: 'SRS PDF' }]} /></MantineProvider>);
  expect(api.history).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Earlier submissions'));
  expect(await screen.findByText('old@test.invalid')).toBeVisible();
  expect(api.history).toHaveBeenCalledWith('workspace', 'latest');
  expect(screen.getByText('Earlier answer')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open submitted file or link' })).toHaveAttribute('href', 'https://drive.google.com/file/d/old/view');
});

it('shows field labels and selected option labels for earlier form definitions', async () => {
  api.history.mockResolvedValue([{ id: 'old-options', googleEmail: 'old@test.invalid',
    valuesJson: JSON.stringify({ 'field-old-step': 'old-option', retiredChecks: ['first', 'second'] }) }]);
  render(<MantineProvider><EarlierSubmissions workspaceId="workspace" responseId="latest-options" fields={[
    { id: 'validationStep', definitionId: 'field-old-step', label: 'Validation Step', options: [{ id: 'old-option', label: 'MVP Validation' }] },
    { id: 'retiredChecks', label: 'Selected activities', options: [{ id: 'first', label: 'Survey' }, { id: 'second', label: 'Interview' }] }
  ]} /></MantineProvider>);
  fireEvent.click(screen.getByText('Earlier submissions'));
  expect(await screen.findByText('Validation Step:')).toBeVisible();
  expect(screen.getByText('MVP Validation')).toBeVisible();
  expect(screen.getByText('Survey, Interview')).toBeVisible();
  expect(screen.queryByText(/field-old-step:|old-option/)).not.toBeInTheDocument();
});
