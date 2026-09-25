import { ActionIcon, Alert, Badge, Modal, Tabs, Tooltip } from '@mantine/core';
import { useEffect, useState } from 'react';
import { ArrowSquareOut, CheckCircle, Info, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react';
import { Button, StatusIndicator } from '../ui.jsx';
import { formatDateTime, makeDriveViewUrl, submissionSubstanceStatus } from '../../lib/workflow.js';
import { ObservedFileHistory } from './ObservedFileHistory.jsx';
import { SubmittedFileHistory } from './SubmittedFileHistory.jsx';
import { getSubmittedFileHistory } from '../../lib/api.js';

export function DocumentCheckDialog({
  response,
  documentCheck = null,
  observedHistory = null,
  historyTarget = null,
  initialTab = 'result',
  historyOnly = false,
  fileLink,
  open,
  onClose,
  onRecheck,
  rechecking = false,
  error = '',
  audience = 'staff',
  allowRecheck = true
}) {
  const [tab, setTab] = useState(initialTab);
  const [sharedHistory, setSharedHistory] = useState(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const targetKey = historyTarget ? `${historyTarget.workspaceId}:${historyTarget.responseId}:${historyTarget.fieldId}` : '';
  useEffect(() => {
    if (!open || !historyTarget?.workspaceId || !historyTarget?.responseId || !historyTarget?.fieldId || !fileLink) {
      setSharedHistory(null);
      return undefined;
    }
    let active = true;
    setSharedHistory({ key: targetKey, loading: true, data: null });
    getSubmittedFileHistory(historyTarget.workspaceId, historyTarget.responseId, historyTarget.fieldId)
      .then(data => { if (active) setSharedHistory({ key: targetKey, loading: false, data }); })
      .catch(() => { if (active) setSharedHistory({ key: targetKey, loading: false, data: null }); });
    return () => { active = false; };
  }, [open, targetKey, fileLink, historyRefresh]);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab, response?.id, historyTarget?.fieldId]);
  if (!response) return null;
  const report = documentCheck || response.documentCheck;
  const studentView = audience === 'student';
  const showResult = !historyOnly;
  const historyAvailable = Boolean(historyTarget && fileLink) || (!studentView && Boolean(observedHistory));
  const effectiveResponse = documentCheck ? { ...response, documentCheck } : response;
  const metadata = report?.metadata;
  const document = report?.document;
  const comparison = report?.templateComparison;
  const missingSections = report?.missingSections || [];
  const expectedSectionCount = comparison?.expectedTemplateHeadings?.length || 0;
  const detectedSectionCount = comparison?.detectedTemplateHeadings?.length || 0;
  const currentStatus = documentCheckStatus(effectiveResponse);
  const successful = currentStatus === 'Ready for review' || currentStatus === 'Looks substantially filled';
  const substanceStatus = submissionSubstanceStatus(report);
  const overviewNeedsAttention = substanceStatus
    ? substanceStatus !== 'Looks substantially filled'
    : Boolean(report?.redFlags?.length || report?.missingSections?.length);
  const latestObservation = studentView ? null : observedHistory?.observations?.[0];
  const sharedMetadata = sharedHistory?.key === targetKey && open ? sharedHistory?.data?.fileMetadata : null;
  const ownerSource = sharedMetadata?.driveOwner || sharedMetadata?.driveOwnerStudent
    ? sharedMetadata : latestObservation;
  const editorSource = sharedMetadata?.lastModifiedBy || sharedMetadata?.lastModifiedByStudent
    ? sharedMetadata : latestObservation;
  const ownerDisplay = ownerSource === sharedMetadata ? sharedMetadata?.driveOwner : latestObservation?.driveOwner;
  const editorDisplay = editorSource === sharedMetadata ? sharedMetadata?.lastModifiedBy : latestObservation?.modifiedBy;
  const ownerStudent = ownerSource === sharedMetadata ? sharedMetadata?.driveOwnerStudent : latestObservation?.driveOwnerStudent;
  const editorStudent = editorSource === sharedMetadata ? sharedMetadata?.lastModifiedByStudent : latestObservation?.modifiedByStudent;
  const checkExplanation = studentView
    ? 'Document Check checks whether your PDF can be accessed and read and whether it appears substantially filled. It does not grade your work or decide whether it is accepted.'
    : 'Document Check verifies file access and readability, then screens whether the PDF appears substantially filled. Template structure is supporting evidence only. It does not grade the submission or replace staff review.';

  const title = (
    <div className="document-check-title">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{historyOnly ? 'File history' : 'Document Check'}</span>
        {!historyOnly ? (
          <Tooltip label={checkExplanation} multiline w={320} withArrow events={{ hover: true, focus: true, touch: true }}>
            <ActionIcon variant="subtle" size={24} radius="sm" color="gray" aria-label="About Document Check">
              <Info size={16} aria-hidden="true" />
            </ActionIcon>
          </Tooltip>
        ) : null}
      </div>
      <h2>{metadata?.name || 'Submitted PDF'}</h2>
      {!historyOnly ? <p>{report?.checkedAt ? `Checked ${formatDateTime(report.checkedAt)}` : 'This document has not been checked yet.'}</p> : null}
    </div>
  );

  return (
    <Modal
      opened={open}
      onClose={onClose}
      title={title}
      size="xl"
      centered
      closeOnClickOutside={!rechecking}
      closeOnEscape={!rechecking}
      withCloseButton={!rechecking}
      transitionProps={{ duration: 0 }}
      classNames={{ content: 'document-check-dialog', body: 'document-check-body', header: 'document-check-header' }}
      closeButtonProps={{ 'aria-label': 'Close Document Check details' }}
    >
      {error ? <Alert color="red" role="alert">{error}</Alert> : null}
      <Tabs value={historyOnly ? 'history' : tab} onChange={setTab} className="document-check-tabs">
        {showResult && historyAvailable ? (
          <Tabs.List>
            <Tabs.Tab value="result">Check result</Tabs.Tab>
            <Tabs.Tab value="history">File history</Tabs.Tab>
          </Tabs.List>
        ) : null}

        {showResult ? <Tabs.Panel value="result" pt={studentView ? 0 : 'md'}>
          <div className={'document-check-overview ' + (overviewNeedsAttention ? 'attention' : '')}>
            {successful && !overviewNeedsAttention ? <CheckCircle weight="regular" aria-hidden="true" /> : <WarningCircle weight="regular" aria-hidden="true" />}
            <div>
              <StatusIndicator status={studentView ? studentDocumentCheckStatus(effectiveResponse) : currentStatus} />
              <p>{studentView ? studentSummary(report, effectiveResponse) : report?.summary || effectiveResponse.checkSummary || 'No Document Check result is available.'}</p>
            </div>
          </div>

          <details className="document-check-details" open={!report?.submissionSubstance}>
            <summary>{report?.submissionSubstance ? 'View details' : 'Check details'}</summary>
            <div className="document-check-details-body">
            <section className="document-check-section">
              <h3>File validation</h3>
              <div className="document-check-grid">
              <CheckFact label="Drive access" value={metadata ? 'Accessible' : unavailableValue(response)} ready={Boolean(metadata)} />
              <CheckFact label="File type" value={metadata?.mimeType === 'application/pdf' ? 'PDF' : metadata?.mimeType || 'Not available'} ready={metadata?.mimeType === 'application/pdf'} />
              <CheckFact label="Download" value={metadata ? metadata.canDownload ? 'Allowed' : 'Disabled' : 'Not available'} ready={Boolean(metadata?.canDownload)} />
              <CheckFact label="File size" value={formatBytes(metadata?.size)} ready={Boolean(metadata?.size)} neutral />
              <CheckFact label="PDF integrity" value={document?.readable ? 'Readable' : document?.encrypted ? 'Password protected' : 'Not verified'} ready={Boolean(document?.readable)} />
              <CheckFact label="Pages" value={document ? String(document.pageCount) : 'Not available'} ready={Boolean(document?.pageCount)} neutral />
              <CheckFact
                label="Readable text"
                value={Number.isFinite(Number(document?.extractedCharacterCount)) ? Number(document.extractedCharacterCount).toLocaleString() + ' characters' : 'Not available'}
                ready={Number(document?.extractedCharacterCount) > 0}
                neutral
              />
              <CheckFact label="Last modified (Drive)" value={metadata?.modifiedTime ? formatDateTime(metadata.modifiedTime) : 'Not available'} ready={Boolean(metadata?.modifiedTime)} neutral />
              {sharedMetadata?.lastModifiedTime ? (
                <CheckFact label="Latest Drive modified (Google metadata)" value={formatDateTime(sharedMetadata.lastModifiedTime)} ready neutral />
              ) : null}
              {studentView ? (
                <CheckFact label="Created time" value={sharedMetadata?.createdTime ? formatDateTime(sharedMetadata.createdTime) : 'Unavailable'} ready={Boolean(sharedMetadata?.createdTime)} neutral />
              ) : null}
              {!studentView ? (
                <>
                  <CheckFact label="Created time" value={sharedMetadata?.createdTime || latestObservation?.driveCreatedTime ? formatDateTime(sharedMetadata?.createdTime || latestObservation?.driveCreatedTime) : 'Unavailable'} ready={Boolean(sharedMetadata?.createdTime || latestObservation?.driveCreatedTime)} neutral />
                  <CheckFact label="Drive owner" wide neutral
                    value={<DriveIdentityValue registeredStudent={ownerStudent} providerValue={ownerDisplay} />} />
                  <CheckFact label="Last modified by" wide neutral
                    value={<DriveIdentityValue registeredStudent={editorStudent} providerValue={editorDisplay} />} />
                </>
              ) : null}
              </div>
            </section>

            <section className="document-check-section">
              <h3>Official template structure</h3>
              {comparison?.available ? (
              <>
                <div className="document-check-template-summary">
                  <strong>{missingSections.length ? missingSections.length + ' expected body section' + (missingSections.length === 1 ? '' : 's') + ' not detected' : 'Expected template sections detected'}</strong>
                  <p>
                    This check compares the document's body structure with the official template. Sample project names, example transaction names, and placeholder values are not treated as required headings.
                  </p>
                </div>
                {expectedSectionCount ? (
                  <div className="document-check-measures">
                    <div><span>Expected body sections</span><strong>{expectedSectionCount}</strong></div>
                    <div><span>Detected in body</span><strong>{detectedSectionCount}</strong></div>
                    <div><span>Not detected</span><strong>{missingSections.length}</strong></div>
                  </div>
                ) : null}
                {!comparison?.sectionEvidence?.length ? (
                  <div className="document-check-findings">
                    <h4>{missingSections.length ? 'Expected body sections not detected' : 'Structure result'}</h4>
                    {missingSections.length ? (
                      <ul>{missingSections.map((section) => <li key={section}>{section}</li>)}</ul>
                    ) : <p>No expected body sections were flagged as missing.</p>}
                  </div>
                ) : null}
                <TemplateSectionEvidence comparison={comparison} />
                {comparison.appearsTemplateOnly ? (
                  <Alert color="orange" mt="sm" title="Document still looks largely like the blank template">
                    Large portions of the official template appear unchanged. Treat this as a review signal, not a grade or completion percentage.
                  </Alert>
                ) : null}
              </>
              ) : (
              <p className="muted-copy">
                {studentView
                  ? 'No official template was available for comparison when your PDF was checked.'
                  : 'No official template was available for this deliverable when the document was checked.'}
              </p>
              )}
            </section>

            {report?.redFlags?.length ? (
              <section className="document-check-section">
                <h3>{studentView ? 'What needs attention' : 'Findings'}</h3>
                <div className="status-strip stable">
                  {report.redFlags.map((flag) => <Badge key={flag} color="orange" variant="light" radius="sm">{flag}</Badge>)}
                </div>
                <p>{studentView ? 'Review the items above and update your submitted PDF link if needed.' : report.suggestedAction}</p>
              </section>
            ) : null}
            </div>
          </details>

        </Tabs.Panel> : null}

        {historyAvailable ? (
          <Tabs.Panel value="history" pt="md">
            <div className="document-check-history-panel">
              {(tab === 'history' || historyOnly) && historyTarget && fileLink ? (
                <SubmittedFileHistory
                  key={`${historyTarget.workspaceId}:${historyTarget.responseId}:${historyTarget.fieldId}:${historyRefresh}`}
                  workspaceId={historyTarget.workspaceId}
                  responseId={historyTarget.responseId}
                  fieldId={historyTarget.fieldId}
                  observedHistory={observedHistory}
                  audience={audience}
                  initialHistory={sharedHistory?.key === targetKey ? sharedHistory?.data : null}
                  initialLoading={Boolean(open && (!sharedHistory || sharedHistory.key !== targetKey || sharedHistory.loading))}
                  onRefresh={() => {
                    setSharedHistory({ key: targetKey, loading: true, data: null });
                    setHistoryRefresh(value => value + 1);
                  }}
                  refreshing={Boolean(sharedHistory?.loading)}
                />
              ) : !studentView ? <ObservedFileHistory history={observedHistory} /> : null}
            </div>
          </Tabs.Panel>
        ) : null}
      </Tabs>

      <footer className="document-check-actions">
        {fileLink ? (
          <Button component="a" variant="secondary" icon={ArrowSquareOut} href={makeDriveViewUrl(fileLink)} target="_blank" rel="noreferrer">
            {studentView ? 'Open submitted PDF' : 'Open submitted file'}
          </Button>
        ) : null}
        {allowRecheck && onRecheck ? (
          <Button type="button" variant="secondary" icon={MagnifyingGlass} loading={rechecking} onClick={onRecheck}>Check again</Button>
        ) : null}
        <Button type="button" onClick={onClose} disabled={rechecking}>Done</Button>
      </footer>
    </Modal>
  );
}

