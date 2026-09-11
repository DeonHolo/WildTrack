import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegisterPage } from './RegisterPage.jsx';
import { wildTrackTheme } from '../app/theme.js';
import '../styles/index.css';
import '../styles/wildtrack.css';

vi.mock('../app/WorkspaceSession.jsx', () => ({
  useWorkspaceSession: () => ({ refreshSession: vi.fn() })
}));

describe('RegisterPage layout & responsiveness (ticket 02)', () => {
  it('renders the login banner with accessible artwork and unconstrained footer note', () => {
    const { container } = render(
      <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>
      </MantineProvider>
    );

    const banner = screen.getByRole('region', { name: 'WildTrack sign in banner' });
    expect(banner).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome to WildTrack' })).toBeInTheDocument();

    expect(banner).toHaveClass('wt-form-artwork');
    const art = screen.getByRole('img', { name: 'WildTrack mascot exploring quest nodes' });
    expect(art).toHaveClass('wt-artwork-mascot');
    expect(art).toHaveClass('wt-login-hero-mascot');
    expect(art).not.toHaveClass('wt-login-banner-art');
    expect(art).toHaveStyle('background-image: url("/assets/FIND%20QUEST%20NODES.webp")');
    expect(art).toHaveStyle('background-position: right bottom');
    expect(art).toHaveStyle('background-size: auto 94%');

    const footerNote = container.querySelector('.wt-login-footer-note');
    expect(footerNote).toBeInTheDocument();
    expect(footerNote.textContent).toContain('WildTrack securely identifies submissions using Google Identity Services.');
  });
});

