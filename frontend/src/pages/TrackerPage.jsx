import { useEffect, useMemo, useState } from 'react';
import { CaretLeft, CaretRight, ChartBar, UsersThree } from '@phosphor-icons/react';
import { Button, PageHeader, SearchBox } from '../components/ui.jsx';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { formatDateTime, getActiveTrackerColumns, getAdviserOptions, getProjectMetadata, getTeamAdviser, isUsableAdviserName, normalizeStudentNumber } from '../lib/workflow.js';
import { getStoredPreviewAdviser, usePreviewRole } from '../hooks/usePreviewRole.js';

const PAGE_SIZE = 25;
const COMPACT_LABELS = {
  probexploration: 'ProbEx',
  convergence: 'Conv',
  rrl: 'RRL',
  projectproposal: 'Proposal',
  srs: 'SRS',
  sdd: 'SDD',
  adviserassessment: 'Adviser',
  sourcecode: 'Source',
  demo: 'Demo',
  peerevaluation: 'Peer'
};

export function TrackerPage() {
  const { state } = useWorkflow();
  const previewRole = usePreviewRole();
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState(state.activeStudentNumber || getStudentKey(state.students[0]) || '');
  const [page, setPage] = useState(1);
  const [showSummary, setShowSummary] = useState(false);
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
  const selected = scopeStudents.find((student) => getStudentKey(student) === selectedKey || student.studentNumber === selectedKey) || pageRows[0] || rows[0];
  const selectedProject = selected ? getProjectMetadata(state, selected.teamCode) : null;
  const selectedAdviser = previewRole === 'adviser'
    ? adviserName
    : isUsableAdviserName(selectedProject?.adviserName)
      ? selectedProject.adviserName
      : isUsableAdviserName(selected?.adviser)
        ? selected.adviser
        : 'Unassigned';
  const counts = useMemo(() => buildTrackerCounts(scopeStudents, activeColumns), [activeColumns, scopeStudents]);
  const selectedSummary = useMemo(() => selected ? buildSelectedStudentSummary(selected, state) : null, [selected, state]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Tracker"
        description={previewRole === 'adviser'
          ? 'Read-only class-record values for teams assigned to the selected adviser.'
          : 'Raw class-record values stay visible as days-late numbers, dates, blanks, or Sheet values.'}
        actions={previewRole === 'adviser' ? (
          <div className="role-scope-note">
            <UsersThree weight="regular" aria-hidden="true" />
            <span>Adviser scope</span>
            <strong>{adviserName}</strong>
          </div>
        ) : null}
      />

      <section className="panel tracker-shell-panel">
        {selected ? (
          <div className="selected-tracker-strip tracker-focus-band">
            <div>
              <span>Selected student</span>
              <strong>{selected.name}</strong>
              <small>{selected.studentNumber || 'No Student Number from Team Formation'} | {selected.teamCode} | Member {selected.memberNumber}</small>
              <small>{selectedProject?.softwareName || selectedProject?.projectTitle || 'Project metadata not loaded'} | {selectedAdviser}</small>
            </div>
            <div className="tracker-student-insight">
              <MetricLine label="Missing" value={selectedSummary.missingCount} />
              <MetricLine label="Late" value={selectedSummary.lateCount} />
              <MetricLine label="Needs review" value={selectedSummary.needsReviewCount} />
              <MetricLine label="Template-like" value={selectedSummary.templateCount} />
              {selectedSummary.latest ? <small>Latest response: {selectedSummary.latest}</small> : <small>No current response recorded yet.</small>}
            </div>
          </div>
        ) : null}

        <section className="tracker-table-panel" aria-label="Class-wide tracker table">
          <div className="tracker-table-title">
            <span>{previewRole === 'adviser' ? 'Assigned-team tracker' : 'Class-wide tracker table'}</span>
            <strong>{rows.length} rows</strong>
          </div>
          <div className="tracker-table-toolbar">
            <div className="tracker-toolbar-main">
              <span>
                {showAllRows
                  ? `Showing all ${rows.length} rows`
                  : `Showing ${rows.length ? ((page - 1) * PAGE_SIZE) + 1 : 0}-${Math.min(page * PAGE_SIZE, rows.length)} of ${rows.length}`}
              </span>
            </div>
            <div className="tracker-pagination">
              <SearchBox value={query} onChange={setQuery} placeholder="Search student or team" />
              <div className="tracker-summary-menu">
                <Button type="button" size="sm" variant="secondary" icon={ChartBar} onClick={() => setShowSummary((current) => !current)}>
                  Summary
                </Button>
                {showSummary ? (
                  <div className="tracker-summary-popover" role="dialog" aria-label="Tracker value summary">
                    <Summary label="On time" value={counts.onTime} />
                    <Summary label="Late values" value={counts.late} />
                    <Summary label="Blank" value={counts.missing} />
                    <Summary label="#N/A" value={counts.needsCheck} />
                  </div>
                ) : null}
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => setShowAllRows((current) => !current)}>
                {showAllRows ? 'Use pages' : 'Load all rows'}
              </Button>
              {!showAllRows ? (
                <>
                  <Button type="button" size="sm" variant="secondary" icon={CaretLeft} disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
                  <strong>Page {page} of {pageCount}</strong>
                  <Button type="button" size="sm" variant="secondary" icon={CaretRight} disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</Button>
                </>
              ) : null}
            </div>
          </div>
          <TrackerGrid
            rows={pageRows}
            columns={activeColumns}
            selectedKey={getStudentKey(selected)}
            onSelect={(student) => setSelectedKey(getStudentKey(student))}
          />
        </section>
      </section>
    </div>
  );
}

