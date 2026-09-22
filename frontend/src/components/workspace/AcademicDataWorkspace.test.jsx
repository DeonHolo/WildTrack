import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../../app/theme.js';
import { AcademicDataWorkspace } from './AcademicDataWorkspace.jsx';

const client = vi.hoisted(() => ({
  loadAcademicData: vi.fn(),
  saveAcademicRows: vi.fn(),
  getAcademicDataSnapshot: vi.fn(),
  clearAcademicDataSnapshot: vi.fn(),
  addAcademicDeliverableColumn: vi.fn()
}));

const csv = vi.hoisted(() => ({ downloadAcademicCsv: vi.fn() }));

vi.mock('../../lib/academicDataCsv.js', () => ({ downloadAcademicCsv: (...args) => csv.downloadAcademicCsv(...args) }));

vi.mock('../../lib/academicDataClient.js', () => ({
  loadAcademicData: (...args) => client.loadAcademicData(...args),
  saveAcademicRows: (...args) => client.saveAcademicRows(...args),
  getAcademicDataSnapshot: (...args) => client.getAcademicDataSnapshot(...args),
  clearAcademicDataSnapshot: (...args) => client.clearAcademicDataSnapshot(...args),
  addAcademicDeliverableColumn: (...args) => client.addAcademicDeliverableColumn(...args)
}));

function snapshot(overrides = {}) {
  return {
    students: [{
      id: 'student-1',
      studentNumber: '26-0001',
      studentName: 'DOE, JANE',
      teamCode: 'TEAM-01',
      teamFormationCode: 'SOURCE-01',
      memberNumber: '1',
      sectionName: 'G7',
      adviserName: 'Sir Ralph',
      institutionalEmail: 'jane@cit.edu',
      sourceRowNumber: 12,
      updatedAt: '2026-09-19T08:00:00'
    }],
    projects: [{
      id: 'project-1',
      groupCode: 'TEAM-01',
      sourceGroupCode: 'SOURCE-01',
      projectTitle: 'WildTrack',
      softwareName: 'WildTrack',
      adviserName: 'Sir Ralph',
      projectStatus: 'Active',
      category: 'Capstone',
      description: '',
      proposalRemarks: '',
      demoComments: '',
      sourceRowNumber: 8,
      updatedAt: '2026-09-19T08:00:00'
    }],
    trackerColumns: [
      { id: 'column-srs', columnKey: 'Refactored SRS', label: 'Refactored SRS', active: true, pdfRequired: true },
      { id: 'column-sdd', columnKey: 'Refactored SDD', label: 'Refactored SDD', active: true, pdfRequired: true }
    ],
    deliverables: [{
      id: 'deliverable-srs',
      trackerColumnKey: 'Refactored SRS',
      title: 'Refactored SRS Submission',
      slug: 'refactored-srs',
      dueAt: '2026-09-19T23:59:00',
      status: 'UNPUBLISHED',
      updatedAt: '2026-09-19T08:00:00'
    }],
    ...overrides
  };
}

function renderWorkspace(props = {}) {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <AcademicDataWorkspace workspaceId="workspace-it" {...props} />
    </MantineProvider>
  );
}

async function openStudents() {
  return screen.findByRole('table', { name: 'Students academic data' });
}

