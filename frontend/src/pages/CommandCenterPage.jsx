import { StudentAccountManagement } from '../components/command/StudentAccountManagement.jsx';
import { ResourceBoundary } from '../components/ResourceBoundary.jsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { CheckCircle, Files, MagnifyingGlass, Warning } from '@phosphor-icons/react';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { WorkQueueTable } from '../components/command/WorkQueueTable.jsx';
import { useWorkspaceResource } from '../hooks/useWorkspaceResource.js';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope.js';
import { archiveAttempts as archiveServerAttempts } from '../lib/archiveClient.js';
import { dismissWorkTask, getAiReviewStatus, getFileMonitorEvents, getIdentityConflicts,
  getWorkTaskDismissals, restoreWorkTask } from '../lib/api.js';
import { DocumentCheckDialog } from '../components/review/DocumentCheckDialog.jsx';
import { AiReviewDialog } from '../components/review/AiReviewDialog.jsx';
import { AiReviewReportDialog } from '../components/review/AiReviewReportDialog.jsx';
import { ReviewResponseDrawer } from '../components/review/ReviewResponseDrawer.jsx';
import { emptyMonitoringState, loadMonitoringState } from '../lib/monitoringClient.js';
import {
  applyDocumentCheck,
  applyArtifactAiReview,
  applyReviewMutation,
  acceptResponse,
  revokeAcceptance,
  runAiReview,
  runDocumentCheck as runReviewDocumentCheck,
  runDocumentChecks as runReviewDocumentChecks
} from '../lib/reviewDeskClient.js';
import {
  artifactDocumentCheckStatus,
  artifactAiReview,
  artifactAiReviewStatus,
  isArtifactAiReviewCurrent,
  deliverableUsesDocumentCheck,
  findStudent,
  getDeliverable,
  isArtifactDocumentCheckCurrent,
  reviewableSubmissionFields
} from '../lib/workflow.js';

const PAGE_SIZE = 50;
const QUEUE_FILTERS = [
  { value: 'all', label: 'All work' },
  { value: 'document', label: 'Document Check' },
  { value: 'review', label: 'Review' },
  { value: 'identity', label: 'Identity' },
  { value: 'workspace', label: 'Workspace' },
  { value: 'archive', label: 'Archive' }
];

function emptyWorkQueue() { return { ...emptyMonitoringState(), openConflicts: [], fileEvents: [], dismissedKeys: [] }; }
async function loadWorkQueue(workspaceId) {
  const [monitoring, conflicts, fileEvents, dismissedKeys] = await Promise.all([
    loadMonitoringState(workspaceId), getIdentityConflicts(workspaceId),
    getFileMonitorEvents(workspaceId), getWorkTaskDismissals(workspaceId)
  ]);
  return { ...monitoring, openConflicts: (conflicts || []).filter(item => item.status === 'OPEN'),
    fileEvents: fileEvents || [], dismissedKeys: dismissedKeys || [] };
}

