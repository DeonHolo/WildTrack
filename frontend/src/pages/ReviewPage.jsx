import { useMemo, useState } from 'react';
import {
  Archive,
  ArrowCounterClockwise,
  ArrowSquareOut,
  CheckCircle,
  Files,
  MagnifyingGlass,
  Sparkle
} from '@phosphor-icons/react';
import { Button, ConfirmDialog, DataTable, EmptyState, PageHeader, SearchBox, StatusBadge } from '../components/ui.jsx';
import {
  compactMissingSections,
  DocumentCheckDialog,
  documentCheckStatus
} from '../components/review/DocumentCheckDialog.jsx';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import {
  findStudent,
  deliverableUsesDocumentCheck,
  firstSubmissionLink,
  formatDate,
  formatDateTime,
  getIdentityStudents,
  getProjectMetadata,
  isAiReportCurrent,
  isDocumentCheckCurrent,
  makeDriveViewUrl,
  sortDeliverables
} from '../lib/workflow.js';

const reviewFilters = ['Pending', 'Flagged', 'All', 'Accepted'];

export function ReviewPage() {
  const {
    state,
    runDocumentCheck,
    runDocumentChecks,
    runAiReview,
    markAccepted,
    revokeAcceptance,
    archiveAttempt
  } = useWorkflow();
  const identityStudents = useMemo(() => getIdentityStudents(state.students), [state.students]);
  const orderedDeliverables = useMemo(() => sortDeliverables(state, state.deliverables), [state]);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState(orderedDeliverables[0]?.id || '');
  const [expandedResponseId, setExpandedResponseId] = useState('');
  const [checkDialogId, setCheckDialogId] = useState('');
  const [filter, setFilter] = useState('Pending');
  const [query, setQuery] = useState('');
  const [actionTarget, setActionTarget] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [aiTarget, setAiTarget] = useState(null);

  const deliverableSummaries = useMemo(() => orderedDeliverables.map((deliverable) => {
    const responses = state.attempts.filter((response) => response.deliverableId === deliverable.id);
    const usesDocumentCheck = deliverableUsesDocumentCheck(deliverable);
    const accepted = responses.filter((response) => response.reviewStatus === 'Accepted').length;
    const flagged = responses.filter(isFlaggedResponse).length;
    const notChecked = usesDocumentCheck
      ? responses.filter((response) => response.reviewStatus !== 'Accepted' && !isDocumentCheckCurrent(response)).length
      : 0;
    const needsCheck = responses.filter(needsReviewAction).length;
    const missing = Math.max(0, identityStudents.length - responses.length);
    return { deliverable, responses, expected: identityStudents.length, received: responses.length, accepted, flagged, notChecked, needsCheck, missing, usesDocumentCheck };
  }), [identityStudents.length, orderedDeliverables, state.attempts]);

  const selectedSummary = deliverableSummaries.find((item) => item.deliverable.id === selectedDeliverableId) || deliverableSummaries[0];
  const selectedDeliverable = selectedSummary?.deliverable || null;
  const pendingDocumentChecks = useMemo(
    () => selectedSummary?.usesDocumentCheck ? (selectedSummary.responses || []).filter((response) =>
      response.reviewStatus !== 'Accepted' &&
      response.fileCheckStatus !== 'Checking' &&
      !isDocumentCheckCurrent(response)
    ) : [],
    [selectedSummary]
  );
  const pendingAiReviews = useMemo(
    () => (selectedSummary?.responses || []).filter((response) =>
      response.reviewStatus !== 'Accepted' &&
      isDocumentCheckCurrent(response) &&
      !isAiReportCurrent(response)
    ),
    [selectedSummary]
  );

  const selectedResponses = useMemo(() => {
    if (!selectedDeliverable) return [];
    const needle = query.trim().toLowerCase();
    let rows = state.attempts.filter((response) => response.deliverableId === selectedDeliverable.id);
    if (filter === 'Accepted') rows = rows.filter((response) => response.reviewStatus === 'Accepted');
    if (filter === 'Pending') rows = rows.filter((response) => response.reviewStatus !== 'Accepted');
    if (filter === 'Flagged') rows = rows.filter(isFlaggedResponse);
    if (needle) {
      rows = rows.filter((response) => {
        const student = findStudent(state.students, response.studentNumber);
        return `${student?.name || response.studentName} ${student?.teamCode || response.teamCode} ${response.studentNumber}`.toLowerCase().includes(needle);
      });
    }
    return rows.sort((first, second) => new Date(second.updatedAt || second.submittedAt) - new Date(first.updatedAt || first.submittedAt));
  }, [filter, query, selectedDeliverable, state.attempts, state.students]);

  const checkDialogResponse = state.attempts.find((response) => response.id === checkDialogId) || null;

  function chooseDeliverable(id) {
    setSelectedDeliverableId(id);
    setExpandedResponseId('');
    setCheckDialogId('');
  }

  async function openOrRunDocumentCheck(response) {
    if (!isDocumentCheckCurrent(response)) {
      await runDocumentCheck(response.id);
    }
    setCheckDialogId(response.id);
  }

  async function recheckFromDialog() {
    if (!checkDialogResponse) return;
    await runDocumentCheck(checkDialogResponse.id);
  }

  async function runPendingDocumentChecks() {
    setBatchConfirmOpen(false);
    if (!pendingDocumentChecks.length) return;
    setBatchProgress({ completed: 0, total: pendingDocumentChecks.length, failed: 0 });
    const result = await runDocumentChecks(
      pendingDocumentChecks.map((response) => response.id),
      { onProgress: ({ completed, total }) => setBatchProgress((current) => ({ ...current, completed, total })) }
    );
    setBatchProgress({ completed: result.completed, total: result.total, failed: result.failed, done: true });
  }

  async function confirmTargetAction() {
    if (!actionTarget?.response) return;
    setActionBusy(true);
    if (actionTarget.type === 'archive') await archiveAttempt(actionTarget.response.id);
    else revokeAcceptance(actionTarget.response.id);
    setActionBusy(false);
    setActionTarget(null);
  }

  async function acknowledgeAiUnavailable() {
    await runAiReview(aiTarget?.response?.id);
    setAiTarget(null);
  }

  return (
    <div className="page-stack review-page">
      <PageHeader
        title="Submission Review"
        description="Review by deliverable first, scan compact response rows, and expand only the records that need attention."
      />

      <section className="panel review-deliverable-panel">
        <div className="panel-header">
          <div>
            <h2>Deliverables</h2>
            <p>Each row shows how much work is waiting before Sir opens the submissions table.</p>
          </div>
        </div>
        <div className="review-deliverable-strip" role="list" aria-label="Deliverable review queue">
          {deliverableSummaries.map((item) => (
            <button
              className={`review-deliverable-chip ${item.deliverable.id === selectedSummary?.deliverable.id ? 'active' : ''}`}
              key={item.deliverable.id}
              type="button"
              onClick={() => chooseDeliverable(item.deliverable.id)}
            >
              <span>{item.deliverable.shortTitle}</span>
              <strong>{item.received}/{item.expected}</strong>
              <small>{item.missing} missing</small>
              <em>{item.needsCheck} pending</em>
            </button>
          ))}
        </div>
      </section>

      <section className="panel review-main-panel">
        {selectedDeliverable ? (
          <>
            <div className="review-main-header">
              <div>
                <span>{selectedDeliverable.trackerColumn}</span>
                <h2>{selectedDeliverable.title}</h2>
                <p>{selectedSummary.received} received out of {selectedSummary.expected} expected. Due {formatDate(selectedDeliverable.dueAt)}.</p>
              </div>
              <div className="review-count-grid" aria-label="Selected deliverable counts">
                <Count label="Missing" value={selectedSummary.missing} />
                <Count label="Not checked" value={selectedSummary.notChecked} />
                <Count label="Flagged" value={selectedSummary.flagged} />
                <Count label="Accepted" value={selectedSummary.accepted} />
              </div>
              <div className="review-batch-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Files}
                  disabled={!pendingDocumentChecks.length || Boolean(batchProgress && !batchProgress.done)}
                  onClick={() => setBatchConfirmOpen(true)}
                >
                  Check pending documents
                </Button>
                <Button size="sm" variant="secondary" icon={Sparkle} onClick={() => setAiTarget({ type: 'batch', count: pendingAiReviews.length })}>
                  Run AI reviews
                </Button>
              </div>
            </div>

            {batchProgress ? (
              <div className={`batch-progress ${batchProgress.done ? batchProgress.failed ? 'warning' : 'success' : ''}`} role="status">
                <div>
                  <strong>{batchProgress.done ? 'Document checks complete' : 'Checking documents'}</strong>
                  <span>{batchProgress.completed} of {batchProgress.total}{batchProgress.failed ? ` | ${batchProgress.failed} could not be checked` : ''}</span>
                </div>
                <progress value={batchProgress.completed} max={Math.max(batchProgress.total, 1)} />
                {batchProgress.done ? <button type="button" onClick={() => setBatchProgress(null)}>Dismiss</button> : null}
              </div>
            ) : null}

            <div className="review-toolbar">
              <div className="review-filter-row" role="tablist" aria-label="Review filter">
                {reviewFilters.map((item) => (
                  <button key={item} type="button" className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
                    {item}
                  </button>
                ))}
              </div>
              <SearchBox value={query} onChange={setQuery} placeholder="Search student or team" />
            </div>

            <DataTable columns={['Student', 'Team', 'Submitted', 'Review', 'Actions']} minWidth={900} className="review-wide-table">
              {selectedResponses.map((response) => (
                <ReviewTableRows
                  key={response.id}
                  response={response}
                  state={state}
                  expanded={expandedResponseId === response.id}
                  onToggle={() => setExpandedResponseId((current) => current === response.id ? '' : response.id)}
                  onDocumentCheck={() => openOrRunDocumentCheck(response)}
                  documentCheckEnabled={selectedSummary.usesDocumentCheck}
                  onAiReview={() => setAiTarget({ type: 'individual', response })}
                  onAccept={() => markAccepted(response.id, { name: 'Sir Ralph Laviste', role: 'Teacher/Admin', scope: 'Individual response' })}
                  onRevoke={() => setActionTarget({ type: 'revoke', response })}
                  onArchive={() => setActionTarget({ type: 'archive', response })}
                />
              ))}
            </DataTable>

            {!selectedResponses.length ? (
              <EmptyState
                title="No responses in this filter"
                description={filter === 'Pending' ? 'No current responses are pending for this deliverable.' : 'Try another filter or select another deliverable.'}
              />
            ) : null}
          </>
        ) : <EmptyState title="No deliverables published" description="Publish a form before reviewing student responses." />}
      </section>

      <DocumentCheckDialog
        open={Boolean(checkDialogResponse)}
        response={checkDialogResponse}
        fileLink={firstSubmissionLink(checkDialogResponse?.values)}
        rechecking={checkDialogResponse?.fileCheckStatus === 'Checking'}
        onClose={() => setCheckDialogId('')}
        onRecheck={recheckFromDialog}
      />

      <ConfirmDialog
        open={batchConfirmOpen}
        title={`Check ${pendingDocumentChecks.length} pending document${pendingDocumentChecks.length === 1 ? '' : 's'}?`}
        description="CapVault will process up to three PDFs at a time. Current checks are skipped and one failure will not stop the remaining documents."
        confirmLabel="Start Document Check"
        loading={false}
        onClose={() => setBatchConfirmOpen(false)}
        onConfirm={runPendingDocumentChecks}
      >
        <strong>{selectedDeliverable?.title}</strong>
        <span>Google Drive metadata and PDF bytes will be read temporarily. Submission files are not archived by this action.</span>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(aiTarget)}
        title="AI Review is not connected yet"
        description="Gemini AI Review will be available only to Admin/Sir from this Review page. Document Check is already available and does not make generative claims."
        confirmLabel="Understood"
        cancelLabel="Close"
        onClose={() => setAiTarget(null)}
        onConfirm={acknowledgeAiUnavailable}
      >
        <strong>{aiTarget?.type === 'batch' ? `${selectedDeliverable?.title}: ${aiTarget.count} eligible response${aiTarget.count === 1 ? '' : 's'}` : findStudent(state.students, aiTarget?.response?.studentNumber)?.name || 'Selected response'}</strong>
        <span>When Gemini is connected, this action will summarize content, compare instructions, identify weak or missing sections, and suggest the next review action.</span>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(actionTarget)}
        title={actionTarget?.type === 'archive' ? 'Archive this accepted response?' : 'Revoke this acceptance?'}
        description={actionTarget?.type === 'archive'
          ? 'This creates a local archive record and locks acceptance from being revoked in this workflow.'
          : 'The response returns to Pending and must be accepted again before it can be archived.'}
        confirmLabel={actionTarget?.type === 'archive' ? 'Archive response' : 'Revoke acceptance'}
        intent={actionTarget?.type === 'revoke' ? 'danger' : 'primary'}
        loading={actionBusy}
        onClose={() => { if (!actionBusy) setActionTarget(null); }}
        onConfirm={confirmTargetAction}
      >
        <strong>{findStudent(state.students, actionTarget?.response?.studentNumber)?.name || actionTarget?.response?.studentName || 'Student response'}</strong>
        <span>{selectedDeliverable?.title || 'Deliverable'} | {actionTarget?.response?.teamCode || 'No team'}</span>
        <span>Saved {actionTarget?.response ? formatDateTime(actionTarget.response.updatedAt || actionTarget.response.submittedAt) : ''}</span>
      </ConfirmDialog>
    </div>
  );
}

