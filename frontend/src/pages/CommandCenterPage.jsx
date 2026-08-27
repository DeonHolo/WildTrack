import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
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
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { WorkQueueTable } from '../components/command/WorkQueueTable.jsx';
import { decideIdentityConflict, getIdentityConflicts } from '../lib/api.js';
import {
  deliverableUsesDocumentCheck,
  findStudent,
  getDeliverable,
  isDocumentCheckCurrent
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

export function CommandCenterPage() {
  const { state, activeWorkspaceId, runDocumentCheck, runDocumentChecks, archiveAttempt, refreshBackendData } = useWorkflow();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [runningIds, setRunningIds] = useState(new Set());
  const [resolvedTaskIds, setResolvedTaskIds] = useState(new Set());
  const [batchProgress, setBatchProgress] = useState(null);
  const [openConflicts, setOpenConflicts] = useState([]);
  const [conflictError, setConflictError] = useState(null);
  // The active workspace lives at the workflow-context root, not inside state.
  const workspaceId = activeWorkspaceId;

  // Ticket 05: identity conflicts are server-owned, so Today's work reads the open queue
  // from the backend instead of inferring conflicts from this browser's submissions.
  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setOpenConflicts([]);
      setConflictError(null);
      return undefined;
    }
    refreshBackendData?.({ silent: true })?.catch?.(() => {});
    getIdentityConflicts(workspaceId)
      .then((conflicts) => {
        if (cancelled) return;
        setConflictError(null);
        setOpenConflicts(Array.isArray(conflicts) ? conflicts.filter((item) => item.status === 'OPEN') : []);
      })
      .catch((error) => {
        if (cancelled) return;
        setOpenConflicts([]);
        // A failed fetch must not read as "All clear": say the queue is incomplete.
        setConflictError(error?.message || 'Identity conflicts could not be loaded.');
      });
    return () => { cancelled = true; };
  }, [workspaceId, refreshBackendData]);

  const allTasks = useMemo(() => buildWorkQueue(state, openConflicts), [state, openConflicts]);
  const openTasks = useMemo(
    () => allTasks.filter((task) => !resolvedTaskIds.has(task.id)),
    [allTasks, resolvedTaskIds]
  );
  const visibleTasks = useMemo(
    () => openTasks
      .filter((task) => filter === 'all' || task.category === filter)
      .filter((task) => taskMatchesQuery(task, query)),
    [filter, openTasks, query]
  );
  const counts = useMemo(
    () => QUEUE_FILTERS.reduce((result, item) => ({
      ...result,
      [item.value]: openTasks.filter((task) => item.value === 'all' || task.category === item.value).length
    }), {}),
    [openTasks]
  );
  const pendingDocumentTasks = useMemo(
    () => openTasks.filter((task) => task.category === 'document'),
    [openTasks]
  );
  const pageCount = Math.max(1, Math.ceil(visibleTasks.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const pageTasks = visibleTasks.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const firstRow = visibleTasks.length ? (activePage - 1) * PAGE_SIZE + 1 : 0;
  const lastRow = Math.min(activePage * PAGE_SIZE, visibleTasks.length);
  const batchRunning = Boolean(batchProgress && !batchProgress.done);

  function chooseFilter(value) {
    setFilter(value);
    setPage(1);
  }

  async function checkDocument(task) {
    setRunningIds((current) => withId(current, task.response.id));
    const result = await runDocumentCheck(task.response.id);
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
    const tasks = pendingDocumentTasks;
    const ids = tasks.map((task) => task.response.id);
    setBatchProgress({ completed: 0, total: ids.length, failed: 0, done: false });
    const result = await runDocumentChecks(ids, {
      onProgress: ({ completed, total }) => setBatchProgress((current) => ({ ...current, completed, total }))
    });
    const successfulAttemptIds = new Set((result.results || []).filter((item) => item.ok).map((item) => item.attemptId));
    if (!result.results?.length && result.failed === 0) ids.forEach((id) => successfulAttemptIds.add(id));
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

  const decideConflict = useCallback(async (task, decision) => {
    setRunningIds((current) => withId(current, task.id));
    try {
      await decideIdentityConflict(workspaceId, task.conflict.id, decision);
      setOpenConflicts((current) => current.filter((item) => item.id !== task.conflict.id));
      notifications.show({
        color: 'green',
        title: decision === 'DISMISSED' ? 'Conflict dismissed' : 'Conflict resolved',
        message: 'The decision was recorded for ' + (task.conflict.studentNumber || 'this Student Record') + '.'
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Decision not recorded',
        message: error?.message || 'The identity conflict is still open.'
      });
    } finally {
      setRunningIds((current) => withoutId(current, task.id));
    }
  }, [workspaceId]);

  function confirmArchive(task) {
    modals.openConfirmModal({
      title: 'Archive this accepted response?',
      children: (
        <Text size="sm">
          WildTrack creates one archive metadata record and keeps the submitted Drive link as its source reference. Independent PDF storage is not connected yet.
        </Text>
      ),
      labels: { confirm: 'Archive response', cancel: 'Cancel' },
      confirmProps: { color: 'wildtrackMaroon' },
      centered: true,
      onConfirm: async () => {
        setRunningIds((current) => withId(current, task.response.id));
        const result = await archiveAttempt(task.response.id);
        setRunningIds((current) => withoutId(current, task.response.id));
        if (result?.ok) {
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
    ? (conflictError ? 'Work queue is incomplete' : 'All clear for this workspace')
    : 'No ' + (filter === 'all' ? 'matching' : QUEUE_FILTERS.find((item) => item.value === filter)?.label.toLowerCase()) + ' work';

  return (
    <Stack gap="lg" className="wt-command-page">
      <header className="wt-staff-page-heading wt-command-heading">
        <div>
          <Text className="wt-eyebrow">Command center</Text>
          <Title order={1}>Today&apos;s work</Title>
          <Text c="dimmed">Resolve unchecked files, review decisions, conflicts, imports, and final records for this workspace.</Text>
        </div>
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

      <Paper withBorder className="wt-command-workbench">
        <div className="wt-command-workbench-head">
          <div>
            <Title order={2}>Work queue</Title>
            <Text size="sm" c="dimmed">Only unresolved items with a direct next action appear here.</Text>
          </div>
          <Text className="wt-command-total wt-tabular" size="sm" fw={800}>{counts.all || 0} open</Text>
        </div>

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
              <span className="wt-command-filter-count wt-tabular">{counts[item.value] || 0}</span>
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
        </div>

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

        {conflictError ? (
          <Alert
            role="status"
            color="orange"
            variant="light"
            title="Identity conflicts could not be loaded"
            icon={<Warning size={19} />}
            className="wt-command-batch-progress"
          >
            <Text size="sm">{conflictError} This queue may be missing identity work.</Text>
          </Alert>
        ) : null}

        {visibleTasks.length ? (
          <>
            <WorkQueueTable
              tasks={pageTasks}
              runningIds={runningIds}
              onCheck={checkDocument}
              onArchive={confirmArchive}
              onDecideConflict={decideConflict}
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
                  ? 'New unresolved work will appear here as submissions and imports change.'
                  : 'Try another work type or search term.'}
              </Text>
            </div>
          </div>
        )}
      </Paper>
    </Stack>
  );
}

function buildWorkQueue(state, openConflicts = []) {
  const tasks = [];
  const attempts = state.attempts || [];

  openConflicts.forEach((conflict) => {
    const label = conflict.studentNumber || conflict.studentRecordId;
    tasks.push({
      id: 'conflict:' + conflict.id,
      category: 'identity',
      type: 'Identity conflict',
      title: (conflict.studentName || 'Unnamed student') + ' has two Google accounts claiming one Student Record',
      detail: 'Student Record ' + label + ' | '
        + identityLabel(conflict.existingIdentity) + ' vs ' + identityLabel(conflict.conflictingIdentity)
        + '. Resolve keeps the record under staff review; Dismiss closes it as harmless.',
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
        href: reviewHref(response),
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

    if (deliverableUsesDocumentCheck(deliverable) && !isDocumentCheckCurrent(response)) {
      tasks.push({
        id: 'document:' + response.id,
        category: 'document',
        type: 'Document Check',
        title: studentName + ' | ' + deliverableCode,
        detail: response.fileCheckStatus === 'Error'
          ? response.fileCheckError || 'The previous Document Check could not finish.'
          : 'Submitted PDF has not been checked against its current response.',
        studentName,
        teamCode,
        deliverableCode,
        updatedAt,
        response,
        action: 'check',
        actionLabel: response.fileCheckStatus === 'Error' ? 'Check again' : 'Check document',
        actionAriaLabel: 'Check ' + studentName + ' document'
      });
      return;
    }

    tasks.push({
      id: 'review:' + response.id,
      category: 'review',
      type: 'Review decision',
      title: studentName + ' | ' + deliverableCode,
      detail: response.documentCheck?.summary || 'Document Check is complete and this response needs a staff decision.',
      studentName,
      teamCode,
      deliverableCode,
      updatedAt: response.documentCheck?.checkedAt || updatedAt,
      response,
      href: reviewHref(response),
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

function reviewHref(response) {
  return '/review?deliverable=' + encodeURIComponent(response.deliverableId) + '&response=' + encodeURIComponent(response.id);
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
