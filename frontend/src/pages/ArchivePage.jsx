import { ResourceBoundary } from '../components/ResourceBoundary.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Badge,
  Checkbox,
  Collapse,
  Group,
  Modal,
  NativeSelect,
  Paper,
  Progress,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  Archive as ArchiveIcon,
  CloudSlash,
  Funnel,
  MagnifyingGlass,
  WarningCircle,
  X
} from '@phosphor-icons/react';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { ArchiveIndexTable } from '../components/archive/ArchiveIndexTable.jsx';
import { ArchiveRecordDrawer } from '../components/archive/ArchiveRecordDrawer.jsx';
import { useWorkspaceResource } from '../hooks/useWorkspaceResource.js';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope.js';
import { emptyArchiveState, loadArchiveState } from '../lib/archiveClient.js';
import { syncReviewDecisionCache } from '../lib/reviewDeskClient.js';
import { getArchiveStatus, getArchiveVersion } from '../lib/archive.js';
import { retryArchiveRecord, unarchiveRecord, verifyArchiveRecord, getLatestArchiveBatch, prepareArchiveBatch, startArchiveBatch } from '../lib/api.js';

const PAGE_SIZE = 50;
const ARCHIVE_FILTER_STATE_KEY = 'wildtrack.archive.filters';
const EMPTY_FILTERS = {
  query: '',
  workspace: '',
  project: '',
  team: '',
  student: '',
  adviser: '',
  deliverable: '',
  version: '',
  status: '',
  lifecycle: 'archived',
  archivedFrom: '',
  archivedTo: ''
};

