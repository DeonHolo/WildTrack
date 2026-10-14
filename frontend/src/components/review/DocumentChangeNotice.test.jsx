import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentChangeNotice } from './DocumentChangeNotice.jsx';
import { documentChangeAcknowledgementKey } from '../../lib/documentChangeAcknowledgement.js';

const state = vi.hoisted(() => ({ session: null, resourceCache: null }));
const api = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock('../../app/WorkspaceSession.jsx', () => ({ useWorkspaceSession: () => state }));
vi.mock('../../lib/api.js', () => ({
  getWorkTaskDismissals: (...args) => api.read(...args),
  dismissWorkTask: (...args) => api.save(...args)
}));
const target = { workspaceId: 'workspace-a', responseId: 'response-a', fieldId: 'field-a' };
const observation = { firstObservedAt: '2026-10-13T18:20:51Z', contentIdentifier: 'md5:changed', fileId: 'file-a' };
const key = documentChangeAcknowledgementKey(target, observation);
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function tree(props = {}) { return <MantineProvider><DocumentChangeNotice observation={observation} target={target} {...props} /></MantineProvider>; }
beforeEach(() => {
  state.session = { authenticated: true, email: 'first@example.test', googleSubject: 'first', roles: ['ADMIN'] };
  const cached = new Map();
  state.resourceCache = { read: k => cached.get(k), write: (k, value) => cached.set(k, value),
    load: (_k, load) => load(), clear: () => cached.clear() };
  api.read.mockReset(); api.save.mockReset().mockResolvedValue(null);
});

describe('acknowledgment first render and operation isolation', () => {
  it('never renders the attention notice while an existing receipt read is unresolved', async () => {
    const pending = deferred(); api.read.mockReturnValue(pending.promise);
    render(tree());
    expect(screen.queryByText('PDF content changed')).not.toBeInTheDocument();
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: 'Acknowledge change' })).not.toBeInTheDocument();
    await act(async () => pending.resolve([key]));
    expect(screen.queryByText('PDF content changed')).not.toBeInTheDocument();
  });

  it('shows a real unacknowledged change only after the receipt read resolves', async () => {
    const pending = deferred(); api.read.mockReturnValue(pending.promise);
    render(tree());
    expect(screen.queryByText('PDF content changed')).not.toBeInTheDocument();
    await act(async () => pending.resolve([]));
    expect(screen.getByText('PDF content changed')).toBeInTheDocument();
  });

  it('retains a saved receipt on remount while the next GET is pending', async () => {
    api.read.mockResolvedValueOnce([]);
    const first = render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Acknowledge change', exact: true }));
    const modal = screen.getByRole('dialog', { name: 'Acknowledge this PDF change?' });
    fireEvent.click(within(modal).getByRole('button', { name: 'Acknowledge change' }));
    await waitFor(() => expect(screen.queryByText('PDF content changed')).not.toBeInTheDocument());
    first.unmount();
    api.read.mockReturnValue(new Promise(() => {}));
    render(tree());
    expect(screen.queryByText('PDF content changed')).not.toBeInTheDocument();
  });

  it('does not reuse another account receipt and ignores its late GET', async () => {
    const old = deferred(), next = deferred();
    api.read.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const view = render(tree());
    state.session = { ...state.session, email: 'second@example.test', googleSubject: 'second' };
    view.rerender(tree());
    await act(async () => old.resolve([key]));
    expect(screen.queryByText('PDF content changed')).not.toBeInTheDocument();
    await act(async () => next.resolve([]));
    expect(screen.getByText('PDF content changed')).toBeInTheDocument();
  });

  it('does not apply a late save after artifact A to B to A', async () => {
    api.read.mockResolvedValue([]);
    const saving = deferred(); api.save.mockReturnValue(saving.promise);
    const view = render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Acknowledge change', exact: true }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Acknowledge change' }));
    view.rerender(tree({ target: { ...target, fieldId: 'field-b' } }));
    view.rerender(tree());
    await act(async () => saving.resolve(null));
    expect(screen.getByText('PDF content changed')).toBeInTheDocument();
  });

  it('a read started before saving cannot resurrect the acknowledged notice', async () => {
    api.read.mockResolvedValueOnce([]);
    render(tree());
    await screen.findByText('PDF content changed');
    const oldRead = deferred(); api.read.mockReturnValueOnce(oldRead.promise);
    await act(async () => window.dispatchEvent(new Event('wildtrack:refresh-resources')));
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge change', exact: true }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Acknowledge change' }));
    await waitFor(() => expect(screen.queryByText('PDF content changed')).not.toBeInTheDocument());
    await act(async () => oldRead.resolve([]));
    expect(screen.queryByText('PDF content changed')).not.toBeInTheDocument();
  });

  it('shows an actionable load error instead of pretending the receipt is unacknowledged', async () => {
    api.read.mockRejectedValue(new Error('Read failed'));
    render(tree());
    expect(await screen.findByText('Change acknowledgement unavailable')).toBeInTheDocument();
    expect(screen.queryByText('PDF content changed')).not.toBeInTheDocument();
    api.read.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('PDF content changed')).toBeInTheDocument();
  });
});
