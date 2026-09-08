import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { FormsPage } from './FormsPage.jsx';
import { WorkspaceSessionProvider, useWorkspaceSession } from '../app/WorkspaceSession.jsx';

const payload = {
  deliverables: [{ id: 'form', slug: 'srs', title: 'Ready to publish', trackerColumnKey: 'SRS', status: 'PUBLISHED' }],
  trackerColumns: [{ columnKey: 'SRS', label: 'SRS', active: true }],
  responses: [{ id: 'slow-response', deliverableId: 'form', valuesJson: '{}' }]
};

function installApi(load) {
  const identity = { authenticated: true, email: 'admin@forms.test', roles: ['ADMIN'] };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (String(url).includes('/auth/session')) return Response.json(identity);
    if (String(url).endsWith('/workspaces')) return Response.json([{ id: 'forms-test', publicKey: 'forms-test' }]);
    if (String(url).includes('/monitoring')) return load();
    return new Promise(() => {});
  });
  return identity;
}

function SessionActions() {
  const { refreshSession } = useWorkspaceSession();
  return <button onClick={refreshSession}>Refresh session</button>;
}

function Journey() {
  const [show, setShow] = useState(true);
  return <MantineProvider><ModalsProvider><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><WorkspaceSessionProvider>
    <SessionActions />
    <button onClick={() => setShow(value => !value)}>Toggle Forms</button>
    {show ? <FormsPage /> : <p>Other page</p>}
  </WorkspaceSessionProvider></MemoryRouter></ModalsProvider></MantineProvider>;
}

afterEach(() => vi.restoreAllMocks());

it('lists published forms while unrelated response detail requests remain unresolved', async () => {
  installApi(async () => Response.json(payload));
  render(<Journey />);
  expect(await screen.findByRole('button', { name: 'Edit SRS form' })).toBeEnabled();
});

it('shows the loaded forms immediately on return while a new request is pending', async () => {
  const load = vi.fn().mockResolvedValueOnce(Response.json(payload)).mockImplementation(() => new Promise(() => {}));
  installApi(load);
  render(<Journey />);
  await screen.findByRole('button', { name: 'Edit SRS form' });
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Forms' }));
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Forms' }));
  expect(screen.getByRole('button', { name: 'Edit SRS form' })).toBeEnabled();
});

it('preserves a server-confirmed edit across a late read and return navigation', async () => {
  let finishRead;
  const load = vi.fn().mockResolvedValueOnce(Response.json(payload))
    .mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }))
    .mockImplementation(() => new Promise(() => {}));
  installApi(load);
  const originalFetch = globalThis.fetch.getMockImplementation();
  globalThis.fetch.mockImplementation((url, options) => {
    if (String(url).includes('/deliverables/form') && options?.method === 'PUT') {
      return Promise.resolve(Response.json({ ...payload.deliverables[0], title: 'Saved on server' }));
    }
    return originalFetch(url, options);
  });
  render(<Journey />);
  await screen.findByText('Ready to publish');
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: 'Edit SRS form' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Form title' }), { target: { value: 'Saved on server' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Saved on server');
  await act(async () => { finishRead(Response.json(payload)); });
  expect(screen.queryByText('Ready to publish')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Forms' }));
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Forms' }));
  expect(screen.getByText('Saved on server')).toBeInTheDocument();
});

it('retains forms on a failed refresh, labels them as old, and retries successfully', async () => {
  const load = vi.fn().mockResolvedValueOnce(Response.json(payload))
    .mockResolvedValueOnce(Response.json({ error: 'Temporary outage' }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ...payload, deliverables: [{ ...payload.deliverables[0], title: 'Updated form' }] }));
  installApi(load);
  render(<Journey />);
  await screen.findByText('Ready to publish');
  act(() => window.dispatchEvent(new Event('focus')));
  expect(await screen.findByRole('alert', { name: 'Form error' })).toHaveTextContent('Temporary outage');
  expect(screen.getByText('Ready to publish')).toBeInTheDocument();
  expect(screen.getByText(/Showing previously loaded forms/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading forms' }));
  expect(await screen.findByText('Updated form')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('alert', { name: 'Form error' })).not.toBeInTheDocument());
});

it('clears cached forms on forbidden refresh and does not resurrect them during retry or return', async () => {
  const load = vi.fn().mockResolvedValueOnce(Response.json(payload))
    .mockResolvedValueOnce(Response.json({ error: 'Access revoked' }, { status: 403 }))
    .mockImplementation(() => new Promise(() => {}));
  installApi(load);
  render(<Journey />);
  await screen.findByText('Ready to publish');
  fireEvent.click(screen.getByRole('button', { name: 'Edit SRS form' }));
  await screen.findByRole('dialog', { name: 'Edit SRS form' });
  act(() => window.dispatchEvent(new Event('focus')));
  await screen.findByText('Access revoked');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit SRS form' })).not.toBeInTheDocument());
  expect(screen.queryByText('Ready to publish')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading forms' }));
  expect(screen.queryByText('Ready to publish')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Forms' }));
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Forms' }));
  expect(screen.queryByText('Ready to publish')).not.toBeInTheDocument();
});

it('renders an initial error with Retry instead of an empty result', async () => {
  const load = vi.fn().mockResolvedValueOnce(Response.json({ error: 'Initial outage' }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ...payload, deliverables: [] }));
  installApi(load);
  render(<Journey />);
  await screen.findByText('Initial outage');
  expect(screen.queryByText('0 forms')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading forms' }));
  expect(await screen.findByText('0 forms')).toBeInTheDocument();
});

it('expires retained forms after a minute without treating them as current on return', async () => {
  installApi(vi.fn().mockResolvedValueOnce(Response.json(payload)).mockImplementation(() => new Promise(() => {})));
  render(<Journey />);
  await screen.findByText('Ready to publish');
  const later = Date.now() + 60_001;
  vi.spyOn(Date, 'now').mockReturnValue(later);
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Forms' }));
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Forms' }));
  expect(screen.queryByText('Ready to publish')).not.toBeInTheDocument();
});

it('clears cached private forms across sign-out and sign-in even for the same email', async () => {
  const identity = installApi(vi.fn().mockResolvedValueOnce(Response.json(payload)).mockImplementation(() => new Promise(() => {})));
  render(<Journey />);
  await screen.findByText('Ready to publish');
  identity.authenticated = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh session' }));
  await waitFor(() => expect(screen.queryByText('Ready to publish')).not.toBeInTheDocument());
  identity.authenticated = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh session' }));
  await screen.findByRole('status', { name: 'Loading published forms' });
  expect(screen.queryByText('Ready to publish')).not.toBeInTheDocument();
});
