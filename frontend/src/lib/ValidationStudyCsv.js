const INITIAL_COLUMNS = [
  'scope',
  'workspaceId',
  'deliverableId',
  'evaluatedAt',
  'selectionRule',
  'denominator',
  'aggregateStatus',
  'candidateCount',
  'selectedCount',
  'passedCount',
  'failedCount',
  'unverifiedCount',
  'agreement',
  'responseId',
  'studentNumber',
  'studentName',
  'teamCode',
  'studentRecordId',
  'recordWorkspaceId',
  'recordDeliverableId',
  'originalSource',
  'originalRevision',
  'originalSavedAt',
  'originalArtifactValue',
  'originalVersion',
  'originalLink',
  'storedStudentNumber',
  'storedStudentName',
  'storedTeamCode',
  'rosterStudentNumber',
  'rosterStudentName',
  'rosterTeamCode',
  'studentDetailsStatus',
  'studentDetailsReason',
  'workspaceStatus',
  'workspaceReason',
  'deliverableStatus',
  'deliverableReason',
  'originalVersionStatus',
  'originalVersionReason',
  'storedValuesStatus',
  'storedValuesReason',
  'accountBindingStatus',
  'accountBindingReason',
  'requiredFieldsChecked',
  'missingRequiredFieldKeys',
  'overallStatus',
  'LIMITS_PROOF_SCOPE'
];

const INITIAL_SCOPE = 'INITIAL_SAVED_RECORD_SYSTEM_AUDIT_V1';
const INITIAL_LIMITS = 'System audit of saved records only; does not prove consent, pre-save failures, student-visible readback, or end-to-end study completion.';

export function buildInitialSavedRecordCsv(evidence) {
  const audit = evidence?.initialSavedRecords;
  if (!audit || typeof audit !== 'object') return '';
  const records = Array.isArray(audit.records) ? audit.records : [];
  const counts = {
    candidateCount: audit.candidates,
    selectedCount: audit.selectedRecords,
    passedCount: audit.passedRecords,
    failedCount: audit.failedRecords,
    unverifiedCount: audit.unverifiedRecords
  };
  const denominator = audit.selectedRecords ?? audit.candidates;
  const rows = [INITIAL_COLUMNS];
  for (const record of records) {
    rows.push(initialRecordRow(audit, record, counts, denominator));
  }
  if (!records.length) {
    rows.push(initialRecordRow(audit, {}, counts, denominator));
  }
  return rows.map(row => row.map(escapeCsv).join(',')).join('\r\n') + '\r\n';
}

export function downloadInitialSavedRecordCsv(evidence) {
  const csv = buildInitialSavedRecordCsv(evidence);
  if (!csv) return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const key = safeFilePart(evidence?.trackerColumnKey || evidence?.deliverableTitle || evidence?.initialSavedRecords?.deliverableId || 'deliverable');
  link.href = url;
  link.download = `validation-study-initial-saved-record-audit-${key}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  let text = String(value ?? '');
  // Excel treats these as formulas, including when whitespace/control characters precede them.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function initialRecordRow(audit, record, counts, denominator) {
  const check = key => statusValue(record[key] ?? record.checks?.[key]);
  const agreement = audit.agreement === null || audit.agreement === undefined ? '' : audit.agreement;
  return [
    audit.scope || INITIAL_SCOPE,
    audit.workspaceId,
    audit.deliverableId,
    audit.evaluatedAt,
    audit.selectionRule,
    denominator,
    audit.outcome,
    counts.candidateCount,
    counts.selectedCount,
    counts.passedCount,
    counts.failedCount,
    counts.unverifiedCount,
    agreement,
    record.responseId,
    record.studentNumber,
    record.studentName,
    record.teamCode,
    record.studentRecordId,
    record.workspaceId,
    record.deliverableId,
    record.originalSource,
    record.originalRevision,
    record.originalSavedAt,
    record.originalArtifactValue,
    valueOf(record.originalVersion),
    record.originalArtifactValue,
    valueOf(record.storedValues?.studentNumber ?? record.storedValues?.student?.studentNumber),
    valueOf(record.storedValues?.studentName ?? record.storedValues?.student?.studentName),
    valueOf(record.storedValues?.teamCode ?? record.storedValues?.student?.teamCode),
    record.rosterStudentNumber,
    record.rosterStudentName,
    record.rosterTeamCode,
    check('studentDetails').status,
    check('studentDetails').reason,
    check('workspace').status,
    check('workspace').reason,
    check('deliverable').status,
    check('deliverable').reason,
    check('originalVersion').status,
    check('originalVersion').reason,
    check('storedValues').status,
    check('storedValues').reason,
    check('accountBinding').status,
    check('accountBinding').reason,
    Array.isArray(record.requiredFieldsChecked) ? record.requiredFieldsChecked.join('; ') : '',
    '',
    Array.isArray(record.missingRequiredFieldKeys) ? record.missingRequiredFieldKeys.join('; ') : '',
    record.overallStatus,
    audit.limitations?.length ? `${INITIAL_LIMITS} ${audit.limitations.join(' ')}` : INITIAL_LIMITS
  ];
}

function statusValue(value) {
  if (value && typeof value === 'object') return { status: value.status ?? 'UNVERIFIED', reason: value.reason ?? '' };
  if (value === true) return { status: 'PASS', reason: '' };
  if (value === false) return { status: 'FAIL', reason: '' };
  return { status: 'UNVERIFIED', reason: '' };
}

function valueOf(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return value;
}

function safeFilePart(value) {
  return String(value || 'deliverable').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deliverable';
}
