import { ResourceBoundary } from '../components/ResourceBoundary.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Select,
  Collapse,
  Button,
  Group,
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
import { getAiReviewStatus, getIdentityConflicts } from '../lib/api.js';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { useWorkspaceResource } from '../hooks/useWorkspaceResource.js';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope.js';
import { archiveAttempts as archiveServerAttempts } from '../lib/archiveClient.js';
import { DocumentCheckDialog } from '../components/review/DocumentCheckDialog.jsx';
import { AiReviewDialog } from '../components/review/AiReviewDialog.jsx';
import { ReviewDeliverablesTable } from '../components/review/ReviewDeliverablesTable.jsx';
import { ReviewResponseDrawer } from '../components/review/ReviewResponseDrawer.jsx';
import { ReviewSubmissionsTable } from '../components/review/ReviewSubmissionsTable.jsx';
import { buildDeliverableReviewSummaries, filterReviewResponses, REVIEW_FILTERS } from '../lib/review.js';
import {
  acceptResponse,
  applyArtifactAiReview,
  applyDocumentCheck,
  applyReviewMutation,
  emptyReviewDesk,
  loadReviewDesk,
  revokeAcceptance,
  runAiReviews,
  runDocumentCheck as runReviewDocumentCheck,
  runDocumentChecks as runReviewDocumentChecks
} from '../lib/reviewDeskClient.js';
import {
  aiReviewableSubmissionFields,
  artifactAiReview,
  artifactAiReviewStatus,
  deliverableUsesDocumentCheck,
  findStudent,
  getIdentityStudents,
  isArtifactDocumentCheckCurrent,
  reviewableSubmissionFields,
  sortDeliverables
} from '../lib/workflow.js';

const REVIEW_PAGE_SIZE = 50;

