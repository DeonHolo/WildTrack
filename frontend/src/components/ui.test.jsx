import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { StatusIndicator } from './ui.jsx';

function renderStatus(status) {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <StatusIndicator status={status} />
    </MantineProvider>
  );
}

describe('shared status indicator', () => {
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
