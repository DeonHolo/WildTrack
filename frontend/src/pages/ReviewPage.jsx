import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { DocumentCheckDialog } from '../components/review/DocumentCheckDialog.jsx';
import { ReviewDeliverablesTable } from '../components/review/ReviewDeliverablesTable.jsx';
import { ReviewResponseDrawer } from '../components/review/ReviewResponseDrawer.jsx';
import { ReviewSubmissionsTable } from '../components/review/ReviewSubmissionsTable.jsx';
import { buildDeliverableReviewSummaries, filterReviewResponses, REVIEW_FILTERS } from '../lib/review.js';
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
  const summaries = useMemo(() => buildDeliverableReviewSummaries({
    deliverables: orderedDeliverables,
    attempts: state.attempts,
    expectedStudents: identityStudents
  }), [identityStudents, orderedDeliverables, state.attempts]);

  const [selectedDeliverableId, setSelectedDeliverableId] = useState(orderedDeliverables[0]?.id || '');
  const activeDeliverableId = summaries.some((summary) => summary.deliverable.id === selectedDeliverableId)
    ? selectedDeliverableId
    : summaries[0]?.deliverable.id || '';
  const selectedSummary = summaries.find((summary) => summary.deliverable.id === activeDeliverableId) || null;
  const selectedDeliverable = selectedSummary?.deliverable || null;
  const [filter, setFilter] = useState('Pending');
  const [query, setQuery] = useState('');
  const [selectedResponseId, setSelectedResponseId] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [checkDialogId, setCheckDialogId] = useState('');
  const [batchProgress, setBatchProgress] = useState(null);
  const [page, setPage] = useState(1);
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
    setBatchProgress(null);
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
    if (!isDocumentCheckCurrent(response)) await runDocumentCheck(response.id);
    setCheckDialogId(response.id);
  }

  async function recheckFromDialog() {
    if (checkDialogResponse) await runDocumentCheck(checkDialogResponse.id);
  }

  function confirmDocumentCheckBatch(ids, { allUnchecked = false } = {}) {
    if (!ids.length) return;
    modals.openConfirmModal({
      title: allUnchecked
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
    setBatchProgress({ completed: 0, total: ids.length, failed: 0, done: false });
    const result = await runDocumentChecks(ids, {
      onProgress: ({ completed, total }) => setBatchProgress((current) => ({ ...current, completed, total }))
    });
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

  async function requestAiReview(ids) {
    const result = await runAiReview(ids);
    if (result?.unavailable || result?.ok === false) {
      notifications.show({
        color: 'wildtrackMaroon',
        title: 'AI Review is not connected yet',
        message: 'Document Check remains available while Gemini integration is configured.'
      });
    }
  }

  function acceptResponse(response) {
    markAccepted(response.id, { name: 'Sir Ralph Laviste', role: 'Teacher/Admin', scope: 'Individual response' });
    setSelectedIds((current) => withoutId(current, response.id));
    notifications.show({ color: 'green', title: 'Response accepted', message: 'The response left the Pending queue. You can archive it from the open details.' });
  }

  function confirmRevoke(response) {
    modals.openConfirmModal({
      title: 'Revoke this acceptance?',
      children: <Text size="sm">The response returns to Pending and must be accepted again before it can be archived.</Text>,
      labels: { confirm: 'Revoke acceptance', cancel: 'Keep accepted' },
      confirmProps: { color: 'red' },
      centered: true,
      onConfirm: () => {
        revokeAcceptance(response.id);
        setSelectedResponseId('');
      }
    });
  }

  function confirmArchive(response) {
    modals.openConfirmModal({
      title: 'Archive this accepted response?',
      children: <Text size="sm">WildTrack creates an archive record for this accepted response. The current local archive adapter is used until durable object storage is connected.</Text>,
      labels: { confirm: 'Archive response', cancel: 'Cancel' },
      confirmProps: { color: 'wildtrackMaroon' },
      centered: true,
      onConfirm: async () => {
        const result = await archiveAttempt(response.id);
        notifications.show({
          color: result?.ok ? 'green' : 'red',
          title: result?.ok ? 'Response archived' : 'Archive failed',
          message: result?.ok ? 'The archive record is available in Archive.' : result?.error || 'The response could not be archived.'
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

      <ReviewDeliverablesTable summaries={summaries} selectedId={activeDeliverableId} onSelect={chooseDeliverable} />

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
        onClose={() => setSelectedResponseId('')}
        onDocumentCheck={() => openOrRunDocumentCheck(selectedResponse)}
        onAiReview={() => requestAiReview([selectedResponse.id])}
        onAccept={() => acceptResponse(selectedResponse)}
        onRevoke={() => confirmRevoke(selectedResponse)}
        onArchive={() => confirmArchive(selectedResponse)}
      />

      <DocumentCheckDialog
        open={Boolean(checkDialogResponse)}
        response={checkDialogResponse}
        fileLink={firstSubmissionLink(checkDialogResponse?.values)}
        rechecking={checkDialogResponse?.fileCheckStatus === 'Checking'}
        onClose={() => setCheckDialogId('')}
        onRecheck={recheckFromDialog}
      />
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