export function CommandCenterPage() {
  const { activeWorkspaceId } = useWorkspaceSession();
  const { data: state, setData: setState, status, error, reload } = useWorkspaceResource(
    activeWorkspaceId,
    loadWorkQueue,
    emptyWorkQueue, 'work-queue');
  const [accountManagementOpen, setAccountManagementOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [taskTab, setTaskTab] = useState('open');
  const [dismissedKeys, setDismissedKeys] = useState(null);
  const [selectedResponseId, setSelectedResponseId] = useState('');
  const [checkDialogTarget, setCheckDialogTarget] = useState(null);
  const [aiDialogTarget, setAiDialogTarget] = useState(null);
  const [aiRunning, setAiRunning] = useState(new Set());
  const [checkError, setCheckError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [runningIds, setRunningIds] = useState(new Set());
  const [bulkDismissProgress, setBulkDismissProgress] = useState(null);
  const [resolvedTaskIds, setResolvedTaskIds] = useState(new Set());
  const [batchProgress, setBatchProgress] = useState(null);
  const openConflicts = state.openConflicts || [];
  // The active workspace is session state, while monitoring data stays resource-scoped.
  const workspaceId = activeWorkspaceId;
  const isCurrentScope = useWorkspaceScope(workspaceId);

  useEffect(() => {
    setAccountManagementOpen(false);
    setRunningIds(new Set());
    setBulkDismissProgress(null);
    setResolvedTaskIds(new Set());
    setBatchProgress(null);
    setDismissedKeys(null);
    setTaskTab('open');
    setSelectedResponseId('');
    setCheckDialogTarget(null);
    setAiDialogTarget(null);
    setAiRunning(new Set());
    setCheckError('');
  }, [isCurrentScope]);

  const dismissed = useMemo(() => new Set(dismissedKeys ?? state.dismissedKeys ?? []),
    [dismissedKeys, state.dismissedKeys]);
  const allTasks = useMemo(() => buildWorkQueue(state, openConflicts, dismissed),
    [state, openConflicts, dismissed]);
  const openTasks = useMemo(
    () => allTasks.filter((task) => !resolvedTaskIds.has(task.id) && !dismissed.has(task.id)),
    [allTasks, resolvedTaskIds, dismissed]
  );
  const dismissedTasks = allTasks.filter((task) => dismissed.has(task.id));
  const displayedTasks = taskTab === 'dismissed' ? dismissedTasks : openTasks;
  // A bulk action applies to the selected *section*, not just the current search
  // result or first page. All work intentionally covers every category.
  const sectionTasks = displayedTasks.filter(task => filter === 'all' || task.category === filter);
  const visibleTasks = useMemo(
    () => displayedTasks
      .filter((task) => filter === 'all' || task.category === filter)
      .filter((task) => taskMatchesQuery(task, query)),
    [filter, displayedTasks, query]
  );
  const counts = useMemo(
    () => QUEUE_FILTERS.reduce((result, item) => ({
      ...result,
      [item.value]: openTasks.filter((task) => item.value === 'all' || task.category === item.value).length
    }), {}),
    [openTasks]
  );
  const pendingDocumentTasks = useMemo(
    () => openTasks.filter((task) => task.action === 'check'),
    [openTasks]
  );
  const pageCount = Math.max(1, Math.ceil(visibleTasks.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const pageTasks = visibleTasks.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const firstRow = visibleTasks.length ? (activePage - 1) * PAGE_SIZE + 1 : 0;
  const lastRow = Math.min(activePage * PAGE_SIZE, visibleTasks.length);
  const batchRunning = Boolean(batchProgress && !batchProgress.done);
  const selectedResponse = state.attempts.find(item => item.id === selectedResponseId) || null;
  const selectedDeliverable = state.deliverables.find(item => item.id === selectedResponse?.deliverableId) || null;
  const selectedStudent = selectedResponse ? findStudent(state.students, selectedResponse.studentNumber) || {
    name: selectedResponse.studentName || selectedResponse.studentNumber || 'Unmatched student',
    studentNumber: selectedResponse.studentNumber, teamCode: selectedResponse.teamCode
  } : null;
  const checkResponse = state.attempts.find(item => item.id === checkDialogTarget?.responseId) || null;
  const checkDeliverable = state.deliverables.find(item => item.id === checkResponse?.deliverableId);
  const checkField = checkDeliverable?.fields?.find(field => (field.definitionId || field.id) === checkDialogTarget?.fieldId);
  const checkFieldId = checkField?.definitionId || checkField?.id || '';
  const checkReport = checkField ? checkResponse?.artifactChecks?.[checkFieldId]
    || (!checkField.definitionId ? checkResponse?.documentCheck : null) : null;
  const aiResponse = state.attempts.find(item => item.id === aiDialogTarget?.responseId) || null;
  const aiField = state.deliverables.find(item => item.id === aiResponse?.deliverableId)?.fields?.find(field =>
    (field.definitionId || field.id) === aiDialogTarget?.fieldId);
  const aiReview = aiField ? artifactAiReview(aiResponse, aiField) : null;
  const aiReport = aiField && isArtifactAiReviewCurrent(aiResponse, aiField) ? aiReview?.report : null;

  function chooseFilter(value) {
    setFilter(value);
    setPage(1);
  }

  async function changeDismissal(task, shouldDismiss) {
    if (!isCurrentScope() || bulkDismissProgress) return;
    setRunningIds(current => withId(current, task.id));
    try {
      if (shouldDismiss) await dismissWorkTask(workspaceId, task.id);
      else await restoreWorkTask(workspaceId, task.id);
      if (!isCurrentScope()) return;
      setDismissedKeys(current => {
        const next = new Set(current ?? state.dismissedKeys ?? []);
        if (shouldDismiss) next.add(task.id);
        else next.delete(task.id);
        return [...next];
      });
    } catch (error) {
      if (isCurrentScope()) notifications.show({ color: 'red', title: shouldDismiss ? 'Dismiss failed' : 'Restore failed',
        message: error?.message || 'The notification could not be updated.' });
    } finally {
      if (isCurrentScope()) setRunningIds(current => withoutId(current, task.id));
    }
  }

  async function changeSectionDismissal() {
    if (!isCurrentScope() || bulkDismissProgress || !sectionTasks.length) return;
    const shouldDismiss = taskTab === 'open';
    const targets = [...sectionTasks];
    const selectedWorkspace = workspaceId;
    const selectedSection = filter;
    setBulkDismissProgress({ done: 0, total: targets.length, failed: 0, shouldDismiss });
    let failed = 0;
    for (let offset = 0; offset < targets.length; offset += 8) {
      if (!isCurrentScope()) return;
      const batch = targets.slice(offset, offset + 8);
      setRunningIds(current => new Set([...current, ...batch.map(task => task.id)]));
      const results = await Promise.allSettled(batch.map(task => shouldDismiss
        ? dismissWorkTask(selectedWorkspace, task.id) : restoreWorkTask(selectedWorkspace, task.id)));
      if (!isCurrentScope()) return;
      setDismissedKeys(current => {
        const next = new Set(current ?? state.dismissedKeys ?? []);
        results.forEach((result, index) => {
          if (result.status !== 'fulfilled') return;
          if (shouldDismiss) next.add(batch[index].id);
          else next.delete(batch[index].id);
        });
        return [...next];
      });
      failed += results.filter(result => result.status !== 'fulfilled').length;
      setBulkDismissProgress({ done: Math.min(offset + batch.length, targets.length),
        total: targets.length, failed, shouldDismiss });
      setRunningIds(current => {
        const next = new Set(current);
        batch.forEach(task => next.delete(task.id));
        return next;
      });
    }
    if (isCurrentScope()) {
      setBulkDismissProgress(null);
      notifications.show({ color: failed ? 'orange' : 'green',
        title: `${shouldDismiss ? 'Dismiss' : 'Restore'} ${selectedSection === 'all' ? 'all work' : selectedSection} complete`,
        message: failed ? `${targets.length - failed} updated; ${failed} failed. Retry the remaining items.`
          : `${targets.length} notification${targets.length === 1 ? '' : 's'} updated.` });
    }
  }

  function openResponse(task) {
    if (task.response) setSelectedResponseId(task.response.id);
  }

  async function openOrCheckSelected(field) {
    if (!selectedResponse || !field) return;
    if (!isArtifactDocumentCheckCurrent(selectedResponse, field)) {
      setCheckError('');
      const result = await runDocumentCheck(selectedResponse.id, [field]);
      if (!isCurrentScope()) return;
      if (!result.ok) { setCheckError(result.error || 'Document Check could not finish.'); return; }
    }
    if (isCurrentScope()) setCheckDialogTarget({ responseId: selectedResponse.id, fieldId: field.definitionId || field.id });
  }

  async function recheckFromDialog() {
    if (!checkResponse || !checkField) return;
    setCheckError('');
    const result = await runDocumentCheck(checkResponse.id, [checkField]);
    if (isCurrentScope() && !result.ok) setCheckError(result.error || 'Document Check could not finish.');
  }

  async function acceptSelected() {
    if (!selectedResponse || !isCurrentScope()) return;
    try {
      const serverState = await acceptResponse(selectedResponse.id);
      if (!isCurrentScope()) return;
      setState(current => ({ ...current, attempts: current.attempts.map(item =>
        item.id === selectedResponse.id ? applyReviewMutation(item, serverState) : item) }));
      notifications.show({ color: 'green', title: 'Response accepted', message: 'The accepted response is ready for final archiving.' });
    } catch (error) {
      if (isCurrentScope()) notifications.show({ color: 'red', title: 'Response not accepted', message: error?.message || 'The acceptance could not be saved.' });
    }
  }

  function revokeSelected() {
    if (!selectedResponse) return;
    const responseId = selectedResponse.id;
    modals.openConfirmModal({ title: 'Revoke this acceptance?', centered: true,
      children: <Text size="sm">The response returns to Pending. Existing archive records remain immutable historical snapshots.</Text>,
      labels: { confirm: 'Revoke acceptance', cancel: 'Keep accepted' }, confirmProps: { color: 'red' },
      onConfirm: async () => {
        if (!isCurrentScope()) return;
        try {
          const serverState = await revokeAcceptance(responseId);
          if (!isCurrentScope()) return;
          setState(current => ({ ...current, attempts: current.attempts.map(item =>
            item.id === responseId ? applyReviewMutation(item, serverState) : item) }));
        } catch (error) {
          if (isCurrentScope()) notifications.show({ color: 'red', title: 'Acceptance not revoked', message: error?.message || 'The response could not be updated.' });
        }
      }
    });
  }

  async function requestSelectedAiReview(field) {
    if (!selectedResponse || !field || !isCurrentScope()) return;
    if (!isArtifactDocumentCheckCurrent(selectedResponse, field)) {
      notifications.show({ color: 'orange', message: 'Run Document Check on this PDF before AI Review.' });
      return;
    }
    const responseId = selectedResponse.id;
    // Legacy single-PDF forms have no persisted field definition. The API
    // resolves their sole PDF from an omitted fieldId; the display-only
    // documentPdf key is not a backend field ID.
    const fieldId = field.definitionId || null;
    const key = `${responseId}:${field.definitionId || field.id}`;
    if (aiRunning.has(key)) return;
    const prior = artifactAiReview(selectedResponse, field);
    const retryToken = artifactAiReviewStatus(selectedResponse, field) === 'Retry required' ? prior?.retryToken : null;
    try {
      const status = await getAiReviewStatus();
      if (!isCurrentScope()) return;
      if (!status.configured) {
        notifications.show({ color: 'orange', message: status.message || 'AI Review is unavailable.' });
        return;
      }
      const rerunRequested = !retryToken && isArtifactAiReviewCurrent(selectedResponse, field);
      const modalId = modals.open({ title: retryToken ? 'Retry AI review?' : rerunRequested ? 'Rerun AI Review?' : 'AI review submission', centered: true,
        children: <AiReviewDialog targets={[{ key, responseId, fieldId, response: selectedResponse, field, label: field.label }]}
          retry={Boolean(retryToken)} rerun={rerunRequested} retryTokens={retryToken ? { [key]: retryToken } : {}}
          onCancel={() => modals.close(modalId)}
          onConfirm={async () => {
            modals.close(modalId);
            if (!isCurrentScope()) return;
            setAiRunning(current => withId(current, key));
            try {
              const result = await runAiReview(workspaceId, responseId, fieldId, Boolean(retryToken), retryToken,
                isCurrentScope, rerunRequested);
              if (!isCurrentScope()) return;
              if (result.review) setState(current => ({ ...current, attempts: current.attempts.map(item =>
                item.id === responseId ? applyArtifactAiReview(item, result.review) : item) }));
              notifications.show({ color: result.ok ? 'green' : 'orange', title: result.ok ? 'AI Review available' : 'AI Review needs attention',
                message: result.ok
                  ? rerunRequested && result.review?.reused
                    ? 'An identical review was already being processed or its saved result was reused. Open View AI Review to read it.'
                    : 'Open View AI Review on the PDF to read the saved result.'
                  : result.error || 'Check the saved review status before retrying.' });
            } catch (error) {
              if (isCurrentScope()) notifications.show({ color: 'red', title: 'AI Review could not finish',
                message: error?.message || 'Check the saved review status before retrying.' });
            } finally {
              if (isCurrentScope()) setAiRunning(current => withoutId(current, key));
            }
          }} /> });
    } catch (error) {
      if (isCurrentScope()) notifications.show({ color: 'red', message: error?.message || 'AI Review could not be started.' });
    }
  }

  async function checkDocument(task) {
    if (!isCurrentScope()) return;
    setRunningIds((current) => withId(current, task.response.id));
    const result = await runDocumentCheck(task.response.id, task.pendingFields);
    if (!isCurrentScope()) return;
    setRunningIds((current) => withoutId(current, task.response.id));
    if (result?.ok) {
      setResolvedTaskIds((current) => withId(current, task.id));
      notifications.show({
        color: 'green',
        title: 'Document Check complete',
        message: task.studentName + "'s " + task.deliverableCode + ' left the unchecked queue.'
      });
    } else {
      notifications.show({
        color: 'red',
        title: 'Document Check could not finish',
        message: result?.error || 'Try checking this response again.'
      });
    }
  }

  function confirmCheckAll() {
    if (!pendingDocumentTasks.length) return;
    const count = pendingDocumentTasks.length;
    modals.openConfirmModal({
      title: 'Check ' + count + ' unchecked document' + (count === 1 ? '' : 's') + '?',
      children: (
        <Text size="sm">
          WildTrack will process the complete unchecked queue. An individual failure will not stop the remaining checks.
        </Text>
      ),
      labels: { confirm: 'Start Document Check', cancel: 'Cancel' },
      confirmProps: { color: 'wildtrackMaroon' },
      centered: true,
      onConfirm: runAllDocumentChecks
    });
  }

  async function runAllDocumentChecks() {
    if (!isCurrentScope()) return;
    const tasks = pendingDocumentTasks;
    const targets = tasks.flatMap((task) => task.pendingFields.map((field) => ({ response: task.response, field })));
    setBatchProgress({ completed: 0, total: targets.length, failed: 0, done: false });
    const result = await runReviewDocumentChecks(workspaceId, targets, state.deliverables, {
      useDedup: true,
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
    const successfulAttemptIds = new Set(tasks.filter((task) => task.pendingFields.every((field) => (
      (result.results || []).some((item) => item.attemptId === task.response.id
        && (item.fieldId || item.fieldKey) === (field.definitionId || field.id)
        && item.ok)
    ))).map((task) => task.response.id));
    setResolvedTaskIds((current) => {
      const next = new Set(current);
      tasks.filter((task) => successfulAttemptIds.has(task.response.id)).forEach((task) => next.add(task.id));
      return next;
    });
    setBatchProgress({
      completed: result.completed,
      total: result.total,
      failed: result.failed,
      done: true
    });
  }

  async function runDocumentCheck(responseId, fields = null) {
    const response = state.attempts.find((item) => item.id === responseId);
    if (!response) return { ok: false, error: 'The selected response was not found.' };
    const deliverable = state.deliverables.find((item) => item.id === response.deliverableId);
    const reviewableFields = reviewableSubmissionFields(deliverable);
    const targetFields = fields?.length ? fields : (reviewableFields.length === 1 ? reviewableFields : []);
    if (!targetFields.length && reviewableFields.length > 1) return { ok: false, error: 'Choose which PDF artifacts to check.' };
    if (!targetFields.length) return { ok: false, error: 'This response has no reviewable PDF artifact.' };
    const result = targetFields.length === 1
      ? await runReviewDocumentCheck(workspaceId, response, deliverable, targetFields[0])
      : await runReviewDocumentChecks(workspaceId, targetFields.map((field) => ({ response, field })), state.deliverables, {
          shouldContinue: isCurrentScope
        });
    if (isCurrentScope() && (result.ok || result.results?.some((item) => item.ok))) {
      setState((current) => ({
        ...current,
        attempts: current.attempts.map((item) => {
          if (item.id !== responseId) return item;
          if (result.report) return applyDocumentCheck(item, result.report);
          return (result.results || []).filter((entry) => entry.ok && entry.report)
            .reduce((updated, entry) => applyDocumentCheck(updated, entry.report), item);
        })
      }));
    }
    if (result.results) {
      const firstFailure = result.results.find((item) => !item.ok);
      return { ...result, error: firstFailure?.error || (result.ok ? '' : 'One or more PDF artifacts could not be checked.') };
    }
    return result;
  }

  function confirmArchive(task) {
    modals.openConfirmModal({
      title: 'Archive this accepted response?',
      children: (
        <Text size="sm">
          WildTrack creates one archive metadata record and snapshots the submitted artifact references. Independent PDF storage is not connected yet.
        </Text>
      ),
      labels: { confirm: 'Archive response', cancel: 'Cancel' },
      confirmProps: { color: 'wildtrackMaroon' },
      centered: true,
      onConfirm: async () => {
        if (!isCurrentScope()) return;
        setRunningIds((current) => withId(current, task.response.id));
        let result;
        try {
          result = await archiveServerAttempts(workspaceId, [task.response.id]);
        } catch (error) {
          result = { ok: false, error: error?.message || 'The archive record could not be created.' };
        }
        if (!isCurrentScope()) return;
        setRunningIds((current) => withoutId(current, task.response.id));
        if (result?.ok) {
          setState(current => ({ ...current, attempts: current.attempts.map(item =>
            item.id === task.response.id ? { ...item, archiveStatus: 'Archived' } : item) }));
          setResolvedTaskIds((current) => withId(current, task.id));
          notifications.show({
            color: 'green',
            title: 'Archive record created',
            message: "The accepted response left Today's work."
          });
        } else {
          notifications.show({
            color: 'red',
            title: 'Archive failed',
            message: result?.error || 'The archive record could not be created.'
          });
        }
      }
    });
  }

  const emptyTitle = filter === 'all' && !query
    ? taskTab === 'dismissed' ? 'No dismissed notifications' : 'All clear for this workspace'
    : 'No ' + (filter === 'all' ? 'matching' : QUEUE_FILTERS.find((item) => item.value === filter)?.label.toLowerCase()) + ' work';

  return (
    <Stack gap="lg" className="wt-command-page">
      <header className="wt-staff-page-heading wt-command-heading">
        <div>
          <Text className="wt-eyebrow">Command center</Text>
          <Title order={1}>Today&apos;s work</Title>
          <Text c="dimmed">Resolve unchecked files, review decisions, conflicts, imports, and final records for this workspace.</Text>
        </div>
        <Button variant="default" onClick={() => setAccountManagementOpen(true)}>Account management</Button>
        {pendingDocumentTasks.length ? (
          <Button
            variant="default"
            leftSection={<Files size={18} />}
            disabled={batchRunning}
            onClick={confirmCheckAll}
          >
            Check all unchecked ({pendingDocumentTasks.length})
          </Button>
        ) : null}
      </header>

      <StudentAccountManagement workspaceId={workspaceId} opened={accountManagementOpen}
        onClose={() => setAccountManagementOpen(false)} onChanged={reload} />
      <ResourceBoundary status={status} error={error} onRetry={reload}>
      {aiRunning.size ? <Alert color="blue" title="AI Review running" role="status">
        {aiRunning.size} PDF {aiRunning.size === 1 ? 'review is' : 'reviews are'} running. The saved result will appear in the response drawer.
      </Alert> : null}
      <Paper withBorder className="wt-command-workbench">
        <div className="wt-command-workbench-head">
          <div>
            <Title order={2}>Work queue</Title>
            <Text size="sm" c="dimmed">Only unresolved items with a direct next action appear here.</Text>
          </div>
          <Text className="wt-command-total wt-tabular" size="sm" fw={800}>{openTasks.length} open</Text>
        </div>

        <Group role="tablist" aria-label="Work notification status" gap="xs" mb="sm" className="wt-command-status-tabs">
          <Button role="tab" aria-selected={taskTab === 'open'} aria-controls="work-notification-list"
            variant={taskTab === 'open' ? 'filled' : 'default'} color="wildtrackMaroon"
            onClick={() => { setTaskTab('open'); setPage(1); }}>Open ({openTasks.length})</Button>
          <Button role="tab" aria-selected={taskTab === 'dismissed'} aria-controls="work-notification-list"
            variant={taskTab === 'dismissed' ? 'filled' : 'default'} color="wildtrackMaroon"
            onClick={() => { setTaskTab('dismissed'); setPage(1); }}>Dismissed ({dismissedTasks.length})</Button>
        </Group>

        <div className="wt-command-filters" role="group" aria-label="Work queue filter">
          {QUEUE_FILTERS.map((item) => (
            <Button
              key={item.value}
              size="sm"
              variant={filter === item.value ? 'filled' : 'subtle'}
              color="wildtrackMaroon"
              aria-label={item.label}
              aria-pressed={filter === item.value}
              onClick={() => chooseFilter(item.value)}
            >
              {item.label}
              <span className="wt-command-filter-count wt-tabular">{taskTab === 'open' ? counts[item.value] || 0
                : dismissedTasks.filter(task => item.value === 'all' || task.category === item.value).length}</span>
            </Button>
          ))}
        </div>

        <div className="wt-command-toolbar">
          <TextInput
            aria-label="Search work queue"
            type="search"
            placeholder="Search student, team, deliverable, or issue"
            leftSection={<MagnifyingGlass size={17} />}
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPage(1);
            }}
          />
          <Text size="sm" fw={700} c="dimmed" className="wt-nowrap wt-tabular">
            Showing {firstRow}-{lastRow} of {visibleTasks.length}
          </Text>
          <Button size="xs" variant="default" disabled={!sectionTasks.length || Boolean(bulkDismissProgress)}
            loading={Boolean(bulkDismissProgress)} onClick={changeSectionDismissal}
            aria-label={`${taskTab === 'dismissed' ? 'Restore' : 'Dismiss'} all ${filter === 'all' ? 'work' : QUEUE_FILTERS.find(item => item.value === filter)?.label || filter} notifications`}>
            {taskTab === 'dismissed' ? 'Restore all' : 'Dismiss all'} ({sectionTasks.length})
          </Button>
        </div>

        {bulkDismissProgress ? <Text role="status" size="sm" ml="md" mb="xs">
          {bulkDismissProgress.shouldDismiss ? 'Dismissing' : 'Restoring'} {bulkDismissProgress.done} of {bulkDismissProgress.total} notifications
          {bulkDismissProgress.failed ? ` · ${bulkDismissProgress.failed} failed` : ''}
        </Text> : null}

        {batchProgress ? (
          <Alert
            role="status"
            color={!batchProgress.done ? 'blue' : batchProgress.failed ? 'orange' : 'green'}
            variant="light"
            title={batchProgress.done ? 'Document checks complete' : 'Checking documents'}
            icon={batchProgress.done && !batchProgress.failed ? <CheckCircle size={19} /> : <Files size={19} />}
            withCloseButton={batchProgress.done}
            onClose={() => setBatchProgress(null)}
            className="wt-command-batch-progress"
          >
            <Stack gap="xs">
              <Text size="sm">
                {batchProgress.completed} of {batchProgress.total} completed
                {batchProgress.failed ? ' | ' + batchProgress.failed + ' could not be checked' : ''}
              </Text>
              <Progress value={(batchProgress.completed / Math.max(batchProgress.total, 1)) * 100} color="wildtrackMaroon" size="sm" />
            </Stack>
          </Alert>
        ) : null}

        <div id="work-notification-list" role="tabpanel" aria-label={taskTab === 'dismissed' ? 'Dismissed notifications' : 'Open notifications'}>
        {visibleTasks.length ? (
          <>
            <WorkQueueTable
              tasks={pageTasks}
              runningIds={runningIds}
              onCheck={checkDocument}
              onArchive={confirmArchive}
              onDecideConflict={() => setAccountManagementOpen(true)}
              onReview={openResponse}
              onDismiss={(task) => changeDismissal(task, true)}
              onRestore={(task) => changeDismissal(task, false)}
              dismissed={taskTab === 'dismissed'}
            />
            {visibleTasks.length > PAGE_SIZE ? (
              <div className="wt-command-pagination">
                <Text size="sm" c="dimmed" className="wt-tabular">Page {activePage} of {pageCount}</Text>
                <Pagination total={pageCount} value={activePage} onChange={setPage} color="wildtrackMaroon" size="sm" withEdges />
              </div>
            ) : null}
          </>
        ) : (
          <div className="wt-command-empty">
            <CheckCircle size={28} weight="duotone" aria-hidden="true" />
            <div>
              <Text fw={800}>{emptyTitle}</Text>
              <Text size="sm" c="dimmed">
                {filter === 'all' && !query
                  ? taskTab === 'dismissed' ? 'Dismissed notifications that still apply to this workspace will appear here.'
                    : 'New unresolved work will appear here as submissions and imports change.'
                  : 'Try another work type or search term.'}
              </Text>
            </div>
          </div>
        )}
        </div>
      </Paper>
      </ResourceBoundary>
      <ReviewResponseDrawer opened={Boolean(selectedResponse && selectedStudent && selectedDeliverable)}
        response={selectedResponse} student={selectedStudent} state={state} deliverable={selectedDeliverable}
        checkingFields={runningIds} checkingAiFields={aiRunning} checkError={checkError}
        onClose={() => { setSelectedResponseId(''); setCheckError(''); }}
        onDocumentCheck={openOrCheckSelected}
        onFileHistory={field => setCheckDialogTarget({ responseId: selectedResponse.id,
          fieldId: field.definitionId || field.id, initialTab: 'history' })}
        onViewAiReview={field => setAiDialogTarget({ responseId: selectedResponse.id, fieldId: field.definitionId || field.id })}
        onAiReview={requestSelectedAiReview}
        onAccept={acceptSelected} onRevoke={revokeSelected}
        onArchive={() => confirmArchive({ id: 'archive:' + selectedResponse.id, response: selectedResponse })} />
      <DocumentCheckDialog open={Boolean(checkResponse && checkField)}
        response={checkResponse && checkReport ? { ...checkResponse, documentCheck: checkReport, fileCheckStatus: checkReport.status } : checkResponse}
        observedHistory={checkResponse?.observedFileHistoryByField?.[checkFieldId] || checkResponse?.observedFileHistory || null}
        initialTab={checkDialogTarget?.initialTab || 'result'}
        historyOnly={checkDialogTarget?.initialTab === 'history' && !checkReport}
        historyTarget={workspaceId && checkResponse?.id && checkFieldId ? { workspaceId, responseId: checkResponse.id,
          fieldId: checkFieldId } : null}
        fileLink={checkField ? checkResponse?.values?.[checkField.id] : ''}
        rechecking={Boolean(checkResponse && runningIds.has(checkResponse.id))}
        error={checkError} onClose={() => { setCheckDialogTarget(null); setCheckError(''); }} onRecheck={recheckFromDialog} />
      <AiReviewReportDialog opened={Boolean(aiReport)} report={aiReport} review={aiReview}
        fieldLabel={aiField?.label} onClose={() => setAiDialogTarget(null)} />
    </Stack>
  );
}

function buildWorkQueue(state, openConflicts = [], dismissedKeys = new Set()) {
  const tasks = [];
  const attempts = state.attempts || [];
  const byResponse = new Map(attempts.map(response => [response.id, response]));
  const eventsByFile = new Map();
  for (const event of state.fileEvents || []) {
    if (!event?.fileId || !event.id) continue;
    const visibleResponseIds = [...new Set(event.responseIds || [])].filter(id => byResponse.has(id));
    if (!visibleResponseIds.length) continue;
    const group = eventsByFile.get(event.fileId) || [];
    group.push({ ...event, visibleResponseIds });
    eventsByFile.set(event.fileId, group);
  }
  for (const events of eventsByFile.values()) {
    // One prominent event per file. A subsequent metadata observation or access
    // restoration must not bury an unresolved content, type, or access alert.
    events.sort((a, b) => dateValue(b.observedAt) - dateValue(a.observedAt));
    const significantEvents = events.filter(event => isSignificantFileEvent(event.kind));
    const candidates = significantEvents.length ? significantEvents : events;
    // A dismissed newer significant alert must not hide an older significant
    // alert that this staff member has not dismissed yet.
    const primary = candidates.find(event => !dismissedKeys.has(fileEventTaskId(event))) || candidates[0];
    // Keep the latest acknowledged event in Dismissed even after a newer change
    // becomes the open alert, without rendering the whole event feed as queue rows.
    const latestDismissed = candidates.find(event => dismissedKeys.has(fileEventTaskId(event)));
    for (const event of latestDismissed && latestDismissed.id !== primary.id
      ? [primary, latestDismissed] : [primary]) {
      const response = byResponse.get(event.visibleResponseIds[0]);
      const deliverable = getDeliverable(state, response.deliverableId);
      const kind = monitorEventLabel(event.kind);
      const affected = event.visibleResponseIds.length;
      const linkedNames = [...new Set(event.visibleResponseIds.map(id => {
        const linked = byResponse.get(id);
        return findStudent(state.students, linked.studentNumber)?.name || linked.studentName
          || linked.studentNumber || 'Unmatched student';
      }))];
      const namePreview = linkedNames.slice(0, 2).join(', ')
        + (linkedNames.length > 2 ? ` and ${linkedNames.length - 2} more` : '');
      tasks.push({ id: fileEventTaskId(event), category: 'document', type: kind,
        title: (deliverable?.shortTitle || deliverable?.trackerColumn || 'Submitted PDF') + ' | ' + kind,
        detail: `Linked submission${linkedNames.length === 1 ? '' : 's'}: ${namePreview}. File ending ${event.fileId.slice(-8)} · ${affected} affected ${affected === 1 ? 'response' : 'responses'} across ${new Set(event.teamCodes || []).size || 1} team(s). ${event.detail || ''}`,
        studentName: linkedNames.join(', '),
        teamCode: (event.teamCodes || []).join(', ') || response.teamCode || 'Submitted file',
        deliverableCode: deliverable?.shortTitle || deliverable?.trackerColumn || 'Submitted PDF',
        updatedAt: event.observedAt, response, action: 'review', actionLabel: 'Review response',
        actionAriaLabel: 'Review affected response for ' + kind });
    }
  }

  openConflicts.forEach((conflict) => {
    const label = conflict.studentNumber || conflict.studentRecordId;
    tasks.push({
      id: 'conflict:' + conflict.id,
      category: 'identity',
      type: 'Identity conflict',
      title: (conflict.studentName || 'Unnamed student') + ' has unresolved Google account claims',
      detail: 'Student Record ' + label + ' | '
        + identityLabel(conflict.existingIdentity) + ' vs ' + identityLabel(conflict.conflictingIdentity)
        + '. Review the recorded accounts before choosing any recovery action.',
      studentName: conflict.studentName || '',
      teamCode: conflict.teamCode || 'Unmatched team',
      deliverableCode: 'Student identity',
      updatedAt: conflict.createdAt,
      conflict,
      action: 'conflict',
      actionLabel: 'Resolve conflict',
      actionAriaLabel: 'Resolve ' + label + ' identity conflict',
      dismissAriaLabel: 'Dismiss ' + label + ' identity conflict'
    });
  });

  attempts.forEach((response) => {
    if (response.archiveStatus === 'Archived') return;
    const student = findStudent(state.students, response.studentNumber);
    const deliverable = getDeliverable(state, response.deliverableId);
    const studentName = student?.name || response.studentName || response.studentNumber || 'Unmatched student';
    const teamCode = student?.teamCode || response.teamCode || 'Unmatched team';
    const deliverableCode = deliverable?.shortTitle || deliverable?.trackerColumn || 'Deliverable';
    const updatedAt = response.updatedAt || response.submittedAt;

    if (response.identityConflict) {
      tasks.push({
        id: 'identity:' + response.id,
        category: 'identity',
        type: 'Identity conflict',
        title: studentName + ' used an identity already associated with another response',
        detail: 'Confirm the submitted roster details before this response affects the tracker.',
        studentName,
        teamCode,
        deliverableCode,
        updatedAt,
        response,
        action: 'review',
        actionLabel: 'Resolve conflict',
        actionAriaLabel: 'Resolve ' + studentName + ' identity conflict'
      });
      return;
    }

    if (response.reviewStatus === 'Accepted') {
      tasks.push({
        id: 'archive:' + response.id,
        category: 'archive',
        type: 'Archive final',
        title: studentName + ' | ' + deliverableCode,
        detail: 'Accepted response is ready for a final archive record.',
        studentName,
        teamCode,
        deliverableCode,
        updatedAt: response.acceptance?.acceptedAt || updatedAt,
        response,
        action: 'archive',
        actionLabel: 'Archive final',
        actionAriaLabel: 'Archive ' + studentName + ' final'
      });
      return;
    }

    const reviewFields = reviewableSubmissionFields(deliverable)
      .filter((field) => String(response.values?.[field.id] || '').trim());
    const pendingFields = reviewFields.filter((field) => !isArtifactDocumentCheckCurrent(response, field));
    if (deliverableUsesDocumentCheck(deliverable) && pendingFields.length) {
      const checkedCount = reviewFields.length - pendingFields.length;
      const attentionCount = reviewFields.filter((field) => artifactDocumentCheckStatus(response, field) === 'Needs attention').length;
      tasks.push({
        id: 'document:' + response.id,
        category: 'document',
        type: 'Document Check',
        title: studentName + ' | ' + deliverableCode,
        detail: `${reviewFields.length} PDF artifact${reviewFields.length === 1 ? '' : 's'} · ${checkedCount} checked · ${pendingFields.length} need checking${attentionCount ? ` · ${attentionCount} need attention` : ''}`,
        studentName,
        teamCode,
        deliverableCode,
        updatedAt,
        response,
        pendingFields,
        action: 'check',
        actionLabel: pendingFields.length === 1 ? 'Check document' : `Check ${pendingFields.length} PDFs`,
        actionAriaLabel: 'Check ' + studentName + ' reviewable PDF artifacts'
      });
      return;
    }

    tasks.push({
      id: 'review:' + response.id,
      category: 'review',
      type: 'Review decision',
      title: studentName + ' | ' + deliverableCode,
      detail: reviewFields.length
        ? `${reviewFields.length} reviewable PDF artifact${reviewFields.length === 1 ? '' : 's'} checked. This response needs a staff decision.`
        : 'This response has no Document Check requirement and needs a staff decision.',
      studentName,
      teamCode,
      deliverableCode,
      updatedAt: Object.values(response.artifactChecks || {}).map((report) => report?.checkedAt).filter(Boolean).sort().at(-1)
        || response.documentCheck?.checkedAt || updatedAt,
      response,
      action: 'review',
      actionLabel: 'Review response',
      actionAriaLabel: 'Review ' + studentName + ' response'
    });
  });

  importWarnings(state).forEach((warning, index) => {
    const source = normalizeImportSource(state.classRecord?.importSummary?.sourceType);
    tasks.push({
      id: 'workspace:' + source + ':' + index + ':' + warning,
      category: 'workspace',
      type: 'Import warning',
      title: sourceLabel(source) + ' import needs attention',
      detail: warning,
      teamCode: 'Workspace source',
      deliverableCode: sourceLabel(source),
      updatedAt: state.classRecord?.sources?.[source]?.connectedAt || '',
      href: '/workspace?source=' + source,
      actionLabel: 'Open import',
      actionAriaLabel: 'Open ' + sourceLabel(source) + ' import warning'
    });
  });

  (state.archives || [])
    .filter((archive) => archive.storageStatus === 'Failed' || archive.integrityStatus === 'Verification failed')
    .forEach((archive) => {
      tasks.push({
        id: 'archive-failed:' + archive.id,
        category: 'archive',
        type: archive.integrityStatus === 'Verification failed' ? 'Integrity check failed' : 'Archive storage failed',
        title: (archive.teamCode || 'Unknown team') + ' | ' + (archive.deliverableTitle || 'Final document'),
        detail: archive.failureReason || 'Open the archive record to inspect the failure and available retry action.',
        teamCode: archive.teamCode || 'Archive record',
        deliverableCode: archive.deliverableTitle || 'Final document',
        updatedAt: archive.lastCheckedAt || archive.archivedAt,
        href: '/archive?record=' + encodeURIComponent(archive.id),
        actionLabel: 'Open record',
        actionAriaLabel: 'Open failed archive record'
      });
    });

  return tasks.sort((a, b) => priorityOf(a.category) - priorityOf(b.category) || dateValue(b.updatedAt) - dateValue(a.updatedAt));
}

function identityLabel(identity) {
  if (!identity) return 'unknown account';
  return identity.googleEmail || identity.googleSubject || 'unknown account';
}

function importWarnings(state) {
  const summary = state.classRecord?.importSummary;
  if (!summary || !String(summary.resultStatus || '').toLowerCase().includes('warning')) return [];
  return [...new Set([...(summary.warnings || []), ...(state.classRecord?.importWarnings || [])].filter(Boolean))];
}

function monitorEventLabel(kind) {
  return ({ CONTENT_CHANGED: 'PDF content changed', FILE_TYPE_CHANGED: 'PDF file type changed',
    DOWNLOAD_UNAVAILABLE: 'PDF download unavailable', ACCESS_UNAVAILABLE: 'PDF access unavailable',
    ACCESS_RESTORED: 'PDF access restored', CHANGE_AWAITING_CHECK: 'PDF change awaiting check',
    METADATA_CHANGED: 'Drive metadata changed' })[kind] || 'Submitted file changed';
}

function isSignificantFileEvent(kind) {
  return ['CONTENT_CHANGED', 'FILE_TYPE_CHANGED', 'ACCESS_UNAVAILABLE',
    'DOWNLOAD_UNAVAILABLE', 'CHANGE_AWAITING_CHECK'].includes(kind);
}

function fileEventTaskId(event) {
  return `file:${event.fileId}:${event.id}`;
}

function normalizeImportSource(value) {
  const lower = String(value || '').toLowerCase();
  if (lower.includes('team')) return 'teamFormation';
  if (lower.includes('project')) return 'projectMonitor';
  return 'tracker';
}

function sourceLabel(source) {
  if (source === 'teamFormation') return 'Team Formation';
  if (source === 'projectMonitor') return 'Software Project Monitor';
  return 'Tracker';
}

function taskMatchesQuery(task, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [task.type, task.title, task.detail, task.studentName, task.teamCode, task.deliverableCode]
    .some((value) => String(value || '').toLowerCase().includes(needle));
}

function priorityOf(category) {
  return { identity: 0, document: 1, review: 2, workspace: 3, archive: 4 }[category] ?? 5;
}

function dateValue(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function withId(values, id) {
  return new Set([...values, id]);
}

function withoutId(values, id) {
  const next = new Set(values);
  next.delete(id);
  return next;
}
