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
