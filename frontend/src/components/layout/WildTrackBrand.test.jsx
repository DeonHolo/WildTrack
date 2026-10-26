import React from 'react';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { WildTrackBrand } from './WildTrackBrand.jsx';

describe('WildTrackBrand', () => {
  it('does not render the default operations subtitle when the shell suppresses it', () => {
    render(<MantineProvider><MemoryRouter><WildTrackBrand subtitle={null} /></MemoryRouter></MantineProvider>);

    expect(screen.getByText('WildTrack')).toBeInTheDocument();
    expect(screen.queryByText('Capstone operations')).not.toBeInTheDocument();
  });

  it('preserves the adviser subtitle', () => {
    render(<MantineProvider><MemoryRouter><WildTrackBrand subtitle="Adviser workspace" /></MemoryRouter></MantineProvider>);

    expect(screen.getByText('Adviser workspace')).toBeInTheDocument();
  });
});
