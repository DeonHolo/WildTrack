import { useEffect, useRef, useState } from 'react';
import { Alert, Button, FileInput, Modal, NativeSelect, ScrollArea } from '@mantine/core';
import { DownloadSimple, FileArrowUp } from '@phosphor-icons/react';
import { applyWorkspaceWorkbook, downloadWorkspaceWorkbook, previewWorkspaceWorkbook } from '../../lib/api.js';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope.js';
import './WorkspaceWorkbookImport.css';

export function WorkspaceWorkbookImport({ workspaceId, onImported }) {
  const isCurrentScope = useWorkspaceScope(workspaceId);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [resolutions, setResolutions] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const attempt = useRef(null);
  const conflicts = (preview?.changes || []).flatMap(row => row.fields || []).filter(field => field.conflict);
  const unresolved = conflicts.filter(field => !['SOURCE', 'LOCAL'].includes(resolutions[field.key]));

  useEffect(() => {
    setFile(null); setPreview(null); setResolutions({}); setBusy(''); setError('');
    setResult(null); setUncertain(false); setStale(false); attempt.current = null;
  }, [workspaceId]);

  async function download() {
    const current = isCurrentScope;
    setBusy('download'); setError('');
    try {
      const blob = await downloadWorkspaceWorkbook(workspaceId);
      if (!current()) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'WildTrack_Workspace_Template.xlsx';
      document.body.append(link); link.click(); link.remove();
      // Keep the URL alive while the browser writes the downloaded file.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (failure) {
      if (current()) setError(failure.message || 'The Excel template could not be downloaded.');
    } finally { if (current()) setBusy(''); }
  }

  async function inspect() {
    if (!file || busy) return;
    setError(''); setResult(null);
    if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setError('Choose an .xlsx workbook of 5 MB or less.'); return;
    }
    const current = isCurrentScope;
    setBusy('preview');
    try {
      const next = await previewWorkspaceWorkbook(workspaceId, file);
      if (!current()) return;
      setPreview(next); setResolutions({}); setUncertain(false); setStale(false); attempt.current = null;
    } catch (failure) {
      if (current()) setError(failure.message || 'The workbook could not be checked.');
    } finally { if (current()) setBusy(''); }
  }

  async function apply() {
    if (!preview || busy || stale || preview.errors?.length || unresolved.length) return;
    const current = isCurrentScope;
    // An unconfirmed response is retried with the same persisted preview and choices.
    attempt.current ||= { previewId: preview.previewId, resolutions: { ...resolutions } };
    setBusy('apply'); setError('');
    try {
      const saved = await applyWorkspaceWorkbook(workspaceId, attempt.current.previewId, attempt.current.resolutions);
      if (!current()) return;
      setResult(saved); setPreview(null); setFile(null); setUncertain(false); attempt.current = null;
      Promise.resolve(onImported?.()).catch(() => {
        if (current()) setError('The import was saved. Reload Workspace to see the updated records.');
      });
    } catch (failure) {
      if (!current()) return;
      const unknown = !failure.status || failure.status >= 500;
      setUncertain(unknown);
      setStale(failure.status === 409 || failure.status === 410);
      if (!unknown) attempt.current = null;
      setError(failure.message || 'The import result could not be confirmed.');
    } finally { if (current()) setBusy(''); }
  }

  function close() { if (!busy) { setPreview(null); setError(''); } }
  return (
    <div className="wt-workbook-import">
      <div className="wt-workbook-title">
        <div>
          <h3>Import Excel workbook</h3>
          <p>Start with the Students tab. Student Number, Student Name and Team Code are required. Teams and Projects and Deliverables are optional tabs.</p>
        </div>
        <Button variant="default" leftSection={<DownloadSimple size={18} />} onClick={download}
          loading={busy === 'download'} disabled={Boolean(busy) && busy !== 'download'}>Download Excel template</Button>
      </div>
      <div className="wt-workbook-upload">
        <FileInput label="Excel workbook (.xlsx)" description="Up to 5 MB" accept=".xlsx" clearable
          value={file} onChange={next => { setFile(next); setError(''); setResult(null); }} disabled={Boolean(busy)} />
        <Button color="wildtrackMaroon" leftSection={<FileArrowUp size={18} />} onClick={inspect}
          loading={busy === 'preview'} disabled={!file || Boolean(busy) && busy !== 'preview'}>Preview import</Button>
      </div>
      {error && !preview ? <Alert color="red" role="alert">{error}</Alert> : null}
      {result ? <Alert color="green" role="status" title="Workbook imported">
        {result.addedRows} added · {result.changedRows} updated · {result.unchangedRows} unchanged.
      </Alert> : null}
      <Modal opened={Boolean(preview)} onClose={close} title="Review workbook import" size="xl" centered
        className="wt-workbook-modal" scrollAreaComponent={ScrollArea.Autosize}
        closeOnClickOutside={!busy && !uncertain} closeOnEscape={!busy && !uncertain} withCloseButton={!busy}>
        {preview ? <>
          <p className="wt-workbook-filename">{preview.filename}</p>
          <p>No records change until you apply this preview. Omitted rows and blank optional cells keep their saved values. Submissions, AI Review results, decisions and account links are kept.</p>
          <div className="wt-workbook-counts">
            <span><strong>{preview.addedRows}</strong> to add</span>
            <span><strong>{preview.changedRows}</strong> to update</span>
            <span><strong>{preview.unchangedRows}</strong> unchanged</span>
          </div>
          {preview.errors?.length ? <Alert color="red" title="Fix the workbook before importing" role="alert">
            <ul>{preview.errors.map((issue, index) => <li key={index}>{issue.sheet}{issue.rowNumber ? `, row ${issue.rowNumber}` : ''}: {issue.message}</li>)}</ul>
          </Alert> : null}
          {preview.warnings?.length ? <Alert color="yellow"><ul>{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></Alert> : null}
          <div className="wt-workbook-changes">
            {(preview.changes || []).map(row => <section className="wt-workbook-change" key={row.key}>
              <h3>{row.label || row.rowKey}</h3>
              <p>{row.sheet}, row {row.rowNumber} · {row.kind === 'ADD' ? 'New record' : 'Update'}</p>
              {(row.fields || []).map(field => <div className="wt-workbook-field" key={field.key}>
                <div><strong>{field.label}</strong>
                  <span>Saved: {field.before || '—'}</span><span>Workbook: {field.after || '—'}</span></div>
                {field.conflict ? <NativeSelect label="Use which value?" aria-label={`${row.label || row.rowKey}: ${field.label}`}
                  value={resolutions[field.key] || ''} disabled={Boolean(busy) || uncertain}
                  onChange={event => { const value = event.currentTarget.value; setResolutions(values => ({ ...values, [field.key]: value })); }}
                  data={[{ value: '', label: 'Choose a value' }, { value: 'SOURCE', label: 'Use workbook value' }, { value: 'LOCAL', label: 'Keep saved value' }]} /> : null}
              </div>)}
            </section>)}
          </div>
          {unresolved.length ? <p role="status">Choose a value for {unresolved.length} conflicting field{unresolved.length === 1 ? '' : 's'}.</p> : null}
          {error ? <Alert color="red" role="alert">{error}</Alert> : null}
          {stale ? <p>Close this preview, then select Preview import again.</p> : null}
          {uncertain ? <Alert color="yellow">The request may have finished. Check its saved result before starting another import.</Alert> : null}
          <div className="wt-workbook-actions">
            <Button variant="default" onClick={close} disabled={Boolean(busy)}>Close</Button>
            <Button color="wildtrackMaroon" onClick={apply} loading={busy === 'apply'}
              disabled={Boolean(busy) && busy !== 'apply' || Boolean(preview.errors?.length) || Boolean(unresolved.length) || stale}>
              {uncertain ? 'Check import result' : 'Apply import'}
            </Button>
          </div>
        </> : null}
      </Modal>
    </div>
  );
}
