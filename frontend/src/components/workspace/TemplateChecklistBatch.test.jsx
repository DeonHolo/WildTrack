import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateChecklistBatch } from './TemplateChecklistBatch.jsx';

const api = vi.hoisted(() => ({ get: vi.fn(), prepare: vi.fn() }));
vi.mock('../../lib/api.js', () => ({
  getTemplateChecklistBatch: (...args) => api.get(...args),
  prepareTemplateChecklistBatch: (...args) => api.prepare(...args),
  getDocumentTemplatePreviewUrl: (ws, id) => `/templates/${id}/preview?workspaceId=${ws}`
}));
const row = (id, state = 'UNPREPARED', pdfState = 'READY') => ({ templateId: id, versionId: `v-${id}`, revision: state === 'UNPREPARED' ? 0 : 2, title: `Template ${id}`, state, pdfState });
const items = [row('new'), row('failed', 'FAILED'), row('draft', 'DRAFT'), row('approved', 'APPROVED'), row('pdf', 'UNPREPARED', 'FAILED')];
const tree = (workspaceId = 'workspace-a') => <MantineProvider><TemplateChecklistBatch workspaceId={workspaceId}><button>Add official template</button></TemplateChecklistBatch></MantineProvider>;
async function open() {
  fireEvent.click(await screen.findByRole('button', { name: 'Prepare AI drafts' }));
  await screen.findByText('1 template draft to prepare');
  return screen.getByRole('dialog');
}
describe('template checklist batch', () => {
  beforeEach(() => { api.get.mockReset().mockResolvedValue(items); api.prepare.mockReset(); });
  it('requires confirmation, preserves existing checklists and excludes unready PDFs', async () => {
    render(tree()); const dialog = await open();
    expect(within(dialog).getByRole('checkbox', { name: 'Template new' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Template failed' })).not.toBeChecked();
    for (const id of ['draft', 'approved', 'pdf']) expect(within(dialog).getByRole('checkbox', { name: `Template ${id}` })).toBeDisabled();
    expect(within(dialog).getByText(/does not review student submissions or approve/)).toBeInTheDocument();
    expect(api.prepare).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close', exact: true }));
    expect(api.prepare).not.toHaveBeenCalled();
  });
  it('queues one confirmed selection and shows server progress without another AI request', async () => {
    api.prepare.mockResolvedValue(items.map(item => item.templateId === 'new' ? { ...item, state: 'QUEUED', revision: 1 } : item));
    render(tree()); const dialog = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Prepare drafts' }));
    await screen.findByText('Preparing template AI drafts');
    expect(api.prepare).toHaveBeenCalledExactlyOnceWith('workspace-a', [{ templateId: 'new', versionId: 'v-new', expectedRevision: 0 }]);
    expect(screen.getByText(/You can leave this page/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check saved drafts' }));
    await screen.findByText('Template preparation needs attention');
    expect(api.prepare).toHaveBeenCalledTimes(1);
  });
  it('requires a separate acknowledgement for failed preparation retries', async () => {
    api.prepare.mockResolvedValue(items);
    render(tree()); const dialog = await open();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Template failed' }));
    expect(within(dialog).getByRole('button', { name: 'Prepare drafts' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I agree to retry 1 failed preparation' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Prepare drafts' }));
    await waitFor(() => expect(api.prepare).toHaveBeenCalledTimes(1));
    expect(api.prepare.mock.calls[0][1].map(item => item.templateId)).toEqual(['new', 'failed']);
  });
  it('reloads a lost submission response without repeating it or leaving stale selections', async () => {
    api.prepare.mockRejectedValue(new Error('Request could not be confirmed'));
    render(tree()); const dialog = await open();
    api.get.mockResolvedValue(items.map(item => item.templateId === 'new' ? { ...item, state: 'QUEUED', revision: 1 } : item));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Prepare drafts' }));
    await within(dialog).findByText('Request could not be confirmed');
    expect(within(dialog).getByRole('button', { name: 'Prepare drafts' })).toBeDisabled();
    expect(within(dialog).getByRole('checkbox', { name: 'Template new' })).toBeDisabled();
    expect(api.prepare).toHaveBeenCalledTimes(1);
  });
  it('resumes saved progress after navigating back without queueing work again', async () => {
    api.get.mockResolvedValue([row('running', 'PREPARING')]);
    const first = render(tree()); await screen.findByText('Preparing template AI drafts'); first.unmount();
    api.get.mockResolvedValue([row('running', 'DRAFT')]);
    render(tree()); await screen.findByText('Template drafts ready');
    expect(screen.getByText('1 draft ready · 0 approved · 0 preparing')).toBeInTheDocument();
    expect(api.prepare).not.toHaveBeenCalled();
  });
  it('ignores a previous workspace response', async () => {
    let finish;
    api.get.mockImplementation(ws => ws === 'workspace-a' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve([]));
    const rendered = render(tree());
    rendered.rerender(tree('workspace-b'));
    await act(async () => { finish(items); });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare AI drafts' }));
    await screen.findByText('No official templates are available in this workspace.');
    expect(screen.queryByRole('checkbox', { name: 'Template new' })).not.toBeInTheDocument();
  });
});
