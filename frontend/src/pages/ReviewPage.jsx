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
import { applyAiReview } from '../lib/backendDomain.js';
import { getAiReviewStatus, getIdentityConflicts } from '../lib/api.js';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { useWorkspaceResource } from '../hooks/useWorkspaceResource.js';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope.js';
import { archiveAttempts as archiveServerAttempts } from '../lib/archiveClient.js';
import { DocumentCheckDialog } from '../components/review/DocumentCheckDialog.jsx';
import { ReviewDeliverablesTable } from '../components/review/ReviewDeliverablesTable.jsx';
import { ReviewResponseDrawer } from '../components/review/ReviewResponseDrawer.jsx';
import { ReviewSubmissionsTable } from '../components/review/ReviewSubmissionsTable.jsx';
import { buildDeliverableReviewSummaries, filterReviewResponses, REVIEW_FILTERS } from '../lib/review.js';
import {
  acceptResponse,
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
  deliverableUsesDocumentCheck,
  findStudent,
  firstSubmissionLink,
  getIdentityStudents,
  isDocumentCheckCurrent,
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
  const [checkDialogId, setCheckDialogId] = useState('');
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
    setCheckDialogId('');
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
  const checkDialogResponse = state.attempts.find((response) => response.id === checkDialogId) || null;
  const documentCheckEnabled = deliverableUsesDocumentCheck(selectedDeliverable);
  const uncheckedResponseIds = useMemo(() => documentCheckEnabled
    ? (selectedSummary?.responses || [])
      .filter((response) => (
        response.reviewStatus !== 'Accepted'
        && response.archiveStatus !== 'Archived'
        && !isDocumentCheckCurrent(response)
      ))
      .map((response) => response.id)
    : [], [documentCheckEnabled, selectedSummary]);
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
    setCheckDialogId('');
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

  async function openOrRunDocumentCheck(response) {
    if (!isDocumentCheckCurrent(response)) {
      const result = await runDocumentCheck(response.id);
      if (!result.ok) return;
    }
    if (!isCurrentScope()) return;
    setCheckDialogId(response.id);
  }

  async function recheckFromDialog() {
    if (checkDialogResponse) await runDocumentCheck(checkDialogResponse.id);
  }

  function confirmDocumentCheckBatch(ids, { allUnchecked = false, allDeliverables = false } = {}) {
    if (!ids.length) return;
    modals.openConfirmModal({
      title: allDeliverables ? `Recheck ${ids.length} responses across all deliverables?` : allUnchecked
        ? `Check all ${ids.length} unchecked document${ids.length === 1 ? '' : 's'}?`
        : `Check ${ids.length} selected document${ids.length === 1 ? '' : 's'}?`,
      children: (
        <Text size="sm">
          WildTrack will check every document in this batch and report progress here. One failed file will not stop the remaining checks.
        </Text>
      ),
      labels: { confirm: 'Start Document Check', cancel: 'Cancel' },
      confirmProps: { color: 'wildtrackMaroon' },
      centered: true,
      onConfirm: () => runDocumentCheckBatch(ids)
    });
  }

  async function runDocumentCheckBatch(ids) {
    if (!isCurrentScope()) return;
    const responses = ids.map((id) => state.attempts.find((attempt) => attempt.id === id)).filter(Boolean);
    setBatchProgress({ completed: 0, total: ids.length, failed: 0, done: false });
    const result = await runReviewDocumentChecks(activeWorkspaceId, responses, state.deliverables, {
      shouldContinue: isCurrentScope,
      onProgress: ({ completed, total }) => {
        if (isCurrentScope()) setBatchProgress((current) => ({ ...current, completed, total }));
      }
    });
    if (!isCurrentScope()) return;
    setState((current) => ({
      ...current,
      attempts: current.attempts.map((attempt) => {
        const completed = result.results?.find((item) => item.attemptId === attempt.id && item.ok);
        return completed?.report ? applyDocumentCheck(attempt, completed.report) : attempt;
      })
    }));
    const failures = (result.results || [])
      .filter((item) => !item.ok)
      .map((item) => {
        const response = state.attempts.find((attempt) => attempt.id === item.attemptId);
        const student = response ? findStudent(state.students, response.studentNumber) : null;
        return {
          id: item.attemptId,
          student: student?.name || response?.studentName || response?.studentNumber || 'Unknown response',
          error: item.error || 'Document Check could not finish.'
        };
      });
    setBatchProgress({ completed: result.completed, total: result.total, failed: result.failed, failures, done: true });
  }

  async function requestAiReview(ids, retryAcknowledged = false, retryTokens = {}) {
    if (aiBusy.current || !isCurrentScope()) return;
    const candidates = ids.filter(id => {
      const response = state.attempts.find(attempt => attempt.id === id);
      return response && deliverableUsesDocumentCheck(state.deliverables.find(d => d.id === response.deliverableId));
    });
    if (!candidates.length) { notifications.show({ message: 'No PDF responses selected for AI review.' }); return; }
    try {
      const provider = await getAiReviewStatus();
      if (!isCurrentScope()) return;
      if (!provider.configured) {
        modals.openConfirmModal({ title: 'AI review is not connected', centered: true,
          children: <Text size="sm">{provider.message || 'Gemini is ready to connect. Add its API key to the backend to enable reviews.'} No documents have been sent.</Text>,
          labels: { confirm: 'Understood', cancel: 'Close' } });
        return;
      }
      modals.openConfirmModal({ title: retryAcknowledged ? 'Retry uncertain AI requests?' : `AI review ${candidates.length} responses?`, centered: true,
        children: <Stack gap="sm"><Text size="sm">Identical PDFs from the same team and deliverable reuse one review when the instructions, template and model settings match. New reviews send document contents to the configured AI provider and may incur charges.</Text>
          <Text size="sm">AI findings can be wrong. Review them before making an academic decision.</Text>
          {retryAcknowledged ? <Text size="sm" c="orange">The previous request may already have been billed. Retrying explicitly permits another provider request.</Text> : null}</Stack>,
        labels: { confirm: retryAcknowledged ? 'Retry and allow possible charges' : 'Start AI review', cancel: 'Cancel' },
        onConfirm: () => runAiBatch(candidates, retryAcknowledged, retryTokens) });
    } catch (error) { if (isCurrentScope()) notifications.show({ color: 'red', message: error.message || 'AI review status could not be loaded.' }); }
  }

  async function runAiBatch(ids, retryAcknowledged, retryTokens) {
    if (aiBusy.current || !isCurrentScope()) return;
    aiBusy.current = true;
    let progress = { total: ids.length, completed: 0, reused: 0, failures: [], uncertainIds: [], retryTokens: {}, done: false };
    setAiProgress(progress);
    try {
      await runAiReviews(activeWorkspaceId, ids, { retryAcknowledged, retryTokens, shouldContinue: isCurrentScope,
        onResult: (id, result) => {
          const response = state.attempts.find(attempt => attempt.id === id);
          const deliverable = state.deliverables.find(item => item.id === response?.deliverableId);
          const label = `${deliverable?.title || 'Document'} — ${response?.studentName || response?.studentNumber || id}`;
          if (result.review) setState(current => ({ ...current, attempts: current.attempts.map(response => response.id === id ? applyAiReview(response, result.review) : response) }));
          progress = { ...progress, completed: progress.completed + 1,
            reused: progress.reused + (result.ok && result.review?.reused ? 1 : 0),
            failures: result.ok ? progress.failures : [...progress.failures, `${label}: ${result.error}`],
            uncertainIds: result.uncertain ? [...progress.uncertainIds, id] : progress.uncertainIds,
            retryTokens: result.uncertain ? { ...progress.retryTokens, [id]: result.review.retryToken } : progress.retryTokens };
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
      children: <Text size="sm">The response returns to Pending and must be accepted again before it can be archived.</Text>,
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

  async function runDocumentCheck(attemptId) {
    if (!isCurrentScope() || checkingIds.has(attemptId)) return { ok: false };
    const response = state.attempts.find((attempt) => attempt.id === attemptId);
    if (!response) return { ok: false, error: 'The selected response was not found.' };
    const deliverable = state.deliverables.find((item) => item.id === response.deliverableId);
    setCheckingIds((current) => new Set([...current, attemptId]));
    setCheckError(null);
    let result;
    try {
      result = await runReviewDocumentCheck(activeWorkspaceId, response, deliverable);
    } catch (error) {
      result = { ok: false, error: error?.message || 'Document Check could not finish.' };
    }
    if (!isCurrentScope()) return { ok: false };
    setCheckingIds((current) => withoutId(current, attemptId));
    if (result.ok) {
      setState((current) => ({
        ...current,
        attempts: current.attempts.map((attempt) => attempt.id === attemptId ? applyDocumentCheck(attempt, result.report) : attempt)
      }));
    } else {
      setCheckError({ attemptId, message: result.error || 'Document Check could not finish. Please try again.' });
    }
    return result;
  }

  function confirmArchive(response) {
    modals.openConfirmModal({
      title: 'Archive this accepted response?',
      children: <Text size="sm">WildTrack creates one archive metadata record and keeps the submitted Drive link as its source reference. Independent PDF storage is not connected yet.</Text>,
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
        <Group gap="xs"><Button variant="default" disabled={batchRunning || !state.attempts.some(response => deliverableUsesDocumentCheck(state.deliverables.find(d => d.id === response.deliverableId)) && firstSubmissionLink(response.values))}
          onClick={() => confirmDocumentCheckBatch(state.attempts.filter(response => deliverableUsesDocumentCheck(state.deliverables.find(d => d.id === response.deliverableId)) && firstSubmissionLink(response.values)).map(response => response.id), { allDeliverables: true })}>Recheck all documents</Button>
          <Button variant="default" leftSection={<Sparkle size={16} />} disabled={Boolean(aiProgress && !aiProgress.done)} onClick={() => requestAiReview(state.attempts.map(response => response.id))}>AI review all</Button>
          <Button variant="subtle" onClick={() => setOverviewOpen(value => !value)} aria-expanded={overviewOpen}>{overviewOpen ? 'Hide overview' : 'Deliverable overview'}</Button></Group>
      </Group></Paper>
      {aiProgress ? <Alert color={aiProgress.failures.length ? 'orange' : 'blue'} title={aiProgress.done ? (aiProgress.completed < aiProgress.total ? 'AI review batch paused' : 'AI review batch finished') : 'Reviewing documents'}
        withCloseButton={aiProgress.done} onClose={() => setAiProgress(null)}>
        <Text size="sm">{aiProgress.completed} of {aiProgress.total} processed; {aiProgress.reused} saved reviews reused.</Text>
        {[...new Set(aiProgress.failures)].map(message => <Text size="sm" key={message}>{message}</Text>)}
        {aiProgress.done && aiProgress.uncertainIds.length ? <Button variant="default" size="xs" mt="sm" onClick={() => requestAiReview(aiProgress.uncertainIds, true, aiProgress.retryTokens)}>Review retry options</Button> : null}
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
              {documentCheckEnabled && uncheckedResponseIds.length ? (
                <Button
                  variant="default"
                  size="sm"
                  disabled={batchRunning}
                  leftSection={<Files size={17} />}
                  onClick={() => confirmDocumentCheckBatch(uncheckedResponseIds, { allUnchecked: true })}
                >
                  Check all unchecked ({uncheckedResponseIds.length})
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
                    <Button variant="default" size="sm" disabled={batchRunning} leftSection={<Files size={17} />} onClick={() => confirmDocumentCheckBatch([...selectedIds])}>
                      Check selected
                    </Button>
                    <Button variant="default" size="sm" leftSection={<Sparkle size={17} />} onClick={() => requestAiReview([...selectedIds])}>
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
        documentCheckEnabled={documentCheckEnabled}
        checking={checkingIds.has(selectedResponse?.id)}
        checkError={checkError?.attemptId === selectedResponse?.id ? checkError?.message : ''}
        onClose={() => setSelectedResponseId('')}
        onDocumentCheck={() => openOrRunDocumentCheck(selectedResponse)}
        onAiReview={() => requestAiReview([selectedResponse.id])}
        onAccept={() => acceptReview(selectedResponse)}
        onRevoke={() => confirmRevoke(selectedResponse)}
        onArchive={() => confirmArchive(selectedResponse)}
      />

      <DocumentCheckDialog
        open={Boolean(checkDialogResponse)}
        response={checkDialogResponse}
        fileLink={firstSubmissionLink(checkDialogResponse?.values)}
        rechecking={checkingIds.has(checkDialogResponse?.id) || checkDialogResponse?.fileCheckStatus === 'Checking'}
        error={checkError?.attemptId === checkDialogResponse?.id ? checkError?.message : ''}
        onClose={() => setCheckDialogId('')}
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
