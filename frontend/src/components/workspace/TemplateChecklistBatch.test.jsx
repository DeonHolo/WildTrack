import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateChecklistBatch } from './TemplateChecklistBatch.jsx';

const api = vi.hoisted(() => ({ get: vi.fn(), prepare: vi.fn(), approve: vi.fn() }));
vi.mock('../../lib/api.js', () => ({
  getTemplateChecklistBatch: (...args) => api.get(...args),
  prepareTemplateChecklistBatch: (...args) => api.prepare(...args),
  approveTemplateChecklistBatch: (...args) => api.approve(...args),
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
  beforeEach(() => { api.get.mockReset().mockResolvedValue(items); api.prepare.mockReset(); api.approve.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });
  it('keeps the saved drafts button steady during recurring background polling', async () => {
    api.get.mockResolvedValue([row('running', 'PREPARING')]);
    vi.useFakeTimers();
    await act(async () => { render(tree()); });
    const button = screen.getByRole('button', { name: 'Check saved drafts' });
    expect(button).not.toHaveAttribute('data-loading');
    let finish; api.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(button).not.toHaveAttribute('data-loading'); expect(button).toBeEnabled();
    await act(async () => { finish([row('running', 'PREPARING')]); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(button).not.toHaveAttribute('data-loading');
  });
  it('requires checklist inspection acknowledgement before bulk approval and uses saved revisions', async () => {
    const drafts = [row('draft-a','DRAFT'), row('draft-b','DRAFT'), row('approved','APPROVED'), row('failed','FAILED')];
    api.get.mockResolvedValue(drafts);
    api.approve.mockResolvedValue(drafts.map(item => item.state === 'DRAFT' ? { ...item, state:'APPROVED',revision:3 } : item));
    render(tree()); fireEvent.click(await screen.findByRole('button',{name:'Check saved drafts'}));
    const dialog = await screen.findByRole('dialog',{name:'Saved template AI drafts'});
    const approve = within(dialog).getByRole('button',{name:'Approve all checklists'});
    expect(approve).toBeDisabled();
    expect(within(dialog).getByText(/You can edit or unapprove it later/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('checkbox',{name:'I checked the draft checklists against their template PDFs.'}));
    fireEvent.click(approve);
    await within(dialog).findByText('2 checklists approved.');
    expect(api.approve).toHaveBeenCalledExactlyOnceWith('workspace-a',[
      {templateId:'draft-a',versionId:'v-draft-a',expectedRevision:2},
      {templateId:'draft-b',versionId:'v-draft-b',expectedRevision:2}
    ]);
    expect(api.prepare).not.toHaveBeenCalled();
  });
  it('reloads a rejected bulk approval without approving changed checklists again', async () => {
    const drafts = [row('draft','DRAFT')]; api.get.mockResolvedValue(drafts);
    api.approve.mockRejectedValue(new Error('The checklist changed. Reload and try again.'));
    render(tree()); fireEvent.click(await screen.findByRole('button',{name:'Check saved drafts'}));
    const dialog=await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox',{name:'I checked the draft checklists against their template PDFs.'}));
    fireEvent.click(within(dialog).getByRole('button',{name:'Approve all checklists'}));
    await within(dialog).findByText('The checklist changed. Reload and try again.');
    expect(within(dialog).getByRole('button',{name:'Approve all checklists'})).toBeDisabled();
    expect(api.approve).toHaveBeenCalledTimes(1);
  });
  it('requires confirmation, preserves existing checklists and excludes unready PDFs', async () => {
    render(tree()); const dialog = await open();
    expect(within(dialog).getByRole('checkbox', { name: 'Template new' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Template failed' })).not.toBeChecked();
    for (const id of ['draft', 'approved', 'pdf']) expect(within(dialog).getByRole('checkbox', { name: `Template ${id}` })).toBeDisabled();
    expect(within(dialog).getByText(/does not run AI Review on submissions or approve/)).toBeInTheDocument();
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
  it('opens saved drafts with readable names and direct links instead of silently refreshing counts', async () => {
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Check saved drafts' }));
    const dialog=await screen.findByRole('dialog', { name: 'Saved template AI drafts' });
    expect(within(dialog).getByText(/Opening it does not send an AI request/)).toBeVisible();
    expect(within(dialog).getByText('Template draft')).toBeVisible();
    expect(within(dialog).getByRole('checkbox',{name:'I checked the draft checklists against their template PDFs.'})).not.toBeChecked();
    expect(within(dialog).getAllByRole('link', { name: 'Open checklist' })).toHaveLength(items.length);
    expect(within(dialog).getAllByRole('link')[2]).toHaveAttribute('href', '/templates/draft/preview?workspaceId=workspace-a');
    expect(within(dialog).queryByRole('button', { name: 'Prepare drafts' })).not.toBeInTheDocument();
    expect(api.prepare).not.toHaveBeenCalled();
  });
  it('reruns saved drafts only after an explicit mode and replacement acknowledgement', async () => {
    api.prepare.mockResolvedValue(items.map(item=>['draft','approved'].includes(item.templateId)?{...item,state:'QUEUED',revision:3}:item));
    render(tree()); await open();
    fireEvent.click(screen.getByRole('checkbox',{name:'Rerun saved AI drafts',exact:true}));
    const dialog=screen.getByRole('dialog',{name:'Rerun template AI drafts'});
    expect(within(dialog).getByRole('checkbox',{name:'Template draft'})).toBeChecked();
    expect(within(dialog).getByRole('checkbox',{name:'Template approved'})).toBeChecked();
    expect(within(dialog).getByRole('checkbox',{name:'Template new'})).toBeDisabled();
    expect(within(dialog).getByRole('button',{name:'Rerun AI drafts'})).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox',{name:'Replace the selected saved Review checklists'}));
    fireEvent.click(within(dialog).getByRole('button',{name:'Rerun AI drafts'}));
    await waitFor(()=>expect(api.prepare).toHaveBeenCalledExactlyOnceWith('workspace-a',[
      {templateId:'draft',versionId:'v-draft',expectedRevision:2,rerun:true},
      {templateId:'approved',versionId:'v-approved',expectedRevision:2,rerun:true}
    ]));
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