function ReviewTableRows({ response, state, expanded, documentCheckEnabled, onToggle, onDocumentCheck, onAiReview, onAccept, onRevoke, onArchive }) {
  const student = findStudent(state.students, response.studentNumber);
  const fileLink = firstSubmissionLink(response.values);
  const project = getProjectMetadata(state, student?.teamCode || response.teamCode);
  const primary = response.primaryStatus || response.reviewStatus || 'Received';
  const checkRunning = response.fileCheckStatus === 'Checking';
  const report = response.documentCheck;
  const secondaryFlags = (response.flags || []).filter((flag) => !['Received', primary, response.reviewStatus].includes(flag)).slice(0, 2);
  const missingPreview = compactMissingSections(report?.missingSections);

  return (
    <>
      <tr className={expanded ? 'selected-row' : ''} onClick={onToggle}>
        <td><strong>{student?.name || response.studentName || response.studentNumber}</strong><small>{response.studentNumber}</small></td>
        <td>{student?.teamCode || response.teamCode}</td>
        <td><strong>{formatDateTime(response.updatedAt || response.submittedAt)}</strong></td>
        <td>
          <div className="review-status-summary">
            <div className="status-strip stable">
              <StatusBadge status={primary} />
              {documentCheckEnabled ? <StatusBadge status={documentCheckStatus(response)} /> : null}
              {secondaryFlags.map((flag) => <StatusBadge key={flag} status={flag} />)}
            </div>
            <p>{response.checkSummary || (documentCheckEnabled ? 'Document Check will run automatically for this response.' : 'This deliverable does not require PDF Document Check.')}</p>
            {response.acceptance ? <small>Accepted by {response.acceptance.acceptedBy} ({response.acceptance.acceptedByRole})</small> : null}
          </div>
        </td>
        <td>
          <div className="row-action-group review-actions-compact">
            {fileLink ? (
              <a className="btn btn-secondary btn-sm" href={makeDriveViewUrl(fileLink)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                <ArrowSquareOut weight="regular" /><span>Open file</span>
              </a>
            ) : null}
            {documentCheckEnabled ? (
              <Button size="sm" variant="secondary" icon={MagnifyingGlass} loading={checkRunning} onClick={(event) => { event.stopPropagation(); onDocumentCheck(); }}>
                {isDocumentCheckCurrent(response) ? 'View check' : 'Check document'}
              </Button>
            ) : null}
            {response.reviewStatus === 'Accepted' ? (
              <Button size="sm" variant="secondary" icon={ArrowCounterClockwise} disabled={response.archiveStatus === 'Archived'} onClick={(event) => { event.stopPropagation(); onRevoke(); }}>Revoke</Button>
            ) : <Button size="sm" variant="secondary" icon={CheckCircle} onClick={(event) => { event.stopPropagation(); onAccept(); }}>Accept</Button>}
            <Button size="sm" variant="primary" icon={Archive} disabled={response.reviewStatus !== 'Accepted' || response.archiveStatus === 'Archived'} onClick={(event) => { event.stopPropagation(); onArchive(); }}>Archive</Button>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="review-expanded-row">
          <td colSpan={5}>
            <div className="review-expanded-content">
              <section>
                <span>Document Check</span>
                {documentCheckEnabled ? (
                  <>
                    <p>{report?.summary || response.checkSummary || 'This response has not been checked yet.'}</p>
                    {report?.redFlags?.length ? <div className="status-strip stable">{report.redFlags.map((flag) => <StatusBadge key={flag} status={flag} />)}</div> : null}
                    {missingPreview ? <small>Template headings not detected: {missingPreview}</small> : null}
                    {report?.document ? <small>{report.document.pageCount} pages | {report.document.extractedCharacterCount.toLocaleString()} readable characters</small> : null}
                    <Button size="sm" variant="secondary" icon={MagnifyingGlass} loading={checkRunning} onClick={onDocumentCheck}>
                      {isDocumentCheckCurrent(response) ? 'View document check' : 'Check document'}
                    </Button>
                  </>
                ) : <p>Not required for this link-based deliverable.</p>}
              </section>
              <section>
                <span>Project context</span>
                <p>{project?.projectTitle || 'Project metadata not loaded yet.'}</p>
                {project?.softwareName ? <small>{project.softwareName}</small> : null}
                {project?.proposalRemarks ? <small>{project.proposalRemarks}</small> : null}
              </section>
              <section>
                <span>Admin AI Review</span>
                <p>{response.aiReport?.summary || 'Generate a content summary and instruction-level findings after Gemini is connected.'}</p>
                <Button size="sm" variant="secondary" icon={Sparkle} disabled={!documentCheckEnabled || !isDocumentCheckCurrent(response)} onClick={onAiReview}>
                  {!documentCheckEnabled ? 'Not available for this form' : !isDocumentCheckCurrent(response) ? 'Check document first' : response.aiReport ? 'View AI Review' : 'Run AI Review'}
                </Button>
                {response.acceptance ? <small>Accepted by {response.acceptance.acceptedBy} on {formatDateTime(response.acceptance.acceptedAt)}.</small> : null}
              </section>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Count({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function isFlaggedResponse(response) {
  return (response.flags || []).some((flag) => [
    'Template-like',
    'Too Short',
    'Template Headings Missing',
    'Not PDF',
    'Inaccessible',
    'Invalid Drive Link',
    'Download Disabled',
    'File Too Large',
    'Download Failed',
    'Password Protected',
    'Corrupt PDF'
  ].includes(flag));
}

function needsReviewAction(response) {
  if (response.reviewStatus === 'Accepted') return false;
  return isFlaggedResponse(response) || !isDocumentCheckCurrent(response) || response.reviewStatus === 'Needs Review' || response.reviewStatus === 'Received';
}
