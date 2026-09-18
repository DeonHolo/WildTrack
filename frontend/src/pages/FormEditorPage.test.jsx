import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { FormEditorPage } from './FormEditorPage.jsx';

const session = vi.hoisted(() => ({
  activeWorkspace: {
    id: 'workspace-it', name: 'IT411', program: 'IT', courseCode: 'IT411', semester: 'Semester 1', academicYear: '2026-27'
  },
  activeWorkspaceId: 'workspace-it',
  session: { authenticated: true, email: 'admin@example.com', googleSubject: 'admin-1', roles: ['ADMIN'] }
}));

const formsClient = vi.hoisted(() => ({ loadFormsState: vi.fn() }));
const submissionClient = vi.hoisted(() => ({ saveDeliverable: vi.fn() }));

vi.mock('../app/WorkspaceSession.jsx', () => ({ useWorkspaceSession: () => session }));
vi.mock('../lib/formsClient.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadFormsState: (...args) => formsClient.loadFormsState(...args) };
});
vi.mock('../lib/submissionClient.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, saveDeliverable: (...args) => submissionClient.saveDeliverable(...args) };
});

function state() {
  return {
    trackerColumns: [
      { id: 'column-srs', key: 'SRS', label: 'SRS', active: true, pdfRequired: true },
      { id: 'column-code', key: 'SourceCode', label: 'Source Code', active: true, pdfRequired: false }
    ],
    students: [
      { rowKey: 'student-1', studentNumber: '26-0001', name: 'DOE, JANE', teamCode: '2627-sem1-it411-01', section: 'G7' }
    ],
    attempts: [],
    deliverables: [{
      id: 'form-srs',
      slug: 'srs-submission',
      title: 'SRS Submission',
      shortTitle: 'SRS',
      trackerColumn: 'SRS',
      dueAt: '2026-09-30T23:59:00+08:00',
      instructions: 'Submit the final SRS.',
      status: 'Published',
      updatedAt: '2026-09-18T10:00:00',
      fields: [
        { id: 'studentNumber', definitionId: 'field-student-number', label: 'Student Number', helpText: '', type: 'academicStudentNumber', required: true, active: true, options: [] },
        { id: 'framework', definitionId: 'field-framework', label: 'Framework PDF', helpText: 'Final PDF', type: 'drive', required: true, active: true, pdfRequired: true, documentCheckPolicy: 'OFF', aiReviewEnabled: true, options: [] },
        { id: 'scope', definitionId: 'field-scope', label: 'Scope', helpText: '', type: 'dropdown', required: true, active: true, options: [
          { id: 'option-a', label: 'Campus' }, { id: 'option-b', label: 'Community' }
        ] }
      ],
      retiredFields: []
    }]
  };
}

function renderEditor(path) {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <MemoryRouter initialEntries={[path]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Link to="/review">Review nav</Link>
        <Routes>
          <Route path="/forms/new" element={<FormEditorPage />} />
          <Route path="/forms/:formId/edit" element={<FormEditorPage />} />
          <Route path="/review" element={<h1>Review destination</h1>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  );
}

describe('full-page form editor', () => {
  beforeEach(() => {
    formsClient.loadFormsState.mockReset().mockResolvedValue(state());
    submissionClient.saveDeliverable.mockReset().mockImplementation(async (_workspaceId, payload) => ({
      ...payload,
      id: payload.id || 'created-form',
      slug: payload.slug || 'source-code-submission',
      updatedAt: '2026-09-19T04:00:00'
    }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('creates an unpublished draft with additive academic suggestions including real Section data', async () => {
    renderEditor('/forms/new');
    expect(await screen.findByRole('heading', { name: 'New form' })).toBeInTheDocument();
    expect(screen.getByText('Unpublished')).toBeInTheDocument();
    const labels = screen.getAllByRole('textbox', { name: 'Field label' }).map((input) => input.value);
    expect(labels).toEqual(expect.arrayContaining(['Student Number', 'Student Name', 'Team Code', 'Section']));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(submissionClient.saveDeliverable).toHaveBeenCalledWith('workspace-it', expect.objectContaining({
      status: 'Unpublished'
    })));
  });

  it('preserves existing publication state on Save and publishes only from the explicit action', async () => {
    renderEditor('/forms/form-srs/edit');
    expect(await screen.findByDisplayValue('SRS Submission')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Form title' }), { target: { value: 'Revised SRS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(submissionClient.saveDeliverable).toHaveBeenCalledWith('workspace-it', expect.objectContaining({
      id: 'form-srs',
      slug: 'srs-submission',
      status: 'Published',
      expectedUpdatedAt: '2026-09-18T10:00:00'
    })));
  });

  it('keeps the dirty draft after a stale save and guards sidebar-style in-app navigation', async () => {
    submissionClient.saveDeliverable.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { status: 409 }));
    renderEditor('/forms/form-srs/edit');
    const title = await screen.findByRole('textbox', { name: 'Form title' });
    fireEvent.change(title, { target: { value: 'My unsaved title' } });

    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('link', { name: 'Review nav' }));
    expect(screen.queryByRole('heading', { name: 'Review destination' })).not.toBeInTheDocument();
    expect(title).toHaveValue('My unsaved title');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('newer version');
    expect(screen.getByRole('textbox', { name: 'Form title' })).toHaveValue('My unsaved title');
  });

  it('duplicates choice fields with fresh persisted identities and retires persisted fields without deleting them', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Scope' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retire Framework PDF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(submissionClient.saveDeliverable).toHaveBeenCalled());
    const saved = submissionClient.saveDeliverable.mock.calls[0][1];
    const copies = saved.fields.filter((field) => field.type === 'dropdown');
    expect(copies).toHaveLength(2);
    expect(copies[0].definitionId).toBe('field-scope');
    expect(copies[1].definitionId).toBeNull();
    expect(copies[1].id).not.toBe(copies[0].id);
    expect(copies[1].options.every((option) => option.id === null)).toBe(true);
    expect(saved.fields.find((field) => field.id === 'framework')).toMatchObject({ active: false, definitionId: 'field-framework' });
  });

  it('keeps Student Number as a single non-duplicable identity anchor', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');

    const duplicateAnchor = screen.getByRole('button', { name: 'Duplicate Student Number' });
    expect(duplicateAnchor).toBeDisabled();
    fireEvent.click(duplicateAnchor);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(submissionClient.saveDeliverable).toHaveBeenCalled());
    const saved = submissionClient.saveDeliverable.mock.calls[0][1];
    expect(saved.fields.filter((field) => field.type === 'academicStudentNumber')).toHaveLength(1);
  });

  it('keeps PDF Document Check and AI Review independent and previews locally without saving', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    const aiReview = screen.getByRole('checkbox', { name: 'Allow AI Review' });
    expect(aiReview).toBeChecked();
    expect(aiReview).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Document Check' })).toHaveValue('Off');

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = await screen.findByRole('dialog', { name: 'Student preview' });
    expect(within(preview).getByText('Preview only. Nothing entered here is submitted or sent to review services.')).toBeInTheDocument();
    expect(within(preview).getByRole('textbox', { name: 'Scope' })).toBeInTheDocument();
    expect(submissionClient.saveDeliverable).not.toHaveBeenCalled();
  });
});
