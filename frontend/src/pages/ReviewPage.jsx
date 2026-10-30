import { ResourceBoundary } from '../components/ResourceBoundary.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Select,
  Collapse,
  Button,
  Group,
  Modal,
  Pagination,
  Paper,
  Progress,
  Stack,
  Text,
  TextInput,
  Title
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { CheckCircle, Files, MagnifyingGlass, Sparkle, X } from '@phosphor-icons/react';
import { getAiReviewStatus, getIdentityConflicts, getSavedAiReview } from '../lib/api.js';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { useWorkspaceResource } from '../hooks/useWorkspaceResource.js';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope.js';
import { archiveAttempts as archiveServerAttempts } from '../lib/archiveClient.js';
import { DocumentCheckDialog } from '../components/review/DocumentCheckDialog.jsx';
import { AiReviewDialog } from '../components/review/AiReviewDialog.jsx';
import { AiReviewReportDialog } from '../components/review/AiReviewReportDialog.jsx';
import { AiReviewBatchDialog } from '../components/review/AiReviewBatchDialog.jsx';
import { AiReviewBatchPanel } from '../components/review/AiReviewBatchPanel.jsx';
import { SavedAiReviewsDialog } from '../components/review/SavedAiReviewsDialog.jsx';
import { useAiReviewBatch } from '../app/useAiReviewBatch.js';
import { ReviewDeliverablesTable } from '../components/review/ReviewDeliverablesTable.jsx';
import { ReviewResponseDrawer } from '../components/review/ReviewResponseDrawer.jsx';
import { ReviewSubmissionsTable } from '../components/review/ReviewSubmissionsTable.jsx';
import { buildDeliverableReviewSummaries, filterReviewResponses, REVIEW_FILTERS } from '../lib/review.js';
import { sortReviewResponses } from '../lib/reviewTable.js';
import { isAiBatchAccessRestriction } from '../lib/aiReviewBatch.js';
import { artifactTemplatePreviewUrl } from '../lib/templatePreview.js';
import {
  acceptResponse,
  applyArtifactAiReview,
  applyDocumentCheck,
  applyReviewMutation,
  diagnoseAiReviewAuthFailure,
  emptyReviewDesk,
  loadReviewDesk,
  revokeAcceptance,
  runAiReviews,
  runDocumentCheck as runReviewDocumentCheck,
  runDocumentChecks as runReviewDocumentChecks
} from '../lib/reviewDeskClient.js';
import {
  aiReviewableSubmissionFields,
  aiReviewReportStatus,
  artifactAiReview,
  artifactAiReviewChange,
  artifactAiReportForDisplay,
  artifactAiReviewStatus,
  deliverableUsesDocumentCheck,
  findStudent,
  getIdentityStudents,
  isArtifactAiReviewCurrent,
  isArtifactDocumentCheckCurrent,
  isInconclusiveAiReviewReport,
  reviewableSubmissionFields,
  sortDeliverables
} from '../lib/workflow.js';

const REVIEW_PAGE_SIZE = 50;
const ALL_DELIVERABLES = '__all__';

function progressPercent(completed, total) {
  return Math.round((Math.min(completed || 0, total || 0) / Math.max(total || 0, 1)) * 100);
}

function reviewTargetLabel(target) {
  return target?.label || `${target?.responseId || 'Response'} / ${target?.field?.label || 'PDF'}`;
}

function documentTargetLabel(target) {
  const response = target?.response;
  return `${response?.studentName || response?.studentNumber || response?.id || 'Response'} / ${target?.field?.label || 'PDF'}`;
}

function currentSkippedDriveUrl(target, attempts) {
  const current = attempts.find(response => response.id === target.responseId);
  const originalUrl = String(target.response?.values?.[target.field?.id] || '').trim();
  const currentUrl = String(current?.values?.[target.field?.id] || '').trim();
  if (!current || current.deliverableId !== target.response?.deliverableId || !originalUrl || currentUrl !== originalUrl) return '';
  try {
    const parsed = new URL(currentUrl);
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'drive.google.com' ? parsed.href : '';
  } catch {
    return '';
  }
}

