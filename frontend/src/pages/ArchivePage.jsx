import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Collapse,
  Group,
  NativeSelect,
  Paper,
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
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { ArchiveIndexTable } from '../components/archive/ArchiveIndexTable.jsx';
import { ArchiveRecordDrawer } from '../components/archive/ArchiveRecordDrawer.jsx';
import { getArchiveStatus, getArchiveVersion } from '../lib/archive.js';

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
  archivedFrom: '',
  archivedTo: ''
};

export function ArchivePage() {
  const workflow = useWorkflow();
  const [searchParams] = useSearchParams();
  const linkedArchiveId = searchParams.get('record') || '';
  const {
    state,
    activeWorkspace,
    workspaces = [],
    archiveAttempts,
    verifyArchive,
    retryArchive,
    refreshArchive
  } = workflow;
  const [filters, setFilters] = useState(loadArchiveFilters);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedArchiveId, setSelectedArchiveId] = useState(linkedArchiveId);
  const [page, setPage] = useState(1);
  const [archiving, setArchiving] = useState(false);

  const archives = useMemo(
    () => [...(state.archives || [])].sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt)),
    [state.archives]
  );
  const candidates = useMemo(
    () => (state.attempts || []).filter((attempt) => attempt.reviewStatus === 'Accepted' && attempt.archiveStatus !== 'Archived'),
    [state.attempts]
  );
  const filteredArchives = useMemo(
    () => archives.filter((archive) => archiveMatchesFilters(archive, filters)),
    [archives, filters]
  );
  const pageCount = Math.max(1, Math.ceil(filteredArchives.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredArchives.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedArchive = archives.find((archive) => archive.id === selectedArchiveId) || null;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const storageConfigured = Boolean(state.archiveStorage?.configured);
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

  function confirmArchiveAccepted() {
    if (!candidates.length) return;
    modals.openConfirmModal({
      title: `Archive ${candidates.length} accepted finals?`,
      children: (
        <Stack gap="xs">
          <Text size="sm">This records {candidates.length} accepted response{candidates.length === 1 ? '' : 's'} in the final archive.</Text>
          {!storageConfigured ? (
            <Text size="sm" c="dimmed">
              Current archive storage is not connected, so this creates metadata records and keeps each Drive link as a source reference. It does not create independent PDF copies.
            </Text>
          ) : null}
        </Stack>
      ),
      labels: { confirm: `Archive ${candidates.length} finals`, cancel: 'Cancel' },
      confirmProps: { color: 'wildtrackMaroon', loading: archiving },
      onConfirm: async () => {
        setArchiving(true);
        const result = await archiveAttempts(candidates.map((attempt) => attempt.id));
        setArchiving(false);
        if (result?.ok) {
          const count = result.archived ?? candidates.length;
          notifications.show({
            color: 'green',
            title: 'Archive records created',
            message: `${count} accepted final${count === 1 ? '' : 's'} recorded.`
          });
        } else {
          notifications.show({
            color: 'red',
            title: 'Archive failed',
            message: result?.error || 'The accepted finals could not be archived.'
          });
        }
      }
    });
  }

  const loadStatus = state.archiveLoadStatus || 'ready';

  return (
    <div className="wt-archive-page">
      <header className="wt-staff-page-heading wt-archive-heading">
        <div>
          <Text className="wt-eyebrow">Final records</Text>
          <Title order={1}>Final archive</Title>
          <Text c="dimmed">Find accepted final submissions, inspect their metadata, and manage preservation status.</Text>
        </div>
        <Button
          leftSection={<ArchiveIcon size={18} />}
          color="wildtrackMaroon"
          disabled={!candidates.length}
          loading={archiving}
          onClick={confirmArchiveAccepted}
        >
          Archive accepted finals ({candidates.length})
        </Button>
      </header>

      {!storageConfigured ? (
        <Alert
          className="wt-archive-storage-alert"
          role="status"
          icon={<CloudSlash size={21} />}
          color="gray"
          title="Independent archive storage is not connected"
        >
          WildTrack currently records archive metadata and keeps the submitted Drive link as its source reference. It does not yet preserve an independent PDF copy. Connect Cloudflare R2 or another S3-compatible service before relying on this as permanent file storage.
        </Alert>
      ) : null}

      {loadStatus === 'loading' ? (
        <Paper withBorder className="wt-archive-loading" aria-live="polite">
          <Text fw={700}>Loading archive records</Text>
          <Skeleton height={42} mt="md" />
          <Skeleton height={190} mt="sm" />
        </Paper>
      ) : loadStatus === 'error' ? (
        <Alert role="alert" icon={<WarningCircle size={20} />} color="red" title="Archive records could not be loaded">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">{state.archiveLoadError || 'Try loading the archive again.'}</Text>
            {refreshArchive ? <Button variant="outline" color="red" onClick={refreshArchive}>Retry</Button> : null}
          </Stack>
        </Alert>
      ) : (
        <Paper withBorder className="wt-archive-index">
          <div className="wt-archive-index-header">
            <div>
              <Title order={2}>Archive records</Title>
              <Text size="sm" c="dimmed">{filteredArchives.length} of {archives.length} final record{archives.length === 1 ? '' : 's'}</Text>
            </div>
            <Group gap="lg" className="wt-archive-inline-summary">
              <ArchiveMetric label="Recorded" value={archives.length} />
              <ArchiveMetric label="Waiting" value={candidates.length} />
              <ArchiveMetric label="Stored copies" value={archives.filter((item) => item.storageStatus === 'Stored').length} />
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
            allArchiveCount={archives.length}
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
        storageConfigured={storageConfigured}
        onClose={() => setSelectedArchiveId('')}
        onVerify={verifyArchive}
        onRetry={retryArchive}
      />
    </div>
  );
}

function ArchiveMetric({ label, value }) {
  return <div><Text size="xs" c="dimmed">{label}</Text><Text fw={800} className="wt-tabular">{value}</Text></div>;
}

function archiveMatchesFilters(archive, filters) {
  const query = filters.query.trim().toLowerCase();
  const status = getArchiveStatus(archive);
  const archivedDate = String(archive.archivedAt || '').slice(0, 10);
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