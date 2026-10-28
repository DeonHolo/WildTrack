import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatePreviewPage } from './TemplatePreviewPage.jsx';

const workspace = vi.hoisted(() => ({
  activeWorkspaceId: 'workspace-current',
  session: { authenticated: true, email: 'admin@school.edu', roles: ['ADMIN'] }
}));
const api = vi.hoisted(() => ({ structure: vi.fn(), pdf: vi.fn(), retry: vi.fn(), checklist: vi.fn(), prepare: vi.fn(), rerun: vi.fn(), save: vi.fn(), approve: vi.fn() }));
vi.mock('../app/WorkspaceSession.jsx', () => ({ useWorkspaceSession: () => workspace }));
vi.mock('../lib/api.js', () => ({
  getDocumentTemplateStructure: (...args) => api.structure(...args),
  getDocumentTemplatePdfState: (...args) => api.pdf(...args),
  retryDocumentTemplatePdf: (...args) => api.retry(...args),
  getDocumentTemplateChecklist: (...args) => api.checklist(...args),
  prepareDocumentTemplateChecklist: (...args) => api.prepare(...args),
  rerunDocumentTemplateChecklist: (...args) => api.rerun(...args),
  saveDocumentTemplateChecklist: (...args) => api.save(...args),
  approveDocumentTemplateChecklist: (...args) => api.approve(...args),
  getDocumentTemplatePdfUrl: (workspaceId, templateId, versionId) => `/api/templates/${templateId}/pdf?workspaceId=${workspaceId}&versionId=${versionId}`,
  getDocumentTemplateFileUrl: (workspaceId, templateId) => `/api/templates/${templateId}/file?workspaceId=${workspaceId}`
}));

const template = {
  templateId: 'template-std', displayName: 'STD template', originalFilename: 'STD TEMPLATE.docx',
  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  expectedHeadings: ['Introduction', 'Test Plan', 'Test Cases'],
  detectedHeadings: ['Introduction', 'Test Plan'],
  extractedText: 'Introduction\n<script>untrusted template text</script>\nTest Plan',
  sha256: 'source-hash'
};
const pdf = { versionId: 'version-1', sourceSha256: 'source-hash', originalFilename: 'STD TEMPLATE.docx',
  state: 'READY', pages: 7, error: null, originalAvailable: true };
function Navigation() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/templates/next/preview?workspaceId=workspace-next')}>Next template</button>;
}
function tree() {
  return <MantineProvider><MemoryRouter initialEntries={['/templates/template-std/preview?workspaceId=workspace-link']}>
    <Navigation /><Routes><Route path="/templates/:templateId/preview" element={<TemplatePreviewPage />} /></Routes>
  </MemoryRouter></MantineProvider>;
}

