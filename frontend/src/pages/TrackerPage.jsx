import { useEffect, useMemo, useState } from 'react';
import { Button, Group, Paper, Popover, Text, TextInput, Title } from '@mantine/core';
import { CaretLeft, CaretRight, ChartBar, MagnifyingGlass, UsersThree } from '@phosphor-icons/react';
import { PageHeader } from '../components/ui.jsx';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import {
  formatDateTime,
  getActiveTrackerColumns,
  getAdviserOptions,
  getProjectMetadata,
  getTeamAdviser,
  isUsableAdviserName,
  normalizeStudentNumber
} from '../lib/workflow.js';
import { getStoredPreviewAdviser, usePreviewRole } from '../hooks/usePreviewRole.js';

const PAGE_SIZE = 25;
const COMPACT_LABELS = {
  probexploration: 'ProbEx', convergence: 'Conv', rrl: 'RRL', projectproposal: 'Proposal',
  srs: 'SRS', sdd: 'SDD', adviserassessment: 'Adviser', sourcecode: 'Source', demo: 'Demo', peerevaluation: 'Peer'
};

export function TrackerPage() {
  const { state } = useWorkflow();
  const previewRole = usePreviewRole();
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState(state.activeStudentNumber || getStudentKey(state.students[0]) || '');
  const [page, setPage] = useState(1);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  const activeColumns = getActiveTrackerColumns(state);
  const adviserOptions = useMemo(() => getAdviserOptions(state), [state]);
  const adviserName = previewRole === 'adviser'
    ? adviserOptions.includes(getStoredPreviewAdviser()) ? getStoredPreviewAdviser() : adviserOptions[0] || 'Unassigned'
    : '';
  const scopeStudents = useMemo(
    () => previewRole === 'adviser'
      ? state.students.filter((student) => getTeamAdviser(state, student.teamCode) === adviserName)
      : state.students,
    [adviserName, previewRole, state]
  );
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? scopeStudents.filter((student) => `${student.name} ${student.teamCode} ${student.studentNumber}`.toLowerCase().includes(needle))
      : scopeStudents;
    return [...filtered].sort((first, second) => String(first.teamCode).localeCompare(String(second.teamCode)) || Number(first.memberNumber || 0) - Number(second.memberNumber || 0));
  }, [query, scopeStudents]);
  const pageCount = showAllRows ? 1 : Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = showAllRows ? rows : rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = pageRows.find((student) => getStudentKey(student) === selectedKey || student.studentNumber === selectedKey) || pageRows[0] || rows[0];
  const selectedProject = selected ? getProjectMetadata(state, selected.teamCode) : null;
  const selectedAdviser = previewRole === 'adviser'
    ? adviserName
    : isUsableAdviserName(selectedProject?.adviserName)
      ? selectedProject.adviserName
      : isUsableAdviserName(selected?.adviser) ? selected.adviser : 'Unassigned';
  const counts = useMemo(() => buildTrackerCounts(scopeStudents, activeColumns), [activeColumns, scopeStudents]);
  const selectedSummary = useMemo(() => selected ? buildSelectedStudentSummary(selected, state) : null, [selected, state]);
  const firstVisible = rows.length ? ((page - 1) * PAGE_SIZE) + 1 : 0;
  const lastVisible = Math.min(page * PAGE_SIZE, rows.length);

  useEffect(() => setPage(1), [query]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  return (
    <div className="page-stack wt-tracker-page">
      <PageHeader
        title="Tracker"
        description={previewRole === 'adviser'
          ? 'Read-only class-record values for teams assigned to the selected adviser.'
          : 'Raw class-record values stay visible as days-late numbers, dates, blanks, or Sheet values.'}
        actions={previewRole === 'adviser' ? (
          <div className="role-scope-note"><UsersThree aria-hidden="true" /><span>Adviser scope</span><strong>{adviserName}</strong></div>
        ) : null}
      />

      <Paper className="wt-tracker-workbench" withBorder>
        {selected ? (
          <section className="wt-tracker-context" aria-label="Selected student context">
            <div className="wt-tracker-student-identity">
              <Text component="span" className="wt-tracker-eyebrow">Selected student</Text>
              <Title order={2}>{selected.name}</Title>
              <Text size="sm" c="dimmed" className="wt-tabular">
                {selected.studentNumber || 'No Student Number'} · {selected.teamCode} · Member {selected.memberNumber}
              </Text>
              <Text size="sm" c="dimmed">
                {selectedProject?.softwareName || selectedProject?.projectTitle || 'Project metadata not loaded'} · {selectedAdviser}
              </Text>
            </div>
            <div className="wt-tracker-student-metrics" aria-label="Selected student summary">
              <MetricLine label="Missing" value={selectedSummary.missingCount} />
              <MetricLine label="Late" value={selectedSummary.lateCount} />
              <MetricLine label="Needs review" value={selectedSummary.needsReviewCount} />
              <MetricLine label="Template-like" value={selectedSummary.templateCount} />
              <Text size="xs" c="dimmed" className="wt-tracker-latest">
                {selectedSummary.latest ? `Latest: ${selectedSummary.latest}` : 'No response recorded yet'}
              </Text>
            </div>
          </section>
        ) : null}

        <section className="wt-tracker-table-region" role="region" aria-label="Class-wide tracker table">
          <header className="wt-tracker-table-title">
            <div>
              <Text component="span" className="wt-tracker-eyebrow">{previewRole === 'adviser' ? 'Assigned teams' : 'Class-wide tracker'}</Text>
              <Title order={3}>Student progress</Title>
            </div>
            <Text size="sm" fw={750} className="wt-tabular">{rows.length} rows</Text>
          </header>

          <div className="wt-tracker-toolbar">
            <Text size="sm" fw={700} c="dimmed" className="wt-nowrap wt-tabular">
              {showAllRows ? `Showing all ${rows.length} rows` : `Showing ${firstVisible}-${lastVisible} of ${rows.length}`}
            </Text>
            <Group gap="xs" wrap="wrap" className="wt-tracker-toolbar-actions">
              <TextInput
                aria-label="Search tracker"
                type="search"
                placeholder="Search student or team"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                leftSection={<MagnifyingGlass size={17} aria-hidden="true" />}
                className="wt-tracker-search"
              />
              <Popover opened={summaryOpen} onChange={setSummaryOpen} position="bottom-end" width={310} shadow="md">
                <Popover.Target>
                  <Button variant="default" size="sm" leftSection={<ChartBar size={17} />} onClick={() => setSummaryOpen((current) => !current)}>Summary</Button>
                </Popover.Target>
                <Popover.Dropdown aria-label="Tracker value summary">
                  <div className="wt-tracker-summary-grid">
                    <Summary label="On time" value={counts.onTime} />
                    <Summary label="Late values" value={counts.late} />
                    <Summary label="Blank" value={counts.missing} />
                    <Summary label="#N/A" value={counts.needsCheck} />
                  </div>
                </Popover.Dropdown>
              </Popover>
              <Button variant="default" size="sm" onClick={() => setShowAllRows((current) => !current)}>{showAllRows ? 'Use pages' : 'Load all rows'}</Button>
              {!showAllRows ? (
                <Group gap={6} wrap="nowrap" className="wt-tracker-page-controls">
                  <Button variant="default" size="sm" leftSection={<CaretLeft size={16} />} disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
                  <Text size="sm" fw={700} className="wt-nowrap wt-tabular">Page {page} of {pageCount}</Text>
                  <Button variant="default" size="sm" rightSection={<CaretRight size={16} />} disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</Button>
                </Group>
              ) : null}
            </Group>
          </div>

          <TrackerGrid rows={pageRows} columns={activeColumns} selectedKey={getStudentKey(selected)} onSelect={(student) => setSelectedKey(getStudentKey(student))} />
        </section>
      </Paper>
    </div>
  );
}