function TemplateSectionEvidence({ comparison }) {
  const entries = Array.isArray(comparison?.sectionEvidence) ? comparison.sectionEvidence : [];
  const legacyDetected = comparison?.detectedTemplateHeadings || [];
  const detected = entries.length ? entries.filter(item => item.status === 'DETECTED') : legacyDetected.map(expectedHeading => ({ expectedHeading }));
  const missing = entries.filter(item => item.status === 'NOT_DETECTED');
  if (!detected.length && !missing.length) return null;
  return (
    <div className="document-check-evidence">
      <details>
        <summary>Detected sections ({detected.length})</summary>
        <p className="muted-copy">A detected heading matches the expected template structure. It does not verify the section's content or quality. Line numbers refer to extracted text, not PDF pages.</p>
        <ul>{detected.map((item, index) => (
          <li key={`${item.expectedHeading}-${index}`}>
            <strong>{item.expectedHeading}</strong>
            {item.matchedLine ? <span>Matched text: {item.matchedLine}</span> : null}
            {Number.isInteger(item.extractedTextLine) && item.extractedTextLine > 0 ? <span>Extracted text line {item.extractedTextLine}</span> : null}
          </li>
        ))}</ul>
      </details>
      {missing.length ? <details open>
        <summary>Sections not detected ({missing.length})</summary>
        <p className="muted-copy">These expected heading lines were not found by the structure check. Generic template headings such as “Module 1” may have been replaced by project-specific titles. A heading that was not detected does not prove its section or content is absent. Review the actual PDF.</p>
        <ul>{missing.map((item, index) => <li key={`${item.expectedHeading}-${index}`}>{item.expectedHeading}</li>)}</ul>
      </details> : null}
    </div>
  );
}

