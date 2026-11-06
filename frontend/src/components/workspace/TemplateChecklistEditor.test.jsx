import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateChecklistEditor } from './TemplateChecklistEditor.jsx';

const api = vi.hoisted(() => ({ get: vi.fn(), prepare: vi.fn(), rerun: vi.fn(), save: vi.fn(), approve: vi.fn(), unapprove: vi.fn() }));
vi.mock('../../lib/api.js', () => ({
  getDocumentTemplateChecklist: (...args) => api.get(...args),
  prepareDocumentTemplateChecklist: (...args) => api.prepare(...args),
  rerunDocumentTemplateChecklist: (...args) => api.rerun(...args),
  saveDocumentTemplateChecklist: (...args) => api.save(...args),
  approveDocumentTemplateChecklist: (...args) => api.approve(...args),
  unapproveDocumentTemplateChecklist: (...args) => api.unapprove(...args)
}));

const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};
const checklist = state => ({ versionId: 'version-1', revision: 1, state, pdfPages: 1, items: [] });
const tree = <TemplateChecklistEditor workspaceId="workspace-1" templateId="template-1" versionId="version-1" />;

describe('template checklist editor polling', () => {
  beforeEach(() => { vi.useFakeTimers(); sessionStorage.clear(); Object.values(api).forEach(mock => mock.mockReset()); });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps the newest poll result when an older poll resolves later', async () => {
    const initial = deferred();
    const older = deferred();
    const newer = deferred();
    api.get.mockReturnValueOnce(initial.promise).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    render(<MantineProvider env="test">{tree}</MantineProvider>);

    await act(async () => initial.resolve(checklist('PREPARING')));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    await act(async () => newer.resolve(checklist('DRAFT')));
    expect(screen.getByText('Draft')).toBeInTheDocument();

    await act(async () => older.resolve(checklist('PREPARING')));
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.queryByText('Preparing')).not.toBeInTheDocument();
  });

  it.each(['scope change', 'unmount'])('ignores a late approval after %s', async changed => {
    const approval = deferred();
    const item = { title: 'First checklist item', instruction: 'Check the PDF.', sourceQuote: 'Template text', page: 1, applicability: 'REQUIRED' };
    const first = { ...checklist('DRAFT'), items: [item] };
    api.get.mockResolvedValueOnce(first);
    api.approve.mockReturnValueOnce(approval.promise);
    const view = render(<MantineProvider env="test">{tree}</MantineProvider>);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Approve checklist' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval', hidden: true }));
    expect(api.approve).toHaveBeenCalledTimes(1);
    if (changed === 'scope change') {
      api.get.mockResolvedValueOnce({ ...first, versionId: 'version-2', items: [{ ...item, title: 'Second checklist item' }] });
      await act(async () => view.rerender(<MantineProvider env="test">
        <TemplateChecklistEditor workspaceId="workspace-2" templateId="template-2" versionId="version-2" />
      </MantineProvider>));
    } else {
      view.unmount();
      sessionStorage.setItem('template-checklist-draft:workspace-1:template-1:version-1', 'newer unsaved draft');
    }
    await act(async () => approval.resolve({ ...first, state: 'APPROVED', revision: 2 }));
    if (changed === 'scope change') {
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Second checklist item' })).toBeInTheDocument();
      expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    } else {
      expect(sessionStorage.getItem('template-checklist-draft:workspace-1:template-1:version-1')).toBe('newer unsaved draft');
    }
  });
});
