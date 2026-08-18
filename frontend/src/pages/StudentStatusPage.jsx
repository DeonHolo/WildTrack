import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowSquareOut, IdentificationCard, LinkBreak, PencilSimple, Student, X } from '@phosphor-icons/react';
import { Button, ConfirmDialog, DataTable, EmptyState, Field, SearchableSelect, StatusBadge } from '../components/ui.jsx';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { findStudent, firstSubmissionLink, formatDate, formatDateTime, getActiveTrackerColumns, getIdentityStudents, getProjectMetadata, getPublishedDeliverables, getStudentOptions, getWorkspacePublicKey, isUsableAdviserName, makeDriveViewUrl, normalizeStudentNumber } from '../lib/workflow.js';

export function StudentStatusPage() {
  const { state, activeWorkspace, claimStudentNumber, disconnectStudentNumber, setActiveStudentNumber } = useWorkflow();
  const activeAccount = useMemo(() => state.studentAccounts.find((account) => account.email.toLowerCase() === String(state.activeAccountEmail || '').toLowerCase()) || null, [state.activeAccountEmail, state.studentAccounts]);
  const [studentNumber, setStudentNumber] = useState(state.activeStudentNumber || activeAccount?.studentNumber || '');
  const [claimNumber, setClaimNumber] = useState('');
  const [claimError, setClaimError] = useState('');
  const [claimTarget, setClaimTarget] = useState(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [activeFeedback, setActiveFeedback] = useState(null);
  const identityStudents = useMemo(() => getIdentityStudents(state.students), [state.students]);
  const claimOptions = useMemo(() => getStudentOptions(identityStudents, state.studentAccounts).filter((item) => !item.claimed || item.studentNumber === activeAccount?.studentNumber), [activeAccount?.studentNumber, identityStudents, state.studentAccounts]);
  const studentNumberHelper = identityStudents.length
    ? `${identityStudents.length} Student Numbers loaded from Team Formation. Search by ID or name.`
    : 'Student Numbers appear after Sir imports the Team Formation sheet in Workspace.';
  const [filter, setFilter] = useState('All');
  const workspaceKey = getWorkspacePublicKey(activeWorkspace);
  const student = useMemo(() => findStudent(state.students, studentNumber), [state.students, studentNumber]);
  const project = useMemo(() => student ? getProjectMetadata(state, student.teamCode) : null, [state, student]);
  const adviserLabel = isUsableAdviserName(project?.adviserName)
    ? project.adviserName
    : isUsableAdviserName(student?.adviser)
      ? student.adviser
      : 'Unassigned';
  const responses = state.attempts.filter((response) => normalizeStudentNumber(response.studentNumber) === normalizeStudentNumber(studentNumber));
  const activeColumns = getActiveTrackerColumns(state);
  const visibleDeliverables = useMemo(() => {
    const published = getPublishedDeliverables(state);
    const responseDeliverableIds = new Set(responses.map((response) => response.deliverableId));
    const historical = state.deliverables.filter((deliverable) => responseDeliverableIds.has(deliverable.id) && !published.some((item) => item.id === deliverable.id));
    return [...published, ...historical];
  }, [responses, state]);
  const deliverableRows = useMemo(() => visibleDeliverables.map((deliverable) => {
    const response = responses.find((item) => item.deliverableId === deliverable.id);
    return buildStudentDeliverableRow(deliverable, response);
  }), [responses, visibleDeliverables]);
  const filteredDeliverables = useMemo(() => {
    if (filter === 'All') return deliverableRows;
    if (filter === 'Missing') return deliverableRows.filter((row) => row.primaryStatus === 'Missing');
    if (filter === 'Needs Review') return deliverableRows.filter((row) => row.primaryStatus === 'Needs Review');
    if (filter === 'Submitted') return deliverableRows.filter((row) => row.response);
    return deliverableRows;
  }, [deliverableRows, filter]);
  const summary = useMemo(() => ({
    missing: deliverableRows.filter((row) => row.primaryStatus === 'Missing').length,
    needsReview: deliverableRows.filter((row) => row.primaryStatus === 'Needs Review').length,
    submitted: deliverableRows.filter((row) => row.response).length,
    accepted: deliverableRows.filter((row) => row.primaryStatus === 'Accepted').length
  }), [deliverableRows]);
  const groupProgress = useMemo(() => {
    if (!student) return null;
    const teamMembers = state.students.filter((item) => item.teamCode === student.teamCode);
    const teamNumbers = new Set(teamMembers.map((item) => normalizeStudentNumber(item.studentNumber)));
    const submittedMembers = new Set(
      state.attempts
        .filter((response) => teamNumbers.has(normalizeStudentNumber(response.studentNumber)))
        .map((response) => normalizeStudentNumber(response.studentNumber))
    );
    return {
      teamSize: teamMembers.length,
      submittedMembers: submittedMembers.size,
      names: teamMembers
        .filter((member) => submittedMembers.has(normalizeStudentNumber(member.studentNumber)))
        .map((member) => member.name)
        .slice(0, 4)
    };
  }, [state.attempts, state.students, student]);

  const teamTrackerRows = useMemo(() => {
    if (!student) return [];
    return state.students
      .filter((item) => item.teamCode === student.teamCode)
      .sort((first, second) => Number(first.memberNumber) - Number(second.memberNumber));
  }, [state.students, student]);

  function requestClaim() {
    setClaimError('');
    const selected = findStudent(identityStudents, claimNumber);
    if (!selected) {
      setClaimError('Choose a Student Number from the connected class record.');
      return;
    }
    setClaimTarget(selected);
  }

  function confirmClaim() {
    if (!claimTarget) return;
    const result = claimStudentNumber(claimNumber);
    if (!result.ok) {
      setClaimError(result.error);
      setClaimTarget(null);
      return;
    }
    setStudentNumber(result.student.studentNumber);
    setClaimNumber('');
    setClaimTarget(null);
  }

  function confirmDisconnect() {
    const result = disconnectStudentNumber();
    if (!result.ok) {
      setClaimError(result.error);
      setDisconnectOpen(false);
      return;
    }
    setStudentNumber('');
    setClaimNumber('');
    setDisconnectOpen(false);
  }

  useEffect(() => {
    if (studentNumber) setActiveStudentNumber(studentNumber);
  }, [setActiveStudentNumber, studentNumber]);

  useEffect(() => {
    if (activeAccount?.studentNumber && activeAccount.studentNumber !== studentNumber) setStudentNumber(activeAccount.studentNumber);
  }, [activeAccount?.studentNumber, studentNumber]);

  return (
    <div className="public-page dashboard-page">
      <section className="student-dashboard">
        <div className="dashboard-hero">
          <div>
            <h1>Student Dashboard</h1>
            <p>Check your own submission status, Document Check results, and tracker values.</p>
          </div>
        </div>

        {activeAccount && !activeAccount.studentNumber ? (
          <section className="panel student-claim-panel">
            <div>
              <span>Complete your profile</span>
              <h2>Claim your Student Number</h2>
              <p>Connect this account to one official record in {activeWorkspace?.name}. This claim applies only to the current academic workspace.</p>
            </div>
            <div className="student-claim-controls">
              <SearchableSelect
                value={claimNumber}
                onChange={(value) => { setClaimNumber(value); setClaimError(''); }}
                options={claimOptions}
                placeholder="Search Student Number"
                getValue={(item) => item.studentNumber}
                getLabel={(item) => `${item.name} | ${item.teamCode}`}
                disabledOptions={(item) => item.claimed}
              />
              <Button disabled={!claimNumber} onClick={requestClaim}>Continue</Button>
            </div>
            {claimError ? <div className="inline-alert danger">{claimError}</div> : null}
          </section>
        ) : null}

        {activeAccount?.studentNumber && student ? (
          <section className="panel student-profile-panel">
            <div className="student-profile-heading">
              <span className="student-profile-icon"><IdentificationCard weight="regular" /></span>
              <div>
                <span>Student profile</span>
                <h2>{student.name}</h2>
                <p>{activeAccount.email}</p>
              </div>
              <div className="student-profile-actions">
                <StatusBadge status="Record connected" />
                <Button size="sm" variant="secondary" icon={LinkBreak} onClick={() => setDisconnectOpen(true)}>Disconnect</Button>
              </div>
            </div>
            <dl className="student-profile-details">
              <div><dt>Student Number</dt><dd>{student.studentNumber}</dd></div>
              <div><dt>Team</dt><dd>{student.teamCode}</dd></div>
              <div><dt>Member</dt><dd>#{student.memberNumber}</dd></div>
              <div><dt>Adviser</dt><dd>{adviserLabel}</dd></div>
            </dl>
          </section>
        ) : !activeAccount ? (
          <section className="panel">
            <div className="student-lookup-grid">
              <Field label="Preview Student Number" helper={studentNumberHelper}>
                <SearchableSelect
                  value={studentNumber}
                  onChange={(value) => setStudentNumber(value)}
                  options={identityStudents}
                  placeholder="Search Student Number"
                  getValue={(item) => item.studentNumber}
                  getLabel={(item) => `${item.name} | ${item.teamCode}`}
                />
              </Field>
              {student ? (
                <div className="identity-card matched no-margin">
                  <Student weight="regular" />
                  <div>
                    <span>Matched student</span>
                    <strong>{student.name}</strong>
                    <small>{student.studentNumber} | {student.teamCode} | Member {student.memberNumber} | {adviserLabel}</small>
                  </div>
                </div>
              ) : (
                <div className="identity-card warning no-margin">
                  <Student weight="regular" />
                  <div>
                    <span>No match</span>
                    <strong>Choose a class record entry</strong>
                    <small>The student dashboard only shows records from the connected Sheet.</small>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeAccount?.studentNumber && !student ? (
          <section className="panel">
            <EmptyState title="Connected record is unavailable" description="The claimed Student Number is not present in this workspace's current Team Formation data. Ask the administrator to review the imported roster." />
          </section>
        ) : null}

        {student ? (
          <>
            <section className="panel student-project-panel">
              <div className="student-project-main">
                <div>
                  <span>Your project</span>
                  <strong>{project?.projectTitle || 'Project metadata not loaded yet'}</strong>
                  <small>{project?.softwareName || student.teamCode} | {adviserLabel}</small>
                </div>
                {project?.category ? <StatusBadge status={project.category} /> : null}
              </div>
              {(project?.proposalRemarks || project?.demoComments) ? (
                <div className="student-project-notes">
                  {project?.proposalRemarks ? <p><strong>Proposal remarks</strong>{project.proposalRemarks}</p> : null}
                  {project?.demoComments ? <p><strong>Demo comments</strong>{project.demoComments}</p> : null}
                </div>
              ) : null}
            </section>

            <section className="panel student-status-panel">
              <div className="student-status-summary">
                <SummaryPill label="Missing" value={summary.missing} />
                <SummaryPill label="Needs review" value={summary.needsReview} />
                <SummaryPill label="Submitted" value={summary.submitted} />
                <SummaryPill label="Accepted" value={summary.accepted} />
              </div>
              {groupProgress ? (
                <div className="group-progress-strip">
                  <div>
                    <span>Group progress</span>
                    <strong>{groupProgress.submittedMembers}/{groupProgress.teamSize} members have current responses</strong>
                    <small>{groupProgress.names.length ? groupProgress.names.join(', ') : 'No teammates have current responses yet.'}</small>
                  </div>
                </div>
              ) : null}
              <div className="student-feedback-guide">Adviser feedback appears under each submitted deliverable once it is saved.</div>
              <div className="student-filter-row" role="tablist" aria-label="Filter deliverables">
                {['All', 'Missing', 'Needs Review', 'Submitted'].map((item) => (
                  <button key={item} type="button" className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
                    {item}
                  </button>
                ))}
              </div>
              <div className="student-deliverable-list">
                {filteredDeliverables.map((row) => (
                  <article className="student-deliverable-row" key={row.deliverable.id}>
                    <div className="student-deliverable-main">
                      <span>{row.deliverable.shortTitle}</span>
                      <strong>{row.deliverable.title}</strong>
                      <small>Due {formatDate(row.deliverable.dueAt)} | {row.deliverable.trackerColumn}</small>
                    </div>
                    <div className="student-deliverable-status">
                      <StatusBadge status={row.primaryStatus} />
                      {row.flags.map((flag) => <StatusBadge key={flag} status={flag} />)}
                    </div>
                    <div className="student-deliverable-message">
                      <p className="student-deliverable-note">{row.summary}</p>
                      {row.feedback ? (
                        <div className="student-feedback-note">
                          <span>Adviser feedback</span>
                          <strong>{row.feedback.author}</strong>
                          <p>{row.feedback.note}</p>
                          <button type="button" onClick={() => setActiveFeedback({ ...row.feedback, deliverable: row.deliverable.title })}>
                            Read full feedback
                          </button>
                        </div>
                      ) : row.response ? <small className="student-feedback-empty">No adviser feedback yet.</small> : null}
                    </div>
                    <div className="student-deliverable-actions">
                      {row.link ? (
                        <a className="btn btn-secondary btn-sm" href={makeDriveViewUrl(row.link)} target="_blank" rel="noreferrer">
                          <ArrowSquareOut weight="regular" /><span>Open submitted file link</span>
                        </a>
                      ) : (
                        <Link className="btn btn-primary btn-sm" to={`/w/${workspaceKey}/submit/${row.deliverable.slug}?student=${encodeURIComponent(studentNumber)}`}>
                          <ArrowSquareOut weight="regular" /><span>Open form</span>
                        </Link>
                      )}
                      {row.response ? (
                        <Link className="btn btn-secondary btn-sm" to={`/w/${workspaceKey}/submit/${row.deliverable.slug}?student=${encodeURIComponent(studentNumber)}`}>
                          <PencilSimple weight="regular" /><span>Edit response</span>
                        </Link>
                      ) : null}
                    </div>
                  </article>
                ))}
                {!filteredDeliverables.length ? (
                  <EmptyState title="Nothing in this filter" description="Try another filter to see your current deliverables." />
                ) : null}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Your tracker values</h2>
                  <p>Your individual class-record values appear first for quick scanning.</p>
                </div>
              </div>
              <div className="tracker-chip-grid">
                {activeColumns.map((column) => (
                  <div key={column.id}>
                    <span>{column.label}</span>
                    <strong>{student.milestones[column.key] === '' || student.milestones[column.key] === undefined ? 'Blank' : student.milestones[column.key]}</strong>
                  </div>
                ))}
              </div>
              <div className="student-team-tracker-head">
                <div>
                  <h3>Team tracker</h3>
                  <p>Read-only progress for {student.teamCode}. Your row is highlighted.</p>
                </div>
                <StatusBadge status={`${teamTrackerRows.length} members`} />
              </div>
              <DataTable
                columns={['Student', '#', ...activeColumns.map((column) => column.label)]}
                minWidth={Math.max(760, 260 + activeColumns.length * 108)}
                className="student-team-tracker-table"
              >
                {teamTrackerRows.map((member) => (
                  <tr
                    key={member.studentNumber}
                    className={normalizeStudentNumber(member.studentNumber) === normalizeStudentNumber(student.studentNumber) ? 'selected-row' : ''}
                  >
                    <td>
                      <strong>{member.name}</strong>
                      <small>{member.studentNumber}{normalizeStudentNumber(member.studentNumber) === normalizeStudentNumber(student.studentNumber) ? ' | You' : ''}</small>
                    </td>
                    <td className="student-team-member-number">{member.memberNumber}</td>
                    {activeColumns.map((column) => (
                      <td key={`${member.studentNumber}-${column.id}`}>
                        <span className="student-team-tracker-value">
                          {formatTrackerValue(member.milestones?.[column.key])}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </DataTable>
            </section>

            {activeFeedback ? (
              <div className="modal-backdrop" role="presentation">
                <section className="modal-panel feedback-modal" role="dialog" aria-modal="true" aria-label="Adviser feedback">
                  <button className="icon-close" type="button" onClick={() => setActiveFeedback(null)} aria-label="Close feedback">
                    <X weight="regular" />
                  </button>
                  <div className="panel-header">
                    <div>
                      <h2>Adviser feedback</h2>
                      <p>{activeFeedback.deliverable}</p>
                    </div>
                  </div>
                  <div className="feedback-full-text">
                    <span>{activeFeedback.author}</span>
                    <p>{activeFeedback.note}</p>
                  </div>
                  <div className="button-row">
                    <Button variant="secondary" onClick={() => setActiveFeedback(null)}>Close</Button>
                  </div>
                </section>
              </div>
            ) : null}
          </>
        ) : activeAccount && !activeAccount.studentNumber ? null : (
          <section className="panel">
            <EmptyState title="Choose a Student Number" description="Your dashboard appears after selecting a class record entry." />
          </section>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(claimTarget)}
        title="Connect this Student Number?"
        description={`This links your account to the selected class-record entry in ${activeWorkspace?.name}. Only an administrator can change the connection afterward.`}
        confirmLabel="Connect record"
        onClose={() => setClaimTarget(null)}
        onConfirm={confirmClaim}
      >
        <strong>{claimTarget?.name}</strong>
        <span>{claimTarget?.studentNumber} | {claimTarget?.teamCode} | Member {claimTarget?.memberNumber}</span>
      </ConfirmDialog>

      <ConfirmDialog
        open={disconnectOpen}
        title="Disconnect this Student Number?"
        description="This removes the Student Number from this account in the current academic workspace. It does not delete class records or submitted responses. You can connect another unclaimed record afterward."
        confirmLabel="Disconnect record"
        intent="danger"
        onClose={() => setDisconnectOpen(false)}
        onConfirm={confirmDisconnect}
      >
        <strong>{student?.name}</strong>
        <span>{student?.studentNumber} | {student?.teamCode}</span>
      </ConfirmDialog>
    </div>
  );
}

function buildStudentDeliverableRow(deliverable, response) {
  if (!response) {
    return {
      deliverable,
      response: null,
      primaryStatus: 'Missing',
      flags: [],
      link: '',
      summary: 'No response has been recorded for this deliverable.',
      feedback: null
    };
  }

  const hasFeedback = Boolean(response.feedback?.length);
  const flags = (response.flags || [])
    .filter((flag) => !['Received', response.primaryStatus, response.reviewStatus].includes(flag))
    .filter((flag) => !(hasFeedback || response.primaryStatus === 'Accepted') || flag !== 'Needs Review')
    .slice(0, 2);
  const hasAttention = flags.some((flag) => ['Template-like', 'Too Short', 'Not PDF', 'Inaccessible'].includes(flag));
  const primaryStatus = response.primaryStatus === 'Accepted'
    ? 'Accepted'
    : hasFeedback
      ? 'Reviewed'
      : hasAttention
      ? 'Needs Review'
      : response.primaryStatus || response.reviewStatus || 'Received';

  return {
    deliverable,
    response,
    primaryStatus,
    flags,
    link: firstSubmissionLink(response.values),
    summary: response.checkSummary || `Last saved ${formatDateTime(response.updatedAt || response.submittedAt)}. File check notes will appear here when available.`,
    feedback: response.feedback?.[0] || null
  };
}

function formatTrackerValue(value) {
  if (value === '' || value === undefined || value === null) return 'Blank';
  return String(value);
}

function SummaryPill({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
