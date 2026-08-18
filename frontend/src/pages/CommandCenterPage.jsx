import { useMemo, useState } from 'react';
import { Archive, ArrowSquareOut, ClipboardText, FilePdf, Files, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { Button, ConfirmDialog, DataTable, EmptyState, PageHeader, StatusBadge } from '../components/ui.jsx';
import { DocumentCheckDialog } from '../components/review/DocumentCheckDialog.jsx';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import {
  findStudent,
  deliverableUsesDocumentCheck,
  firstSubmissionLink,
  formatDateTime,
  getDeliverable,
  getIdentityStudents,
  isDocumentCheckCurrent,
  isDocumentCheckUnavailable,
  makeDriveViewUrl
} from '../lib/workflow.js';

export function CommandCenterPage() {
  const { state, runDocumentCheck, runDocumentChecks, archiveAttempt } = useWorkflow();
  const [checkDialogId, setCheckDialogId] = useState('');
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const identityStudents = getIdentityStudents(state.students);
  const attention = buildAttentionQueue(state);
  const accepted = state.attempts.filter((response) => response.reviewStatus === 'Accepted' && response.archiveStatus !== 'Archived');
  const missing = Math.max(0, state.deliverables.filter((item) => item.status !== 'Unpublished').length * identityStudents.length - state.attempts.length);
  const pendingChecks = useMemo(
    () => attention
      .filter((item) => deliverableUsesDocumentCheck(item.deliverable))
      .map((item) => item.response)
      .filter((response) => response.fileCheckStatus !== 'Checking' && !isDocumentCheckCurrent(response)),
    [attention]
  );
  const checkDialogResponse = state.attempts.find((response) => response.id === checkDialogId) || null;

  async function openOrRunDocumentCheck(response) {
    if (!isDocumentCheckCurrent(response)) await runDocumentCheck(response.id);
    setCheckDialogId(response.id);
  }

  async function runPendingChecks() {
    setBatchConfirmOpen(false);
    setBatchProgress({ completed: 0, total: pendingChecks.length, failed: 0 });
    const result = await runDocumentChecks(
      pendingChecks.map((response) => response.id),
      { onProgress: ({ completed, total }) => setBatchProgress((current) => ({ ...current, completed, total })) }
    );
    setBatchProgress({ completed: result.completed, total: result.total, failed: result.failed, done: true });
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
          <div className="panel-header-actions">
            <Button size="sm" variant="secondary" icon={Files} disabled={!pendingChecks.length || Boolean(batchProgress && !batchProgress.done)} onClick={() => setBatchConfirmOpen(true)}>
              Check pending documents
            </Button>
            <Link className="text-link" to="/review">Open full review</Link>
          </div>
        </div>
        {batchProgress ? (
          <div className={`batch-progress ${batchProgress.done ? batchProgress.failed ? 'warning' : 'success' : ''}`} role="status">
            <div><strong>{batchProgress.done ? 'Document checks complete' : 'Checking documents'}</strong><span>{batchProgress.completed} of {batchProgress.total}{batchProgress.failed ? ` | ${batchProgress.failed} could not be checked` : ''}</span></div>
            <progress value={batchProgress.completed} max={Math.max(batchProgress.total, 1)} />
            {batchProgress.done ? <button type="button" onClick={() => setBatchProgress(null)}>Dismiss</button> : null}
          </div>
        ) : null}
        {attention.length ? (
          <DataTable columns={['Priority', 'Student', 'Deliverable', 'Issue', 'Updated', 'Actions']} minWidth={980} className="today-work-table">
            {attention.slice(0, 12).map((item) => {
              const fileLink = firstSubmissionLink(item.response.values);
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
                      {deliverableUsesDocumentCheck(item.deliverable) ? (
                        <Button size="sm" variant="secondary" icon={MagnifyingGlass} loading={item.response.fileCheckStatus === 'Checking'} onClick={() => openOrRunDocumentCheck(item.response)}>
                          {isDocumentCheckCurrent(item.response) ? 'View check' : 'Check document'}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No urgent work right now" description="Review is clear based on current responses and Document Check results." />
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

      <DocumentCheckDialog
        open={Boolean(checkDialogResponse)}
        response={checkDialogResponse}
        fileLink={firstSubmissionLink(checkDialogResponse?.values)}
        rechecking={checkDialogResponse?.fileCheckStatus === 'Checking'}
        onClose={() => setCheckDialogId('')}
        onRecheck={() => runDocumentCheck(checkDialogResponse.id)}
      />

      <ConfirmDialog
        open={batchConfirmOpen}
        title={`Check ${pendingChecks.length} pending document${pendingChecks.length === 1 ? '' : 's'}?`}
        description="WildTrack checks up to three PDFs at a time and continues if an individual document cannot be checked."
        confirmLabel="Start Document Check"
        onClose={() => setBatchConfirmOpen(false)}
        onConfirm={runPendingChecks}
      />
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
      const currentCheck = isDocumentCheckCurrent(response);
      const checkEligible = deliverableUsesDocumentCheck(deliverable);
      const issue = flags.includes('Template-like')
        ? 'Submission appears close to the provided template.'
        : flags.includes('Too Short')
          ? 'Extracted content appears too short.'
          : checkEligible && !currentCheck
            ? isDocumentCheckUnavailable(response)
              ? 'This file was not checked because Google Drive API was not configured on that machine.'
              : 'This submitted file has not been checked yet.'
            : response.reviewStatus === 'Needs Review'
              ? 'Document Check found items that need a staff decision.'
              : 'Document Check is complete and this response is ready for a staff decision.';
      if (!issue) return null;
      return {
        response,
        student,
        deliverable,
        issue,
        priority: flags.includes('Template-like') || flags.includes('Too Short') || response.reviewStatus === 'Needs Review'
          ? 'Needs attention'
          : checkEligible && !currentCheck ? 'Not checked' : 'Ready for review'
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(isDocumentCheckCurrent(a.response)) - Number(isDocumentCheckCurrent(b.response)));
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