export function ArchivePage() {
  const [searchParams] = useSearchParams();
  const linkedArchiveId = searchParams.get('record') || '';
  const linkedResponseId = searchParams.get('response') || '';
  const { activeWorkspace, activeWorkspaceId, workspaces = [], resourceCache } = useWorkspaceSession();
  const isCurrentScope = useWorkspaceScope(activeWorkspaceId);
  const { data: state, setData: setState, status: archiveStatus, error: archiveError, reload: refreshArchive } = useWorkspaceResource(
    activeWorkspaceId,
    loadArchiveState,
    emptyArchiveState, 'archive');
  const [filters, setFilters] = useState(loadArchiveFilters);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedArchiveId, setSelectedArchiveId] = useState(linkedArchiveId);
  const [page, setPage] = useState(1);
  const [archiving, setArchiving] = useState(false);
  const [action, setAction] = useState('');
  const [batch, setBatch] = useState(null);
  const [preparationOpen, setPreparationOpen] = useState(false);
  const [batchError, setBatchError] = useState('');
  const batchEpoch = useRef(0);

  useEffect(() => {
    setArchiving(false);
    setAction('');
    setSelectedArchiveId(linkedArchiveId);
    setBatch(null);
    setPreparationOpen(false);
    setBatchError('');
    batchEpoch.current++;
  }, [isCurrentScope, linkedArchiveId]);

  useEffect(() => {
    if (state.archiveBatch !== undefined) setBatch(state.archiveBatch);
  }, [state.archiveBatch]);

  const archives = useMemo(
    () => [...(state.archives || [])].sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt)),
    [state.archives]
  );
  const candidates = useMemo(
    () => (state.attempts || []).filter((attempt) => attempt.reviewStatus === 'Accepted' && attempt.archiveStatus !== 'Archived' && !archives.some((archive) => currentCapture(archive, attempt))),
    [state.attempts, archives]
  );
  const filteredArchives = useMemo(
    () => archives.filter((archive) => archiveMatchesFilters(archive, filters)),
    [archives, filters]
  );
  const pageCount = Math.max(1, Math.ceil(filteredArchives.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredArchives.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedArchive = archives.find((archive) => archive.id === selectedArchiveId) || null;
  const linkedResponseRecordId = linkedResponseId ? (
    archives.find(archive => (archive.responseId || archive.attemptId) === linkedResponseId && archive.lifecycleState === 'Archived')
      || archives.find(archive => (archive.responseId || archive.attemptId) === linkedResponseId))?.id : '';
  useEffect(() => {
    if (linkedResponseRecordId) setSelectedArchiveId(linkedResponseRecordId);
  }, [isCurrentScope, linkedResponseRecordId]);
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key === 'lifecycle' ? value !== 'archived' : Boolean(value)).length;
  const storageReady = Boolean(state.archiveStorage?.ready);
  const copying = archives.some((item) => ['QUEUED', 'COPYING'].includes(item.captureState));
  const batchRunning = ['CHECKING', 'ARCHIVING'].includes(batch?.state);
  const batchItems = batch?.items || [];
  const checkingBatch = batch?.state === 'CHECKING';
  const readyCount = batchItems.filter(item => item.stage === 'READY').length;
  const blockedCount = batchItems.filter(item => item.stage === 'BLOCKED').length;
  const finishedCount = batchItems.filter(item => !['PENDING', 'READY', 'COPYING'].includes(item.stage)).length;
  useEffect(() => {
    if (!batchRunning || !activeWorkspaceId) return undefined;
    let reading = false;
    let cancelled = false;
    const poll = async () => {
      if (reading) return;
      const epoch = batchEpoch.current;
      reading = true;
      try {
        const current = await getLatestArchiveBatch(activeWorkspaceId);
        if (!isCurrentScope() || cancelled || epoch !== batchEpoch.current) return;
        if (!current?.id || !Array.isArray(current.items)) throw new Error('Archive progress is unavailable.');
        setBatch(current);
        setBatchError('');
        if (current && !['CHECKING', 'ARCHIVING'].includes(current.state)) {
          await refreshArchive({ background: true });
        }
      } catch { if (isCurrentScope() && !cancelled && epoch === batchEpoch.current) setBatchError('Progress could not be refreshed. The server keeps working.'); }
      finally { reading = false; }
    };
    const timer = window.setInterval(poll, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [batchRunning, batch?.id, activeWorkspaceId, isCurrentScope, refreshArchive]);
  useEffect(() => {
    if (!copying || !activeWorkspaceId) return undefined;
    const timer = window.setInterval(() => {
      if (isCurrentScope()) refreshArchive({ background: true });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [copying, activeWorkspaceId, isCurrentScope, refreshArchive]);
  const filterOptions = useMemo(
    () => buildFilterOptions(archives, workspaces, activeWorkspace),
    [activeWorkspace, archives, workspaces]
  );

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  useEffect(() => {
    try {
      sessionStorage.setItem(ARCHIVE_FILTER_STATE_KEY, JSON.stringify(filters));
    } catch {
      // Archive filtering still works when browser storage is unavailable.
    }
  }, [filters]);

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  async function confirmArchiveAccepted() {
    if (!isCurrentScope() || !candidates.length || !storageReady || archiving || copying || batchRunning || action === 'retry') return;
    setArchiving(true);
    batchEpoch.current++;
    setPreparationOpen(true);
    setBatchError('');
    try {
      const result = await prepareArchiveBatch(activeWorkspaceId, candidates.map(item => item.id));
      if (isCurrentScope()) retainBatch(result);
    } catch (error) {
      if (isCurrentScope()) setBatchError(error?.message || 'Archive preparation could not start. Try loading its saved progress.');
    } finally { if (isCurrentScope()) setArchiving(false); }
  }

  async function archivePrepared() {
    if (!isCurrentScope() || archiving || batch?.state !== 'READY' || !readyCount) return;
    setArchiving(true);
    batchEpoch.current++;
    try {
      const result = await startArchiveBatch(activeWorkspaceId, batch.id, batch.version);
      if (isCurrentScope()) retainBatch(result);
    } catch (error) {
      if (isCurrentScope()) setBatchError(error?.message || 'The archive request could not be confirmed. Check saved progress before trying again.');
    } finally { if (isCurrentScope()) setArchiving(false); }
  }

  function retainBatch(result) {
    setBatch(result);
    setState(current => ({ ...current, archiveBatch: result }));
  }

  async function checkBatchProgress() {
    try {
      const result = await getLatestArchiveBatch(activeWorkspaceId);
      if (isCurrentScope()) { retainBatch(result); setBatchError(''); }
    } catch { if (isCurrentScope()) setBatchError('Progress could not be refreshed. Try again.'); }
  }

  function retainArchiveRecords(records) {
    setState(current => ({ ...current, archives: [
      ...records, ...(current.archives || []).filter(record => !records.some(updated => updated.id === record.id))
    ] }));
  }

  async function runAction(kind, archive, revoke = false) {
    if (!isCurrentScope() || action) return;
    setAction(kind);
    try {
      let result;
      if (kind === 'retry') result = await retryArchiveRecord(activeWorkspaceId, archive.id, archive.stateVersion);
      if (kind === 'unarchive') await unarchiveRecord(activeWorkspaceId, archive.id, archive.stateVersion, revoke);
      if (kind === 'verify') result = await verifyArchiveRecord(activeWorkspaceId, archive.id);
      if (!isCurrentScope()) return;
      if (kind === 'retry' && result?.id) retainArchiveRecords([result]);
      if (kind === 'unarchive' && revoke) syncReviewDecisionCache(resourceCache, activeWorkspaceId, archive.responseId || archive.attemptId, { acceptance: null });
      await refreshArchive({ background: true });
      if (!isCurrentScope()) return;
      if (kind === 'unarchive') setSelectedArchiveId('');
      notifications.show({ color: kind === 'verify' && result?.integrityStatus !== 'Verified' ? 'yellow' : 'green', title: kind === 'verify' ? 'Integrity check complete' : kind === 'retry' ? 'Copy queued' : 'Submission unarchived', message: kind === 'verify' ? (result?.integrityStatus === 'Verified' ? 'The retained copies were verified.' : 'Verification is unavailable for this record.') : kind === 'retry' ? 'The archive copy will be retried.' : revoke ? 'Acceptance revoked. The response is back in Pending; preserved files are kept.' : 'The submission is active again. Preserved files are kept.' });
    } catch (error) {
      if (!isCurrentScope()) return;
      notifications.show({ color: 'red', title: kind === 'verify' ? 'Integrity check failed' : 'Archive action failed', message: kind === 'verify' && error?.status === 503 ? 'The retained copy could not be read.' : error?.message || 'Please try again.' });
      if (error?.status === 409) await refreshArchive({ background: true });
    } finally {
      if (isCurrentScope()) setAction('');
    }
  }

  function confirmUnarchive(archive) {
    let revoke = false;
    modals.openConfirmModal({
      title: 'Unarchive this submission?',
      children: <Stack gap="md">
        <Text size="sm">The submission will leave the active archive view. Preserved files and answers are kept in archive history. Unarchive does not delete files from Google Drive or any other storage provider.</Text>
        <Checkbox label="Also revoke acceptance" description="Return this response to Pending in Review." onChange={event => { revoke = event.currentTarget.checked; }} />
      </Stack>,
      labels: { confirm: 'Unarchive', cancel: 'Cancel' },
      onConfirm: () => runAction('unarchive', archive, revoke)
    });
  }

  const loadStatus = archiveStatus === 'idle' ? 'ready' : archiveStatus;

  return (
    <div className="wt-archive-page">
      <header className="wt-staff-page-heading wt-archive-heading">
        <div>
          <Text className="wt-eyebrow">Final records</Text>
          <Title order={1}>Final archive</Title>
          <Text c="dimmed">Preserve accepted PDFs and submission records. Other links are retained; their linked content is not copied.</Text>
        </div>
        <Button
          leftSection={<ArchiveIcon size={18} />}
          color="wildtrackMaroon"
          disabled={!candidates.length || !storageReady || batchRunning || copying || archiving || action === 'retry'}
          loading={archiving || batchRunning || copying}
          onClick={confirmArchiveAccepted}
        >
          {checkingBatch ? 'Checking PDFs…' : copying || batch?.state === 'ARCHIVING' ? 'Archiving PDFs…' : `Archive accepted finals (${candidates.length})`}
        </Button>
      </header>

      {batch ? <Alert color={batchRunning || batch.state === 'READY' ? 'blue' : blockedCount ? 'orange' : 'green'}
        title={checkingBatch ? 'Preparing archive' : batch.state === 'ARCHIVING' ? 'Archiving PDFs' : batch.state === 'READY' ? 'Archive summary ready' : 'Archive batch finished'} role="status" mb="lg">
        <Stack gap="xs">
          <Text size="sm">{checkingBatch ? `${batchItems.filter(item => item.stage !== 'PENDING').length} of ${batchItems.length} responses checked`
            : batch.state === 'READY' ? `${readyCount} ready · ${blockedCount} need attention`
              : `${finishedCount} of ${batchItems.length} responses finished${blockedCount ? ` · ${blockedCount} need attention` : ''}`}</Text>
          {batchRunning ? <>
            <Progress value={batchItems.length ? (checkingBatch ? batchItems.filter(item => item.stage !== 'PENDING').length : finishedCount) / batchItems.length * 100 : 0} />
            <Text size="sm">This runs on the server. You can close the summary or leave this page.</Text>
          </> : null}
          <Group><Button variant="default" size="sm" onClick={() => setPreparationOpen(true)}>View archive summary</Button></Group>
        </Stack>
      </Alert> : null}
      {batchError ? <Alert color="orange" mb="md"><Text size="sm">{batchError}</Text><Button mt="xs" variant="default" size="xs" onClick={checkBatchProgress}>Check saved progress</Button></Alert> : null}

      <Modal opened={preparationOpen} onClose={() => setPreparationOpen(false)}
        title="Archive accepted finals" size="lg" centered>
        <Stack gap="md">
          <Text size="sm">WildTrack checks the submitted PDFs before archiving. This does not run AI Review. Linked Google Forms, Sheets and other files are not copied; their links and other answers stay in the record.</Text>
          {batchRunning || archiving ? <Text size="sm" c="dimmed">You can close this summary. Preparation and archiving continue on the server.</Text> : null}
          {checkingBatch || (archiving && !batch) ? <Text role="status">Checking PDFs: {batchItems.filter(item => item.stage !== 'PENDING').length} of {batchItems.length || candidates.length} responses</Text> : null}
          {batch ? <>
            <Group gap="sm"><Badge color="blue" variant="light">{readyCount} ready</Badge>
              <Badge color={blockedCount ? 'orange' : 'gray'} variant="light">Needs attention: {blockedCount}</Badge></Group>
            {batchItems.map(item => {
              const label = { PENDING: 'Waiting', READY: 'Ready', BLOCKED: 'Needs attention', COPYING: 'Copying PDFs', COMPLETE: 'Archived' }[item.stage] || item.stage;
              return <Paper key={item.responseId} withBorder p="sm" radius="sm">
                <Stack gap="xs">
                  <Group justify="space-between" align="flex-start"><Text fw={600} style={{ overflowWrap: 'anywhere', flex: 1 }}>{item.studentName} · {item.deliverableTitle || 'Submission'}</Text>
                    <Badge variant="light" color={item.stage === 'COMPLETE' ? 'green' : item.stage === 'BLOCKED' ? 'orange' : 'blue'}>{label}</Badge></Group>
                  <Text size="sm">{item.message}</Text>
                  {item.pdfCount > 0 ? <Text size="sm" c="dimmed">{item.pdfCount} PDF{item.pdfCount === 1 ? '' : 's'}</Text> : null}
                  {item.stage === 'BLOCKED' ? <Button component={Link} to={`/review?response=${encodeURIComponent(item.responseId)}`} variant="subtle" size="xs" w="fit-content">Review response</Button> : null}
                </Stack>
              </Paper>;
            })}
          </> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPreparationOpen(false)}>Close</Button>
            {batch?.state === 'READY' ? <Button loading={archiving} disabled={!readyCount || archiving} onClick={archivePrepared}>
              Archive {readyCount} {readyCount === 1 ? 'final' : 'finals'}
            </Button> : null}
          </Group>
        </Stack>
      </Modal>

      {state.archiveStorage && !storageReady ? (
        <Alert
          className="wt-archive-storage-alert"
          role="status"
          icon={<CloudSlash size={21} />}
          color="gray"
          title={state.archiveStorage.configured === false ? 'Archive storage is not connected' : 'Archive storage is unavailable'}
        >
          {state.archiveStorage?.message || 'Archive storage is not ready. New copies cannot be queued. Existing records and available copies remain accessible.'}
        </Alert>
      ) : null}

      {archiveError && loadStatus === 'ready' ? <ResourceBoundary status="ready" error={archiveError} onRetry={refreshArchive} /> : null}
      {loadStatus === 'loading' ? (
        <Paper withBorder className="wt-archive-loading" aria-live="polite">
          <Text fw={700}>Loading archive records</Text>
          <Skeleton height={42} mt="md" />
          <Skeleton height={190} mt="sm" />
        </Paper>
      ) : loadStatus === 'error' ? (
        <Alert role="alert" icon={<WarningCircle size={20} />} color="red" title="Archive records could not be loaded">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">{archiveError || 'Try loading the archive again.'}</Text>
            {refreshArchive ? <Button variant="outline" color="red" onClick={refreshArchive}>Retry</Button> : null}
          </Stack>
        </Alert>
      ) : (
        <Paper withBorder className="wt-archive-index">
          <div className="wt-archive-index-header">
            <div>
              <Title order={2}>Archive records</Title>
              <Text size="sm" c="dimmed">{filteredArchives.length} record{filteredArchives.length === 1 ? '' : 's'} shown</Text>
            </div>
            <Group gap="lg" className="wt-archive-inline-summary">
              <ArchiveMetric label="Recorded" value={archives.filter((item) => item.lifecycleState !== 'Active').length} />
              <ArchiveMetric label="Waiting" value={candidates.length} />
              <ArchiveMetric label="Stored copies" value={archives.filter((item) => item.lifecycleState !== 'Active' && item.storageStatus === 'Stored').length} />
            </Group>
          </div>

          <div className="wt-archive-toolbar">
            <TextInput
              className="wt-archive-search"
              aria-label="Search archive"
              type="search"
              placeholder="Search project, team, student, adviser"
              leftSection={<MagnifyingGlass size={17} />}
              value={filters.query}
              onChange={(event) => setFilter('query', event.currentTarget.value)}
            />
            <NativeSelect
              aria-label="Deliverable"
              data={withAll('All deliverables', filterOptions.deliverables)}
              value={filters.deliverable}
              onChange={(event) => setFilter('deliverable', event.currentTarget.value)}
            />
            <NativeSelect
              aria-label="Archive status"
              data={withAll('All statuses', filterOptions.statuses)}
              value={filters.status}
              onChange={(event) => setFilter('status', event.currentTarget.value)}
            />
            <NativeSelect
              aria-label="Record view"
              data={[{ value: 'archived', label: 'Archived records' }, { value: 'history', label: 'Inactive history' }, { value: 'all', label: 'All records' }]}
              value={filters.lifecycle}
              onChange={(event) => setFilter('lifecycle', event.currentTarget.value)}
            />
            <Button variant="default" leftSection={<Funnel size={17} />} onClick={() => setAdvancedOpen((value) => !value)}>
              More filters
            </Button>
            {activeFilterCount ? (
              <Button variant="subtle" color="wildtrackMaroon" leftSection={<X size={16} />} onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
          <Group className="wt-archive-filter-meta" justify="space-between">
            <Text size="xs" c="dimmed">
              {activeFilterCount ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}` : 'No filters applied'}
            </Text>
            {filters.lifecycle === 'archived' ? <Text size="xs" c="dimmed">Unarchived records are available in Inactive history.</Text> : null}
          </Group>

          <Collapse in={advancedOpen}>
            <div className="wt-archive-advanced-filters">
              <NativeSelect label="Workspace" data={withAll('All workspaces', filterOptions.workspaces)} value={filters.workspace} onChange={(event) => setFilter('workspace', event.currentTarget.value)} />
              <NativeSelect label="Project" data={withAll('All projects', filterOptions.projects)} value={filters.project} onChange={(event) => setFilter('project', event.currentTarget.value)} />
              <NativeSelect label="Team" data={withAll('All teams', filterOptions.teams)} value={filters.team} onChange={(event) => setFilter('team', event.currentTarget.value)} />
              <NativeSelect label="Student" data={withAll('All students', filterOptions.students)} value={filters.student} onChange={(event) => setFilter('student', event.currentTarget.value)} />
              <NativeSelect label="Adviser" data={withAll('All advisers', filterOptions.advisers)} value={filters.adviser} onChange={(event) => setFilter('adviser', event.currentTarget.value)} />
              <NativeSelect label="Version" data={withAll('All versions', filterOptions.versions)} value={filters.version} onChange={(event) => setFilter('version', event.currentTarget.value)} />
              <TextInput label="Archived on or after" type="date" value={filters.archivedFrom} onChange={(event) => setFilter('archivedFrom', event.currentTarget.value)} />
              <TextInput label="Archived on or before" type="date" value={filters.archivedTo} onChange={(event) => setFilter('archivedTo', event.currentTarget.value)} />
            </div>
          </Collapse>

          <ArchiveIndexTable
            archives={pageRows}
            total={filteredArchives.length}
            allArchiveCount={archives.filter(archive => archiveMatchesFilters(archive, { ...EMPTY_FILTERS, lifecycle: filters.lifecycle })).length}
            page={currentPage}
            pageCount={pageCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            onOpen={(archive) => setSelectedArchiveId(archive.id)}
            onClearFilters={clearFilters}
          />
        </Paper>
      )}

      <ArchiveRecordDrawer
        archive={selectedArchive}
        opened={Boolean(selectedArchive)}
        storageReady={storageReady}
        action={action}
        onVerify={(archive) => runAction('verify', archive)}
        onRetry={(archive) => runAction('retry', archive)}
        onUnarchive={confirmUnarchive}
        onClose={() => setSelectedArchiveId('')}
      />
    </div>
  );
}

function currentCapture(archive, attempt) {
  const sameInstant = (a, b) => Boolean(a && b && !Number.isNaN(Date.parse(a)) && Date.parse(a) === Date.parse(b));
  return archive.lifecycleState === 'Archived' && archive.captureState !== 'LEGACY'
    && archive.attemptId === attempt.id
    && sameInstant(archive.sourceResponseUpdatedAt, attempt.updatedAt || attempt.submittedAt)
    && sameInstant(archive.activeAcceptanceAt, attempt.acceptance?.acceptedAt);
}

function ArchiveMetric({ label, value }) {
  return <div><Text size="xs" c="dimmed">{label}</Text><Text fw={800} className="wt-tabular">{value}</Text></div>;
}

function archiveMatchesFilters(archive, filters) {
  const query = filters.query.trim().toLowerCase();
  const status = getArchiveStatus(archive);
  const archivedDate = String(archive.archivedAt || '').slice(0, 10);
  if (filters.lifecycle === 'archived' && archive.lifecycleState === 'Active') return false;
  if (filters.lifecycle === 'history' && archive.lifecycleState !== 'Active') return false;
  if (filters.workspace && getWorkspaceLabel(archive) !== filters.workspace) return false;
  if (filters.project && getProjectLabel(archive) !== filters.project) return false;
  if (filters.team && archive.teamCode !== filters.team) return false;
  if (filters.student && archive.studentName !== filters.student) return false;
  if (filters.adviser && archive.adviserName !== filters.adviser) return false;
  if (filters.deliverable && archive.deliverableTitle !== filters.deliverable) return false;
  if (filters.version && getArchiveVersion(archive) !== filters.version) return false;
  if (filters.status && status !== filters.status) return false;
  if (filters.archivedFrom && archivedDate < filters.archivedFrom) return false;
  if (filters.archivedTo && archivedDate > filters.archivedTo) return false;
  if (!query) return true;
  return [
    archive.projectTitle,
    archive.softwareName,
    archive.teamCode,
    archive.studentName,
    archive.studentNumber,
    archive.adviserName,
    archive.deliverableTitle,
    archive.filename,
    getArchiveVersion(archive)
  ].some((value) => String(value || '').toLowerCase().includes(query));
}

function buildFilterOptions(archives, workspaces, activeWorkspace) {
  const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  return {
    workspaces: unique([...(workspaces || []).map((item) => item.name || item.id), activeWorkspace?.name, ...archives.map(getWorkspaceLabel)]),
    projects: unique(archives.map(getProjectLabel)),
    teams: unique(archives.map((item) => item.teamCode)),
    students: unique(archives.map((item) => item.studentName)),
    advisers: unique(archives.map((item) => item.adviserName)),
    deliverables: unique(archives.map((item) => item.deliverableTitle)),
    versions: unique(archives.map(getArchiveVersion)),
    statuses: unique(archives.map(getArchiveStatus))
  };
}

function withAll(label, values) {
  return [{ value: '', label }, ...values.map((value) => ({ value, label: value }))];
}
function getWorkspaceLabel(archive) {
  return archive.workspaceName || archive.workspaceId || '';
}

function getProjectLabel(archive) {
  return archive.projectTitle || archive.softwareName || '';
}

function loadArchiveFilters() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ARCHIVE_FILTER_STATE_KEY) || 'null');
    return saved ? { ...EMPTY_FILTERS, ...saved } : EMPTY_FILTERS;
  } catch {
    return EMPTY_FILTERS;
  }
}
