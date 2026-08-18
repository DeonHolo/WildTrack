import { useMemo, useState } from 'react';
import { Archive as ArchiveIcon, ArrowSquareOut, CloudSlash, Copy, ShieldCheck } from '@phosphor-icons/react';
import { Button, ConfirmDialog, DataTable, EmptyState, PageHeader, SearchBox, StatusBadge } from '../components/ui.jsx';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { formatDateTime, makeDriveViewUrl } from '../lib/workflow.js';

const PAGE_SIZE = 25;

export function ArchivePage() {
  const { state, archiveAttempts } = useWorkflow();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkConfirmation, setBulkConfirmation] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [query, setQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('All teams');
  const [deliverableFilter, setDeliverableFilter] = useState('All deliverables');
  const [selectedArchiveId, setSelectedArchiveId] = useState('');
  const [page, setPage] = useState(1);

  const archiveCandidates = useMemo(
    () => state.attempts.filter((attempt) => attempt.reviewStatus === 'Accepted' && attempt.archiveStatus !== 'Archived'),
    [state.attempts]
  );
  const orderedArchives = useMemo(
    () => [...state.archives].sort((first, second) => new Date(second.archivedAt) - new Date(first.archivedAt)),
    [state.archives]
  );
  const teamOptions = useMemo(
    () => [...new Set(orderedArchives.map((archive) => archive.teamCode).filter(Boolean))].sort(),
    [orderedArchives]
  );
  const deliverableOptions = useMemo(
    () => [...new Set(orderedArchives.map((archive) => archive.deliverableTitle).filter(Boolean))].sort(),
    [orderedArchives]
  );
  const filteredArchives = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orderedArchives.filter((archive) => {
      if (teamFilter !== 'All teams' && archive.teamCode !== teamFilter) return false;
      if (deliverableFilter !== 'All deliverables' && archive.deliverableTitle !== deliverableFilter) return false;
      if (!needle) return true;
      return [
        archive.projectTitle,
        archive.softwareName,
        archive.teamCode,
        archive.studentName,
        archive.deliverableTitle,
        archive.adviserName
      ].some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [deliverableFilter, orderedArchives, query, teamFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredArchives.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredArchives.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedArchive = filteredArchives.find((archive) => archive.id === selectedArchiveId) || pageRows[0] || null;

  async function archiveAllAccepted() {
    setArchiving(true);
    await archiveAttempts(archiveCandidates.map((attempt) => attempt.id));
    setArchiving(false);
    setBulkOpen(false);
    setBulkConfirmation('');
  }

  async function copyValue(value) {
    await navigator.clipboard?.writeText(value || '');
  }

  function changeQuery(value) {
    setQuery(value);
    setPage(1);
  }

  return (
    <div className="page-stack archive-page">
      <PageHeader
        title="Final Archive"
        description="Search accepted final records, inspect preservation metadata, and prepare independent PDF copies."
        actions={(
          <Button icon={ArchiveIcon} disabled={!archiveCandidates.length} onClick={() => setBulkOpen(true)}>
            Archive all accepted ({archiveCandidates.length})
          </Button>
        )}
      />

      <section className="archive-storage-placeholder" aria-label="Archive storage status">
        <CloudSlash weight="regular" aria-hidden="true" />
        <div>
          <span>Archive storage not configured</span>
          <strong>Independent PDF preservation is not active yet.</strong>
          <p>Current archive actions create metadata records only. Connect Cloudflare R2 or another S3-compatible service before using WildTrack as the permanent file archive.</p>
        </div>
        <StatusBadge status="Not configured" />
      </section>

      <section className="archive-summary-grid" aria-label="Archive summary">
        <ArchiveMetric label="Recorded finals" value={orderedArchives.length} />
        <ArchiveMetric label="Waiting for archive" value={archiveCandidates.length} />
        <ArchiveMetric label="Independent copies" value={0} />
      </section>

      <section className="panel archive-index-panel">
        <div className="panel-header">
          <div>
            <h2>Archive index</h2>
            <p>{filteredArchives.length} matching record{filteredArchives.length === 1 ? '' : 's'} across accepted final submissions.</p>
          </div>
        </div>

        <div className="archive-toolbar">
          <SearchBox value={query} onChange={changeQuery} placeholder="Search project, team, student, adviser" />
          <select value={deliverableFilter} onChange={(event) => { setDeliverableFilter(event.target.value); setPage(1); }} aria-label="Filter by deliverable">
            <option>All deliverables</option>
            {deliverableOptions.map((deliverable) => <option key={deliverable}>{deliverable}</option>)}
          </select>
          <select value={teamFilter} onChange={(event) => { setTeamFilter(event.target.value); setPage(1); }} aria-label="Filter by team">
            <option>All teams</option>
            {teamOptions.map((team) => <option key={team}>{team}</option>)}
          </select>
        </div>

        {selectedArchive ? (
          <div className="archive-detail-band">
            <div className="archive-detail-heading">
              <div>
                <span>Selected archive record</span>
                <strong>{selectedArchive.softwareName || selectedArchive.projectTitle || selectedArchive.teamCode}</strong>
                <small>{selectedArchive.teamCode} | {selectedArchive.deliverableTitle} | {selectedArchive.studentName}</small>
              </div>
              <StatusBadge status="Metadata only" />
            </div>
            <dl className="archive-detail-grid">
              <div><dt>Recorded</dt><dd>{formatDateTime(selectedArchive.archivedAt)}</dd></div>
              <div><dt>Adviser</dt><dd>{selectedArchive.adviserName || 'Not recorded'}</dd></div>
              <div className="archive-detail-wide"><dt>Planned storage key</dt><dd className="mono-cell">{selectedArchive.storageKey}</dd></div>
              <div className="archive-detail-wide"><dt>Record hash</dt><dd className="hash-cell">{selectedArchive.sha256}</dd></div>
            </dl>
            <div className="row-action-group archive-detail-actions">
              {selectedArchive.sourceLink ? (
                <a className="btn btn-secondary btn-sm" href={makeDriveViewUrl(selectedArchive.sourceLink)} target="_blank" rel="noreferrer">
                  <ArrowSquareOut weight="regular" /><span>Open source link</span>
                </a>
              ) : null}
              <Button size="sm" variant="secondary" icon={Copy} onClick={() => copyValue(selectedArchive.storageKey)}>Copy storage key</Button>
              <Button size="sm" variant="secondary" icon={Copy} onClick={() => copyValue(selectedArchive.sha256)}>Copy hash</Button>
            </div>
          </div>
        ) : null}

        {pageRows.length ? (
          <>
            <DataTable columns={['Project', 'Team', 'Deliverable', 'Student', 'Recorded', 'Storage', 'Actions']} minWidth={940} className="archive-table">
              {pageRows.map((archive) => (
                <tr
                  key={archive.id}
                  className={selectedArchive?.id === archive.id ? 'selected-row' : ''}
                  onClick={() => setSelectedArchiveId(archive.id)}
                >
                  <td><strong>{archive.softwareName || 'Project'}</strong><small>{archive.projectTitle || 'Project metadata not loaded'}</small></td>
                  <td>{archive.teamCode}</td>
                  <td>{archive.deliverableTitle}</td>
                  <td>{archive.studentName}</td>
                  <td>{formatDateTime(archive.archivedAt)}</td>
                  <td><StatusBadge status="Metadata only" /></td>
                  <td>
                    <div className="row-action-group">
                      <Button size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); setSelectedArchiveId(archive.id); }}>Details</Button>
                      {archive.sourceLink ? (
                        <a className="btn btn-secondary btn-sm" href={makeDriveViewUrl(archive.sourceLink)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                          <ArrowSquareOut weight="regular" /><span>Open</span>
                        </a>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
            <div className="tracker-pagination archive-pagination">
              <span>Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredArchives.length)} of {filteredArchives.length}</span>
              <div>
                <Button size="sm" variant="secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                <strong>Page {currentPage} of {pageCount}</strong>
                <Button size="sm" variant="secondary" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title={orderedArchives.length ? 'No archive records match' : 'No final archive records yet'}
            description={orderedArchives.length ? 'Clear a filter or search for another project, team, or student.' : 'Accept a response in Review, then record it here. Permanent PDF storage begins after archive storage is configured.'}
          />
        )}
      </section>

      <ConfirmDialog
        open={bulkOpen}
        title="Archive every accepted response?"
        description="This creates archive metadata for every accepted response that has not yet been recorded. No independent PDF copy is created until archive storage is configured."
        confirmLabel={`Archive ${archiveCandidates.length} responses`}
        confirmText="ARCHIVE"
        confirmationValue={bulkConfirmation}
        onConfirmationValueChange={setBulkConfirmation}
        loading={archiving}
        onClose={() => { if (!archiving) { setBulkOpen(false); setBulkConfirmation(''); } }}
        onConfirm={archiveAllAccepted}
      >
        <strong>{archiveCandidates.length} accepted responses are ready</strong>
        <span>Already archived responses are skipped. Pending responses are not included.</span>
      </ConfirmDialog>
    </div>
  );
}

function ArchiveMetric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