export function compactMissingSections(sections, visibleCount = 3) {
  const values = sections || [];
  if (!values.length) return '';
  const visible = values.slice(0, visibleCount).join(', ');
  const remaining = values.length - visibleCount;
  return remaining > 0 ? `${visible}… and ${remaining} more` : visible;
}

export function documentCheckStatus(response) {
  if (response?.fileCheckStatus === 'Checking') return 'Checking';
  if (response?.documentCheck?.status === 'Error' || response?.fileCheckStatus === 'Error') return 'Could not check';
  if (response?.documentCheck?.status === 'Unavailable') return 'Not checked';
  if (!response?.documentCheck) return 'Not checked';
  if (response.documentCheck.sourceResponseUpdatedAt !== (response.updatedAt || response.submittedAt)) return 'Outdated';
  const substanceStatus = submissionSubstanceStatus(response.documentCheck);
  if (substanceStatus) return substanceStatus;
  if (response.documentCheck.redFlags?.length || response.documentCheck.missingSections?.length) return 'Needs attention';
  return 'Ready for review';
}

export function studentDocumentCheckStatus(response) {
  const status = documentCheckStatus(response);
  if (status === 'Ready for review') return 'Check complete';
  if (status === 'Outdated') return 'Check outdated';
  return status;
}

function studentSummary(report, response) {
  if (!report) return response?.checkSummary || 'No Document Check result is available yet.';
  if (['Unavailable', 'Error'].includes(report?.status)) {
    return 'Document Check could not read this PDF right now. Please try again later or update the submitted link if the file is unavailable.';
  }
  if (report?.submissionSubstance?.reason) return report.submissionSubstance.reason;
  if (report?.redFlags?.length || report?.missingSections?.length) {
    return 'Document Check found items that may need your attention. Review the details below.';
  }
  if (report?.status === 'Current' && report?.document?.readable) {
    return report?.templateComparison?.available
      ? 'Your PDF is accessible and readable, and an official template comparison is available below.'
      : 'Your PDF is accessible and readable. No official template was available for comparison.';
  }
  return report?.summary || response?.checkSummary || 'Document Check finished. Review the details below.';
}