export function ReviewPage() {
  const { activeWorkspaceId } = useWorkspaceSession();
  const isCurrentScope = useWorkspaceScope(activeWorkspaceId);
  const { data: state, setData: setState, status: reviewStatus, error: reviewError, reload } = useWorkspaceResource(
    activeWorkspaceId,
    loadReviewDesk,
    emptyReviewDesk, 'monitoring');
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
    orderedDeliverables.some((deliverable) => deliverable.id === linkedDeliverableId)
      ? linkedDeliverableId
      : ''
  ));
  const activeDeliverableId = summaries.some((summary) => summary.deliverable.id === selectedDeliverableId)
    ? selectedDeliverableId
    : (summaries.find(summary => summary.needsAction > 0 || summary.unchecked > 0) || summaries.find(summary => summary.received > 0) || summaries[0])?.deliverable.id || '';
  useEffect(() => {
    if (!selectedDeliverableId && activeDeliverableId) setSelectedDeliverableId(activeDeliverableId);
  }, [selectedDeliverableId, activeDeliverableId]);
  const selectedSummary = summaries.find((summary) => summary.deliverable.id === activeDeliverableId) || null;
  const selectedDeliverable = selectedSummary?.deliverable || null;
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [filter, setFilter] = useState('Pending');
  const [query, setQuery] = useState('');
  const [selectedResponseId, setSelectedResponseId] = useState(linkedResponse?.id || '');
  const [conflictStudentNumbers, setConflictStudentNumbers] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [checkDialogTarget, setCheckDialogTarget] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const [aiProgress, setAiProgress] = useState(null);
  const aiBusy = useRef(false);
  const [checkingIds, setCheckingIds] = useState(new Set());
  const [checkError, setCheckError] = useState(null);
  const [page, setPage] = useState(1);
  useEffect(() => {
    setAiProgress(null); aiBusy.current = false;
    setSelectedDeliverableId(linkedDeliverableId || '');
    setBatchProgress(null);
    setCheckingIds(new Set());
    setCheckError(null);
    setCheckDialogTarget(null);
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

  const visibleResponses = useMemo(() => filterReviewResponses({
    responses: selectedSummary?.responses || [],
    students: state.students,
    deliverable: selectedDeliverable,
    filter,
    query
  }), [filter, query, selectedDeliverable, selectedSummary, state.students]);
  const selectedResponse = state.attempts.find((response) => response.id === selectedResponseId) || null;
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
  const documentCheckEnabled = deliverableUsesDocumentCheck(selectedDeliverable);
  const uncheckedDocumentTargets = useMemo(() => documentCheckEnabled
    ? documentTargetsForResponses(selectedSummary?.responses || [], [selectedDeliverable], { onlyUnchecked: true })
    : [], [documentCheckEnabled, selectedDeliverable, selectedSummary]);
  const pageCount = Math.max(1, Math.ceil(visibleResponses.length / REVIEW_PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const pageResponses = visibleResponses.slice((activePage - 1) * REVIEW_PAGE_SIZE, activePage * REVIEW_PAGE_SIZE);
  const firstVisibleIndex = visibleResponses.length ? (activePage - 1) * REVIEW_PAGE_SIZE + 1 : 0;
  const lastVisibleIndex = Math.min(activePage * REVIEW_PAGE_SIZE, visibleResponses.length);

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
  }, [activeDeliverableId, filter, query]);

  function chooseDeliverable(id) {
    setSelectedDeliverableId(id);
    setSelectedResponseId('');
    setSelectedIds(new Set());
    setCheckDialogTarget(null);
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

  async function openOrRunDocumentCheck(response, field) {
    if (!isArtifactDocumentCheckCurrent(response, field)) {
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
    setBatchProgress({ completed: 0, total: targets.length, failed: 0, done: false });
    const result = await runReviewDocumentChecks(activeWorkspaceId, targets, state.deliverables, {
      shouldContinue: isCurrentScope,
      onProgress: ({ completed, total }) => {
        if (isCurrentScope()) setBatchProgress((current) => ({ ...current, completed, total }));
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
    setBatchProgress({ completed: result.completed, total: result.total, failed: result.failed, failures, done: true });
  }

  async function requestAiReview(targetsOrIds, retryAcknowledged = false, retryTokens = {}, excludeArchived = false) {
    if (aiBusy.current || !isCurrentScope()) return;
    const candidates = normalizeAiTargets(targetsOrIds, state)
      .filter((target) => isArtifactDocumentCheckCurrent(target.response, target.field));
    if (!candidates.length) {
      notifications.show({ message: 'No selected PDF artifacts have a current Document Check and AI Review enabled.' });
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
      const modalId = modals.open({ title: retryAcknowledged ? 'Retry AI reviews?' : 'AI review submissions', centered: true,
        children: <AiReviewDialog targets={candidates}
          excludeArchived={excludeArchived} retry={retryAcknowledged} retryTokens={effectiveRetryTokens}
          onCancel={() => modals.close(modalId)}
          onConfirm={selected => {
            const selectedRetryTokens = Object.fromEntries(selected
              .filter(target => effectiveRetryTokens[target.key])
              .map(target => [target.key, effectiveRetryTokens[target.key]]));
            modals.close(modalId);
            runAiBatch(selected, selectedRetryTokens);
          }} /> });
    } catch (error) { if (isCurrentScope()) notifications.show({ color: 'red', message: error.message || 'AI review status could not be loaded.' }); }
  }

  async function runAiBatch(targets, retryTokens = {}) {
    if (aiBusy.current || !isCurrentScope()) return;
    aiBusy.current = true;
    let progress = { total: targets.length, completed: 0, available: 0, reused: 0, failures: [], uncertainTargets: [], retryTokens: {}, done: false };
    setAiProgress(progress);
    try {
      await runAiReviews(activeWorkspaceId, targets.map(({ key, responseId, fieldId }) => ({ key, responseId, fieldId })), { retryTokens, shouldContinue: isCurrentScope,
        onResult: (targetRef, result) => {
          const target = targets.find((item) => item.responseId === targetRef.responseId && item.fieldId === targetRef.fieldId);
          const response = state.attempts.find(attempt => attempt.id === targetRef.responseId);
          const deliverable = state.deliverables.find(item => item.id === response?.deliverableId);
          const label = `${deliverable?.title || 'Document'} / ${target?.field?.label || 'PDF'} — ${response?.studentName || response?.studentNumber || targetRef.responseId}`;
          if (result.review) setState(current => ({ ...current, attempts: current.attempts.map(item => item.id === targetRef.responseId ? applyArtifactAiReview(item, result.review) : item) }));
          const targetKey = target?.key || `${targetRef.responseId}:${targetRef.fieldId || 'legacy'}`;
          progress = { ...progress, completed: progress.completed + 1,
            available: progress.available + (result.ok ? 1 : 0),
            reused: progress.reused + (result.ok && result.review?.reused ? 1 : 0),
            failures: result.ok ? progress.failures : [...progress.failures, `${label}: ${result.error}`],
            uncertainTargets: result.uncertain ? [...progress.uncertainTargets, target] : progress.uncertainTargets,
            retryTokens: result.uncertain ? { ...progress.retryTokens, [targetKey]: result.review.retryToken } : progress.retryTokens };
          setAiProgress(progress);
        }
      });
    } finally {
      if (isCurrentScope()) { aiBusy.current = false; setAiProgress({ ...progress, done: true }); }
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
      children: <Text size="sm">The response returns to Pending. Any existing archive record remains as an immutable historical snapshot, but it will no longer count as the current archived response unless this response is accepted again.</Text>,
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
      children: <Text size="sm">WildTrack creates one archive metadata record and snapshots the submitted artifact references. Independent PDF storage is not connected yet.</Text>,
      labels: { confirm: 'Archive response', cancel: 'Cancel' },
      confirmProps: { color: 'wildtrackMaroon' },
      centered: true,
      onConfirm: async () => {
        if (!isCurrentScope()) return;
        let result;
        try {
          result = await archiveServerAttempts(activeWorkspaceId, [response.id]);
          if (!isCurrentScope()) return;
          setState((current) => ({
            ...current,
            attempts: current.attempts.map((attempt) => attempt.id === response.id ? { ...attempt, archiveStatus: 'Archived' } : attempt)
          }));
        } catch (error) {
          result = { ok: false, error: error?.message || 'The archive record could not be created.' };
        }
        if (!isCurrentScope()) return;
        notifications.show({
          color: result?.ok ? 'green' : 'red',
          title: result?.ok ? 'Archive record created' : 'Archive failed',
          message: result?.ok ? 'The metadata record is now available in Final archive.' : result?.error || 'The archive record could not be created.'
        });
      }
    });
  }

  const allDocumentTargets = documentTargetsForResponses(state.attempts, state.deliverables);
  const selectedResponses = state.attempts.filter((response) => selectedIds.has(response.id));
  const selectedDocumentTargets = documentTargetsForResponses(selectedResponses, state.deliverables);
  const allAiTargets = aiTargetsForResponses(state.attempts, state.deliverables);

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
          style={{ flex: '1 1 280px', maxWidth: 520 }} data={summaries.map(summary => ({ value: summary.deliverable.id,
            label: (summary.deliverable.shortTitle || summary.deliverable.title) + ' · ' + summary.received + ' received · ' + summary.needsAction + ' need action' }))} />
        <Group gap="xs"><Button variant="default" disabled={batchRunning || !allDocumentTargets.length}
          onClick={() => confirmDocumentCheckBatch(allDocumentTargets, { allDeliverables: true })}>Recheck all documents</Button>
          <Button variant="default" leftSection={<Sparkle size={16} />} disabled={Boolean(aiProgress && !aiProgress.done) || !allAiTargets.length} onClick={() => requestAiReview(allAiTargets, false, {}, true)}>AI review all</Button>
          <Button variant="subtle" onClick={() => setOverviewOpen(value => !value)} aria-expanded={overviewOpen}>{overviewOpen ? 'Hide overview' : 'Deliverable overview'}</Button></Group>
      </Group></Paper>
      {aiProgress ? <Alert color={aiProgress.failures.length ? 'orange' : 'blue'} title={aiProgress.done ? (aiProgress.completed < aiProgress.total ? 'AI review paused' : aiProgress.failures.length ? 'AI review needs attention' : 'AI review complete') : 'Reviewing documents'}
        withCloseButton={aiProgress.done} onClose={() => setAiProgress(null)}>
        <Text size="sm">{aiProgress.available} {aiProgress.available === 1 ? 'review' : 'reviews'} available · {aiProgress.uncertainTargets.length} awaiting retry
          {aiProgress.failures.length > aiProgress.uncertainTargets.length ? ` · ${aiProgress.failures.length - aiProgress.uncertainTargets.length} incomplete` : ''}</Text>
        <Text size="xs" c="dimmed">{aiProgress.completed} of {aiProgress.total} PDF artifacts checked · {aiProgress.reused} saved reviews reused
          {aiProgress.done && aiProgress.completed < aiProgress.total ? ` · ${aiProgress.total - aiProgress.completed} not processed` : ''}</Text>
        {[...new Set(aiProgress.failures)].map(message => <Text size="sm" key={message}>{message}</Text>)}
        {aiProgress.done && aiProgress.uncertainTargets.length ? <Button variant="default" size="xs" mt="sm" onClick={() => requestAiReview(aiProgress.uncertainTargets, true, aiProgress.retryTokens)}>Review retry options</Button> : null}
      </Alert> : null}
      <Collapse in={overviewOpen}><ReviewDeliverablesTable summaries={summaries} selectedId={activeDeliverableId} onSelect={chooseDeliverable} /></Collapse>

      {selectedDeliverable ? (
        <Paper withBorder className="wt-review-workbench" radius="md">
          <div className="wt-review-workbench-head">
            <div>
              <Text size="xs" fw={750} tt="uppercase" c="wildtrackMaroon.7">{selectedDeliverable.trackerColumn}</Text>
              <Title order={2} size="h3">{selectedDeliverable.title}</Title>
              <Text size="sm" c="dimmed">
                {selectedSummary.received} received of {selectedSummary.expected} expected | {selectedSummary.needsAction} need action
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
                Showing {firstVisibleIndex}-{lastVisibleIndex} of {visibleResponses.length}
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

          {batchProgress ? (
            <Alert
              role="status"
              color={!batchProgress.done ? 'blue' : batchProgress.failed ? 'orange' : 'green'}
              variant="light"
              title={batchProgress.done ? 'Document checks complete' : 'Checking documents'}
              icon={<Files size={19} />}
              withCloseButton={batchProgress.done}
              onClose={() => setBatchProgress(null)}
              className="wt-review-batch-progress"
            >
              <Stack gap="xs">
                <Text size="sm">
                  {batchProgress.completed} of {batchProgress.total} completed
                  {batchProgress.failed ? ` | ${batchProgress.failed} could not be checked` : ''}
                </Text>
                {batchProgress.failures?.length ? (
                  <Stack gap={2} className="wt-review-batch-failures">
                    {batchProgress.failures.map((failure) => (
                      <Text key={failure.id} size="xs"><strong>{failure.student}:</strong> {failure.error}</Text>
                    ))}
                  </Stack>
                ) : null}
                <Progress value={(batchProgress.completed / Math.max(batchProgress.total, 1)) * 100} color="wildtrackMaroon" size="sm" />
              </Stack>
            </Alert>
          ) : null}

          <ReviewSubmissionsTable
                  conflictStudentNumbers={conflictStudentNumbers}
            responses={pageResponses}
            state={state}
            deliverable={selectedDeliverable}
            documentCheckEnabled={documentCheckEnabled}
            selectedResponseId={selectedResponseId}
            selectedIds={selectedIds}
            onOpen={setSelectedResponseId}
            onToggle={toggleSelected}
            onToggleAll={toggleAllVisible}
          />

          {!visibleResponses.length ? (
            <div className="wt-review-empty">
              <Text fw={750}>{filter === 'Pending' ? 'Pending queue is clear' : `No ${filter.toLowerCase()} responses`}</Text>
              <Text size="sm" c="dimmed">Try another filter, search term, or deliverable.</Text>
            </div>
          ) : null}

          {visibleResponses.length > REVIEW_PAGE_SIZE ? (
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
        opened={Boolean(selectedResponse && selectedStudent)}
        response={selectedResponse}
        student={selectedStudent}
        state={state}
        deliverable={selectedDeliverable}
        checkingFields={checkingIds}
        checkError={checkError?.targetKey?.startsWith(`${selectedResponse?.id}:`) ? checkError?.message : ''}
        onClose={() => setSelectedResponseId('')}
        onDocumentCheck={(field) => openOrRunDocumentCheck(selectedResponse, field)}
        onAiReview={(field) => {
          const review = artifactAiReview(selectedResponse, field);
          const retry = artifactAiReviewStatus(selectedResponse, field) === 'Retry required' && Boolean(review?.retryToken);
          const target = aiTarget(selectedResponse, field);
          requestAiReview([target], retry, retry ? { [target.key]: review.retryToken } : {});
        }}
        onAccept={() => acceptReview(selectedResponse)}
        onRevoke={() => confirmRevoke(selectedResponse)}
        onArchive={() => confirmArchive(selectedResponse)}
      />

      <DocumentCheckDialog
        open={Boolean(checkDialogResponse)}
        response={checkDialogResponse && checkDialogReport ? { ...checkDialogResponse, documentCheck: checkDialogReport, fileCheckStatus: checkDialogReport.status } : checkDialogResponse}
        fileLink={checkDialogField ? checkDialogResponse?.values?.[checkDialogField.id] : ''}
        rechecking={checkDialogField ? checkingIds.has(artifactTargetKey(checkDialogResponse?.id, checkDialogField)) : false}
        error={checkDialogField && checkError?.targetKey === artifactTargetKey(checkDialogResponse?.id, checkDialogField) ? checkError?.message : ''}
        onClose={() => setCheckDialogTarget(null)}
        onRecheck={recheckFromDialog}
      />
      </ResourceBoundary>
    </Stack>
  );
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
