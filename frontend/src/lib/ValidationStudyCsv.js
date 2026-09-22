const COLUMNS = [
  'recordType',
  'responseId',
  'studentNumber',
  'studentName',
  'teamCode',
  'currentRevision',
  'submittedAt',
  'updatedAt',
  'currentValidationStep',
  'currentPdfLink',
  'historyRevision',
  'historyCreatedAt',
  'historyValidationStep',
  'historyPdfLink',
  'initialSubmissionSeen',
  'initialArtifactPresent',
  'revisedSubmissionCurrent',
  'currentArtifactPresent',
  'sameResponse',
  'revisionIncreased',
  'materialEditHistoryPresent',
  'pdfUnchanged',
  'nonDesignatedValuesPreserved',
  'overallPass',
  'scoreScope'
];

export function buildValidationStudyCsv(evidence) {
  const rows = [COLUMNS];
  for (const response of evidence?.responses || []) {
    rows.push(csvRow(response, 'CURRENT', null));
    for (const revision of response.history || []) {
      rows.push(csvRow(response, 'HISTORY', revision));
    }
  }
  return rows.map(row => row.map(escapeCsv).join(',')).join('\r\n') + '\r\n';
}

export function downloadValidationStudyCsv(evidence) {
  const csv = buildValidationStudyCsv(evidence);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const key = safeFilePart(evidence?.trackerColumnKey || evidence?.deliverableTitle || 'deliverable');
  link.href = url;
  link.download = `validation-study-OLD-T1-T2-NOT-GOAL3-${key}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvRow(response, recordType, revision) {
  const checks = response.checks || {};
  return [
    recordType,
    response.responseId,
    response.studentNumber,
    response.studentName,
    response.teamCode,
    response.currentRevision,
    response.submittedAt,
    response.updatedAt,
    response.validationStepValue,
    response.artifactValue,
    revision?.revision ?? '',
    revision?.createdAt ?? '',
    revision?.validationStepValue ?? '',
    revision?.artifactValue ?? '',
    boolLabel(checks.initialSubmissionSeen),
    boolLabel(checks.initialArtifactPresent),
    boolLabel(checks.revisedSubmissionCurrent),
    boolLabel(checks.currentArtifactPresent),
    boolLabel(checks.sameResponse),
    boolLabel(checks.revisionIncreased),
    boolLabel(checks.materialEditHistoryPresent),
    boolLabel(checks.pdfUnchanged),
    boolLabel(checks.nonDesignatedValuesPreserved),
    boolLabel(checks.overallPass),
    'HISTORICAL_T1_T2_ONLY_NOT_CURRENT_GOAL_3'
  ];
}

function boolLabel(value) {
  if (value === null || value === undefined) return 'N/A';
  return value ? 'PASS' : 'FAIL';
}

function escapeCsv(value) {
  const text = String(value ?? '');
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function safeFilePart(value) {
  return String(value || 'deliverable').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deliverable';
}