export function ReviewPage() {
  const { activeWorkspaceId, refreshSession } = useWorkspaceSession();
  const navigate = useNavigate();
  const isCurrentScope = useWorkspaceScope(activeWorkspaceId);
  const { data: state, setData: setState, status: reviewStatus, error: reviewError, reload } = useWorkspaceResource(
    activeWorkspaceId,
    loadReviewDesk,
    emptyReviewDesk, 'monitoring', { refreshIntervalMs: 60_000 });
  const aiBatch = useAiReviewBatch(activeWorkspaceId, reload);
  const displayedAiBatch = useMemo(() => {
    if (!aiBatch.batch) return null;
    const targets = savedBatchReviewTargets(aiBatch.batch, state);
    return { ...aiBatch.batch, entries: aiBatch.batch.entries.map(entry => {
      if (entry.resultStatus !== 'COMPLETED' || !entry.error) return entry;
      const target = targets.find(target => target.responseId === entry.target?.responseId
        && (target.fieldId === entry.target?.fieldId || !entry.target?.fieldId && target.fieldId === 'documentPdf'));
      if (!target || target.previous) return entry;
      const status = aiReviewReportStatus(target.report);
      return { ...entry, error: status === 'Needs manual verification'
        ? 'Review finished with checks needing manual verification. Open the saved review to inspect the cited areas.'
        : status === 'Limited review coverage'
          ? 'Review finished with limited coverage. Open the saved review to see the supported observations.' : '' };
    }) };
  }, [aiBatch.batch, state]);
  const [searchParams] = useSearchParams();
  const linkedResponseId = searchParams.get('response') || '';
  const linkedResponse = state.attempts.find((response) => response.id === linkedResponseId) || null;
  const linkedDeliverableId = linkedResponse?.deliverableId || searchParams.get('deliverable') || '';
  const identityStudents = useMemo(() => getIdentityStudents(state.students), [state.students]);
  const orderedDeliverables = useMemo(() => sortDeliverables(state, state.deliverables), [state]);
  const summaries = useMemo(() => buildDeliverableReviewSummaries({
    deliverables: orderedDeliverables,
    attempts: state.attempts,
    expectedStudents: identityStudents
  }), [identityStudents, orderedDeliverables, state.attempts]);

  const [selectedDeliverableId, setSelectedDeliverableId] = useState(() => (
    linkedDeliverableId || ALL_DELIVERABLES
  ));
  const activeDeliverableId = selectedDeliverableId === ALL_DELIVERABLES || summaries.some((summary) => summary.deliverable.id === selectedDeliverableId)
    ? selectedDeliverableId
    : ALL_DELIVERABLES;
  useEffect(() => {
    if (!selectedDeliverableId && activeDeliverableId) setSelectedDeliverableId(activeDeliverableId);
  }, [selectedDeliverableId, activeDeliverableId]);
  const selectedSummary = summaries.find((summary) => summary.deliverable.id === activeDeliverableId) || null;
  const selectedDeliverable = selectedSummary?.deliverable || null;
  const allDeliverables = activeDeliverableId === ALL_DELIVERABLES;
  const scopedResponses = useMemo(() => allDeliverables
    ? summaries.flatMap(summary => summary.responses) : selectedSummary?.responses || [],
  [allDeliverables, summaries, selectedSummary]);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [filter, setFilter] = useState('Pending');
  const [query, setQuery] = useState('');
  const [columnSort, setColumnSort] = useState({ column: 'submitted', direction: 'desc' });
  const [selectedResponseId, setSelectedResponseId] = useState(linkedResponse?.id || '');
  const [conflictStudentNumbers, setConflictStudentNumbers] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [checkDialogTarget, setCheckDialogTarget] = useState(null);
  const [aiReportDialogTarget, setAiReportDialogTarget] = useState(null);
  const [failedBatchSelection, setFailedBatchSelection] = useState(false);
  const [savedReviews, setSavedReviews] = useState([]);
  const [savedReviewsLoading, setSavedReviewsLoading] = useState(false);
  const [savedReviewsError, setSavedReviewsError] = useState('');
  const savedReviewsRequest = useRef(0);
  const savedReviewsScope = useRef(isCurrentScope);
  const visibleSavedReviews = savedReviewsScope.current === isCurrentScope ? savedReviews : [];
  const [batchProgress, setBatchProgress] = useState(null);
  const [acceptProgress, setAcceptProgress] = useState(null);
  const acceptBusy = useRef(false);
  const [aiProgress, setAiProgress] = useState(null);
  const [skippedAiOpen, setSkippedAiOpen] = useState(false);
  const aiProgressSequence = useRef(0);
  const savedRefreshBusy = useRef(false);
  const [aiRunningKeys, setAiRunningKeys] = useState(new Set());
  const aiBusy = useRef(false);
  const [checkingIds, setCheckingIds] = useState(new Set());
  const [checkError, setCheckError] = useState(null);
  const [page, setPage] = useState(1);
  useEffect(() => {
    setAiProgress(null); setAiRunningKeys(new Set()); aiBusy.current = false;
    setSkippedAiOpen(false);
    aiProgressSequence.current += 1;
    savedRefreshBusy.current = false;
    setSelectedDeliverableId(linkedDeliverableId || '');
    setBatchProgress(null);
    setAcceptProgress(null);
    acceptBusy.current = false;
    setCheckingIds(new Set());
    setCheckError(null);
    setCheckDialogTarget(null);
    setAiReportDialogTarget(null);
    setSavedReviews([]);
    setSavedReviewsLoading(false);
    setSavedReviewsError('');
    savedReviewsRequest.current += 1;
    setSelectedIds(new Set());
    setSelectedResponseId('');
    setConflictStudentNumbers([]);
  }, [isCurrentScope]);
  useEffect(() => {
    if (!linkedResponse?.id) return;
    setSelectedDeliverableId(linkedResponse.deliverableId);
    setSelectedResponseId(linkedResponse.id);
  }, [isCurrentScope, linkedResponse?.id, linkedResponse?.deliverableId]);
  const batchRunning = Boolean(batchProgress && !batchProgress.done);

  const visibleResponses = useMemo(() => (allDeliverables ? summaries : selectedSummary ? [selectedSummary] : [])
    .flatMap(summary => filterReviewResponses({ responses: summary.responses, students: state.students,
      deliverable: summary.deliverable, filter, query })),
  [allDeliverables, filter, query, selectedSummary, summaries, state.students]);
  const sortedResponses = useMemo(() => sortReviewResponses(visibleResponses, state, selectedDeliverable, columnSort),
    [columnSort, selectedDeliverable, state, visibleResponses]);
  const selectedResponse = state.attempts.find((response) => response.id === selectedResponseId) || null;
  const selectedResponseDeliverable = selectedResponse
    ? state.deliverables.find(item => item.id === selectedResponse.deliverableId) || null : null;
  const selectedStudent = selectedResponse
    ? findStudent(state.students, selectedResponse.studentNumber) || {
      studentNumber: selectedResponse.studentNumber,
      name: selectedResponse.studentName || selectedResponse.studentNumber || 'Unmatched student',
      teamCode: selectedResponse.teamCode || 'Unmatched team'
    }
    : null;
  const checkDialogResponse = state.attempts.find((response) => response.id === checkDialogTarget?.responseId) || null;
  const checkDialogDeliverable = checkDialogResponse
    ? state.deliverables.find((item) => item.id === checkDialogResponse.deliverableId) || null
    : null;
  const checkDialogField = checkDialogDeliverable?.fields?.find((field) => (
    (field.definitionId || field.id) === checkDialogTarget?.fieldId
  )) || null;
  const checkDialogReport = checkDialogField
    ? (checkDialogResponse?.artifactChecks?.[checkDialogField.definitionId]
      || (!checkDialogField.definitionId ? checkDialogResponse?.documentCheck : null))
    : null;
  const checkDialogFieldKey = checkDialogField?.definitionId || checkDialogField?.id || '';
  const checkDialogHistory = checkDialogField
    ? (checkDialogResponse?.observedFileHistoryByField?.[checkDialogFieldKey]
      || checkDialogResponse?.observedFileHistory
      || null)
    : null;
  const visibleAiReportTarget = !aiReportDialogTarget?.scope || aiReportDialogTarget.scope === isCurrentScope
    ? aiReportDialogTarget : null;
  const aiReportDialogResponse = state.attempts.find(response => response.id === visibleAiReportTarget?.responseId) || null;
  const aiReportDialogDeliverable = aiReportDialogResponse
    ? state.deliverables.find((item) => item.id === aiReportDialogResponse.deliverableId) || null
    : null;
  const aiReportDialogField = aiReportDialogDeliverable?.fields?.find((field) => (
    (field.definitionId || field.id) === visibleAiReportTarget?.fieldId
  )) || null;
  const aiReportSourceMatches = !visibleAiReportTarget?.sourceUrl
    || String(aiReportDialogResponse?.values?.[aiReportDialogField?.id] || '').trim() === visibleAiReportTarget.sourceUrl;
  const aiReportDialogReview = aiReportDialogField && aiReportSourceMatches
    ? artifactAiReview(aiReportDialogResponse, aiReportDialogField)
    : null;
  const aiReportDialogReport = aiReportSourceMatches ? artifactAiReportForDisplay(aiReportDialogResponse, aiReportDialogField) : null;
  const documentCheckEnabled = allDeliverables
    ? orderedDeliverables.some(deliverableUsesDocumentCheck) : deliverableUsesDocumentCheck(selectedDeliverable);
  const uncheckedDocumentTargets = useMemo(() => documentCheckEnabled
    ? documentTargetsForResponses(scopedResponses, state.deliverables, { onlyUnchecked: true })
    : [], [documentCheckEnabled, scopedResponses, state.deliverables]);
  const pageCount = Math.max(1, Math.ceil(sortedResponses.length / REVIEW_PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const pageResponses = sortedResponses.slice((activePage - 1) * REVIEW_PAGE_SIZE, activePage * REVIEW_PAGE_SIZE);
  const firstVisibleIndex = sortedResponses.length ? (activePage - 1) * REVIEW_PAGE_SIZE + 1 : 0;
  const lastVisibleIndex = Math.min(activePage * REVIEW_PAGE_SIZE, sortedResponses.length);

  // Ticket 06: compact conflict indicators for the staff exception view.
  useEffect(() => {
    let cancelled = false;
    if (!activeWorkspaceId) return undefined;
    getIdentityConflicts(activeWorkspaceId)
      .then((conflicts) => {
        if (cancelled || !Array.isArray(conflicts)) return;
        setConflictStudentNumbers(conflicts
          .filter((conflict) => conflict.status === 'OPEN')
          .map((conflict) => identityStudents.find((student) => student.id === conflict.studentRecordId)?.studentNumber).filter(Boolean)
          .filter(Boolean));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);
  useEffect(() => {
    setSelectedIds((current) => {
      const visibleIds = new Set(visibleResponses.map((response) => response.id));
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return sameSet(current, next) ? current : next;
    });
  }, [visibleResponses]);

  useEffect(() => {
    setPage(1);
  }, [activeDeliverableId, filter, query, columnSort]);

  function sortColumn(column) {
    setColumnSort(current => ({ column, direction: current.column === column
      ? current.direction === 'asc' ? 'desc' : 'asc' : column === 'submitted' ? 'desc' : 'asc' }));
  }

  function chooseDeliverable(id) {
    setSelectedDeliverableId(id);
    setSelectedResponseId('');
    setSelectedIds(new Set());
    setCheckDialogTarget(null);
    setAiReportDialogTarget(null);
    setBatchProgress(current => current?.done ? null : current);
  }

  function toggleSelected(id, checked) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllVisible(checked) {
    setSelectedIds((current) => {
      const next = new Set(current);
      pageResponses.forEach((response) => {
        if (checked) next.add(response.id);
        else next.delete(response.id);
      });
      return next;
    });
  }

  async function openOrRunDocumentCheck(response, field, rerun = false) {
    if (rerun || !isArtifactDocumentCheckCurrent(response, field)) {
      const result = await runDocumentCheck(response.id, field);
      if (!result.ok) return;
    }
    if (!isCurrentScope()) return;
    setCheckDialogTarget({ responseId: response.id, fieldId: field.definitionId || field.id });
  }

  async function recheckFromDialog() {
    if (checkDialogResponse && checkDialogField) await runDocumentCheck(checkDialogResponse.id, checkDialogField);
  }

  function confirmDocumentCheckBatch(targets, { allUnchecked = false, allDeliverables = false } = {}) {
    if (!targets.length) return;
    modals.openConfirmModal({
      title: allDeliverables ? `Recheck ${targets.length} PDF artifact${targets.length === 1 ? '' : 's'} across all deliverables?` : allUnchecked
        ? `Check all ${targets.length} unchecked PDF artifact${targets.length === 1 ? '' : 's'}?`
        : `Check ${targets.length} selected PDF artifact${targets.length === 1 ? '' : 's'}?`,
      children: (
        <Text size="sm">
          WildTrack will check every document in this batch and report progress here. One failed file will not stop the remaining checks.
        </Text>
      ),
      labels: { confirm: 'Start Document Check', cancel: 'Cancel' },
      confirmProps: { color: 'wildtrackMaroon' },
      centered: true,
      onConfirm: () => runDocumentCheckBatch(targets)
    });
  }

  async function runDocumentCheckBatch(targets) {
    if (!isCurrentScope()) return;
    const sample = targets[0] ? documentTargetLabel(targets[0]) : '';
    setBatchProgress({ completed: 0, total: targets.length, failed: 0, done: false,
      phase: 'Checking submitted PDFs in shared-file batches', sample });
    const result = await runReviewDocumentChecks(activeWorkspaceId, targets, state.deliverables, {
      useDedup: true,
      shouldContinue: isCurrentScope,
      onProgress: ({ completed, total }) => {
        if (isCurrentScope()) setBatchProgress((current) => ({ ...current, completed, total,
          phase: completed < total ? 'Checking remaining submitted PDFs' : 'Collecting Document Check results' }));
      }
    });
    if (!isCurrentScope()) return;
    setState((current) => ({
      ...current,
      attempts: current.attempts.map((attempt) => {
        const completed = (result.results || []).filter((item) => item.attemptId === attempt.id && item.ok && item.report);
        return completed.reduce((updated, item) => applyDocumentCheck(updated, item.report), attempt);
      })
    }));
    const failures = (result.results || [])
      .filter((item) => !item.ok)
      .map((item) => {
        const response = state.attempts.find((attempt) => attempt.id === item.attemptId);
        const student = response ? findStudent(state.students, response.studentNumber) : null;
        const target = targets.find((candidate) => candidate.response.id === item.attemptId
          && (candidate.field?.definitionId || candidate.field?.id || null) === (item.fieldId || item.fieldKey || null));
        return {
          id: `${item.attemptId}:${item.fieldId || item.fieldKey || 'legacy'}`,
          student: `${student?.name || response?.studentName || response?.studentNumber || 'Unknown response'}${target?.field?.label ? ` — ${target.field.label}` : ''}`,
          error: item.error || 'Document Check could not finish.'
        };
      });
    setBatchProgress({ completed: result.completed, total: result.total, failed: result.failed,
      failures, done: true,
      phase: result.completed < result.total ? 'Batch stopped before all PDFs were checked' : 'Document Check results saved', sample });
  }

  async function requestAiReview(targetsOrIds, retryAcknowledged = false, retryTokens = {}, excludeArchived = false,
      rerunRequested = false, immediate = false) {
    if (!isCurrentScope()) return;
    if (aiBusy.current || aiBatch.running) {
      notifications.show({ color: 'blue', title: 'AI Review already running',
        message: 'A review is already running. PDFs included in the batch will be checked there; no additional AI request was sent.' });
      return;
    }
    if (aiBatch.busy || !rerunRequested && aiBatch.batch?.state === 'PLANNING') return;
    const candidates = normalizeAiTargets(targetsOrIds, state)
      .filter((target) => !excludeArchived || target.response?.archiveStatus !== 'Archived');
    if (!candidates.length) {
      notifications.show({ message: 'No selected PDF submissions have AI Review enabled.' });
      return;
    }
    const effectiveRetryTokens = { ...retryTokens };
    for (const target of candidates) {
      const review = artifactAiReview(target.response, target.field);
      if (artifactAiReviewStatus(target.response, target.field) === 'Retry required' && review?.retryToken) {
        effectiveRetryTokens[target.key] = review.retryToken;
      }
    }
    try {
      const provider = await getAiReviewStatus();
      if (!isCurrentScope()) return;
      if (!provider.configured) {
        modals.openConfirmModal({ title: 'AI review is not connected', centered: true,
          children: <Text size="sm">{provider.message || 'Gemini is ready to connect. Add its API key to the backend to enable reviews.'} No documents have been sent.</Text>,
          labels: { confirm: 'Understood', cancel: 'Close' } });
        return;
      }
      if (!immediate && (!rerunRequested || candidates.length > 1)) {
        setAiProgress(null);
        setFailedBatchSelection(false);
        modals.openConfirmModal({ title: 'Prepare AI Review?', centered: true,
          children: <Text size="sm">WildTrack will check current PDFs and saved reviews. This is a precheck only; it does not send an AI request. You will confirm AI Review separately.</Text>,
          labels: { confirm: 'Start precheck', cancel: 'Cancel' },
          onConfirm: () => aiBatch.prepare(candidates) });
        return;
      }
      const modalId = modals.open({ title: retryAcknowledged ? 'Retry AI reviews?'
        : rerunRequested ? 'Rerun AI Review?' : 'AI review submissions', centered: true,
        children: <AiReviewDialog targets={candidates}
          excludeArchived={excludeArchived} retry={retryAcknowledged} rerun={rerunRequested} retryTokens={effectiveRetryTokens}
          onCancel={() => modals.close(modalId)}
          onConfirm={selected => {
            const selectedRetryTokens = Object.fromEntries(selected
              .filter(target => effectiveRetryTokens[target.key])
              .map(target => [target.key, effectiveRetryTokens[target.key]]));
            const selectedRerunKeys = Object.fromEntries(selected
              .filter(target => rerunRequested && !effectiveRetryTokens[target.key]
                && isArtifactAiReviewCurrent(target.response, target.field))
              .map(target => [target.key, true]));
            modals.close(modalId);
            runAiBatch(selected, selectedRetryTokens, selectedRerunKeys);
          }} /> });
    } catch (error) {
      if (!isCurrentScope()) return;
      if (error?.status === 401) {
        const diagnosis = await diagnoseAiReviewAuthFailure(error, 'AI Review availability check');
        if (!isCurrentScope()) return;
        setAiProgress({ total: candidates.length, completed: 0, available: 0, reused: 0,
          failures: [diagnosis.error], uncertainTargets: [], retryTokens: {}, done: true,
          batchId: ++aiProgressSequence.current, targets: candidates, phase: 'AI Review availability check',
          paused: true, authenticationRequired: diagnosis.authenticationRequired,
          sessionConfirmed: diagnosis.sessionConfirmed });
      } else notifications.show({ color: 'red', message: error.message || 'AI review status could not be loaded.' });
    }
  }

  function reconnectGoogle() {
    // A new verified Google credential can replace an unrecognized cookie.
    // Do not revoke another live session or make the user sign out first.
    navigate('/login', { state: { from: '/review' } });
    refreshSession?.();
  }

  async function runAiBatch(targets, retryTokens = {}, rerunKeys = {}) {
    if (aiBusy.current || !isCurrentScope()) return;
    aiBusy.current = true;
    setSkippedAiOpen(false);
    setAiRunningKeys(new Set(targets.map(target => target.key)));
    let progress = { batchId: ++aiProgressSequence.current, targets, total: targets.length,
      completed: 0, available: 0, reused: 0, failures: [], uncertainTargets: [],
      skippedInaccessible: [], advisories: 0,
      retryTokens: {}, done: false, phase: 'Starting AI Review', currentItem: reviewTargetLabel(targets[0]) };
    setAiProgress(progress);
    let outcome = null;
    try {
      outcome = await runAiReviews(activeWorkspaceId, targets.map(({ key, responseId, fieldId }) => ({ key, responseId, fieldId })), { retryTokens, rerunKeys, shouldContinue: isCurrentScope,
        onResult: (targetRef, result) => {
          setAiRunningKeys(current => new Set([...current].filter(key => key !== targetRef.key)));
          const target = targets.find((item) => item.responseId === targetRef.responseId && item.fieldId === targetRef.fieldId);
          const response = state.attempts.find(attempt => attempt.id === targetRef.responseId);
          const deliverable = state.deliverables.find(item => item.id === response?.deliverableId);
          const label = `${deliverable?.title || 'Document'} / ${target?.field?.label || 'PDF'} — ${response?.studentName || response?.studentNumber || targetRef.responseId}`;
          if (result.review) setState(current => ({ ...current, attempts: current.attempts.map(item => item.id === targetRef.responseId ? applyArtifactAiReview(item, result.review) : item) }));
          const targetKey = target?.key || `${targetRef.responseId}:${targetRef.fieldId || 'legacy'}`;
          progress = { ...progress, completed: progress.completed + 1,
            authenticationRequired: Boolean(progress.authenticationRequired || result.authenticationRequired),
            sessionConfirmed: Boolean(progress.sessionConfirmed || result.sessionConfirmed),
            available: progress.available + (result.ok ? 1 : 0),
            advisories: progress.advisories + (result.ok && result.advisory ? 1 : 0),
            reused: progress.reused + (result.ok && result.review?.reused ? 1 : 0),
            failures: result.ok || result.notStarted ? progress.failures : [...progress.failures, `${label}: ${result.error || 'AI Review could not finish.'}`],
            skippedInaccessible: result.notStarted
              ? [...progress.skippedInaccessible, { ...target, key: targetKey, label, error: result.error || 'Submitted PDF could not be opened.',
                technicalFailure: !isAiBatchAccessRestriction({ noAiStarted: true, error: result.error }) }]
              : progress.skippedInaccessible,
            uncertainTargets: result.uncertain ? [...progress.uncertainTargets, target] : progress.uncertainTargets,
            retryTokens: result.uncertain ? { ...progress.retryTokens, [targetKey]: result.review?.retryToken } : progress.retryTokens,
            phase: 'Checking AI Review and saved report status',
            currentItem: progress.completed + 1 < targets.length ? reviewTargetLabel(targets[progress.completed + 1]) : '' };
          setAiProgress(progress);
        }
      });
    } catch (error) {
      const diagnosis = await diagnoseAiReviewAuthFailure(error, 'AI Review batch');
      progress = { ...progress, failures: [...progress.failures, error?.message || 'AI Review batch could not finish.'],
        authenticationRequired: Boolean(progress.authenticationRequired || diagnosis.authenticationRequired),
        sessionConfirmed: Boolean(progress.sessionConfirmed || diagnosis.sessionConfirmed) };
    } finally {
      if (isCurrentScope()) { aiBusy.current = false; setAiRunningKeys(new Set());
        setAiProgress({ ...progress, done: true, paused: Boolean(outcome?.paused || progress.completed < progress.total),
          phase: outcome?.paused || progress.completed < progress.total
            ? 'Batch paused; saved status can be checked without a new AI request' : 'AI Review batch finished',
          currentItem: '',
          authenticationRequired: Boolean(progress.authenticationRequired || outcome?.authenticationRequired),
          sessionConfirmed: Boolean(progress.sessionConfirmed || outcome?.sessionConfirmed) }); }
    }
  }

  async function openSavedBatchReviews() {
    if (!isCurrentScope() || savedReviewsLoading || !aiBatch.batch) return;
    const request = ++savedReviewsRequest.current;
    savedReviewsScope.current = isCurrentScope;
    setSavedReviewsLoading(true);
    setSavedReviewsError('');
    setSavedReviews([]);
    try {
      const fresh = await reload();
      if (!isCurrentScope() || request !== savedReviewsRequest.current) return;
      if (!fresh) throw new Error('Saved reviews could not be loaded. Please try again.');
      const results = savedBatchReviewTargets(aiBatch.batch, fresh);
      setSavedReviews(results);
      if (results.length === 1) {
        setSelectedResponseId(results[0].responseId);
        setAiReportDialogTarget({ ...results[0], scope: isCurrentScope });
      }
      else if (!results.length) setSavedReviewsError('No saved AI Review is available for the current files in this batch. An unfinished or failed attempt does not create a new review.');
    } catch (error) {
      if (isCurrentScope() && request === savedReviewsRequest.current) {
        const message = error?.message || 'Saved reviews could not be loaded. Please try again.';
        setSavedReviewsError(message);
        notifications.show({ color: 'orange', title: 'Saved reviews unavailable', message });
      }
    } finally {
      if (isCurrentScope() && request === savedReviewsRequest.current) setSavedReviewsLoading(false);
    }
  }

  function openSavedReview(target) {
    if (!isCurrentScope()) return;
    const current = savedBatchReviewTargets({ entries: [{ target, identity: { sourceUrl: target.sourceUrl } }] }, reviewStateRef.current)[0];
    if (current) {
      setSelectedResponseId(current.responseId);
      setAiReportDialogTarget({ ...current, scope: isCurrentScope });
    }
    else {
      setSavedReviews([]);
      setSavedReviewsError('This file or its saved review changed. Check saved reviews again to load the current results.');
    }
  }

  function openBatchReview(entry) {
    if (!isCurrentScope()) return;
    const target = savedBatchReviewTargets({ entries: [entry] }, reviewStateRef.current)[0];
    if (target) openSavedReview(target);
    else {
      setSelectedResponseId(entry.target?.responseId || '');
      notifications.show({ color: 'orange', title: 'Saved review unavailable',
        message: 'Open the submission details to check its latest AI Review status.' });
    }
  }

  async function checkSavedReviews() {
    const batch = aiProgress;
    if (!batch?.done || aiBusy.current || savedRefreshBusy.current || !isCurrentScope()) return;
    const targets = batch.targets || [];
    const batchId = batch.batchId;
    savedRefreshBusy.current = true;
    const refresh = { checked: 0, total: targets.length, available: 0, running: 0,
      uncertain: 0, advisories: 0, unavailable: 0, failed: 0, updated: 0, errors: [], done: false,
      currentItem: '', phase: 'Reading saved AI Review status (GET only)' };
    const update = () => {
      if (isCurrentScope()) setAiProgress(current => current?.batchId === batchId
        ? { ...current, savedRefresh: { ...refresh, errors: [...refresh.errors] } } : current);
    };
    update();
    try {
      for (const target of targets) {
        if (!isCurrentScope() || aiProgressSequence.current !== batchId) return;
        refresh.currentItem = reviewTargetLabel(target);
        update();
        try {
          // This is intentionally read-only. Do not call runAiReview, runAiReviews,
          // or the generation POST to resolve an uncertain/billable request.
          const saved = await getSavedAiReview(activeWorkspaceId, target.responseId, target.fieldId);
          if (!isCurrentScope() || aiProgressSequence.current !== batchId) return;
          const currentResponse = reviewStateRef.current.attempts.find(response => response.id === target.responseId);
          const currentUrl = String(currentResponse?.values?.[target.field?.id] || '').trim();
          const initialUrl = String(target.response?.values?.[target.field?.id] || '').trim();
          if (!currentResponse || currentResponse.deliverableId !== target.response?.deliverableId
              || !currentUrl || currentUrl !== initialUrl || (saved?.sourceUrl && String(saved.sourceUrl).trim() !== currentUrl)) {
            refresh.unavailable++;
            refresh.errors.push(`${reviewTargetLabel(target)}: Submitted PDF changed; saved review was not applied.`);
          } else if (saved?.status === 'COMPLETED' && saved.report && typeof saved.report === 'object' && !Array.isArray(saved.report)) {
            refresh.available++;
            if (isInconclusiveAiReviewReport(saved.report)) refresh.advisories++;
            setState(current => ({ ...current, attempts: current.attempts.map(response => response.id === target.responseId
              ? applyArtifactAiReview(response, saved) : response) }));
            refresh.updated++;
          } else if (saved?.status === 'RUNNING') {
            refresh.running++;
            setState(current => ({ ...current, attempts: current.attempts.map(response => response.id === target.responseId
              ? applyArtifactAiReview(response, saved) : response) }));
            refresh.updated++;
          } else if (saved?.status === 'UNCERTAIN') {
            refresh.uncertain++;
            refresh.errors.push(`${reviewTargetLabel(target)}: ${saved.message || 'The saved review needs attention.'}`);
            setState(current => ({ ...current, attempts: current.attempts.map(response => response.id === target.responseId
              ? applyArtifactAiReview(response, saved) : response) }));
            refresh.updated++;
          } else {
            refresh.unavailable++;
            refresh.errors.push(`${reviewTargetLabel(target)}: ${saved?.message || 'No completed saved AI Review is available.'}`);
          }
        } catch (error) {
          if (!isCurrentScope() || aiProgressSequence.current !== batchId) return;
          refresh.failed++;
          refresh.errors.push(`${reviewTargetLabel(target)}: ${error?.message || 'Saved review status could not be read.'}`);
          if (error?.status === 401) {
            const diagnosis = await diagnoseAiReviewAuthFailure(error, 'Saved AI Review status check');
            if (!isCurrentScope() || aiProgressSequence.current !== batchId) return;
            setAiProgress(current => current?.batchId === batchId
              ? { ...current, authenticationRequired: diagnosis.authenticationRequired,
                sessionConfirmed: diagnosis.sessionConfirmed } : current);
            refresh.checked++;
            update();
            break;
          }
        }
        refresh.checked++;
        update();
      }
    } finally {
      savedRefreshBusy.current = false;
      refresh.currentItem = '';
      refresh.done = true;
      refresh.phase = 'Saved status check finished; no new AI request was sent';
      update();
    }
  }

  async function acceptReview(response) {
    if (!isCurrentScope()) return;
    try {
      const serverState = await acceptResponse(response.id);
      if (!isCurrentScope()) return;
      setState((current) => ({
        ...current,
        attempts: current.attempts.map((attempt) => attempt.id === response.id ? applyReviewMutation(attempt, serverState) : attempt)
      }));
      setSelectedIds((current) => withoutId(current, response.id));
      notifications.show({ color: 'green', title: 'Response accepted', message: 'The response left the Pending queue. You can archive it from the open details.' });
    } catch (error) {
      if (!isCurrentScope()) return;
      notifications.show({ color: 'red', title: 'Response not accepted', message: error?.message || 'The acceptance could not be saved.' });
    }
  }

  function confirmRevoke(response) {
    modals.openConfirmModal({
      title: 'Revoke this acceptance?',
      children: <Text size="sm">The response returns to Pending. Existing archive records and preserved copies are kept. To archive it again, accept the response and choose Archive response.</Text>,
      labels: { confirm: 'Revoke acceptance', cancel: 'Keep accepted' },
      confirmProps: { color: 'red' },
      centered: true,
      onConfirm: async () => {
        if (!isCurrentScope()) return;
        try {
          const serverState = await revokeAcceptance(response.id);
          if (!isCurrentScope()) return;
          setState((current) => ({
            ...current,
            attempts: current.attempts.map((attempt) => attempt.id === response.id ? applyReviewMutation(attempt, serverState) : attempt)
          }));
          setSelectedResponseId('');
        } catch (error) {
          if (!isCurrentScope()) return;
          notifications.show({ color: 'red', title: 'Acceptance not revoked', message: error?.message || 'The response could not be updated.' });
        }
      }
    });
  }

  async function runDocumentCheck(attemptId, field) {
    const runningKey = artifactTargetKey(attemptId, field);
    if (!isCurrentScope() || checkingIds.has(runningKey)) return { ok: false };
    const response = state.attempts.find((attempt) => attempt.id === attemptId);
    if (!response) return { ok: false, error: 'The selected response was not found.' };
    const deliverable = state.deliverables.find((item) => item.id === response.deliverableId);
    const reviewableFields = reviewableSubmissionFields(deliverable);
    const targetField = field || (reviewableFields.length === 1 ? reviewableFields[0] : null);
    if (!targetField && reviewableFields.length > 1) return { ok: false, error: 'Choose which PDF artifact to check.' };
    if (!targetField) return { ok: false, error: 'This response has no reviewable PDF artifact.' };
    setCheckingIds((current) => new Set([...current, runningKey]));
    setCheckError(null);
    let result;
    try {
      result = await runReviewDocumentCheck(activeWorkspaceId, response, deliverable, targetField);
    } catch (error) {
      result = { ok: false, error: error?.message || 'Document Check could not finish.' };
    }
    if (!isCurrentScope()) return { ok: false };
    setCheckingIds((current) => withoutId(current, runningKey));
    if (result.ok) {
      setState((current) => ({
        ...current,
        attempts: current.attempts.map((attempt) => attempt.id === attemptId ? applyDocumentCheck(attempt, result.report) : attempt)
      }));
    } else {
      setCheckError({ targetKey: runningKey, message: result.error || 'Document Check could not finish. Please try again.' });
    }
    return result;
  }

  function confirmArchive(response) {
    modals.openConfirmModal({
      title: 'Archive this accepted response?',
      children: <Text size="sm">WildTrack will preserve copies of the accepted PDFs. Other answers and links are retained in the record. Linked Google Forms, Sheets and other files are not copied. Check Final archive for progress.</Text>,
      labels: { confirm: 'Archive response', cancel: 'Cancel' },
      confirmProps: { color: 'wildtrackMaroon' },
      centered: true,
      onConfirm: async () => {
        if (!isCurrentScope()) return;
        let result;
        try {
          result = await archiveServerAttempts(activeWorkspaceId, [response.id]);
          if (!isCurrentScope()) return;
          if (result?.records?.some(record => record.captureState === 'COMPLETE' && record.lifecycleState === 'Archived')) {
            setState((current) => ({
              ...current,
              attempts: current.attempts.map((attempt) => attempt.id === response.id ? { ...attempt, archiveStatus: 'Archived' } : attempt)
            }));
          }
        } catch (error) {
          result = { ok: false, error: error?.message || 'The archive copies could not be queued.' };
        }
        if (!isCurrentScope()) return;
        notifications.show({
          color: result?.ok ? 'blue' : 'red',
          title: result?.ok ? (result?.queued ? 'Archive copies queued' : 'Response archived') : 'Archive failed',
          message: result?.ok ? (result?.queued ? 'Copying is in progress. Check Final archive for the latest status.' : 'The preserved PDFs are available in Final archive.') : result?.error || 'The archive copies could not be queued.'
        });
      }
    });
  }

  const allDocumentTargets = documentTargetsForResponses(state.attempts, state.deliverables);
  const selectedResponses = state.attempts.filter((response) => selectedIds.has(response.id));
  const selectedDocumentTargets = documentTargetsForResponses(selectedResponses, state.deliverables);
  const allAiTargets = aiTargetsForResponses(state.attempts, state.deliverables);
  const selectedIdsRef = useRef(selectedIds);
  const reviewStateRef = useRef(state);
  const deliverableIdRef = useRef(activeDeliverableId);
  const conflictsRef = useRef(conflictStudentNumbers);
  selectedIdsRef.current = selectedIds;
  reviewStateRef.current = state;
  deliverableIdRef.current = activeDeliverableId;
  conflictsRef.current = conflictStudentNumbers;

  function acceptanceSkipReason(response, deliverableId, conflicts) {
    if (!response || response.deliverableId !== deliverableId) return 'Response no longer belongs to this deliverable';
    if (response.archiveStatus === 'Archived') return 'Already archived';
    if (response.reviewStatus === 'Accepted' || response.primaryStatus === 'Accepted'
        || response.acceptance?.acceptedAt) return 'Already accepted';
    if (conflicts.includes(response.studentNumber)) return 'Unresolved identity conflict';
    return '';
  }

  function confirmAcceptSelected() {
    if (!isCurrentScope() || acceptBusy.current || !selectedIds.size) return;
    const selected = selectedResponses.map((response) => ({
      id: response.id,
      deliverableId: response.deliverableId,
      student: findStudent(state.students, response.studentNumber)?.name
        || response.studentName || response.studentNumber || response.id,
      skip: acceptanceSkipReason(response, allDeliverables ? response.deliverableId : activeDeliverableId, conflictStudentNumbers)
    }));
    const eligible = selected.filter(item => !item.skip);
    const skipped = selected.filter(item => item.skip);
    const scopedDeliverableId = activeDeliverableId;
    modals.openConfirmModal({
      title: 'Accept selected responses?',
      centered: true,
      children: <Stack gap="xs">
        <Text size="sm"><strong>{selected.length} selected response{selected.length === 1 ? '' : 's'}:</strong>{' '}
          {eligible.length} eligible for acceptance, {skipped.length} skipped
          {skipped.length ? ` (${skipped.filter(item => item.skip === 'Already accepted').length} already accepted, ${skipped.filter(item => item.skip === 'Already archived').length} archived, ${skipped.filter(item => item.skip === 'Unresolved identity conflict').length} identity conflicts)` : ''}.
        </Text>
        <Text size="sm">Acceptance is an academic decision made by staff, not an automated AI Review result.
          Only the eligible checked response IDs will be accepted. This does not archive responses or check their documents.</Text>
        {!eligible.length ? <Text size="sm" c="orange.8">No selected responses are eligible for acceptance.</Text> : null}
      </Stack>,
      labels: { confirm: `Accept ${eligible.length} eligible response${eligible.length === 1 ? '' : 's'}`, cancel: 'Cancel' },
      confirmProps: { color: 'wildtrackMaroon', disabled: !eligible.length },
      onConfirm: () => acceptSelectedResponses(selected, scopedDeliverableId)
    });
  }

  async function acceptSelectedResponses(selected, scopedDeliverableId) {
    if (acceptBusy.current || !isCurrentScope() || deliverableIdRef.current !== scopedDeliverableId) return;
    acceptBusy.current = true;
    const eligible = selected.filter(item => !item.skip);
    const progress = { selected: selected.length, eligible: eligible.length,
      skipped: selected.length - eligible.length, completed: 0, succeeded: 0, failed: 0,
      failures: [], done: false };
    setAcceptProgress({ ...progress });
    try {
      for (const item of eligible) {
        if (!isCurrentScope()) return;
        const current = reviewStateRef.current.attempts.find(response => response.id === item.id);
        const skip = acceptanceSkipReason(current, item.deliverableId, conflictsRef.current);
        if (!selectedIdsRef.current.has(item.id) || deliverableIdRef.current !== scopedDeliverableId || skip) {
          progress.skipped++;
          progress.completed++;
          setAcceptProgress({ ...progress });
          continue;
        }
        try {
          const serverState = await acceptResponse(item.id);
          if (!isCurrentScope()) return;
          if (!serverState?.acceptance?.acceptedAt
              || applyReviewMutation(current, serverState).reviewStatus !== 'Accepted') {
            throw new Error('Acceptance could not be confirmed from the saved response. Check its current status before retrying.');
          }
          setState(currentState => ({ ...currentState, attempts: currentState.attempts.map(response =>
            response.id === item.id ? applyReviewMutation(response, serverState) : response) }));
          setSelectedIds(currentIds => withoutId(currentIds, item.id));
          progress.succeeded++;
        } catch (error) {
          if (!isCurrentScope()) return;
          progress.failed++;
          progress.failures.push({ id: item.id, student: item.student,
            message: error?.message || 'Acceptance could not be saved.' });
        }
        progress.completed++;
        setAcceptProgress({ ...progress });
      }
    } finally {
      acceptBusy.current = false;
      if (isCurrentScope()) setAcceptProgress({ ...progress, done: true });
    }
  }

  const aiProgressHasErrors = aiProgress?.savedRefresh?.done
    ? aiProgress.savedRefresh.errors.length > 0
    : Boolean(aiProgress?.failures.length || aiProgress?.skippedInaccessible?.some(target => target.technicalFailure));
  const aiProgressFinished = aiProgress?.savedRefresh?.done
    ? !aiProgress.savedRefresh.running : aiProgress?.done && !aiProgress.paused;

  return (
    <Stack gap="lg" className="wt-review-page">
      <header className="wt-staff-page-heading">
        <div>
          <Text size="xs" fw={750} tt="uppercase" c="wildtrackMaroon.7">Academic review</Text>
          <Title order={1}>Submission review</Title>
          <Text c="dimmed">Start with a deliverable, work through its pending responses, and open details only when needed.</Text>
        </div>
      </header>

      <ResourceBoundary status={reviewStatus} error={reviewError} onRetry={reload}>

      <Paper withBorder p="md"><Group justify="space-between" align="flex-end" wrap="wrap">
        <Select label="Deliverable" value={activeDeliverableId} onChange={chooseDeliverable} allowDeselect={false} searchable
          style={{ flex: '1 1 280px', maxWidth: 520 }} data={[{ value: ALL_DELIVERABLES, label: 'All deliverables' },
            ...summaries.map(summary => ({ value: summary.deliverable.id,
            label: (summary.deliverable.shortTitle || summary.deliverable.title) + ' · ' + summary.received + ' received · ' + summary.needsAction + ' need action' }))]} />
        <Group gap="xs"><Button variant="default" leftSection={<Files size={17} />} disabled={batchRunning || !allDocumentTargets.length}
          onClick={() => confirmDocumentCheckBatch(allDocumentTargets, { allDeliverables: true })}>Recheck all documents</Button>
          <Button variant="default" leftSection={<Sparkle size={16} />} disabled={Boolean(aiProgress && !aiProgress.done) || !allAiTargets.length} onClick={() => requestAiReview(allAiTargets, false, {}, true)}>AI review all</Button>
          <Button variant="subtle" onClick={() => setOverviewOpen(value => !value)} aria-expanded={overviewOpen}>{overviewOpen ? 'Hide overview' : 'Deliverable overview'}</Button></Group>
      </Group></Paper>
      <AiReviewBatchPanel batch={displayedAiBatch} error={aiBatch.error} busy={aiBatch.busy}
        onOpenReview={openBatchReview}
        dismissed={aiBatch.panelDismissed} onDismiss={aiBatch.dismiss}
        onResume={aiBatch.resume} onStop={aiBatch.stop} onChoose={aiBatch.open} onCancel={aiBatch.cancel} onRefresh={openSavedBatchReviews} refreshing={savedReviewsScope.current === isCurrentScope && savedReviewsLoading}
        onRetryFailed={targets => { setFailedBatchSelection(true); aiBatch.prepare(targets, { openWhenReady: true }); }}
        onPrepare={() => requestAiReview(allAiTargets, false, {}, true)} />
      {savedReviewsScope.current === isCurrentScope && savedReviewsError ? <Alert color="orange" role="alert">{savedReviewsError}</Alert> : null}
      <SavedAiReviewsDialog key={savedReviewsRequest.current} opened={visibleSavedReviews.length > 1 && !visibleAiReportTarget}
        targets={visibleSavedReviews} onClose={() => setSavedReviews([])} onOpen={openSavedReview} />
      <Modal opened={aiBatch.opened && aiBatch.batch?.state === 'READY'} onClose={aiBatch.close} title="AI review submissions" centered size="lg"
        closeButtonProps={{ 'aria-label': 'Close AI Review window' }}>
        <AiReviewBatchDialog key={aiBatch.batch?.id || 'new'} plan={aiBatch.batch} error={aiBatch.error}
          busy={aiBatch.busy} onStart={aiBatch.start} onCancel={aiBatch.close}
          initialMode={failedBatchSelection ? 'ALL' : 'ATTENTION'} failedSelection={failedBatchSelection} />
      </Modal>
      {aiProgress ? <Alert role="status" color={aiProgressHasErrors ? 'orange' : aiProgressFinished ? 'green' : 'blue'} title={aiProgress.savedRefresh?.done
        ? aiProgress.savedRefresh.checked === aiProgress.savedRefresh.total
          && aiProgress.savedRefresh.available === aiProgress.savedRefresh.total
          ? 'Saved AI Reviews available'
          : aiProgress.savedRefresh.running ? 'Saved AI Reviews still running' : 'Saved AI Review status checked'
        : aiProgress.done ? (aiProgress.paused ? 'AI review paused' : aiProgressHasErrors ? 'AI review finished with items needing attention' : 'AI review complete') : 'Reviewing documents'}
        withCloseButton={aiProgress.done} onClose={() => setAiProgress(null)}>
        <Stack gap="xs">
          <Group justify="space-between" align="center" wrap="wrap" gap="xs">
            <Text size="sm" fw={700}>{aiProgress.savedRefresh?.done
              ? 'Original AI Review batch (attempted actions)' : aiProgress.phase || 'AI Review batch'}</Text>
            <Text size="sm" fw={700} className="wt-tabular">{progressPercent(aiProgress.completed, aiProgress.total)}%</Text>
          </Group>
          <Progress value={progressPercent(aiProgress.completed, aiProgress.total)} size="lg" radius="xl"
            color={aiProgressHasErrors ? 'orange' : aiProgressFinished ? 'green' : 'blue'}
            striped animated={!aiProgress.done} aria-label="AI Review batch progress" />
          <Text size="sm">{aiProgress.completed} of {aiProgress.total} PDF artifacts attempted · {aiProgress.reused} saved reviews reused
            {aiProgress.done && aiProgress.completed < aiProgress.total ? ` · ${aiProgress.total - aiProgress.completed} not attempted` : ''}</Text>
          {aiProgress.currentItem && !aiProgress.done ? <Text size="sm" c="dimmed">Current PDF: {aiProgress.currentItem}</Text> : null}
          <Text size="sm">{aiProgress.savedRefresh?.done ? aiProgress.savedRefresh.available : aiProgress.available}{' '}
            {(aiProgress.savedRefresh?.done ? aiProgress.savedRefresh.available : aiProgress.available) === 1 ? 'review' : 'reviews'} available
            {aiProgress.skippedInaccessible?.length ? ` · ${aiProgress.skippedInaccessible.length} skipped: inaccessible ${aiProgress.skippedInaccessible.length === 1 ? 'PDF' : 'PDFs'}` : ''}
            {aiProgress.savedRefresh ? ` · ${aiProgress.savedRefresh.running} still running · ${aiProgress.savedRefresh.uncertain} unconfirmed attempts · ${aiProgress.savedRefresh.unavailable} unavailable`
              : ` · ${aiProgress.uncertainTargets.length} awaiting retry`}
            {!aiProgress.savedRefresh && aiProgress.failures.length > aiProgress.uncertainTargets.length
              ? ` · ${aiProgress.failures.length - aiProgress.uncertainTargets.length} incomplete` : ''}</Text>
          {(aiProgress.savedRefresh?.advisories ?? aiProgress.advisories) > 0 ? <Text size="sm">
            {aiProgress.savedRefresh?.advisories ?? aiProgress.advisories} completed {(aiProgress.savedRefresh?.advisories ?? aiProgress.advisories) === 1 ? 'review has' : 'reviews have'} items to check in the PDF or review limits. Open the saved review for details.
          </Text> : null}
          {aiProgress.skippedInaccessible?.length ? (
            <Stack gap="xs">
              <Text size="xs" c="dimmed">No Gemini request was started for these PDFs. Check each message for the access or retrieval problem before trying again.</Text>
              <Button variant="default" size="xs" w="fit-content" aria-expanded={skippedAiOpen}
                aria-controls="wt-skipped-inaccessible-pdfs"
                onClick={() => setSkippedAiOpen(open => !open)}>
                {skippedAiOpen ? 'Hide' : 'Show'} skipped inaccessible PDFs ({aiProgress.skippedInaccessible.length})
              </Button>
              <Collapse in={skippedAiOpen}>
                <Stack id="wt-skipped-inaccessible-pdfs" gap="xs" aria-label="Skipped inaccessible PDF submissions">
                  {aiProgress.skippedInaccessible.map(target => {
                    const link = currentSkippedDriveUrl(target, state.attempts);
                    return <Paper key={target.key} withBorder p="xs" radius="sm">
                      <Stack gap={4}>
                        <Text size="sm" fw={650}>{target.label}</Text>
                        <Text size="xs" c="dimmed">{target.error}</Text>
                        <Group gap="xs" wrap="wrap">
                          {link ? <Button component="a" href={link} target="_blank" rel="noopener noreferrer"
                            variant="default" size="xs">Open submitted Drive link</Button>
                            : <Text size="xs" c="dimmed">Original submission link changed or is not a valid Drive URL.</Text>}
                          <Button variant="subtle" size="xs" onClick={() => {
                            setSelectedDeliverableId(target.response?.deliverableId || '');
                            setSelectedResponseId(target.responseId);
                          }}>View response</Button>
                        </Group>
                      </Stack>
                    </Paper>;
                  })}
                </Stack>
              </Collapse>
            </Stack>
          ) : null}
          {aiProgress.savedRefresh && aiProgress.failures.length ? (
            <Stack gap={2}>
              <Text size="xs" fw={700}>Original batch messages (before saved-status check)</Text>
              {[...new Set(aiProgress.failures)].map(message => <Text size="sm" key={message}>{message}</Text>)}
            </Stack>
          ) : !aiProgress.savedRefresh ? [...new Set(aiProgress.failures)]
            .map(message => <Text size="sm" key={message}>{message}</Text>) : null}
          {aiProgress.savedRefresh ? (
            <Stack gap={4}>
              <Group justify="space-between" gap="xs" wrap="wrap">
                <Text size="sm" fw={700}>{aiProgress.savedRefresh.phase}</Text>
                <Text size="sm" fw={700} className="wt-tabular">{progressPercent(aiProgress.savedRefresh.checked, aiProgress.savedRefresh.total)}%</Text>
              </Group>
              <Progress value={progressPercent(aiProgress.savedRefresh.checked, aiProgress.savedRefresh.total)} size="lg"
                striped animated={!aiProgress.savedRefresh.done} aria-label="Saved AI Review status check progress" />
              <Text size="sm">{aiProgress.savedRefresh.checked} of {aiProgress.savedRefresh.total} saved statuses checked · {aiProgress.savedRefresh.updated} response states refreshed
                {aiProgress.savedRefresh.failed ? ` · ${aiProgress.savedRefresh.failed} status checks failed` : ''}
                {aiProgress.savedRefresh.done && aiProgress.savedRefresh.checked < aiProgress.savedRefresh.total
                  ? ` · ${aiProgress.savedRefresh.total - aiProgress.savedRefresh.checked} not checked` : ''}</Text>
              {aiProgress.savedRefresh.currentItem ? <Text size="sm" c="dimmed">Checking saved status: {aiProgress.savedRefresh.currentItem}</Text> : null}
              {[...new Set(aiProgress.savedRefresh.errors)].map(message => <Text size="sm" key={message}>{message}</Text>)}
            </Stack>
          ) : null}
        </Stack>
        {aiProgress.done && aiProgress.authenticationRequired ? <Button variant="default" size="xs" mt="sm"
          onClick={reconnectGoogle}>Continue with Google</Button> : null}
        {aiProgress.done && (aiProgress.paused || aiProgress.savedRefresh) && !aiProgress.authenticationRequired
          ? <Button variant="default" size="xs" mt="sm" disabled={savedRefreshBusy.current || !aiProgress.targets?.length}
            loading={Boolean(aiProgress.savedRefresh && !aiProgress.savedRefresh.done)} onClick={checkSavedReviews}>Check saved reviews</Button> : null}
        {aiProgress.done && !aiProgress.authenticationRequired && aiProgress.uncertainTargets.length ? <Button variant="default" size="xs" mt="sm" onClick={() => requestAiReview(aiProgress.uncertainTargets, true, aiProgress.retryTokens)}>Review retry options</Button> : null}
      </Alert> : null}
      <Collapse in={overviewOpen}><ReviewDeliverablesTable summaries={summaries} selectedId={activeDeliverableId} onSelect={chooseDeliverable} /></Collapse>

      {selectedDeliverable || allDeliverables && summaries.length > 0 ? (
        <Paper withBorder className="wt-review-workbench" radius="md">
          <div className="wt-review-workbench-head">
            <div>
              {selectedDeliverable ? <Text size="xs" fw={750} tt="uppercase" c="wildtrackMaroon.7">{selectedDeliverable.trackerColumn}</Text> : null}
              <Title order={2} size="h3">{allDeliverables ? 'All deliverables' : selectedDeliverable.title}</Title>
              <Text size="sm" c="dimmed">
                {allDeliverables ? <>{scopedResponses.length} responses across {summaries.length} deliverables | {summaries.reduce((total, summary) => total + summary.needsAction, 0)} need action</>
                  : <>{selectedSummary.received} received of {selectedSummary.expected} expected | {selectedSummary.needsAction} need action</>}
              </Text>
            </div>
            <Group gap="xs" className="wt-review-filter-group" role="group" aria-label="Review filter">
              {REVIEW_FILTERS.map((item) => (
                <Button
                  key={item}
                  aria-pressed={filter === item}
                  variant={filter === item ? 'filled' : 'default'}
                  color="wildtrackMaroon"
                  size="sm"
                  onClick={() => setFilter(item)}
                >
                  {item}
                </Button>
              ))}
            </Group>
          </div>

          <div className="wt-review-table-toolbar">
            <TextInput
              aria-label="Search submissions"
              placeholder="Search student, ID, or team"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              leftSection={<MagnifyingGlass size={17} />}
              className="wt-review-search"
            />
            <Group gap="sm" wrap="nowrap" className="wt-review-toolbar-actions">
              {documentCheckEnabled && uncheckedDocumentTargets.length ? (
                <Button
                  variant="default"
                  size="sm"
                  disabled={batchRunning}
                  leftSection={<Files size={17} />}
                  onClick={() => confirmDocumentCheckBatch(uncheckedDocumentTargets, { allUnchecked: true })}
                >
                  Check all unchecked ({uncheckedDocumentTargets.length})
                </Button>
              ) : null}
              <Text size="sm" fw={700} c="dimmed" className="wt-nowrap wt-tabular">
                Showing {firstVisibleIndex}-{lastVisibleIndex} of {sortedResponses.length}
              </Text>
            </Group>
          </div>

          {selectedIds.size ? (
            <div className="wt-review-selection-bar" role="region" aria-label="Selected response actions">
              <Group gap="sm">
                <CheckCircle size={19} aria-hidden="true" />
                <Text fw={750} size="sm">{selectedIds.size} response{selectedIds.size === 1 ? '' : 's'} selected</Text>
              </Group>
              <Group gap="xs">
                <Button variant="default" color="wildtrackMaroon" size="sm" leftSection={<CheckCircle size={17} />}
                  disabled={acceptBusy.current} loading={Boolean(acceptProgress && !acceptProgress.done)} onClick={confirmAcceptSelected}>
                  Accept All Response
                </Button>
                {documentCheckEnabled ? (
                  <>
                    <Button variant="default" size="sm" disabled={batchRunning || !selectedDocumentTargets.length} leftSection={<Files size={17} />} onClick={() => confirmDocumentCheckBatch(selectedDocumentTargets)}>
                      Check selected
                    </Button>
                    <Button variant="default" size="sm" leftSection={<Sparkle size={17} />} onClick={() => requestAiReview(selectedResponses.map((response) => response.id))}>
                      AI review selected
                    </Button>
                  </>
                ) : null}
                <Button variant="subtle" color="gray" size="sm" leftSection={<X size={16} />} onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              </Group>
            </div>
          ) : null}

          {acceptProgress ? (
            <Alert role="status" color={!acceptProgress.done ? 'blue' : acceptProgress.failed || acceptProgress.skipped ? 'orange' : 'green'}
              title={!acceptProgress.done ? 'Accepting selected responses' : acceptProgress.failed || acceptProgress.skipped
                ? 'Selected response acceptance completed with exceptions' : 'Selected responses accepted'}
              withCloseButton={acceptProgress.done} onClose={() => setAcceptProgress(null)}>
              <Text size="sm">{acceptProgress.succeeded} accepted · {acceptProgress.failed} failed · {acceptProgress.skipped} skipped
                {' '}of {acceptProgress.selected} selected ({acceptProgress.eligible} initially eligible).
                {acceptProgress.done ? ' No responses were archived.' : ''}</Text>
              {acceptProgress.failures.map(failure => <Text size="sm" key={failure.id}>
                <strong>{failure.student}:</strong> {failure.message}
              </Text>)}
            </Alert>
          ) : null}

          {batchProgress ? (
            <Alert
              role="status"
              color={!batchProgress.done ? 'blue' : batchProgress.failed ? 'orange' : 'green'}
              variant="light"
              title={batchProgress.done
                ? batchProgress.completed < batchProgress.total ? 'Document checks stopped early' : 'Document checks complete'
                : 'Checking documents'}
              icon={<Files size={19} />}
              withCloseButton={batchProgress.done}
              onClose={() => setBatchProgress(null)}
              className="wt-review-batch-progress"
            >
              <Stack gap="xs">
                <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                  <Text fw={700} size="sm">{batchProgress.phase || 'Checking submitted PDFs'}</Text>
                  <Text fw={700} size="sm" className="wt-tabular">{progressPercent(batchProgress.completed, batchProgress.total)}%</Text>
                </Group>
                <Progress value={progressPercent(batchProgress.completed, batchProgress.total)}
                  color="wildtrackMaroon" size="lg" radius="xl" striped animated={!batchProgress.done}
                  aria-label="Document Check batch progress" />
                <Text size="sm">{batchProgress.completed} of {batchProgress.total} completed
                  {batchProgress.failed ? ` | ${batchProgress.failed} could not be checked` : ''}
                  {batchProgress.done && batchProgress.completed < batchProgress.total
                    ? ` | ${batchProgress.total - batchProgress.completed} not attempted` : ''}
                </Text>
                {!batchProgress.done && batchProgress.sample ? <Text size="sm" c="dimmed">
                  {batchProgress.total === 1 ? 'Current PDF' : 'Batch includes'}: {batchProgress.sample}
                  {batchProgress.total > 1 ? ' (shared-file batching may change processing order; current file is not reported)' : ''}
                </Text> : null}
                {batchProgress.failures?.length ? (
                  <Stack gap={2} className="wt-review-batch-failures">
                    {batchProgress.failures.map((failure) => (
                      <Text key={failure.id} size="xs"><strong>{failure.student}:</strong> {failure.error}</Text>
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            </Alert>
          ) : null}

          <ReviewSubmissionsTable
                  conflictStudentNumbers={conflictStudentNumbers}
            responses={pageResponses}
            state={state}
            deliverable={selectedDeliverable}
            showDeliverable={allDeliverables}
            sort={columnSort}
            onSort={sortColumn}
            selectedResponseId={selectedResponseId}
            selectedIds={selectedIds}
            onOpen={setSelectedResponseId}
            onToggle={toggleSelected}
            onToggleAll={toggleAllVisible}
          />

          {!sortedResponses.length ? (
            <div className="wt-review-empty">
              <Text fw={750}>{filter === 'Pending' ? 'Pending queue is clear' : `No ${filter.toLowerCase()} responses`}</Text>
              <Text size="sm" c="dimmed">Try another filter, search term, or deliverable.</Text>
            </div>
          ) : null}

          {sortedResponses.length > REVIEW_PAGE_SIZE ? (
            <div className="wt-review-pagination">
              <Text size="sm" c="dimmed" className="wt-tabular">Page {activePage} of {pageCount}</Text>
              <Pagination total={pageCount} value={activePage} onChange={setPage} color="wildtrackMaroon" size="sm" withEdges />
            </div>
          ) : null}
        </Paper>
      ) : (
        <Paper withBorder className="wt-review-empty" radius="md">
          <Text fw={750}>No deliverables published</Text>
          <Text size="sm" c="dimmed">Publish a mapped form before reviewing responses.</Text>
        </Paper>
      )}

      <ReviewResponseDrawer
        opened={Boolean(selectedResponse && selectedStudent && selectedResponseDeliverable)}
        detailDialogOpened={Boolean(checkDialogResponse || aiReportDialogReport || aiReportDialogReview?.previousReport)}
        response={selectedResponse}
        student={selectedStudent}
        state={state}
        deliverable={selectedResponseDeliverable}
        checkingFields={checkingIds}
        checkingAiFields={aiRunningKeys}
        checkError={checkError?.targetKey?.startsWith(`${selectedResponse?.id}:`) ? checkError?.message : ''}
        onClose={() => setSelectedResponseId('')}
        onDocumentCheck={(field) => openOrRunDocumentCheck(selectedResponse, field)}
        onRerunDocumentCheck={(field) => openOrRunDocumentCheck(selectedResponse, field, true)}
        onFileHistory={(field) => setCheckDialogTarget({
          responseId: selectedResponse.id,
          fieldId: field.definitionId || field.id,
          initialTab: 'history'
        })}
        onViewAiReview={(field) => setAiReportDialogTarget({
          responseId: selectedResponse.id,
          fieldId: field.definitionId || field.id
        })}
        onAiReview={(field) => {
          const review = artifactAiReview(selectedResponse, field);
          const retry = artifactAiReviewStatus(selectedResponse, field) === 'Retry required' && Boolean(review?.retryToken);
          const target = aiTarget(selectedResponse, field);
          requestAiReview([target], retry, retry ? { [target.key]: review.retryToken } : {}, false,
            !retry && isArtifactAiReviewCurrent(selectedResponse, field), true);
        }}
        onAccept={() => acceptReview(selectedResponse)}
        onRevoke={() => confirmRevoke(selectedResponse)}
        onArchive={() => confirmArchive(selectedResponse)}
      />

      <DocumentCheckDialog
        open={Boolean(checkDialogResponse)}
        response={checkDialogResponse && checkDialogReport ? { ...checkDialogResponse, documentCheck: checkDialogReport, fileCheckStatus: checkDialogReport.status } : checkDialogResponse}
        observedHistory={checkDialogHistory}
        templateFindingsUrl={artifactTemplatePreviewUrl(state.templates, activeWorkspaceId, checkDialogDeliverable, checkDialogField)}
        initialTab={checkDialogTarget?.initialTab || 'result'}
        historyOnly={checkDialogTarget?.initialTab === 'history' && !checkDialogReport}
        historyTarget={activeWorkspaceId && checkDialogResponse?.id && checkDialogFieldKey ? {
          workspaceId: activeWorkspaceId,
          responseId: checkDialogResponse.id,
          fieldId: checkDialogFieldKey
        } : null}
        fileLink={checkDialogField ? checkDialogResponse?.values?.[checkDialogField.id] : ''}
        rechecking={checkDialogField ? checkingIds.has(artifactTargetKey(checkDialogResponse?.id, checkDialogField)) : false}
        error={checkDialogField && checkError?.targetKey === artifactTargetKey(checkDialogResponse?.id, checkDialogField) ? checkError?.message : ''}
        onClose={() => setCheckDialogTarget(null)}
        onRecheck={recheckFromDialog}
      />
      <AiReviewReportDialog
        opened={Boolean(aiReportDialogReport || aiReportDialogReview?.previousReport || aiReportDialogReview?.lastSubstantiveReport)}
        report={aiReportDialogReport}
        review={aiReportDialogReview}
        documentChange={artifactAiReviewChange(aiReportDialogResponse, aiReportDialogField)}
        fileLink={aiReportDialogResponse?.values?.[aiReportDialogField?.id] || ''}
        fieldLabel={aiReportDialogField?.label}
        deliverableTitle={aiReportDialogDeliverable?.title}
        onClose={() => setAiReportDialogTarget(null)}
      />
      </ResourceBoundary>
    </Stack>
  );
}

function savedBatchReviewTargets(batch, state) {
  const seen = new Set();
  return (batch.entries || []).flatMap(entry => {
    if (entry.selected === false && batch.state !== 'READY') return [];
    const response = state.attempts.find(item => item.id === entry.target?.responseId);
    const deliverable = state.deliverables.find(item => item.id === response?.deliverableId);
    const field = reviewableSubmissionFields(deliverable).find(item => entry.target?.fieldId
      ? (item.definitionId || item.id) === entry.target.fieldId
      : !item.definitionId && item.id === 'documentPdf');
    if (!response || !field) return [];
    const sourceUrl = String(response.values?.[field.id] || '').trim();
    const expectedUrl = String(entry.identity?.sourceUrl || entry.preview?.sourceUrl || '').trim();
    if (!sourceUrl || (expectedUrl && sourceUrl !== expectedUrl)) return [];
    const review = artifactAiReview(response, field);
    const sameSource = review?.sourceUrl ? String(review.sourceUrl).trim() === sourceUrl
      : review?.sourceResponseUpdatedAt === (response.updatedAt || response.submittedAt);
    const report = artifactAiReportForDisplay(response, field)
      || (sameSource && (review?.previousReport || review?.lastSubstantiveReport));
    const fieldId = field.definitionId || field.id;
    const key = `${response.id}:${fieldId}`;
    if (!report || seen.has(key)) return [];
    seen.add(key);
    const student = findStudent(state.students, response.studentNumber)?.name || response.studentName || response.studentNumber;
    return [{ responseId: response.id, fieldId, key, sourceUrl, report,
      studentName: student || 'Student', deliverableTitle: deliverable.title, fieldLabel: field.label,
      previous: !isArtifactAiReviewCurrent(response, field),
      generatedAt: review?.report === report ? review.generatedAt : review?.previousReport === report
        ? review.previousGeneratedAt : review?.lastSubstantiveGeneratedAt,
      label: [student, deliverable.title, field.label].filter(Boolean).join(' · ') }];
  });
}

function withoutId(values, id) {
  const next = new Set(values);
  next.delete(id);
  return next;
}

function sameSet(first, second) {
  return first.size === second.size && [...first].every((value) => second.has(value));
}

function artifactTargetKey(responseId, field) {
  return `${responseId}:${field?.definitionId || field?.id || 'legacy'}`;
}

function documentTargetsForResponses(responses, deliverables, { onlyUnchecked = false } = {}) {
  const byId = new Map((deliverables || []).filter(Boolean).map((deliverable) => [deliverable.id, deliverable]));
  return (responses || []).flatMap((response) => {
    if (!response || response.reviewStatus === 'Accepted' || response.archiveStatus === 'Archived') return [];
    const deliverable = byId.get(response.deliverableId);
    return reviewableSubmissionFields(deliverable)
      .filter((field) => String(response.values?.[field.id] || '').trim())
      .filter((field) => !onlyUnchecked || !isArtifactDocumentCheckCurrent(response, field))
      .map((field) => ({ response, field }));
  });
}

function aiTarget(response, field) {
  return {
    key: artifactTargetKey(response.id, field),
    responseId: response.id,
    fieldId: field.definitionId || null,
    response,
    field,
    label: `${response.studentName || response.studentNumber || response.id} — ${field.label}`
  };
}

function aiTargetsForResponses(responses, deliverables) {
  const byId = new Map((deliverables || []).filter(Boolean).map((deliverable) => [deliverable.id, deliverable]));
  return (responses || []).flatMap((response) => {
    if (!response) return [];
    const deliverable = byId.get(response.deliverableId);
    return aiReviewableSubmissionFields(deliverable)
      .filter((field) => String(response.values?.[field.id] || '').trim())
      .map((field) => aiTarget(response, field));
  });
}

function normalizeAiTargets(targetsOrIds, state) {
  const values = targetsOrIds || [];
  if (!values.length) return [];
  if (typeof values[0] !== 'string') return values.filter(Boolean);
  const selected = new Set(values);
  return aiTargetsForResponses(state.attempts.filter((response) => selected.has(response.id)), state.deliverables);
}
