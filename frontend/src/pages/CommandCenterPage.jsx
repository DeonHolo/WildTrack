import { Archive, ArrowSquareOut, ClipboardText, FilePdf, Sparkle, WarningCircle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { Button, DataTable, EmptyState, PageHeader, StatusBadge } from '../components/ui.jsx';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { DRIVE_CHECK_UNAVAILABLE_MESSAGE, findStudent, firstSubmissionLink, formatDateTime, getDeliverable, getIdentityStudents, isAiReportCurrent, isDriveCheckUnavailable, makeDriveViewUrl } from '../lib/workflow.js';

export function CommandCenterPage() {
  const { state, triggerAiEvaluation, archiveAttempt } = useWorkflow();
  const identityStudents = getIdentityStudents(state.students);
  const attention = buildAttentionQueue(state);
  const accepted = state.attempts.filter((response) => response.reviewStatus === 'Accepted' && response.archiveStatus !== 'Archived');
  const missing = Math.max(0, state.deliverables.filter((item) => item.status !== 'Unpublished').length * identityStudents.length - state.attempts.length);

  function runAiReview(response) {
    if (isDriveCheckUnavailable(response)) return;
    if (!isAiReportCurrent(response) || window.confirm('This response already has a current AI Review. Run it again?')) {
      triggerAiEvaluation(response.id);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Today's Work"
        description="Prioritized submission, file-check, tracker, and archive work for Sir Ralph."
        actions={<Link className="btn btn-primary btn-md" to="/forms"><ClipboardText weight="regular" /><span>Publish form</span></Link>}
      />

      <section className="metric-grid">
        <Metric icon={ClipboardText} label="Open forms" value={state.deliverables.filter((item) => item.status !== 'Unpublished').length} />
        <Metric icon={FilePdf} label="Current responses" value={state.attempts.length} />
        <Metric icon={WarningCircle} label="Needs action" value={attention.length} />
        <Metric icon={Archive} label="Archive candidates" value={accepted.length} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Action queue</h2>
            <p>Rows are ordered by work that saves the most checking time first.</p>
          </div>
          <Link className="text-link" to="/review">Open full review</Link>
        </div>
        {attention.length ? (
          <DataTable columns={['Priority', 'Student', 'Deliverable', 'Issue', 'Updated', 'Actions']} minWidth={980} className="today-work-table">
            {attention.slice(0, 12).map((item) => {
              const fileLink = firstSubmissionLink(item.response.values);
              const checkUnavailable = isDriveCheckUnavailable(item.response);
              return (
                <tr key={item.response.id}>
                  <td><StatusBadge status={item.priority} /></td>
                  <td><strong>{item.student?.name || item.response.studentName}</strong><small>{item.student?.teamCode || item.response.teamCode}</small></td>
                  <td>{item.deliverable?.shortTitle || 'Deliverable'}</td>
                  <td className="summary-cell">{item.issue}</td>
                  <td>{formatDateTime(item.response.updatedAt || item.response.submittedAt)}</td>
                  <td>
                    <div className="row-action-group">
                      {fileLink ? <a className="btn btn-secondary btn-sm" href={makeDriveViewUrl(fileLink)} target="_blank" rel="noreferrer"><ArrowSquareOut weight="regular" /><span>Open file link</span></a> : null}
                      <Button size="sm" variant="secondary" icon={Sparkle} disabled={checkUnavailable} title={checkUnavailable ? DRIVE_CHECK_UNAVAILABLE_MESSAGE : undefined} onClick={() => runAiReview(item.response)}>
                        {checkUnavailable ? 'Drive check unavailable' : isAiReportCurrent(item.response) ? 'View AI' : 'AI Review'}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No urgent work right now" description="Review is clear based on current responses and file checks." />
        )}
      </section>

      <section className="split-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Archive candidates</h2>
              <p>Accepted final PDFs waiting for a preserved copy.</p>
            </div>
            <Link className="text-link" to="/archive">Archive index</Link>
          </div>
          <div className="compact-row-list">
            {accepted.length ? accepted.map((response) => {
              const student = findStudent(state.students, response.studentNumber);
              const deliverable = getDeliverable(state, response.deliverableId);
              return (
                <div className="compact-action-row" key={response.id}>
                  <div><strong>{deliverable?.shortTitle}</strong><span>{student?.teamCode} | {student?.name || response.studentName}</span></div>
                  <Button size="sm" variant="primary" icon={Archive} onClick={() => archiveAttempt(response.id)}>Archive final</Button>
                </div>
              );
            }) : <p className="muted-copy">No accepted final responses are waiting for archive.</p>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Workspace signals</h2>
              <p>Import and setup items that can affect form and tracker quality.</p>
            </div>
            <Link className="text-link" to="/workspace">Workspace setup</Link>
          </div>
          <div className="compact-row-list">
            <div className="compact-action-row">
              <div><strong>Missing responses</strong><span>{missing} based on open forms and Team Formation identities.</span></div>
              <StatusBadge status={missing ? 'Needs Attention' : 'Ready'} />
            </div>
            <div className="compact-action-row">
              <div><strong>Identity source</strong><span>{state.classRecord.sources?.teamFormation?.name || 'Team Formation'}</span></div>
              <StatusBadge status={state.classRecord.sources?.teamFormation?.status || 'Not connected'} />
            </div>
            <div className="compact-action-row">
              <div><strong>Project metadata</strong><span>{state.projectMetadata?.length || 0} groups loaded.</span></div>
              <StatusBadge status={state.projectMetadata?.length ? 'Ready' : 'Needs Attention'} />
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}

function buildAttentionQueue(state) {
  return state.attempts
    .filter((response) => response.reviewStatus !== 'Accepted' && response.archiveStatus !== 'Archived')
    .map((response) => {
      const student = findStudent(state.students, response.studentNumber);
      const deliverable = getDeliverable(state, response.deliverableId);
      const flags = response.flags || [];
      const issue = flags.includes('Template-like')
        ? 'Submission appears close to the provided template.'
        : flags.includes('Too Short')
          ? 'Extracted content appears too short.'
          : !isAiReportCurrent(response)
            ? 'Automatic file checks are unavailable until Google Drive API is connected.'
            : response.reviewStatus === 'Needs Review'
              ? 'Review status still needs a decision.'
              : '';
      if (!issue) return null;
      return {
        response,
        student,
        deliverable,
        issue,
        priority: flags.includes('Template-like') || flags.includes('Too Short') ? 'Needs Review' : 'Unchecked'
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(isAiReportCurrent(a.response)) - Number(isAiReportCurrent(b.response)));
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="metric-card">
      <Icon weight="regular" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
