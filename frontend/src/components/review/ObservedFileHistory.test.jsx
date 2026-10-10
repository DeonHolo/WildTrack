import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ObservedFileHistory } from './ObservedFileHistory.jsx';

describe('recorded file checks', () => {
  it('makes the latest recorded state readable and retains exact hashes behind one disclosure', () => {
    const history = { observations: [
      { changeType: 'FIRST_OBSERVED', firstObservedAt: '2026-09-01T09:00:00Z', contentIdentifier: 'sha256:original', modifiedBy: 'Original editor' },
      { changeType: 'CONTENT_CHANGED', firstObservedAt: '2026-10-01T09:00:00Z', contentIdentifier: 'sha256:changed', modifiedBy: 'Current editor', editorMetadataSource: 'Google Drive File metadata' }
    ] };
    render(<ObservedFileHistory history={history} />);
    const entries = within(screen.getByRole('list', { name: 'Recorded file checks' })).getAllByRole('listitem');
    expect(entries[0]).toHaveTextContent('Content changed');
    expect(entries[0]).toHaveTextContent('Current editor');
    expect(entries[1]).toHaveTextContent('First recorded');
    expect(screen.getByText('sha256:changed')).not.toBeVisible();
    fireEvent.click(screen.getByText('Technical record details'));
    expect(screen.getByText('sha256:changed')).toBeVisible();
    expect(screen.getByText('sha256:original')).toBeVisible();
    expect(screen.getByText('2 entries')).toBeInTheDocument();
    expect(history.observations[0].contentIdentifier).toBe('sha256:original');
  });

  it('handles an empty record list without implying that the PDF was edited', () => {
    render(<ObservedFileHistory history={{ observations: [] }} />);
    expect(screen.getByText(/No recorded checks yet/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('Technical record details')).not.toBeInTheDocument();
  });

  it('shows only the latest three checks and expands older records without losing their evidence', () => {
    const history = { observations: Array.from({ length: 8 }, (_, index) => ({
      firstObservedAt: `2026-10-${String(index + 1).padStart(2, '0')}T09:00:00Z`,
      modifiedBy: `Editor ${index + 1}`, contentIdentifier: `sha256:record-${index + 1}`
    })) };
    render(<ObservedFileHistory history={history} />);
    const recent = within(screen.getByRole('list', { name: 'Recorded file checks' })).getAllByRole('listitem');
    expect(recent).toHaveLength(3);
    expect(recent[0]).toHaveTextContent('Editor 8');
    expect(recent[2]).toHaveTextContent('Editor 6');
    expect(screen.getByText('Editor 1')).not.toBeVisible();
    fireEvent.click(screen.getByText('Earlier checks (5)'));
    expect(within(screen.getByRole('list', { name: 'Earlier recorded file checks' })).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('Editor 1')).toBeVisible();
    fireEvent.click(screen.getByText('Earlier checks (5)'));
    expect(screen.getByText('Editor 1')).not.toBeVisible();
    fireEvent.click(screen.getByText('Technical record details'));
    expect(screen.getByText('sha256:record-1')).toBeVisible();
    expect(history.observations[0].modifiedBy).toBe('Editor 1');
  });
});
