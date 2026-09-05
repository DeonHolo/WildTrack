import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegisterPage } from './RegisterPage.jsx';
import { wildTrackTheme } from '../app/theme.js';
import '../styles/index.css';
import '../styles/wildtrack.css';

const workflow = vi.hoisted(() => ({
  authenticateGoogleAccount: vi.fn(),
  state: { activeAccountEmail: '' }
}));

vi.mock('../app/WorkflowContext.jsx', () => ({
  useWorkflow: () => workflow
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

    const art = container.querySelector('.wt-login-banner-art');
    expect(art).toBeInTheDocument();
    expect(art).toHaveAttribute('role', 'img');

    const footerNote = container.querySelector('.wt-login-footer-note');
    expect(footerNote).toBeInTheDocument();
    expect(footerNote.textContent).toContain('WildTrack securely identifies submissions using Google Identity Services.');
  });
});

