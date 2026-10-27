import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatePreviewPage } from './TemplatePreviewPage.jsx';

const workspace = vi.hoisted(() => ({
  activeWorkspaceId: 'workspace-current',
  session: { authenticated: true, email: 'admin@school.edu', roles: ['ADMIN'] }
}));
const api = vi.hoisted(() => ({ structure: vi.fn(), pdf: vi.fn(), retry: vi.fn(), checklist: vi.fn(), prepare: vi.fn(), save: vi.fn(), approve: vi.fn() }));
vi.mock('../app/WorkspaceSession.jsx', () => ({ useWorkspaceSession: () => workspace }));
vi.mock('../lib/api.js', () => ({
  getDocumentTemplateStructure: (...args) => api.structure(...args),
  getDocumentTemplatePdfState: (...args) => api.pdf(...args),
  retryDocumentTemplatePdf: (...args) => api.retry(...args),
  getDocumentTemplateChecklist: (...args) => api.checklist(...args),
  prepareDocumentTemplateChecklist: (...args) => api.prepare(...args),
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
    api.prepare.mockReset(); api.save.mockReset(); api.approve.mockReset();
  });

  it('shows one list and no missing-section panel when all template headings are detected', async () => {
    api.structure.mockResolvedValue({ ...template, detectedHeadings: template.expectedHeadings });
    render(tree());
    await screen.findByRole('heading', { name: 'STD TEMPLATE.docx' });
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
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
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
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Unsaved title' } });
    mounted.unmount();
    api.checklist.mockResolvedValue({ versionId: 'version-1', revision: 3, state: 'DRAFT', pdfPages: 7, items: [item] });
    render(tree());
    expect(await screen.findByText(/unsaved edits have been restored/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Unsaved title');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reload checklist' })).toBeInTheDocument();
  });

  it('lists each detected heading once and keeps missing expectations separate', async () => {
    render(tree());
    expect(await screen.findByRole('heading', { name: 'STD TEMPLATE.docx' })).toBeInTheDocument();
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