function CheckFact({ label, value, ready, neutral = false, wide = false }) {
  return (
    <div className={`document-check-fact${wide ? ' document-check-fact--identity' : ''}`}>
      {ready || neutral ? <CheckCircle weight="regular" aria-hidden="true" /> : <WarningCircle weight="regular" aria-hidden="true" />}
      <span>{label}</span>
      {wide ? value : <strong>{value}</strong>}
    </div>
  );
}

function DriveIdentityValue({ registeredStudent, providerValue }) {
  const studentName = String(registeredStudent?.studentName || '').trim();
  const googleEmail = String(registeredStudent?.email || '').trim();
  const verified = Boolean(studentName && googleEmail);
  const raw = String(providerValue || '').trim();
  if (!verified && (!raw || raw === 'Unavailable')) return <strong>Unavailable</strong>;

  // Existing provider-only strings can be "Display name (email)". Splitting
  // their layout does not establish a verified registered WildTrack identity.
  const providerParts = !verified && /^(.*?)\s*\(([^()\s]+@[^()\s]+)\)$/.exec(raw);
  const emailOnly = !verified && !providerParts && /^[^\s()@]+@[^\s()@]+$/.test(raw);
  const name = verified ? studentName : providerParts ? providerParts[1].trim() : emailOnly ? '' : raw;
  const email = verified ? googleEmail : providerParts ? providerParts[2] : emailOnly ? raw : '';
  return (
    <div className="document-check-identity-value">
      {name ? <strong className="document-check-identity-name">{name}</strong> : null}
      {email ? <span className="document-check-identity-email" title={email}>
        {name ? '(' : null}<EmailWithBreaks email={email} />{name ? ')' : null}
      </span> : null}
    </div>
  );
}

function EmailWithBreaks({ email }) {
  return String(email).split(/([@.+_-])/g).map((part, index) => (
    // Allow wrapping *after* email separators, never at arbitrary characters
    // inside a domain (such as "gma/il.com"). Full text stays accessible.
    <span key={index}>{part}{/^[@.+_-]$/.test(part) ? <wbr /> : null}</span>
  ));
}

function formatBytes(value) {
  if (!value && value !== 0) return 'Not available';
  if (value < 1024) return `${value} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function unavailableValue(response) {
  return response?.documentCheck?.status === 'Unavailable' ? 'API unavailable' : 'Not available';
}
