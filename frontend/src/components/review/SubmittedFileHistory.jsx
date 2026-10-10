import { Alert, Button, Group, Loader } from '@mantine/core';
import { useEffect, useState } from 'react';
import { getSubmittedFileHistory, startDriveHistoryConsent } from '../../lib/api.js';
import { historyDate, newestHistoryEntries, observationTime } from '../../lib/fileHistoryPresentation.js';
import { DriveIdentityValue } from './DriveIdentityValue.jsx';
import { ObservedFileHistory } from './ObservedFileHistory.jsx';

function readableBytes(bytes) {
  if (bytes == null || bytes === '') return 'Unavailable';
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return 'Unavailable';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return size < 1024 ? `${size} bytes` : `${(size / 1024).toFixed(1)} KB`;
}

// Switching the scoped file discards the previous file's page and opaque tokens.
export function SubmittedFileHistory(props) {
  const scopeKey = JSON.stringify([props.workspaceId, props.responseId, props.fieldId]);
  return <FileHistoryContent key={scopeKey} {...props} />;
}

function FileHistoryContent({ workspaceId, responseId, fieldId, observedHistory, audience = 'staff', initialHistory = null, initialLoading = false, onRefresh, refreshing = false }) {
  const studentView = audience === 'student';
  const [pageTokens, setPageTokens] = useState(['']);
  const [pageIndex, setPageIndex] = useState(0);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const token = pageTokens[pageIndex] || '';

  useEffect(() => {
    if (!workspaceId || !responseId || !fieldId) {
      setLoading(false);
      setHistory(null);
      setError('Choose a submitted PDF to view its history.');
      return undefined;
    }
    let current = true;
    if (pageIndex === 0 && initialHistory) {
      setHistory(initialHistory);
      setError('');
      setLoading(false);
      return () => { current = false; };
    }
    if (pageIndex === 0 && initialLoading) {
      setLoading(true);
      setError('');
      setHistory(null);
      return () => { current = false; };
    }
    setLoading(true);
    setError('');
    setHistory(null);
    getSubmittedFileHistory(workspaceId, responseId, fieldId, token)
      .then(result => { if (current) setHistory(result); })
      .catch(failure => { if (current) setError(failure.message || 'File history could not be loaded.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [workspaceId, responseId, fieldId, token, pageIndex, initialHistory, initialLoading]);

  const revisions = newestHistoryEntries(history?.revisions, revision => revision.modifiedTime);
  const latest = newestHistoryEntries(observedHistory?.observations, observationTime)[0];
  const metadata = history?.fileMetadata;
  const owner = metadata?.driveOwner || metadata?.driveOwnerStudent ? metadata : latest;
  const editor = metadata?.lastModifiedBy || metadata?.lastModifiedByStudent ? metadata : latest;
  const status = history?.status || 'UNAVAILABLE';
  const hasRevisions = ['AVAILABLE', 'INCOMPLETE'].includes(status);

  return (
    <div className="file-history" aria-label="Submitted file history">
      {!studentView ? <section className="file-history-overview" aria-label="File details">
        <h3>File details</h3>
        <dl className="file-history-facts">
          <div><dt>Owner</dt><dd><DriveIdentityValue registeredStudent={owner?.driveOwnerStudent} providerValue={owner?.driveOwner} /></dd></div>
          <div><dt>Last modified by</dt><dd><DriveIdentityValue
            registeredStudent={editor === metadata ? metadata?.lastModifiedByStudent : latest?.modifiedByStudent}
            providerValue={editor === metadata ? metadata?.lastModifiedBy : latest?.modifiedBy || latest?.modifiedByEmail} /></dd></div>
          <div><dt>Drive edit time</dt><dd>{historyDate(metadata?.lastModifiedTime || latest?.driveModifiedTime)}</dd></div>
          <div><dt>Last recorded check</dt><dd>{historyDate(latest && observationTime(latest))}</dd></div>
        </dl>
        <p className="file-history-caption">{metadata ? 'Available details from Google Drive; recorded checks remain unchanged.' : 'Details from the last recorded check; newer Drive details may be unavailable.'}</p>
      </section> : null}

      {!studentView ? observedHistory ? <ObservedFileHistory history={observedHistory} />
        : <section className="file-history-section" aria-label="WildTrack observations"><h3>Recorded checks</h3>
          <p className="file-history-empty">WildTrack observed history is unavailable for this file.</p></section> : null}

      <section className="file-history-section" aria-label="Google Drive revision metadata">
        <div className="file-history-section-heading">
          <h3>Google Drive edits</h3>
          {onRefresh ? <Button variant="default" size="sm" mih={44} loading={refreshing} disabled={loading || refreshing}
            onClick={() => { setPageIndex(0); setPageTokens(['']); onRefresh(); }}>Refresh history</Button> : null}
        </div>
        <p className="file-history-caption">{studentView
          ? 'Edits Google returns for your submitted PDF. Owner and editor identities are hidden.'
          : 'Edits returned by Google, separate from WildTrack’s recorded checks.'}</p>

        {loading ? <Group role="status" gap="xs" className="file-history-state"><Loader size="xs" /><span>Loading file history…</span></Group> : null}
        {error ? <Alert color="orange" role="alert">{error}</Alert> : null}
        {!loading && !error && !hasRevisions ? <div className="file-history-state" role="status">
          <h4>Drive edit history unavailable</h4>
          <p>{history?.coverageMessage || (status === 'NOT_CONNECTED'
            ? 'No submitter of this file currently has usable Drive history access. An owner or editor may authorize access when signing in.'
            : status === 'PERMISSION_DENIED' ? 'Connected submitters currently lack permission to read the file revisions.'
              : 'Google Drive revision history is currently unavailable for this submitted file.')}</p>
          {studentView && status === 'NOT_CONNECTED' ? <Button mt="sm" variant="default" mih={44} size="sm"
            onClick={async () => {
              try { await startDriveHistoryConsent(); }
              catch (failure) { setError(failure.message || 'Drive consent could not be started.'); }
            }}>
            Optionally allow Drive metadata
          </Button> : null}
        </div> : null}

        {!loading && !error && hasRevisions ? <>
          {revisions.length ? <>
            <p className="file-history-caption">Page {pageIndex + 1} · {revisions.length} {revisions.length === 1 ? 'edit' : 'edits'} · Newest first on this page</p>
            <ol className="file-history-timeline" aria-label="Google Drive edits">
              {revisions.map((revision, index) => <li key={revision.id || `${revision.modifiedTime}-${index}`}
                className="file-history-entry" role="group" aria-label={`Drive revision ${index + 1} on page ${pageIndex + 1}`}>
                <div className="file-history-entry-heading"><h4>PDF revision</h4>
                  <span className="file-history-date">{historyDate(revision.modifiedTime)}</span></div>
                <p>{revision.mimeType === 'application/pdf' ? 'PDF' : revision.mimeType || 'File type unavailable'} · {readableBytes(revision.size)}</p>
                {!studentView ? <div className="file-history-editor"><span>Modified by</span><DriveIdentityValue
                  providerValue={revision.modifiedBy && revision.modifiedByEmail && !revision.modifiedBy.includes(revision.modifiedByEmail)
                    ? `${revision.modifiedBy} (${revision.modifiedByEmail})` : revision.modifiedBy || revision.modifiedByEmail} /></div> : null}
              </li>)}
            </ol>
          </> : <p className="file-history-empty">No Google Drive revisions were returned for this submitted file.</p>}
          {pageIndex > 0 || history?.nextPageToken ? <Group justify="space-between" gap="sm" wrap="wrap" className="file-history-pagination">
            <Button variant="default" size="sm" mih={44} disabled={pageIndex === 0} onClick={() => setPageIndex(index => index - 1)}>Previous page</Button>
            <span>Page {pageIndex + 1}</span>
            <Button variant="default" size="sm" mih={44} disabled={!history?.nextPageToken} onClick={() => {
              if (!history?.nextPageToken) return;
              setPageTokens(current => [...current.slice(0, pageIndex + 1), history.nextPageToken]);
              setPageIndex(index => index + 1);
            }}>Next page</Button>
          </Group> : null}
        </> : null}
      </section>
      <p className="file-history-limit">{studentView
        ? 'This history can be incomplete. Earlier edits may be unavailable because of file permissions, access changes, or Google retention.'
        : 'Recorded checks cover only WildTrack inspections. Google may omit older edits or identities; neither list proves authorship or a complete editing history.'}</p>
    </div>
  );
}