function TrackerGrid({ rows, columns, selectedKey, onSelect }) {
  return (
    <div className="tracker-grid-wrap">
      <table className="tracker-grid-table">
        <colgroup>
          <col className="tracker-col-name" />
          <col className="tracker-col-team" />
          <col className="tracker-col-member" />
          {columns.map((column) => <col className="tracker-col-milestone" key={column.id} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="tracker-sticky tracker-sticky-name">Name of Student</th>
            <th className="tracker-sticky tracker-sticky-team">Team Code</th>
            <th className="tracker-sticky tracker-sticky-member">#</th>
            {columns.map((column) => (
              <th key={column.id} title={column.label}>{compactTrackerLabel(column.label)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((student) => (
            <tr key={getStudentKey(student)} className={getStudentKey(student) === selectedKey ? 'selected-row active-data-row' : ''} onClick={() => onSelect(student)}>
              <td className="tracker-sticky tracker-sticky-name"><strong>{student.name}</strong><small>{student.studentNumber || 'No official ID'}</small></td>
              <td className="tracker-sticky tracker-sticky-team tracker-team-code mono-cell">{student.teamCode}</td>
              <td className="tracker-sticky tracker-sticky-member mono-cell">{student.memberNumber}</td>
              {columns.map((column) => <td key={column.id}><TrackerCell value={student.milestones?.[column.key]} /></td>)}
            </tr>
          ))}
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
  const key = String(label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return COMPACT_LABELS[key] || label;
}

function Summary({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function MetricLine({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TrackerCell({ value }) {
  if (value === '' || value === null || value === undefined) return <span className="tracker-cell tracker-cell-missing">Blank</span>;
  if (String(value).toUpperCase() === '#N/A') return <span className="tracker-cell tracker-cell-na">#N/A</span>;
  if (Number(value) === 0) return <span className="tracker-cell tracker-cell-ok">0</span>;
  if (!Number.isNaN(Number(value))) return <span className="tracker-cell tracker-cell-late">{value}</span>;
  return <span className="tracker-cell tracker-cell-raw">{value}</span>;
}

function buildTrackerCounts(students, activeColumns) {
  let onTime = 0;
  let late = 0;
  let missing = 0;
  let needsCheck = 0;
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
  const missingNames = missingDeliverables.map((deliverable) => deliverable.shortTitle).slice(0, 3);
  const reviewNames = needsReview
    .map((response) => state.deliverables.find((deliverable) => deliverable.id === response.deliverableId)?.shortTitle)
    .filter(Boolean)
    .slice(0, 3);
  const summaryParts = [];

  if (missingNames.length) summaryParts.push(`${missingNames.join(', ')} ${missingNames.length === 1 ? 'is' : 'are'} missing`);
  if (reviewNames.length) summaryParts.push(`${reviewNames.join(', ')} ${reviewNames.length === 1 ? 'needs' : 'need'} review`);
  if (lateCount) summaryParts.push(`${lateCount} tracker ${lateCount === 1 ? 'value is' : 'values are'} late`);

  return {
    missingCount: missingDeliverables.length,
    lateCount,
    needsReviewCount: needsReview.length,
    templateCount: templateLike.length,
    latest: latestResponse ? `${state.deliverables.find((deliverable) => deliverable.id === latestResponse.deliverableId)?.shortTitle || 'Deliverable'} at ${formatDateTime(latestResponse.updatedAt || latestResponse.submittedAt)}` : '',
    summary: summaryParts.length
      ? `This student needs attention: ${summaryParts.join('; ')}.`
      : 'This student has no current file-check flags in CapVault.'
  };
}
