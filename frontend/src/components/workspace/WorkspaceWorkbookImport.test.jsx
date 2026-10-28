import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceWorkbookImport } from './WorkspaceWorkbookImport.jsx';

const api = vi.hoisted(() => ({ download: vi.fn(), preview: vi.fn(), apply: vi.fn(), scope: 'workspace-a' }));
vi.mock('../../lib/api.js', () => ({
  downloadWorkspaceWorkbook: (...args) => api.download(...args),
  previewWorkspaceWorkbook: (...args) => api.preview(...args),
  applyWorkspaceWorkbook: (...args) => api.apply(...args)
}));
vi.mock('../../hooks/useWorkspaceScope.js', () => ({ useWorkspaceScope: ws => () => api.scope === ws }));
const change = { key: 'student:23-01', sheet: 'Students', rowNumber: 2, rowKey: '23-01', label: 'Student One', kind: 'UPDATE',
  fields: [{ key: 'student:23-01:name', name: 'studentName', label: 'Student Name', before: 'Student One', after: 'Updated Name', conflict: true }] };
const preview = { previewId: 'preview-1', filename: 'class.xlsx', addedRows: 0, changedRows: 1, unchangedRows: 2,
  changes: [change], errors: [], warnings: [] };
const tree = (props = {}) => <MantineProvider><WorkspaceWorkbookImport workspaceId="workspace-a" {...props} /></MantineProvider>;
function select(container, name = 'class.xlsx') {
  const file = new File(['workbook'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
  return file;
}
async function inspect(container) {
  select(container); fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
  return screen.findByRole('dialog', { name: 'Review workbook import' });
}

describe('Workspace workbook import', () => {
  beforeEach(() => { api.scope = 'workspace-a'; api.download.mockReset(); api.apply.mockReset(); api.preview.mockReset().mockResolvedValue(preview); });
  it('keeps required and optional setup visible, and makes no import request before a file is selected', () => {
    render(tree());
    expect(screen.getByText(/Student Number, Student Name and Team Code are required/)).toBeVisible();
    expect(screen.getByText(/Teams and Projects and Deliverables are optional tabs/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Preview import' })).toBeDisabled();
    expect(api.preview).not.toHaveBeenCalled(); expect(api.apply).not.toHaveBeenCalled();
  });
  it('previews the selected file without changing data and requires a conflict choice before applying', async () => {
    const onImported = vi.fn(); api.apply.mockResolvedValue({ previewId: 'preview-1', addedRows: 0, changedRows: 1, unchangedRows: 2 });
    const { container } = render(tree({ onImported })); const file = select(container);
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    const dialog = await screen.findByRole('dialog');
    expect(api.preview).toHaveBeenCalledExactlyOnceWith('workspace-a', file);
    expect(api.apply).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Apply import' })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Student One: Student Name' }), { target: { value: 'LOCAL' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply import' }));
    await screen.findByText('Workbook imported');
    expect(api.apply).toHaveBeenCalledExactlyOnceWith('workspace-a', 'preview-1', { 'student:23-01:name': 'LOCAL' });
    expect(onImported).toHaveBeenCalledTimes(1);
  });
  it('shows sheet and row errors and refuses to apply a partly valid workbook', async () => {
    api.preview.mockResolvedValue({ ...preview, errors: [{ sheet: 'Students', rowNumber: 3, message: 'Student Number is required.' }] });
    const { container } = render(tree()); const dialog = await inspect(container);
    expect(within(dialog).getByText(/Students, row 3: Student Number is required/)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Apply import' })).toBeDisabled();
    expect(api.apply).not.toHaveBeenCalled();
  });
  it('reuses the same preview and frozen choices when a saved result cannot be confirmed', async () => {
    api.apply.mockRejectedValueOnce(new Error('Connection interrupted.')).mockResolvedValueOnce({ addedRows: 0, changedRows: 1, unchangedRows: 2 });
    const { container } = render(tree()); const dialog = await inspect(container);
    const choice = within(dialog).getByRole('combobox', { name: 'Student One: Student Name' });
    fireEvent.change(choice, { target: { value: 'SOURCE' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply import' }));
    const check = await within(dialog).findByRole('button', { name: 'Check import result' });
    expect(choice).toBeDisabled(); fireEvent.click(check);
    await screen.findByText('Workbook imported');
    expect(api.apply.mock.calls).toEqual([
      ['workspace-a', 'preview-1', { 'student:23-01:name': 'SOURCE' }],
      ['workspace-a', 'preview-1', { 'student:23-01:name': 'SOURCE' }]
    ]);
  });
  it('requires a fresh preview after intervening edits', async () => {
    api.preview.mockResolvedValue({ ...preview, changes: [] });
    api.apply.mockRejectedValue(Object.assign(new Error('Academic data changed. Preview the workbook again.'), { status: 409 }));
    const { container } = render(tree()); const dialog = await inspect(container);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply import' }));
    await within(dialog).findByText('Academic data changed. Preview the workbook again.');
    expect(within(dialog).getByRole('button', { name: 'Apply import' })).toBeDisabled();
  });
  it('rejects unsupported file types before sending their contents', async () => {
    const { container } = render(tree()); select(container, 'macro.xlsm');
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    await screen.findByText('Choose an .xlsx workbook of 5 MB or less.');
    expect(api.preview).not.toHaveBeenCalled();
  });
  it('discards a preview response after switching workspaces', async () => {
    let finish; api.preview.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { container, rerender } = render(tree()); select(container);
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    api.scope = 'workspace-b'; rerender(tree({ workspaceId: 'workspace-b' }));
    await act(async () => { finish(preview); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(api.apply).not.toHaveBeenCalled();
  });
  it('downloads the template without starting an import', async () => {
    const blob = new Blob(['xlsx']); api.download.mockResolvedValue(blob);
    const create = vi.fn().mockReturnValue('blob:workbook');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(tree()); fireEvent.click(screen.getByRole('button', { name: 'Download Excel template' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(api.download).toHaveBeenCalledExactlyOnceWith('workspace-a'); expect(create).toHaveBeenCalledWith(blob);
    expect(api.preview).not.toHaveBeenCalled(); expect(api.apply).not.toHaveBeenCalled();
    click.mockRestore();
  });
});
