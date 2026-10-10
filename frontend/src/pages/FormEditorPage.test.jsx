import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    // Floating menus need viewport geometry; jsdom otherwise reports no space.
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1280);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 20, y: 100, top: 100, left: 20, bottom: 136, right: 340, width: 320, height: 36, toJSON() {}
    });
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

  it('hydrates existing generated forms with academic fields without marking the draft dirty', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');

    const labels = screen.getAllByRole('textbox', { name: 'Field label' }).map((input) => input.value);
    expect(labels.slice(0, 4)).toEqual(['Student Number', 'Student Name', 'Team Code', 'Section']);
    expect(screen.getByRole('status')).toHaveTextContent('No unsaved changes');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
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

  it('duplicates choice fields with fresh persisted identities and removes persisted fields without deleting historical identities', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Scope' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Framework PDF' }));
    expect(screen.queryByDisplayValue('Framework PDF')).not.toBeInTheDocument();
    expect(screen.getByText('Item deleted')).toBeInTheDocument();
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

  it('keeps Add question visible in the side rail and supports undo/redo', async () => {
    renderEditor('/forms/form-srs/edit');
    const title = await screen.findByRole('textbox', { name: 'Form title' });
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    fireEvent.change(title, { target: { value: 'Revised SRS title' } });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    expect(screen.getByRole('textbox', { name: 'Form title' })).toHaveValue('SRS Submission');
    expect(redo).toBeEnabled();
    fireEvent.click(redo);
    expect(screen.getByRole('textbox', { name: 'Form title' })).toHaveValue('Revised SRS title');

    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByDisplayValue('New question')).toBeInTheDocument();
    expect(screen.getAllByText(/Question [0-9]+ of [0-9]+/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Section 1 of 1')).not.toBeInTheDocument();
  });

  it('adds a question directly below the selected question and keeps question selection behavior', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');

    fireEvent.click(screen.getByDisplayValue('Framework PDF'));
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));

    const labels = screen.getAllByRole('textbox', { name: 'Field label' }).map((input) => input.value);
    expect(labels.indexOf('New question')).toBe(labels.indexOf('Framework PDF') + 1);
    expect(screen.getByDisplayValue('New question').closest('.wt-question-card')).toHaveClass('is-selected');
    expect(screen.getByDisplayValue('New question').closest('.wt-question-card')).toHaveClass('is-new-question');
    expect(screen.getByDisplayValue('New question')).toHaveFocus();
    expect(document.querySelector('.wt-form-editor-announcement')).toHaveTextContent('Added New question at position 6 of 7');
    expect(submissionClient.saveDeliverable).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('inserts with visible focus and a temporary highlight while respecting reduced motion', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)', addEventListener: vi.fn(), removeEventListener: vi.fn()
    }));
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
      const label = screen.getByDisplayValue('New question');
      expect(label).toHaveFocus();
      expect(label.closest('.wt-question-card')).toHaveClass('is-new-question');
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
      act(() => vi.advanceTimersByTime(4000));
      expect(label.closest('.wt-question-card')).not.toHaveClass('is-new-question');
      expect(submissionClient.saveDeliverable).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      matchMedia.mockRestore();
    }
  });

  it('renders the saved public URL as a top-right action button', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    expect(screen.queryByText('Public URL:')).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Public URL' });
    expect(link).toHaveAttribute('href', '/w/it-it411-2026-27-semester-1/submit/srs-submission');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('keeps a deleted-item snackbar until Undo and restores only that question', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Framework PDF' }));

    const deletedLabel = screen.getByText('Item deleted');
    const snackbar = deletedLabel.closest('.wt-form-editor-delete-snackbar');
    expect(snackbar).toBeInTheDocument();
    expect(within(snackbar).getByText(/Framework PDF was removed/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Form title' }), { target: { value: 'Title changed after delete' } });
    expect(screen.getByText('Item deleted')).toBeInTheDocument();
    fireEvent.click(within(snackbar).getByRole('button', { name: 'Undo' }));

    expect(screen.getByDisplayValue('Framework PDF')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Form title' })).toHaveValue('Title changed after delete');
    expect(screen.queryByText('Item deleted')).not.toBeInTheDocument();
  });

  it('reorders downward from the native drag handle while keeping arrow controls as a fallback', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    const sourceHandle = screen.getByRole('button', { name: 'Drag Framework PDF' });
    const targetHandle = screen.getByRole('button', { name: 'Drag Scope' });
    const targetCard = targetHandle.closest('.wt-question-card');
    fireEvent.dragStart(sourceHandle, { dataTransfer: { effectAllowed: 'move' } });
    fireEvent.dragOver(targetCard);
    fireEvent.drop(targetCard);
    fireEvent.dragEnd(sourceHandle);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(submissionClient.saveDeliverable).toHaveBeenCalled());
    const activeOrder = submissionClient.saveDeliverable.mock.calls[0][1].fields
      .filter((field) => field.active !== false)
      .map((field) => field.id);
    expect(activeOrder).toEqual(['studentNumber', 'studentName', 'teamCode', 'section', 'scope', 'framework']);
  });

  it.each(['before', 'after'])('previews and performs an explicit %s-card drop without saving or changing persisted identities', async (side) => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    const source = screen.getByRole('button', { name: 'Drag Framework PDF' });
    const sourceCard = source.closest('.wt-question-card');
    const targetCard = screen.getAllByRole('textbox', { name: 'Field label' }).find((input) => input.value === 'Team Code').closest('.wt-question-card');
    targetCard.getBoundingClientRect = () => ({ top: 100, height: 200 });
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), setDragImage: vi.fn() };
    fireEvent.dragStart(source, { dataTransfer });
    expect(sourceCard).toHaveClass('is-dragging');
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'framework');
    expect(document.querySelector('.wt-question-drag-preview')).toHaveAttribute('aria-hidden', 'true');
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperties(over, { clientY: { value: side === 'before' ? 120 : 280 }, dataTransfer: { value: dataTransfer } });
    fireEvent(targetCard, over);
    const indicator = document.querySelector('.wt-question-drop-indicator');
    expect(indicator).toHaveClass(`is-${side}`);
    expect(indicator).toHaveTextContent(`Drop ${side} Team Code`);
    expect(document.querySelector('.wt-form-editor-announcement')).toHaveTextContent(`Drop ${side} Team Code`);
    fireEvent.drop(targetCard);
    expect(document.querySelector('.wt-question-drop-indicator')).not.toBeInTheDocument();
    expect(document.querySelector('.wt-question-drag-preview')).not.toBeInTheDocument();
    expect(submissionClient.saveDeliverable).not.toHaveBeenCalled();
    const expected = side === 'before'
      ? ['Student Number', 'Student Name', 'Framework PDF', 'Team Code', 'Section', 'Scope']
      : ['Student Number', 'Student Name', 'Team Code', 'Framework PDF', 'Section', 'Scope'];
    expect(screen.getAllByRole('textbox', { name: 'Field label' }).map((input) => input.value)).toEqual(expected);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(submissionClient.saveDeliverable).toHaveBeenCalled());
    const saved = submissionClient.saveDeliverable.mock.calls[0][1];
    expect(saved.fields.find((field) => field.id === 'framework')).toMatchObject({ definitionId: 'field-framework', type: 'drive' });
    expect(saved.fields.find((field) => field.id === 'scope').options.map((option) => option.id)).toEqual(['option-a', 'option-b']);
  });

  it('cancels a drag with Escape, removes its preview, and preserves the clean draft', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    const before = screen.getAllByRole('textbox', { name: 'Field label' }).map((input) => input.value);
    const source = screen.getByRole('button', { name: 'Drag Framework PDF' });
    fireEvent.dragStart(source, { dataTransfer: { effectAllowed: '', setDragImage: vi.fn() } });
    fireEvent.dragOver(screen.getByDisplayValue('Scope').closest('.wt-question-card'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(source.closest('.wt-question-card')).not.toHaveClass('is-dragging');
    expect(document.querySelector('.wt-question-drop-indicator')).not.toBeInTheDocument();
    expect(document.querySelector('.wt-question-drag-preview')).not.toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: 'Field label' }).map((input) => input.value)).toEqual(before);
    expect(screen.getByRole('status')).toHaveTextContent('No unsaved changes');
    expect(submissionClient.saveDeliverable).not.toHaveBeenCalled();
  });

  it('keeps move buttons as accessible reorder alternatives with a position announcement', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    const move = screen.getByRole('button', { name: 'Move Framework PDF up' });
    move.focus();
    fireEvent.click(move);
    expect(move).toHaveFocus();
    expect(screen.getAllByRole('textbox', { name: 'Field label' }).map((input) => input.value)).toEqual([
      'Student Number', 'Student Name', 'Team Code', 'Framework PDF', 'Section', 'Scope'
    ]);
    expect(document.querySelector('.wt-form-editor-announcement')).toHaveTextContent('Moved Framework PDF to position 4 of 6');
    expect(submissionClient.saveDeliverable).not.toHaveBeenCalled();
  });

  it('reviews academic suggestions before applying selection and order, with Student Number locked', async () => {
    const data = state();
    data.deliverables[0].fields.splice(1, 0, {
      id: 'teamCode', definitionId: 'field-team-code', label: 'Team Code', helpText: '', type: 'academicTeamCode', required: true, active: true, options: []
    });
    formsClient.loadFormsState.mockResolvedValueOnce(data);
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh academic suggestions' }));
    const dialog = await screen.findByRole('dialog', { name: 'Review academic fields' });
    expect(within(dialog).getByRole('checkbox', { name: 'Student Number' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Student Number' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Team Code' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move Section up' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move Section up' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));

    const labels = screen.getAllByRole('textbox', { name: 'Field label' }).map((input) => input.value);
    expect(labels.slice(0, 3)).toEqual(['Student Number', 'Section', 'Student Name']);
    expect(labels).not.toContain('Team Code');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(submissionClient.saveDeliverable).toHaveBeenCalled());
    expect(submissionClient.saveDeliverable.mock.calls[0][1].fields.find((field) => field.id === 'teamCode'))
      .toMatchObject({ definitionId: 'field-team-code', active: false });
  });

  it('cancels academic suggestion review without mutating the draft', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh academic suggestions' }));
    const dialog = await screen.findByRole('dialog', { name: 'Review academic fields' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Section' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.getAllByRole('textbox', { name: 'Field label' }).some((input) => input.value === 'Section')).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('No unsaved changes');
  });

  it('uses the compact Field Type dropdown surface without the default bottom padding gap', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    const frameworkCard = screen.getByDisplayValue('Framework PDF').closest('.wt-question-card');
    fireEvent.click(within(frameworkCard).getByRole('textbox', { name: 'Field type' }));
    const pdfOption = await screen.findByRole('option', { name: 'Google Drive PDF link', exact: true });
    const dropdown = pdfOption.closest('.wt-field-type-dropdown');
    expect(dropdown).toHaveClass('wt-form-designer-type-dropdown');
    expect(frameworkCard).not.toContainElement(dropdown);
    expect(within(dropdown).getByRole('option', { name: 'Google Drive PDF link', exact: true })).toBeInTheDocument();
    expect(within(dropdown).getByRole('option', { name: 'Section', exact: true })).toBeInTheDocument();
    expect(within(dropdown).getAllByRole('option')).toHaveLength(14);
  });

  it.each(['Framework PDF', 'Scope'])('retires the original persisted definition after a type edit and rejected Save: %s', async (label) => {
    const loaded = state();
    const original = loaded.deliverables[0].fields.find((field) => field.label === label);
    const oldResponse = { id: 'old-response', deliverableId: 'form-srs', values: {
      framework: 'https://drive.google.com/file/d/original-pdf/view', scope: 'Campus'
    } };
    loaded.attempts = [oldResponse];
    formsClient.loadFormsState.mockResolvedValueOnce(loaded);
    submissionClient.saveDeliverable.mockImplementation(async (_workspaceId, payload) => {
      const persisted = payload.fields.find((field) => field.definitionId === original.definitionId);
      if (persisted.type !== original.type) throw new Error('A submission field type cannot be changed after responses exist. Remove it from the form and add a new field instead.');
      return { ...payload, updatedAt: '2026-09-19T04:00:00' };
    });
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    const card = screen.getByDisplayValue(label).closest('.wt-question-card');
    fireEvent.click(within(card).getByRole('textbox', { name: 'Field type' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Short answer', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A submission field type cannot be changed after responses exist');

    fireEvent.click(screen.getByRole('button', { name: `Remove ${label}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    const replacement = screen.getByDisplayValue('New question').closest('.wt-question-card');
    fireEvent.change(within(replacement).getByRole('textbox', { name: 'Field label' }), { target: { value: 'Replacement note' } });
    fireEvent.click(within(replacement).getByRole('textbox', { name: 'Field type' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Paragraph', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    const saved = submissionClient.saveDeliverable.mock.calls.at(-1)[1];
    expect(saved.fields.find((field) => field.definitionId === original.definitionId))
      .toMatchObject({ id: original.id, type: original.type, label: original.label, active: false });
    expect(saved.fields.find((field) => field.definitionId === original.definitionId).options.map((option) => option.id))
      .toEqual(original.options.map((option) => option.id));
    expect(saved.fields.find((field) => field.label === 'Replacement note'))
      .toMatchObject({ definitionId: null, type: 'textarea', active: true });
    expect(saved.fields.find((field) => field.label === 'Replacement note').id).not.toBe(original.id);
    expect(loaded.attempts[0]).toEqual(oldResponse);
  });

  it('restores the edited draft type on deletion Undo rather than discarding the pending edit', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    const card = screen.getByDisplayValue('Framework PDF').closest('.wt-question-card');
    fireEvent.click(within(card).getByRole('textbox', { name: 'Field type' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Paragraph', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Framework PDF' }));
    const snackbar = screen.getByText('Item deleted').closest('.wt-form-editor-delete-snackbar');
    fireEvent.click(within(snackbar).getByRole('button', { name: 'Undo' }));
    const restored = screen.getByDisplayValue('Framework PDF').closest('.wt-question-card');
    expect(within(restored).getByRole('textbox', { name: 'Field type' })).toHaveValue('Paragraph');
    expect(submissionClient.saveDeliverable).not.toHaveBeenCalled();
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

  it('forces automatic PDF Document Check on legacy OFF fields while keeping AI Review independent', async () => {
    renderEditor('/forms/form-srs/edit');
    await screen.findByDisplayValue('SRS Submission');
    const aiReview = screen.getByRole('checkbox', { name: 'Allow AI Review' });
    expect(aiReview).toBeChecked();
    expect(aiReview).toBeEnabled();
    expect(screen.queryByRole('textbox', { name: 'Document Check' })).not.toBeInTheDocument();
    expect(screen.getByText('Document Check runs automatically for PDF submissions.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(submissionClient.saveDeliverable).toHaveBeenCalled());
    expect(submissionClient.saveDeliverable.mock.calls[0][1].fields.find((field) => field.id === 'framework'))
      .toMatchObject({ documentCheckPolicy: 'AUTO', aiReviewEnabled: true });
    submissionClient.saveDeliverable.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = await screen.findByRole('dialog', { name: 'Student preview' });
    expect(within(preview).getByText('Preview only. Nothing entered here is submitted or sent to review services.')).toBeInTheDocument();
    expect(within(preview).getByRole('textbox', { name: 'Scope' })).toBeInTheDocument();
    expect(submissionClient.saveDeliverable).not.toHaveBeenCalled();
  });
});
