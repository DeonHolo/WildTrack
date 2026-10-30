import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { ConfirmDialog, StatusIndicator } from './ui.jsx';

function renderStatus(status) {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <StatusIndicator status={status} />
    </MantineProvider>
  );
}

describe('shared status indicator', () => {
  it.each([
    ['Ready for review', 'Looks filled', 'success'],
    ['Looks substantially filled', 'Looks filled', 'success'],
    ['Looks filled', 'Looks filled', 'success'],
    ['Needs manual verification', 'Needs attention', 'warning'],
    ['Check in PDF', 'Needs attention', 'warning'],
    ['No issues', 'No issues', 'success'],
    ['Needs attention', 'Needs attention', 'warning'],
    ['Retry required', 'Retry required', 'warning']
  ])('displays %s as %s without changing its meaning or tone', (status, label, tone) => {
    renderStatus(status);
    expect(screen.getByText(label).parentElement).toHaveAttribute('data-tone', tone);
    if (status !== label) expect(screen.queryByText(status)).not.toBeInTheDocument();
  });

  it('shows a complete status with text and a non-verbal semantic marker', () => {
    const { container } = renderStatus('Published');

    const label = screen.getByText('Published');
    expect(label.parentElement).toHaveAttribute('data-tone', 'success');
    expect(label.parentElement).toHaveClass('wt-status-indicator');
    expect(container.querySelector('.wt-status-indicator-dot')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.mantine-Badge-root')).not.toBeInTheDocument();
  });

  it('keeps inactive and pending statuses visually neutral or cautionary', () => {
    const { rerender } = renderStatus('Not checked');
    expect(screen.getByText('Not checked').parentElement).toHaveAttribute('data-tone', 'neutral');

    rerender(
      <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
        <StatusIndicator status="Starter data" />
      </MantineProvider>
    );
    expect(screen.getByText('Starter data').parentElement).toHaveAttribute('data-tone', 'warning');

    rerender(
      <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
        <StatusIndicator status="No file link" />
      </MantineProvider>
    );
    expect(screen.getByText('No file link').parentElement).toHaveAttribute('data-tone', 'danger');
  });
});

describe('shared confirmation dialog', () => {
  it('can pause confirmation without locking the cancel action', () => {
    render(
      <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
        <ConfirmDialog
          open
          title="Check first"
          confirmLabel="Archive anyway"
          confirmDisabled
          onConfirm={() => {}}
          onClose={() => {}}
        />
      </MantineProvider>
    );

    expect(screen.getByRole('button', { name: 'Archive anyway' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});
