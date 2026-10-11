import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatePreviewPage } from './TemplatePreviewPage.jsx';

const workspace = vi.hoisted(() => ({
  activeWorkspaceId: 'workspace-current',
  session: { authenticated: true, email: 'admin@school.edu', roles: ['ADMIN'] }
}));
const api = vi.hoisted(() => ({ structure: vi.fn() }));
vi.mock('../app/WorkspaceSession.jsx', () => ({ useWorkspaceSession: () => workspace }));
vi.mock('../lib/api.js', () => ({
  getDocumentTemplateStructure: (...args) => api.structure(...args),
  getDocumentTemplateFileUrl: (workspaceId, templateId) => `/api/templates/${templateId}/file?workspaceId=${workspaceId}`
}));

const template = {
  templateId: 'template-std', displayName: 'STD template', originalFilename: 'STD TEMPLATE.docx',
  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  expectedHeadings: ['Introduction', 'Test Plan', 'Test Cases'],
  detectedHeadings: ['Introduction', 'Test Plan'],
  extractedText: 'Introduction\n<script>untrusted template text</script>\nTest Plan'
};
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
    workspace.session = { authenticated: true, email: 'admin@school.edu', roles: ['ADMIN'] };
    api.structure.mockReset().mockResolvedValue(template);
  });

  it('loads the link workspace and renders text plus expected and detected headings without opening the original', async () => {
    render(tree());
    expect(await screen.findByRole('heading', { name: 'STD TEMPLATE.docx' })).toBeInTheDocument();
    expect(api.structure).toHaveBeenCalledWith('workspace-link', 'template-std');
    expect(screen.getByText('3 expected body sections · 2 detected in this template')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Expected body sections' })).getAllByRole('listitem'))
      .toHaveLength(3);
    const detected = screen.getByText('Headings detected in the template').closest('details');
    expect(detected).not.toHaveAttribute('open');
    expect(within(detected).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(/<script>untrusted template text<\/script>/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
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
  });
});
