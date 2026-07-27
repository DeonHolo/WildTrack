import { ArrowSquareOut, CheckCircle, MagnifyingGlass, WarningCircle, X } from '@phosphor-icons/react';
import { Button, StatusBadge } from '../ui.jsx';
import { formatDateTime, makeDriveViewUrl } from '../../lib/workflow.js';

export function DocumentCheckDialog({ response, fileLink, open, onClose, onRecheck, rechecking = false }) {
  if (!open || !response) return null;
  const report = response.documentCheck;
  const metadata = report?.metadata;
  const document = report?.document;
  const comparison = report?.templateComparison;
  const missingSections = report?.missingSections || [];
  const successful = report?.status === 'Current' && response.fileCheckStatus === 'COMPLETED';

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !rechecking) onClose();
    }}>
      <section className="modal-panel document-check-dialog" role="dialog" aria-modal="true" aria-labelledby="document-check-title">
        <header className="document-check-header">
          <div>
            <span>Document Check</span>
            <h2 id="document-check-title">{metadata?.name || 'Submitted PDF'}</h2>
            <p>{report?.checkedAt ? `Checked ${formatDateTime(report.checkedAt)}` : 'This document has not been checked yet.'}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close Document Check details" onClick={onClose} disabled={rechecking}>
            <X weight="bold" />
          </button>
        </header>

        <div className={`document-check-overview ${report?.redFlags?.length ? 'attention' : ''}`}>
          {successful && !report?.redFlags?.length ? <CheckCircle weight="regular" /> : <WarningCircle weight="regular" />}
          <div>
            <StatusBadge status={documentCheckStatus(response)} />
            <p>{report?.summary || response.checkSummary || 'No Document Check result is available.'}</p>
          </div>
        </div>

        <section className="document-check-section">
          <h3>File validation</h3>
          <div className="document-check-grid">
            <CheckFact label="Drive access" value={metadata ? 'Accessible' : unavailableValue(response)} ready={Boolean(metadata)} />
            <CheckFact label="File type" value={metadata?.mimeType === 'application/pdf' ? 'PDF' : metadata?.mimeType || 'Not available'} ready={metadata?.mimeType === 'application/pdf'} />
            <CheckFact label="Download" value={metadata ? metadata.canDownload ? 'Allowed' : 'Disabled' : 'Not available'} ready={Boolean(metadata?.canDownload)} />
            <CheckFact label="File size" value={formatBytes(metadata?.size)} ready={Boolean(metadata?.size)} neutral />
            <CheckFact label="PDF integrity" value={document?.readable ? 'Readable' : document?.encrypted ? 'Password protected' : 'Not verified'} ready={Boolean(document?.readable)} />
            <CheckFact label="Pages" value={document ? String(document.pageCount) : 'Not available'} ready={Boolean(document?.pageCount)} neutral />
            <CheckFact label="Readable text" value={document ? `${document.extractedCharacterCount.toLocaleString()} characters` : 'Not available'} ready={Boolean(document?.extractedCharacterCount)} neutral />
            <CheckFact label="Drive modified" value={metadata?.modifiedTime ? formatDateTime(metadata.modifiedTime) : 'Not available'} ready={Boolean(metadata?.modifiedTime)} neutral />
          </div>
        </section>

        <section className="document-check-section">
          <h3>Official template comparison</h3>
          {comparison?.available ? (
            <>
              <div className="document-check-measures">
                <div><span>Template coverage</span><strong>{Math.round(comparison.templateCoverage * 100)}%</strong></div>
                <div><span>Added content</span><strong>{Math.round(comparison.addedContentRatio * 100)}%</strong></div>
                <div><span>Unchanged instructions</span><strong>{comparison.unchangedInstructionCount}</strong></div>
              </div>
              <div className="document-check-findings">
                <h4>Template headings not detected</h4>
                {missingSections.length ? (
                  <ul>{missingSections.map((section) => <li key={section}>{section}</li>)}</ul>
                ) : <p>No missing template headings were detected.</p>}
              </div>
            </>
          ) : (
            <p className="muted-copy">No official template was available for this deliverable when the document was checked.</p>
          )}
        </section>

        {report?.redFlags?.length ? (
          <section className="document-check-section">
            <h3>Findings</h3>
            <div className="status-strip stable">
              {report.redFlags.map((flag) => <StatusBadge key={flag} status={flag} />)}
            </div>
            <p>{report.suggestedAction}</p>
          </section>
        ) : null}

        <div className="inline-alert info document-check-limitation">
          Document Check screens file access, PDF integrity, readable text, and template similarity. It does not grade the submission or replace staff review.
        </div>

        <footer className="document-check-actions">
          {fileLink ? (
            <a className="btn btn-secondary btn-md" href={makeDriveViewUrl(fileLink)} target="_blank" rel="noreferrer">
              <ArrowSquareOut weight="regular" /><span>Open submitted file</span>
            </a>
          ) : null}
          <Button variant="secondary" icon={MagnifyingGlass} loading={rechecking} onClick={onRecheck}>Check again</Button>
          <Button onClick={onClose} disabled={rechecking}>Done</Button>
        </footer>
      </section>
    </div>
  );
}

export function compactMissingSections(sections, visibleCount = 3) {
  const values = sections || [];
  if (!values.length) return '';
  const visible = values.slice(0, visibleCount).join(', ');
  const remaining = values.length - visibleCount;
  return remaining > 0 ? `${visible}... and ${remaining} more` : visible;
}

export function documentCheckStatus(response) {
  if (response?.fileCheckStatus === 'Checking') return 'Checking';
  if (response?.documentCheck?.status === 'Error' || response?.fileCheckStatus === 'Error') return 'Could not check';
  if (response?.documentCheck?.status === 'Unavailable') return 'Not checked';
  if (!response?.documentCheck) return 'Not checked';
  if (response.documentCheck.sourceResponseUpdatedAt !== (response.updatedAt || response.submittedAt)) return 'Outdated';
  if (response.documentCheck.redFlags?.length || response.documentCheck.missingSections?.length) return 'Needs attention';
  return 'Ready for review';
}

function CheckFact({ label, value, ready, neutral = false }) {
  return (
    <div className="document-check-fact">
      {ready || neutral ? <CheckCircle weight="regular" /> : <WarningCircle weight="regular" />}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatBytes(value) {
  if (!value && value !== 0) return 'Not available';
  if (value < 1024) return `${value} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function unavailableValue(response) {
  return response?.documentCheck?.status === 'Unavailable' ? 'API not configured' : 'Not available';
}
