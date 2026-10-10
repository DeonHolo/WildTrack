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
});