function TrackerGrid({ rows, columns, selectedKey, onSelect }) {
  return (
    <div className="wt-tracker-grid-viewport" tabIndex={0} aria-label="Scrollable tracker rows">
      <table
        className="wt-tracker-grid-table"
        aria-label="Student tracker values"
        style={{ minWidth: `${Math.max(960, 438 + (columns.length * 88))}px` }}
      >
        <colgroup>
          <col className="tracker-col-name" /><col className="tracker-col-team" /><col className="tracker-col-member" />
          {columns.map((column) => <col className="tracker-col-milestone" key={column.id} />)}
        </colgroup>
        <thead><tr>
          <th className="tracker-sticky tracker-sticky-name">Name of Student</th>
          <th className="tracker-sticky tracker-sticky-team">Team Code</th>
          <th className="tracker-sticky tracker-sticky-member">Member #</th>
          {columns.map((column) => <th key={column.id} title={column.label}>{compactTrackerLabel(column.label)}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((student) => {
            const selected = getStudentKey(student) === selectedKey;
            return (
              <tr
                key={getStudentKey(student)}
                aria-selected={selected}
                className={selected ? 'selected-row' : ''}
                tabIndex={0}
                onClick={() => onSelect(student)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(student); }
                }}
              >
                <td className="tracker-sticky tracker-sticky-name"><strong>{student.name}</strong><small>{student.studentNumber || 'No official ID'}</small></td>
                <td className="tracker-sticky tracker-sticky-team tracker-team-code wt-tabular">{student.teamCode}</td>
                <td className="tracker-sticky tracker-sticky-member wt-tabular">{student.memberNumber}</td>
                {columns.map((column) => <td key={column.id}><TrackerCell value={student.milestones?.[column.key]} /></td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getStudentKey(student) {
  if (!student) return '';
  return student.studentNumber || student.rowKey || `${student.teamCode}-${student.memberNumber}-${student.name}`;
}

function compactTrackerLabel(label) {
  return COMPACT_LABELS[String(label || '').toLowerCase().replace(/[^a-z0-9]/g, '')] || label;
}

function Summary({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function MetricLine({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function TrackerCell({ value }) {
  if (value === '' || value === null || value === undefined) return <span className="tracker-cell tracker-cell-missing">Blank</span>;
  if (String(value).toUpperCase() === '#N/A') return <span className="tracker-cell tracker-cell-na">#N/A</span>;
  if (Number(value) === 0) return <span className="tracker-cell tracker-cell-ok">0</span>;
  if (!Number.isNaN(Number(value))) return <span className="tracker-cell tracker-cell-late">{value}</span>;
  return <span className="tracker-cell tracker-cell-raw">{value}</span>;
}

function buildTrackerCounts(students, activeColumns) {
  let onTime = 0; let late = 0; let missing = 0; let needsCheck = 0;
  for (const student of students) {
    for (const column of activeColumns) {
      const value = student.milestones?.[column.key];
      if (value === '' || value === undefined || value === null) missing += 1;
      else if (String(value).toUpperCase() === '#N/A') needsCheck += 1;
      else if (Number(value) === 0) onTime += 1;
      else if (!Number.isNaN(Number(value))) late += 1;
    }
  }
  return { onTime, late, missing, needsCheck };
}

function buildSelectedStudentSummary(student, state) {
  const studentResponses = state.attempts.filter((response) => normalizeStudentNumber(response.studentNumber) === normalizeStudentNumber(student.studentNumber));
  const missingDeliverables = state.deliverables.filter((deliverable) => deliverable.status !== 'Unpublished' && !studentResponses.some((response) => response.deliverableId === deliverable.id));
  const needsReview = studentResponses.filter((response) => response.reviewStatus === 'Needs Review' || (response.flags || []).some((flag) => ['Template-like', 'Too Short'].includes(flag)));
  const templateLike = studentResponses.filter((response) => (response.flags || []).includes('Template-like'));
  const lateCount = Object.values(student.milestones || {}).filter((value) => !Number.isNaN(Number(value)) && Number(value) > 0).length;
  const latestResponse = [...studentResponses].sort((a, b) => new Date(b.updatedAt || b.submittedAt) - new Date(a.updatedAt || a.submittedAt))[0];
  return {
    missingCount: missingDeliverables.length,
    lateCount,
    needsReviewCount: needsReview.length,
    templateCount: templateLike.length,
    latest: latestResponse ? `${state.deliverables.find((deliverable) => deliverable.id === latestResponse.deliverableId)?.shortTitle || 'Deliverable'} at ${formatDateTime(latestResponse.updatedAt || latestResponse.submittedAt)}` : ''
  };
}