describe('official template browser preview', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    sessionStorage.clear();
    workspace.session = { authenticated: true, email: 'admin@school.edu', roles: ['ADMIN'] };
    api.structure.mockReset().mockResolvedValue(template);
    api.pdf.mockReset().mockResolvedValue(pdf);
    api.retry.mockReset().mockResolvedValue({ ...pdf, state: 'PENDING' });
    api.checklist.mockReset().mockResolvedValue({ versionId: 'version-1', revision: 0, state: 'UNPREPARED', pdfPages: 7, items: [] });
    api.prepare.mockReset(); api.rerun.mockReset(); api.save.mockReset(); api.approve.mockReset();
  });

  it('shows one list and no missing-section panel when all template headings are detected', async () => {
    api.structure.mockResolvedValue({ ...template, detectedHeadings: template.expectedHeadings });
    render(tree());
    await screen.findByRole('heading', { name: 'STD TEMPLATE.docx' });
    fireEvent.click(screen.getByRole('button', { name: 'Template headings', exact: true }));
    await screen.findByRole('region', { name: 'Template body sections' });
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(template.expectedHeadings);
    expect(screen.queryByRole('region', { name: 'Template sections not detected' })).not.toBeInTheDocument();
  });

  it('lets an adviser read the scoped template and return to their teams', async () => {
    workspace.session = { authenticated: true, email: 'adviser@school.edu', roles: ['ADVISER'] };
    render(tree());
    await screen.findByRole('heading', { name: 'STD TEMPLATE.docx' });
    expect(api.structure).toHaveBeenCalledWith('workspace-link', 'template-std');
    expect(screen.getByRole('link', { name: 'Back to my teams' })).toHaveAttribute('href', '/adviser');
    expect(screen.getByRole('link', { name: 'Original file' })).toHaveAttribute('href',
      '/api/templates/template-std/file?workspaceId=workspace-link');
    expect(screen.queryByRole('link', { name: 'Back to workspace' })).not.toBeInTheDocument();
    expect(api.checklist).not.toHaveBeenCalled();
  });

  it('explains Template headings separately from the Review checklist without expanding the section', async () => {
    render(tree());
    const help=await screen.findByRole('button',{name:'About Template headings'});
    fireEvent.focus(help);
    const tooltip=await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Document Check looks for matching headings in submissions.');
    expect(tooltip).toHaveTextContent('AI Review uses the Review checklist to assess what those sections contain.');
    expect(screen.getByRole('button',{name:'Template headings',exact:true})).toHaveAttribute('aria-expanded','false');
  });

  it('confirms removal and saves it only when the draft is saved', async () => {
    const items = ['Purpose', 'Scope'].map(title => ({ title, instruction: 'Explain the scope', sourceQuote: 'Scope', section: 'Introduction', page: 1, applicability: 'REQUIRED', condition: '' }));
    api.checklist.mockResolvedValue({ versionId: 'version-1', revision: 2, state: 'DRAFT', pdfPages: 7, items });
    api.save.mockImplementation((_ws, _id, payload) => Promise.resolve({ versionId: 'version-1', revision: 3, state: 'DRAFT', pdfPages: 7, items: payload.items }));
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Purpose', exact: true }));
    const remove = screen.getByRole('button', { name: 'Remove item', exact: true });
    expect(remove.querySelector('svg')).toBeInTheDocument();
    fireEvent.click(remove);
    let dialog = screen.getByRole('dialog', { name: 'Remove checklist item?' });
    expect(within(dialog).getByText(/There is no Undo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purpose', exact: true })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel', exact: true }));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    fireEvent.click(remove);
    dialog = screen.getByRole('dialog', { name: 'Remove checklist item?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove item', exact: true }));
    expect(screen.queryByRole('button', { name: 'Purpose', exact: true })).not.toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][2].items.map(item => item.title)).toEqual(['Scope']);
  });

  it('requires confirmation before requesting an AI draft', async () => {
    api.prepare.mockResolvedValue({ versionId: 'version-1', revision: 1, state: 'QUEUED', pdfPages: 7, items: [] });
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare AI draft' }));
    expect(api.prepare).not.toHaveBeenCalled();
    expect(await screen.findByText(/uses AI tokens/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare draft' }));
    expect(api.prepare).toHaveBeenCalledWith('workspace-link', 'template-std', { versionId: 'version-1', expectedRevision: 0 });
    expect(await screen.findByText(/Preparing the draft/)).toBeInTheDocument();
  });

  it('cannot approve a replacement checklist while the previous PDF is still displayed', async () => {
    api.checklist.mockResolvedValue({ versionId: 'version-2', revision: 3, state: 'DRAFT', pdfPages: 7, items: [] });
    render(tree());
    expect(await screen.findByText(/Reload this page to view its current PDF and checklist/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload template' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve checklist' })).not.toBeInTheDocument();
    expect(api.approve).not.toHaveBeenCalled();
  });

  it('retains unsaved edits after a conflicting save', async () => {
    api.checklist.mockResolvedValue({ versionId: 'version-1', revision: 2, state: 'DRAFT', pdfPages: 7, items: [{ title: 'Purpose', instruction: 'Explain purpose', sourceQuote: 'Purpose', section: 'Introduction', page: 1, applicability: 'REQUIRED', condition: '' }] });
    api.save.mockRejectedValue(Object.assign(new Error('Revision changed'), { status: 409 }));
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Purpose', exact: true }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Edited purpose' } });
    expect(screen.getByRole('button', { name: 'Approve checklist' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText(/Revision changed/)).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Edited purpose');
    expect(screen.getByRole('button', { name: 'Reload checklist' })).toBeInTheDocument();
  });

  it('saves all items and clears a hidden condition when switching to optional', async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ title: `Item ${i + 1}`, instruction: 'Describe it', sourceQuote: 'Source', section: 'Section', page: 1, applicability: i ? 'REQUIRED' : 'CONDITIONAL', condition: i ? '' : 'If needed' }));
    api.checklist.mockResolvedValue({ versionId: 'version-1', revision: 3, state: 'DRAFT', pdfPages: 7, items });
    api.save.mockImplementation(async (_w, _t, payload) => ({ versionId: 'version-1', revision: 4, state: 'DRAFT', pdfPages: 7, items: payload.items }));
    render(tree());
    expect(await screen.findByRole('button', { name: 'Item 30' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Item 1', exact: true }));
    fireEvent.click(screen.getByRole('textbox', { name: 'Applicability' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Optional' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('button', { name: 'Approve checklist' });
    expect(api.save.mock.calls[0][2]).toMatchObject({ versionId: 'version-1', expectedRevision: 3, items: expect.arrayContaining([{ ...items[0], applicability: 'OPTIONAL', condition: '' }]) });
    expect(api.save.mock.calls[0][2].items).toHaveLength(30);
  });

  it('approves only a nonempty saved revision', async () => {
    const item = { title: 'Purpose', instruction: 'Explain', sourceQuote: 'Purpose', section: '', page: 1, applicability: 'REQUIRED', condition: '' };
    api.checklist.mockResolvedValue({ versionId: 'version-1', revision: 4, state: 'DRAFT', pdfPages: 7, items: [item] });
    api.approve.mockResolvedValue({ versionId: 'version-1', revision: 4, state: 'APPROVED', pdfPages: 7, items: [item] });
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Approve checklist' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm approval' }));
    expect(api.approve).toHaveBeenCalledWith('workspace-link', 'template-std', { versionId: 'version-1', expectedRevision: 4 });
    expect(await screen.findByText('Approved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prepare AI draft' })).not.toBeInTheDocument();
  });

  it('disables approval for an empty saved draft', async () => {
    api.checklist.mockResolvedValue({ versionId: 'version-1', revision: 1, state: 'DRAFT', pdfPages: 7, items: [] });
    render(tree());
    expect(await screen.findByRole('button', { name: 'Approve checklist' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Prepare AI draft' })).not.toBeInTheDocument();
  });

  it('restores unsaved edits after navigation and keeps them on a stale revision', async () => {
    const item = { title: 'Purpose', instruction: 'Explain', sourceQuote: 'Purpose', section: '', page: 1, applicability: 'REQUIRED', condition: '' };
    api.checklist.mockResolvedValue({ versionId: 'version-1', revision: 2, state: 'DRAFT', pdfPages: 7, items: [item] });
    const mounted = render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Purpose', exact: true }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Unsaved title' } });
    mounted.unmount();
    api.checklist.mockResolvedValue({ versionId: 'version-1', revision: 3, state: 'DRAFT', pdfPages: 7, items: [item] });
    render(tree());
    expect(await screen.findByText(/unsaved edits have been restored/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unsaved title', exact: true }));
    expect(screen.getByLabelText('Title')).toHaveValue('Unsaved title');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reload checklist' })).toBeInTheDocument();
  });

  it('shows one disclosure and a read-only source while preserving the original excerpt on save', async () => {
    const item = { title: 'Purpose', instruction: 'Explain the document purpose.', sourceQuote: 'Original source wording', section: '1.1 Purpose', page: 2, applicability: 'REQUIRED', condition: '' };
    api.checklist.mockResolvedValue({ versionId: 'version-1', revision: 2, state: 'DRAFT', pdfPages: 7, items: [item] });
    api.save.mockImplementation(async (_w, _t, payload) => ({ versionId: 'version-1', revision: 3, state: 'DRAFT', pdfPages: 7, items: payload.items }));
    render(tree());
    const toggle = await screen.findByRole('button', { name: 'Purpose', exact: true });
    expect(screen.queryByRole('button', { name: 'Edit', exact: true })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Source: 1.1 Purpose · PDF page 2')).toBeInTheDocument();
    expect(screen.queryByText('Source details')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Source quote')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Template excerpt')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'Explain the purpose of this document, including its audience.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][2].items).toEqual([{ ...item, instruction: 'Explain the purpose of this document, including its audience.' }]);
  });

  it('collects a source for a new manual item without sending UI bookkeeping to the server', async () => {
    api.save.mockImplementation(async (_w, _t, payload) => ({ versionId: 'version-1', revision: 1, state: 'DRAFT', pdfPages: 7, items: payload.items }));
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Project scope' } });
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'Describe the project scope.' } });
    fireEvent.change(screen.getByLabelText('PDF page'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(api.save).not.toHaveBeenCalled();
    expect(screen.getByText('Enter the source quote.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Template excerpt'), { target: { value: 'Describe the project scope.' } });
    fireEvent.change(screen.getByLabelText('Source section (optional)'), { target: { value: '1.2 Scope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][2].items).toEqual([{ title: 'Project scope', instruction: 'Describe the project scope.', sourceQuote: 'Describe the project scope.', section: '1.2 Scope', page: 2, applicability: 'REQUIRED', condition: '' }]);
    expect(await screen.findByText('Source: 1.2 Scope · PDF page 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Template excerpt')).not.toBeInTheDocument();
  });

  it('lists each detected heading once and keeps missing expectations separate', async () => {
    render(tree());
    expect(await screen.findByRole('heading', { name: 'STD TEMPLATE.docx' })).toBeInTheDocument();
    const headings=screen.getByRole('button', { name: 'Template headings', exact: true });
    expect(headings).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('.template-review-layout').compareDocumentPosition(headings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(headings);
    await screen.findByRole('region', { name: 'Template body sections' });
    expect(api.structure).toHaveBeenCalledWith('workspace-link', 'template-std');
    expect(screen.getByText('2 of 3 expected body sections detected in this template')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Template body sections' })).getAllByRole('listitem')).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: 'Template sections not detected' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Introduction', 'Test Plan', 'Test Cases']);
    expect(screen.queryByText(/<script>untrusted template text<\/script>/)).not.toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByTitle('Official template PDF')).toHaveAttribute('src',
      '/api/templates/template-std/pdf?workspaceId=workspace-link&versionId=version-1');
    expect(screen.getByRole('link', { name: 'Open PDF' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Original file' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Original file' }))
      .toHaveAttribute('href', '/api/templates/template-std/file?workspaceId=workspace-link');
    expect(api.structure).toHaveBeenCalledTimes(1);
  });

  it('requires explicit confirmation to rerun a saved checklist and preserves its displayed items while preparing', async () => {
    const item={ title:'Saved instruction',instruction:'Explain the project purpose.',sourceQuote:'Explain the project purpose.',section:'Purpose',page:1,applicability:'REQUIRED',condition:'' };
    const view={versionId:'version-1',revision:4,state:'APPROVED',pdfPages:7,items:[item]};
    api.checklist.mockResolvedValue(view);
    api.rerun.mockResolvedValue({...view,revision:5,state:'QUEUED',approvedAt:null});
    render(tree());
    fireEvent.click(await screen.findByRole('button',{name:'Rerun AI draft',exact:true}));
    let dialog=await screen.findByRole('dialog',{name:'Rerun AI draft?'});
    await waitFor(()=>expect(within(dialog).getByText(/including your edits. There is no Undo/)).toBeVisible());
    fireEvent.click(within(dialog).getByRole('button',{name:'Cancel',exact:true}));
    await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Rerun AI draft?'})).not.toBeInTheDocument());
    expect(api.rerun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Rerun AI draft',exact:true}));
    dialog=await screen.findByRole('dialog',{name:'Rerun AI draft?'});
    fireEvent.click(within(dialog).getByRole('button',{name:'Rerun AI draft',exact:true}));
    await screen.findByText('Preparing the draft. You can leave this page and return later.');
    expect(api.rerun).toHaveBeenCalledExactlyOnceWith('workspace-link','template-std',{versionId:'version-1',expectedRevision:4});
    fireEvent.click(screen.getByRole('button',{name:'Saved instruction',exact:true}));
    expect(screen.getByLabelText('Instruction')).toBeDisabled();
    expect(screen.getByLabelText('Instruction')).toHaveValue(item.instruction);
    expect(screen.getByRole('button',{name:'Approve checklist'})).toBeDisabled();
  });

  it('checks saved progress after a lost rerun response without sending another request', async () => {
    const view={versionId:'version-1',revision:4,state:'DRAFT',pdfPages:7,items:[]};
    api.checklist.mockResolvedValue(view);
    api.rerun.mockRejectedValue(new Error('The rerun request could not be confirmed.'));
    render(tree());
    fireEvent.click(await screen.findByRole('button',{name:'Rerun AI draft',exact:true}));
    api.checklist.mockResolvedValue({...view,state:'QUEUED',revision:5});
    fireEvent.click(within(await screen.findByRole('dialog',{name:'Rerun AI draft?'})).getByRole('button',{name:'Rerun AI draft',exact:true}));
    await screen.findByText('The rerun request could not be confirmed.');
    expect(screen.getByText('Preparing the draft. You can leave this page and return later.')).toBeVisible();
    expect(api.rerun).toHaveBeenCalledTimes(1);
  });

  it('removes the previous private template immediately when the target changes and ignores a late response', async () => {
    let resolveOld, resolveNew;
    api.structure.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveNew = resolve; }));
    render(tree());
    fireEvent.click(screen.getByRole('button', { name: 'Next template' }));
    await act(async () => resolveOld({ ...template, displayName: 'Private previous template' }));
    expect(screen.queryByText('Private previous template')).not.toBeInTheDocument();
    await act(async () => resolveNew({ ...template, originalFilename: 'Next.docx' }));
    expect(screen.getByRole('heading', { name: 'Next.docx' })).toBeInTheDocument();
    expect(api.structure).toHaveBeenLastCalledWith('workspace-next', 'next');
  });

  it('clears private preview content after an authorization failure', async () => {
    api.structure.mockResolvedValueOnce(template).mockRejectedValue(Object.assign(new Error('Access denied.'), { status: 403 }));
    render(tree());
    await screen.findByRole('heading', { name: 'STD TEMPLATE.docx' });
    await act(async () => window.dispatchEvent(new Event('wildtrack:refresh-resources')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Access denied.');
    expect(screen.queryByText(/untrusted template text/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Original file' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Official template PDF')).not.toBeInTheDocument();
  });

  it('keeps the original available during preparation without displaying an older PDF', async () => {
    api.pdf.mockResolvedValue({ ...pdf, state: 'PROCESSING' });
    render(tree());
    expect(await screen.findByText('Preparing template PDF…')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Original file' })).toBeInTheDocument();
    expect(screen.queryByTitle('Official template PDF')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open PDF' })).not.toBeInTheDocument();
  });

  it('lets an administrator retry a failed version and displays its prepared PDF', async () => {
    api.pdf.mockResolvedValueOnce({ ...pdf, state: 'FAILED', error: 'Conversion unavailable.' });
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Retry PDF preparation' }));
    expect(await screen.findByTitle('Official template PDF')).toBeInTheDocument();
    expect(api.retry).toHaveBeenCalledWith('workspace-link', 'template-std', 'version-1');
  });

  it('keeps an older non-PDF original available without offering a pointless retry', async () => {
    api.pdf.mockResolvedValue({ ...pdf, state: 'FAILED', retryable: false,
      error: 'Upload this template as a PDF. The original file is retained.' });
    render(tree());
    expect(await screen.findByText(/Upload this template as a PDF/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Original file' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry PDF preparation' })).not.toBeInTheDocument();
    expect(api.retry).not.toHaveBeenCalled();
  });

  it('does not offer preparation mutations to an adviser or for an unavailable original', async () => {
    workspace.session = { authenticated: true, email: 'adviser@school.edu', roles: ['ADVISER'] };
    api.pdf.mockResolvedValue({ ...pdf, state: 'FAILED', originalAvailable: false,
      error: 'The original template file is unavailable. Replace the template.' });
    render(tree());
    expect(await screen.findByText(/original template file is unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry PDF preparation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Original file' })).not.toBeInTheDocument();
    expect(api.retry).not.toHaveBeenCalled();
  });

  it('hides the previous PDF if a replacement is detected between the two reads', async () => {
    api.pdf.mockResolvedValueOnce(pdf).mockResolvedValue({ ...pdf, sourceSha256: 'replacement-hash', versionId: 'version-2' });
    render(tree());
    await screen.findByTitle('Official template PDF');
    await act(async () => window.dispatchEvent(new Event('wildtrack:refresh-resources')));
    expect(await screen.findByText(/template changed while loading/)).toBeInTheDocument();
    expect(screen.queryByTitle('Official template PDF')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Original file' })).not.toBeInTheDocument();
  });
});