describe('AcademicDataWorkspace', () => {
  beforeEach(() => {
    client.loadAcademicData.mockReset().mockResolvedValue(snapshot());
    client.saveAcademicRows.mockReset().mockResolvedValue([]);
    client.getAcademicDataSnapshot.mockReset().mockReturnValue(null);
    client.clearAcademicDataSnapshot.mockReset();
    client.addAcademicDeliverableColumn.mockReset().mockResolvedValue({ columnKey: 'New PDF', label: 'New PDF' });
    csv.downloadAcademicCsv.mockReset();
  });

  it('edits an imported row and saves its stable id/version while keeping provenance visible', async () => {
    const onSaved = vi.fn();
    renderWorkspace({ onSaved });
    const table = await openStudents();

    expect(within(table).getByText('Imported row 12')).toBeInTheDocument();
    expect(within(table).getByText('Source team: SOURCE-01')).toBeInTheDocument();
    const name = within(table).getByRole('textbox', { name: 'Student name for 26-0001' });
    fireEvent.change(name, { target: { value: 'DOE, JANE EDITED' } });

    client.loadAcademicData.mockResolvedValueOnce(snapshot({
      students: [{ ...snapshot().students[0], studentName: 'DOE, JANE EDITED', updatedAt: '2026-09-19T08:01:00' }]
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes (1)' }));

    await waitFor(() => expect(client.saveAcademicRows).toHaveBeenCalledWith('workspace-it', 'students', [expect.objectContaining({
      id: 'student-1',
      studentNumber: '26-0001',
      studentName: 'DOE, JANE EDITED',
      expectedUpdatedAt: '2026-09-19T08:00:00'
    })]));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(await screen.findByText('1 row saved to WildTrack.')).toBeInTheDocument();
  });

  it('previews reordered spreadsheet headers and applies a multirow paste locally before one atomic save call', async () => {
    renderWorkspace();
    await openStudents();
    fireEvent.click(screen.getByRole('button', { name: 'Paste rows' }));
    const dialog = await screen.findByRole('dialog', { name: 'Paste students rows' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Pasted spreadsheet rows' }), {
      target: { value: 'Team code\tStudent name\tStudent Number\nTEAM-01\tDOE, JANE UPDATED\t26-0001\nTEAM-02\tNEW, STUDENT\t26-0002' }
    });

    expect(await within(dialog).findByText('26-0001')).toBeInTheDocument();
    expect(within(dialog).getByText('26-0002')).toBeInTheDocument();
    expect(within(dialog).getByText('Update')).toBeInTheDocument();
    expect(within(dialog).getByText('Add')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply to grid' }));

    const table = screen.getByRole('table', { name: 'Students academic data' });
    expect(within(table).getByRole('textbox', { name: 'Student name for 26-0001' })).toHaveValue('DOE, JANE UPDATED');
    expect(within(table).getByRole('textbox', { name: 'Student name for 26-0002' })).toHaveValue('NEW, STUDENT');

    fireEvent.click(screen.getByRole('button', { name: 'Save changes (2)' }));
    await waitFor(() => expect(client.saveAcademicRows).toHaveBeenCalledTimes(1));
    const [, kind, rows] = client.saveAcademicRows.mock.calls[0];
    expect(kind).toBe('students');
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.studentNumber === '26-0001')).toMatchObject({ id: 'student-1', expectedUpdatedAt: '2026-09-19T08:00:00' });
    expect(rows.find((row) => row.studentNumber === '26-0002')).toMatchObject({ id: null, expectedUpdatedAt: null, teamCode: 'TEAM-02' });
  });

  it('blocks an invalid duplicate paste before it can change the grid or call the backend', async () => {
    renderWorkspace();
    await openStudents();
    fireEvent.click(screen.getByRole('button', { name: 'Paste rows' }));
    const dialog = await screen.findByRole('dialog', { name: 'Paste students rows' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Pasted spreadsheet rows' }), {
      target: { value: 'Student Number\tStudent name\tTeam code\n26-0002\tFIRST\tTEAM-02\n26-0002\tSECOND\tTEAM-03' }
    });

    expect(await within(dialog).findByText(/duplicate 26-0002/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Apply to grid' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('table', { name: 'Students academic data' })).not.toHaveTextContent('FIRST');
    expect(client.saveAcademicRows).not.toHaveBeenCalled();
  });

  it('surfaces stale-save conflicts without discarding the edited cell', async () => {
    client.saveAcademicRows.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { status: 409 }));
    renderWorkspace();
    const table = await openStudents();
    const name = within(table).getByRole('textbox', { name: 'Student name for 26-0001' });
    fireEvent.change(name, { target: { value: 'MY LOCAL EDIT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes (1)' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('changed after you opened it');
    expect(within(table).getByRole('textbox', { name: 'Student name for 26-0001' })).toHaveValue('MY LOCAL EDIT');
  });

  it('edits teams/projects and deliverables through their own backend grids', async () => {
    renderWorkspace();
    await openStudents();

    fireEvent.click(screen.getByRole('tab', { name: /Teams \/ Projects/ }));
    const projects = screen.getByRole('table', { name: 'Teams / Projects academic data' });
    fireEvent.change(within(projects).getByRole('textbox', { name: 'Project title for TEAM-01' }), { target: { value: 'WildTrack Revised' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes (1)' }));
    await waitFor(() => expect(client.saveAcademicRows).toHaveBeenCalledWith('workspace-it', 'projects', [expect.objectContaining({
      id: 'project-1', groupCode: 'TEAM-01', projectTitle: 'WildTrack Revised', expectedUpdatedAt: '2026-09-19T08:00:00'
    })]));

    client.saveAcademicRows.mockClear();
    fireEvent.click(screen.getByRole('tab', { name: /Deliverables/ }));
    const deliverables = screen.getByRole('table', { name: 'Deliverables academic data' });
    expect(within(deliverables).getByText('Refactored SRS')).toBeInTheDocument();
    fireEvent.change(within(deliverables).getByRole('textbox', { name: 'Title for Refactored SRS' }), { target: { value: 'Refactored SRS Final' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes (1)' }));
    await waitFor(() => expect(client.saveAcademicRows).toHaveBeenCalledWith('workspace-it', 'deliverables', [expect.objectContaining({
      id: 'deliverable-srs', trackerColumnKey: 'Refactored SRS', title: 'Refactored SRS Final', expectedUpdatedAt: '2026-09-19T08:00:00'
    })]));
  });

  it('shows roster-only teams and imported tracker columns in the same grids before they have project/form rows', async () => {
    client.loadAcademicData.mockResolvedValueOnce(snapshot({ projects: [], deliverables: [] }));
    renderWorkspace();
    await openStudents();

    fireEvent.click(screen.getByRole('tab', { name: /Teams \/ Projects/ }));
    const projects = screen.getByRole('table', { name: 'Teams / Projects academic data' });
    expect(within(projects).getByText('Roster team')).toBeInTheDocument();
    expect(within(projects).getByRole('textbox', { name: 'Project title for TEAM-01' })).toHaveValue('');

    fireEvent.click(screen.getByRole('tab', { name: /Deliverables/ }));
    const deliverables = screen.getByRole('table', { name: 'Deliverables academic data' });
    expect(within(deliverables).getAllByText('Tracker column')).toHaveLength(2);
    expect(within(deliverables).getByText('Refactored SRS')).toBeInTheDocument();
    expect(within(deliverables).getByText('Refactored SDD')).toBeInTheDocument();
  });

  it('paginates large academic grids without changing the editable dataset', async () => {
    const students = Array.from({ length: 55 }, (_, index) => ({
      ...snapshot().students[0],
      id: `student-${index + 1}`,
      studentNumber: `26-${String(index + 1).padStart(4, '0')}`,
      studentName: `STUDENT, ${index + 1}`,
      sourceRowNumber: index + 2
    }));
    client.loadAcademicData.mockResolvedValueOnce(snapshot({ students }));
    renderWorkspace();

    const firstPage = await openStudents();
    expect(within(firstPage).getByRole('textbox', { name: 'Student name for 26-0001' })).toBeInTheDocument();
    expect(within(firstPage).queryByRole('textbox', { name: 'Student name for 26-0051' })).not.toBeInTheDocument();
    expect(screen.getByText('1–50 of 55')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(await screen.findByRole('textbox', { name: 'Student name for 26-0051' })).toBeInTheDocument();
    expect(screen.getByText('51–55 of 55')).toBeInTheDocument();
  });

  it('adds a new student on the last page and focuses its editable row', async () => {
    const students = Array.from({ length: 55 }, (_, index) => ({
      ...snapshot().students[0],
      id: `student-${index + 1}`,
      studentNumber: `26-${String(index + 1).padStart(4, '0')}`,
      studentName: `STUDENT, ${index + 1}`
    }));
    client.loadAcademicData.mockResolvedValueOnce(snapshot({ students }));
    renderWorkspace();
    await openStudents();

    fireEvent.click(screen.getByRole('button', { name: 'Add row' }));
    const newNumber = screen.getByRole('textbox', { name: 'Student Number for new row' });
    expect(newNumber).toHaveFocus();
    expect(screen.getByText('51–56 of 56')).toBeInTheDocument();
    fireEvent.change(newNumber, { target: { value: '26-0999' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Student name for 26-0999' }), { target: { value: 'NEW, STUDENT' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Team code for 26-0999' }), { target: { value: 'TEAM-99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes (1)' }));
    await waitFor(() => expect(client.saveAcademicRows).toHaveBeenCalledWith('workspace-it', 'students', [expect.objectContaining({ id: null, studentNumber: '26-0999' })]));
  });

  it('saving a project does not discard an unsaved new student or an edited deliverable in other tabs', async () => {
    renderWorkspace();
    await openStudents();
    fireEvent.click(screen.getByRole('button', { name: 'Add row' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Student Number for new row' }), {
      target: { value: '26-0999' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Student name for 26-0999' }), {
      target: { value: 'UNSAVED STUDENT' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Team code for 26-0999' }), {
      target: { value: 'TEAM-99' }
    });
    fireEvent.click(screen.getByRole('tab', { name: /Deliverables/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title for Refactored SRS' }), {
      target: { value: 'UNSAVED DELIVERABLE' }
    });
    fireEvent.click(screen.getByRole('tab', { name: /Teams \/ Projects/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Project title for TEAM-01' }), {
      target: { value: 'SAVED PROJECT' }
    });
    client.loadAcademicData.mockResolvedValueOnce(snapshot({
      projects: [{ ...snapshot().projects[0], projectTitle: 'SAVED PROJECT' }]
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes (1)' }));
    await waitFor(() => expect(screen.getByText('1 row saved to WildTrack.')).toBeInTheDocument());
    expect(client.saveAcademicRows).toHaveBeenCalledWith('workspace-it', 'projects', [expect.objectContaining({
      groupCode: 'TEAM-01', projectTitle: 'SAVED PROJECT'
    })]);

    fireEvent.click(screen.getByRole('tab', { name: /Students/ }));
    expect(screen.getByRole('textbox', { name: 'Student name for 26-0999' })).toHaveValue('UNSAVED STUDENT');
    expect(screen.getByRole('button', { name: 'Save changes (1)' })).toBeEnabled();
    fireEvent.click(screen.getByRole('tab', { name: /Deliverables/ }));
    expect(screen.getByRole('textbox', { name: 'Title for Refactored SRS' })).toHaveValue('UNSAVED DELIVERABLE');
    expect(screen.getByRole('button', { name: 'Save changes (1)' })).toBeEnabled();
  });

  it('searches the entire grid across pages and exports all matching rows', async () => {
    const students = Array.from({ length: 55 }, (_, index) => ({
      ...snapshot().students[0],
      id: `student-${index + 1}`,
      studentNumber: `26-${String(index + 1).padStart(4, '0')}`,
      studentName: index % 2 ? 'MATCH' : 'OTHER'
    }));
    client.loadAcademicData.mockResolvedValueOnce(snapshot({ students }));
    renderWorkspace();
    await openStudents();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search students' }), { target: { value: '26-0055' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const table = screen.getByRole('table', { name: 'Students academic data' });
    expect(within(table).getByRole('textbox', { name: 'Student Number for 26-0055' })).toBeInTheDocument();
    expect(within(table).queryByRole('textbox', { name: 'Student Number for 26-0001' })).not.toBeInTheDocument();
    expect(screen.getByText('1–1 of 1 matching of 55')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV (filtered)' }));
    expect(csv.downloadAcademicCsv).toHaveBeenCalledWith('students', expect.any(Array), [expect.objectContaining({ studentNumber: '26-0055' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('1–50 of 55')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(csv.downloadAcademicCsv.mock.calls[1][2]).toHaveLength(55);
  });

  it('uses the server-backed tracker-column endpoint and jumps to its form row for later saving', async () => {
    const original = snapshot();
    client.loadAcademicData.mockResolvedValueOnce(original).mockResolvedValueOnce(snapshot({
      trackerColumns: [...original.trackerColumns, { columnKey: 'New PDF', label: 'New PDF', active: true, pdfRequired: true }]
    }));
    renderWorkspace();
    await openStudents();
    fireEvent.click(screen.getByRole('tab', { name: /Deliverables/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add row' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add deliverable' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Deliverable name' }), { target: { value: 'New PDF' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create tracker column' }));

    await waitFor(() => expect(client.addAcademicDeliverableColumn).toHaveBeenCalledWith('workspace-it', 'New PDF', true, original.trackerColumns));
    const dueDate = await screen.findByLabelText('Due date for New PDF');
    expect(screen.getByText(/Tracker column New PDF created/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Title for New PDF' })).toHaveFocus();
    fireEvent.change(dueDate, { target: { value: '2026-10-01T23:59' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes (1)' }));
    await waitFor(() => expect(client.saveAcademicRows).toHaveBeenCalledWith('workspace-it', 'deliverables', [expect.objectContaining({
      id: null, trackerColumnKey: 'New PDF', title: 'New PDF Submission', dueAt: '2026-10-01T23:59:00', status: 'UNPUBLISHED'
    })]));
  });

  it('shows cached records immediately and preserves edits during background refresh', async () => {
    let release;
    client.getAcademicDataSnapshot.mockReturnValue(snapshot());
    client.loadAcademicData.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    renderWorkspace({ cacheScope: 'admin-1' });
    const table = screen.getByRole('table', { name: 'Students academic data' });
    expect(screen.queryByText('Loading academic records…')).not.toBeInTheDocument();
    const name = within(table).getByRole('textbox', { name: 'Student name for 26-0001' });
    fireEvent.change(name, { target: { value: 'UNSAVED EDIT' } });
    release(snapshot({ students: [{ ...snapshot().students[0], studentName: 'UPDATED FROM SERVER' }] }));
    expect(await screen.findByText(/Newer academic records are available/)).toBeInTheDocument();
    expect(name).toHaveValue('UNSAVED EDIT');
  });

  it('clears previously cached academic records when the server rejects the account', async () => {
    client.getAcademicDataSnapshot.mockReturnValueOnce(snapshot()).mockReturnValueOnce(snapshot()).mockReturnValue(null);
    client.loadAcademicData.mockRejectedValueOnce(Object.assign(new Error('Access revoked'), { status: 403 }));
    renderWorkspace({ cacheScope: 'admin-1' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Access revoked');
    expect(client.clearAcademicDataSnapshot).toHaveBeenCalledWith('workspace-it', 'admin-1');
    expect(screen.getByRole('table', { name: 'Students academic data' })).not.toHaveTextContent('DOE, JANE');
  });
});
