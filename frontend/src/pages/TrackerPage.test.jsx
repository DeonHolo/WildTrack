import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { TrackerPage } from './TrackerPage.jsx';
import '../styles/index.css';
import '../styles/wildtrack.css';

const workflow = vi.hoisted(() => ({ state: null }));

vi.mock('../app/WorkflowContext.jsx', () => ({
  useWorkflow: () => workflow
}));

function createState() {
  const trackerColumns = [
    { id: 'probex', key: 'ProbExploration', label: 'ProbExploration', active: true, order: 1 },
    { id: 'srs', key: 'SRS', label: 'SRS', active: true, order: 2 },
    { id: 'demo', key: 'DEMO', label: 'DEMO', active: true, order: 3 },
    { id: 'peer', key: 'PeerEvaluation', label: 'PeerEvaluation', active: true, order: 4 }
  ];
  const students = Array.from({ length: 318 }, (_, index) => {
    const number = index + 1;
    return {
      id: `student-${number}`,
      studentNumber: `23-${String(number).padStart(4, '0')}-001`,
      name: `Student ${String(number).padStart(3, '0')}`,
      teamCode: `2526-sem2-it332-${String(Math.ceil(number / 5)).padStart(2, '0')}`,
      memberNumber: ((number - 1) % 5) + 1,
      milestones: {
        ProbExploration: number === 1 ? 79 : 0,
        SRS: number === 2 ? '#N/A' : number === 3 ? '' : 4,
        DEMO: number === 4 ? '5/28/2026' : '',
        PeerEvaluation: number === 5 ? 'DONE' : ''
      }
    };
  });

  return {
    activeStudentNumber: students[0].studentNumber,
    trackerColumns,
    students,
    projectMetadata: [{ groupCode: students[0].teamCode, softwareName: 'WildTrack', adviserName: 'Sir Ralph Laviste' }],
    deliverables: [],
    attempts: []
  };
}

function renderPage() {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <TrackerPage />
    </MantineProvider>
  );
}

describe('class tracker at scale', () => {
  beforeEach(() => {
    localStorage.clear();
    workflow.state = createState();
  });

  it('keeps 318 students inside one searchable and paged tracker workbench', () => {
    renderPage();

    const workbench = screen.getByRole('region', { name: 'Class-wide tracker table' });
    expect(within(workbench).getByText('Showing 1-25 of 318')).toBeInTheDocument();
    expect(within(workbench).getByText('Page 1 of 13')).toBeInTheDocument();
    expect(within(workbench).getByRole('button', { name: 'Previous' })).toBeInTheDocument();
    expect(within(workbench).getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(within(workbench).getByRole('button', { name: 'Load all rows' })).toBeInTheDocument();
    expect(within(workbench).getByRole('button', { name: 'Summary' })).toBeInTheDocument();
    expect(within(workbench).getAllByRole('row')).toHaveLength(26);

    fireEvent.click(within(workbench).getByRole('button', { name: 'Next' }));
    expect(within(workbench).getByText('Showing 26-50 of 318')).toBeInTheDocument();
    expect(within(workbench).getByText('Page 2 of 13')).toBeInTheDocument();
    fireEvent.click(within(workbench).getByRole('button', { name: 'Previous' }));
    expect(within(workbench).getByText('Page 1 of 13')).toBeInTheDocument();

    const search = within(workbench).getByRole('searchbox', { name: 'Search tracker' });
    search.focus();
    fireEvent.change(search, { target: { value: 'Student 318' } });
    expect(search).toHaveFocus();
    expect(within(workbench).getByText('Showing 1-1 of 1')).toBeInTheDocument();
    expect(within(workbench).getByText('Student 318')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Selected student context' })).getByText('Student 318')).toBeInTheDocument();
  });

  it('loads every row without losing compact mixed values or sticky identity context', () => {
    renderPage();
    const workbench = screen.getByRole('region', { name: 'Class-wide tracker table' });

    fireEvent.click(within(workbench).getByRole('button', { name: 'Load all rows' }));
    expect(within(workbench).getByText('Showing all 318 rows')).toBeInTheDocument();
    expect(within(workbench).getAllByRole('row')).toHaveLength(319);
    expect(within(workbench).getByText('79')).toBeInTheDocument();
    expect(within(workbench).getByText('#N/A')).toBeInTheDocument();
    expect(within(workbench).getByText('5/28/2026')).toBeInTheDocument();
    expect(within(workbench).getByText('DONE')).toBeInTheDocument();

    const targetRow = within(workbench).getByText('Student 318').closest('tr');
    fireEvent.click(targetRow);
    const context = screen.getByRole('region', { name: 'Selected student context' });
    expect(within(context).getByText('Student 318')).toBeInTheDocument();
    expect(targetRow).toHaveAttribute('aria-selected', 'true');
    expect(within(workbench).getByRole('columnheader', { name: 'Name of Student' })).toHaveClass('tracker-sticky-name');
    expect(within(workbench).getByRole('columnheader', { name: 'Team Code' })).toHaveClass('tracker-sticky-team');
    expect(within(workbench).getByRole('columnheader', { name: 'Member #' })).toHaveClass('tracker-sticky-member');
    expect(getComputedStyle(workbench.querySelector('.wt-tracker-grid-viewport')).overflow).toBe('auto');
    expect(getComputedStyle(within(workbench).getByRole('columnheader', { name: 'Name of Student' })).position).toBe('sticky');

    fireEvent.click(within(workbench).getByRole('button', { name: 'Use pages' }));
    expect(within(workbench).getByText('Page 1 of 13')).toBeInTheDocument();
  });
});

describe('empty tracker state (ticket 07)', () => {
  beforeEach(() => {
    localStorage.clear();
    workflow.state = {
      activeStudentNumber: '',
      trackerColumns: [
        { id: 'srs', key: 'SRS', label: 'SRS', active: true, order: 1 }
      ],
      students: [],
      projectMetadata: [],
      deliverables: [],
      attempts: []
    };
  });

  it('shows an instructive empty state when no students are imported', () => {
    renderPage();
    expect(screen.getByText('No students imported')).toBeInTheDocument();
    expect(screen.getByText(/Import the Tracker sheet/i)).toBeInTheDocument();
    expect(screen.getByText('0 rows')).toBeInTheDocument();
  });
});
