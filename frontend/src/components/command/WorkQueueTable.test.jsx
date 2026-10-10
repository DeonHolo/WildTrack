import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { formatDateTime } from '../../lib/workflow.js';
import { WorkQueueTable } from './WorkQueueTable.jsx';

function renderTasks(tasks) {
  render(<MantineProvider theme={wildTrackTheme} forceColorScheme="light">
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <WorkQueueTable tasks={tasks} />
    </MemoryRouter>
  </MantineProvider>);
  return within(screen.getByRole('table', { name: "Today's work queue" }));
}

function task(overrides = {}) {
  return { id: 'review-1', category: 'review', type: 'Review decision', title: 'Student A | SRS',
    detail: 'Needs a staff decision.', teamCode: 'TEAM-1', deliverableCode: 'SRS', action: 'review',
    actionLabel: 'Review response', actionAriaLabel: 'Review Student A response', ...overrides };
}

describe('work queue activity display', () => {
  it.each(['2026-10-10T08:00:00Z', 0])('retains the Updated label and renders the recorded activity date: %j', (updatedAt) => {
    const queue = renderTasks([task({ updatedAt })]);
    expect(queue.getByRole('columnheader', { name: 'Updated' })).toBeInTheDocument();
    expect(queue.getByText(formatDateTime(new Date(updatedAt)))).toBeInTheDocument();
  });

  it.each([undefined, null, '', 'not a date'])('labels unavailable response activity without calling it an import: %j', (updatedAt) => {
    const queue = renderTasks([task({ updatedAt })]);
    expect(queue.getByText('Not recorded')).toBeInTheDocument();
    expect(queue.queryByText('Current import')).not.toBeInTheDocument();
    expect(queue.getByRole('button', { name: 'Review Student A response' })).toBeEnabled();
  });

  it('uses Current import only for an actual import warning without a date', () => {
    const queue = renderTasks([
      task({ id: 'import-1', category: 'workspace', type: 'Import warning', action: undefined,
        title: 'Tracker import needs attention', href: '/workspace?source=tracker', actionLabel: 'Open import' }),
      task({ id: 'identity-1', category: 'identity', type: 'Identity conflict', title: 'Identity needs attention' })
    ]);
    expect(queue.getAllByText('Current import')).toHaveLength(1);
    expect(queue.getAllByText('Not recorded')).toHaveLength(1);
  });
});
