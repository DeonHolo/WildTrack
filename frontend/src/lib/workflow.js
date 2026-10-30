import { recordedTimestamp } from './recordedTime.js';

export const DRIVE_CHECK_UNAVAILABLE_MESSAGE = 'This submitted file has not been checked yet.';
const HISTORICAL_PLACEHOLDER_SUMMARIES = new Set([
  'PDF link opens and contains readable SRS sections. Requirements traceability still needs review.',
  'File opens, but several sections appear close to the provided template.',
  'File opens, but extracted content appears too short for the selected deliverable.',
  'File opens and contains readable capstone sections. Review can proceed from this submission.'
]);

export function getWorkspacePublicKey(workspace) {
  return slugify([
    workspace?.program,
    workspace?.courseCode,
    workspace?.academicYear,
    workspace?.semester
  ].filter(Boolean).join('-')) || String(workspace?.id || 'workspace');
}

export function findWorkspace(workspaces, idOrPublicKey) {
  return (workspaces || []).find((workspace) => (
    workspace.id === idOrPublicKey ||
    getWorkspacePublicKey(workspace) === String(idOrPublicKey || '').toLowerCase()
  )) || null;
}

export function findStudent(students, studentNumber) {
  const normalized = normalizeStudentNumber(studentNumber);
  return students.find((student) => normalizeStudentNumber(student.studentNumber) === normalized) || null;
}

export function normalizeStudentNumber(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase();
}

function normalizeLoose(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getIdentityStudents(students) {
  return students.filter((student) => String(student.studentNumber || '').trim());
}

export function getDeliverable(state, deliverableIdOrSlug) {
  return state.deliverables.find((item) => item.id === deliverableIdOrSlug || item.slug === deliverableIdOrSlug) || null;
}

export function getPublishedDeliverables(state) {
  return sortDeliverables(state, (state.deliverables || []).filter((item) => item.status !== 'Unpublished'));
}

export function upsertDeliverable(deliverables = [], payload = {}) {
  const existing = findDeliverableForUpsert(deliverables, payload);
  const id = existing?.id || payload.id || `deliv-${Date.now()}`;
  const slug = existing?.slug || payload.slug || slugify(payload.title || payload.shortTitle || payload.trackerColumn);
  const next = {
    ...(existing || {}),
    ...payload,
    id,
    slug
  };

  if (!existing) return [...deliverables, next];
  return deliverables.map((item) => item.id === existing.id ? next : item);
}

export function findDeliverableForUpsert(deliverables = [], payload = {}) {
  const existingByColumn = deliverables.find((item) => item.trackerColumn === payload.trackerColumn);
  const existingById = payload.id
    ? deliverables.find((item) => item.id === payload.id)
    : null;
  return existingByColumn || existingById || null;
}

const BACKEND_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function deliverableIdentityKey(deliverable = {}) {
  const column = String(deliverable.trackerColumn || '').trim().toLowerCase();
  if (column) return `column:${column}`;
  const slug = String(deliverable.slug || '').trim().toLowerCase();
  if (slug) return `slug:${slug}`;
  return `id:${String(deliverable.id || '').trim().toLowerCase()}`;
}

function isBackendDeliverable(deliverable = {}) {
  return BACKEND_ID_PATTERN.test(String(deliverable.id || ''));
}

function isBlankValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function combineDeliverables(winner, loser) {
  const combined = { ...loser };
  for (const [key, value] of Object.entries(winner)) {
    if (isBlankValue(value) && !isBlankValue(loser[key])) continue;
    combined[key] = value;
  }
  return combined;
}

export function dedupeDeliverables(deliverables = []) {
  const order = [];
  const byKey = new Map();

  for (const deliverable of deliverables) {
    if (!deliverable) continue;
    const key = deliverableIdentityKey(deliverable);
    const current = byKey.get(key);
    if (!current) {
      order.push(key);
      byKey.set(key, deliverable);
      continue;
    }
    const currentIsBackend = isBackendDeliverable(current);
    const incomingIsBackend = isBackendDeliverable(deliverable);
    const winner = currentIsBackend && !incomingIsBackend ? current : deliverable;
    const loser = winner === current ? deliverable : current;
    byKey.set(key, combineDeliverables(winner, loser));
  }

  return order.map((key) => byKey.get(key));
}

export function mergeDeliverables(existingDeliverables = [], backendDeliverables = []) {
  return dedupeDeliverables([...(existingDeliverables || []), ...(backendDeliverables || [])]);
}

export function sortDeliverables(state, deliverables = []) {
  const trackerOrder = new Map();
  (state.trackerColumns || []).forEach((column, index) => {
    trackerOrder.set(String(column.key || '').toLowerCase(), index);
    trackerOrder.set(String(column.label || '').toLowerCase(), index);
    trackerOrder.set(String(column.sourceColumn || '').toLowerCase(), index);
  });

  return dedupeDeliverables(deliverables).sort((first, second) => {
    const firstTime = Date.parse(first.dueAt || '');
    const secondTime = Date.parse(second.dueAt || '');
    if (!Number.isNaN(firstTime) && !Number.isNaN(secondTime) && firstTime !== secondTime) {
      return firstTime - secondTime;
    }

    const firstOrder = trackerOrder.get(String(first.trackerColumn || first.shortTitle || '').toLowerCase()) ?? 9999;
    const secondOrder = trackerOrder.get(String(second.trackerColumn || second.shortTitle || '').toLowerCase()) ?? 9999;
    if (firstOrder !== secondOrder) return firstOrder - secondOrder;

    return String(first.shortTitle || first.title || '').localeCompare(String(second.shortTitle || second.title || ''));
  });
}

export function getProjectMetadata(state, teamCode) {
  const normalized = normalizeLoose(teamCode);
  return (state.projectMetadata || []).find((item) => normalizeLoose(item.groupCode) === normalized) || null;
}

export function isUsableAdviserName(value) {
  const text = String(value || '').trim();
  if (!text || text === 'Unassigned') return false;
  if (/^#?N\/A$/i.test(text)) return false;
  if (/^(none|null|pending)$/i.test(text)) return false;
  if (/^\d+$/i.test(text)) return false;
  return true;
}

export function getTeamAdviser(state, teamCode) {
  const project = getProjectMetadata(state, teamCode);
  if (isUsableAdviserName(project?.adviserName)) return project.adviserName;

  const memberAdviser = (state.students || [])
    .filter((student) => student.teamCode === teamCode)
    .map((student) => student.adviser)
    .find((name) => isUsableAdviserName(name) && name !== 'Sir Ralph Laviste');
  return memberAdviser || 'Unassigned';
}

export function getAdviserOptions(state) {
  const teamCodes = [...new Set((state.students || []).map((student) => student.teamCode).filter(Boolean))];
  const names = teamCodes.map((teamCode) => getTeamAdviser(state, teamCode)).filter(isUsableAdviserName);
  return [...new Set(names)].sort().concat('Unassigned');
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function getStudentOptions(students, studentAccounts = []) {
  const claimed = new Set(studentAccounts.map((account) => normalizeStudentNumber(account.studentNumber)));
  return students.map((student) => ({
    ...student,
    claimed: claimed.has(normalizeStudentNumber(student.studentNumber))
  }));
}

export function getActiveTrackerColumns(state) {
  const columns = state.trackerColumns || [];
  return columns.filter((column) => column.active !== false);
}

export function getTrackerColumn(state, key) {
  const columns = state.trackerColumns || [];
  return columns.find((column) => column.key === key || column.label === key || column.sourceColumn === key) || null;
}

export function getResponseIdentity(response) {
  return `${normalizeStudentNumber(response.studentNumber)}::${response.deliverableId}`;
}

export function getResponseOwnerKey(response) {
  const subject = String(response?.googleSubject || response?.googleSub || '').trim();
  if (subject) return `sub:${subject}`;
  const email = String(response?.googleEmailSnapshot || response?.googleEmail || response?.submittedByEmail || '').trim().toLowerCase();
  return email ? `email:${email}` : '';
}

export function findOwnedResponse(responses, { deliverableId, studentNumber, googleSubject, googleEmail } = {}) {
  const ownerKey = getResponseOwnerKey({ googleSubject, googleEmailSnapshot: googleEmail });
  if (!ownerKey || !deliverableId || !studentNumber) return null;
  return (responses || []).find((response) => (
    response.deliverableId === deliverableId &&
    normalizeStudentNumber(response.studentNumber) === normalizeStudentNumber(studentNumber) &&
    getResponseOwnerKey(response) === ownerKey
  )) || null;
}

export function hasResponseConflict(responses, { deliverableId, studentNumber, googleSubject, googleEmail } = {}) {
  const ownerKey = getResponseOwnerKey({ googleSubject, googleEmailSnapshot: googleEmail });
  if (!deliverableId || !studentNumber) return false;
  const matchingResponses = (responses || []).filter((response) => (
    response.deliverableId === deliverableId &&
    normalizeStudentNumber(response.studentNumber) === normalizeStudentNumber(studentNumber)
  ));
  if (ownerKey && matchingResponses.some((response) => getResponseOwnerKey(response) === ownerKey)) return false;
  return matchingResponses.length > 0;
}

export function valuesChanged(previous, next) {
  return JSON.stringify(previous || {}) !== JSON.stringify(next || {});
}

export function findStudentByName(students, name) {
  const normalized = String(name || '').trim().toLowerCase();
  return students.find((student) => student.name.toLowerCase() === normalized) || null;
}

export function findStudentByTeam(students, teamCode) {
  const normalized = String(teamCode || '').trim().toLowerCase();
  return students.find((student) => student.teamCode.toLowerCase() === normalized) || null;
}

export function extractSheetId(value) {
  const match = String(value || '').match(/spreadsheets\/d\/(?:e\/)?([^/]+)/i);
  return match?.[1] || '';
}


export function validateSubmission({ deliverable, values }) {
  const errors = {};
  const flags = ['Received'];

  for (const field of deliverable.fields) {
    if (field.type?.startsWith('academic') && field.type !== 'academicSection') continue;
    const rawValue = values[field.id];
    const isCheckboxes = field.type === 'checkboxes';
    const value = isCheckboxes ? rawValue : String(rawValue || '').trim();
    const missing = isCheckboxes ? !Array.isArray(value) || value.length === 0 : !value;
    if (field.required && missing) {
      errors[field.id] = `${field.label} is required.`;
      continue;
    }
    if (missing) continue;

    if (field.type === 'shortText' || field.type === 'textarea' || field.type === 'academicSection') continue;
    if (field.type === 'dropdown' || field.type === 'multipleChoice') {
      const allowed = new Set((field.options || []).map((option) => option.id));
      if (!allowed.has(value)) errors[field.id] = `Choose a valid option for ${field.label}.`;
      continue;
    }
    if (field.type === 'checkboxes') {
      const allowed = new Set((field.options || []).map((option) => option.id));
      if (!Array.isArray(value) || new Set(value).size !== value.length || value.some((optionId) => !allowed.has(optionId))) {
        errors[field.id] = `Choose valid options for ${field.label}.`;
      }
      continue;
    }

    const linkError = validateUrl(value);
    if (linkError) {
      errors[field.id] = linkError;
      continue;
    }

    if (field.type === 'googleForm' && !isGoogleFormUrl(value)) {
      errors[field.id] = 'Use a Google Forms link for this field.';
      continue;
    }
    if (field.type === 'googleSheet' && !isGoogleSheetUrl(value)) {
      errors[field.id] = 'Use a Google Sheets link for this field.';
      continue;
    }
    if (field.type === 'driveFolder' && !isDriveFolderUrl(value)) {
      errors[field.id] = 'Use a Google Drive folder link for this field.';
      continue;
    }
    if (field.pdfRequired || field.type === 'drive') {
      const pdfResult = inspectDriveLink(value);
      if (!pdfResult.ok) {
        errors[field.id] = pdfResult.message;
      } else if (!flags.includes('Drive link format accepted')) {
        flags.push('Drive link format accepted');
      }
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    flags
  };
}

export function validateSubmissionIdentity({ deliverable, identity = {}, student = null, values = {} }) {
  const fields = (deliverable?.fields || []).filter((field) => field.active !== false);
  const academicFields = fields.filter((field) => String(field.type || '').startsWith('academic'));
  const configuredAcademicIdentity = academicFields.length > 0;
  const errors = {};

  if (!String(identity.studentNumber || '').trim()) {
    errors.studentNumber = 'Choose a Student Number.';
  }

  if (!configuredAcademicIdentity) {
    if (!String(identity.studentName || '').trim()) errors.studentName = 'Choose a Student Name.';
    if (!String(identity.teamCode || '').trim()) errors.teamCode = 'Choose a Team Code.';
    if (student && String(identity.studentName || '').trim()
        && String(identity.studentName || '').trim() !== String(student.name || '').trim()) {
      errors.studentName = 'Student Name must match the selected Student Number.';
    }
    if (student && String(identity.teamCode || '').trim()
        && String(identity.teamCode || '').trim() !== String(student.teamCode || '').trim()) {
      errors.teamCode = 'Team Code must match the selected Student Number.';
    }
    return errors;
  }

  const requiredTypes = new Set(academicFields.filter((field) => field.required === true).map((field) => field.type));
  if (requiredTypes.has('academicStudentName') && !String(student?.name || '').trim()) {
    errors.studentName = 'Student Name is required for this form.';
  }
  if (requiredTypes.has('academicTeamCode') && !String(student?.teamCode || '').trim()) {
    errors.teamCode = 'Team Code is required for this form.';
  }
  if (requiredTypes.has('academicSection')) {
    const sectionField = academicFields.find((field) => field.type === 'academicSection');
    const sectionValue = sectionField && Object.hasOwn(values, sectionField.id)
      ? values[sectionField.id]
      : student?.section;
    if (!String(sectionValue || '').trim()) errors.section = 'Section is required for this form.';
  }
  return errors;
}

export function activeSubmissionValues(deliverable, values = {}, student = null) {
  const fields = (deliverable?.fields || []).filter((field) => field.active !== false);
  const allowed = new Set(fields
    .filter((field) => !field.type?.startsWith('academic') || field.type === 'academicSection')
    .map((field) => field.id));
  const active = Object.fromEntries(Object.entries(values || {}).filter(([key]) => allowed.has(key)));
  for (const field of fields.filter((item) => item.type === 'academicSection')) {
    if (!Object.hasOwn(active, field.id) && String(student?.section || '').trim()) {
      active[field.id] = student.section;
    }
  }
  return active;
}

export function validateUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return 'Use a valid http or https link.';
    return '';
  } catch {
    return 'Use a complete link, including https://.';
  }
}

export function isGoogleFormUrl(value) {
  try {
    const url = new URL(value);
    return ['docs.google.com', 'forms.gle'].includes(url.hostname.toLowerCase())
      && (url.hostname.toLowerCase() === 'forms.gle' || url.pathname.toLowerCase().includes('/forms/'));
  } catch {
    return false;
  }
}

export function isGoogleSheetUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === 'docs.google.com' && url.pathname.toLowerCase().includes('/spreadsheets/');
  } catch {
    return false;
  }
}

export function isDriveFolderUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === 'drive.google.com'
      && (/\/drive\/folders\//i.test(url.pathname) || /\/folders\//i.test(url.pathname));
  } catch {
    return false;
  }
}

export function inspectDriveLink(value) {
  const lower = value.toLowerCase();
  if (lower.includes('docs.google.com/document') || lower.includes('docs.google.com/presentation') || lower.includes('docs.google.com/spreadsheets')) {
    return {
      ok: false,
      kind: 'Editable Link',
      message: 'This deliverable requires a PDF Drive link. Editable Google Docs, Slides, or Sheets links cannot be submitted.'
    };
  }
  if (lower.endsWith('.pdf') || lower.includes('.pdf?') || lower.includes('drive.google.com/file/d/')) {
    return { ok: true, kind: 'PDF' };
  }
  return {
    ok: false,
    kind: 'Unverifiable',
    message: 'Use a Google Drive file link to the PDF.'
  };
}

export function deriveAttemptFlags(values, baseFlags) {
  return [...baseFlags];
}

export function isDocumentCheckCurrent(response) {
  if (response?.documentCheck?.status !== 'Current' || !response.documentCheck.checkedAt) return false;
  const sourceTimestamp = response.updatedAt || response.submittedAt;
  return response.documentCheck.sourceResponseUpdatedAt === sourceTimestamp;
}

export function artifactDocumentCheck(response, field) {
  if (!response || !field) return null;
  if (field.definitionId && response.artifactChecks?.[field.definitionId]) {
    return response.artifactChecks[field.definitionId];
  }
  // Compatibility for one-field deliverables checked before field-aware reports existed.
  if ((response.artifactChecks == null || !Object.keys(response.artifactChecks).length)
      && (field.id === 'documentPdf' || !field.definitionId)) {
    return response.documentCheck || null;
  }
  return null;
}

export function isArtifactDocumentCheckCurrent(response, field) {
  const report = artifactDocumentCheck(response, field);
  if (!report || report.status === 'Unavailable' || !report.checkedAt) return false;
  const currentUrl = String(response?.values?.[field?.id] || '').trim();
  if (report.sourceUrl) return String(report.sourceUrl).trim() === currentUrl;
  return isDocumentCheckCurrent({ ...response, documentCheck: report });
}

export function artifactDocumentCheckStatus(response, field) {
  const report = artifactDocumentCheck(response, field);
  if (!report) return 'Not checked';
  if (report.status === 'Unavailable') return 'Not checked';
  if (!isArtifactDocumentCheckCurrent(response, field)) return 'Outdated';
  const substanceStatus = submissionSubstanceStatus(report);
  if (substanceStatus === 'Looks substantially filled') return 'Ready for review';
  if (substanceStatus) return 'Needs attention';
  if (report.redFlags?.length || report.missingSections?.length || report.attentionRequired) return 'Needs attention';
  return 'Ready for review';
}

export function submissionSubstanceStatus(report) {
  if (isSparseDocumentCheck(report)) return 'Needs attention — Sparse Content';
  const state = report?.submissionSubstance?.state;
  if (state === 'LOOKS_SUBSTANTIALLY_FILLED') return 'Looks substantially filled';
  if (state === 'NEEDS_ATTENTION') return 'Needs attention';
  return '';
}

function isSparseDocumentCheck(report) {
  const result = String(report?.resultStatus || report?.status || '').toUpperCase();
  if (['BLOCKED', 'FAILED', 'ERROR', 'UNAVAILABLE'].includes(result)) return false;
  const substance = report?.submissionSubstance;
  if (substance?.state === 'LOOKS_SUBSTANTIALLY_FILLED' || substance?.reasonCode === 'TEMPLATE_LIKE') return false;
  return substance?.state === 'COULD_NOT_DETERMINE'
    || ['SPARSE_CONTENT', 'INSUFFICIENT_TEXT_EXTRACTION'].includes(substance?.reasonCode)
    || (report?.redFlags || []).some(flag => ['Sparse Content', 'Substance Inconclusive'].includes(flag));
}

export function documentCheckSummary(report, fallback = '') {
  if (isSparseDocumentCheck(report)) {
    return 'WildTrack could not confirm that this PDF is substantially filled from its readable text. Open the PDF to check its content.';
  }
  return report?.summary || fallback;
}

export function documentCheckFlags(report) {
  const flags = (report?.redFlags || []).map(flag => flag === 'Substance Inconclusive' ? 'Sparse Content' : flag);
  if (isSparseDocumentCheck(report)) flags.push('Sparse Content');
  return [...new Set(flags)];
}

export function isDocumentCheckUnavailable(response) {
  return response?.documentCheck?.status === 'Unavailable';
}

export function isAiReportCurrent(response) {
  if (response?.aiReport?.status !== 'Current' || !response.aiReport.generatedAt) return false;
  const sourceTimestamp = response.updatedAt || response.submittedAt;
  return response.aiReport.sourceResponseUpdatedAt === sourceTimestamp;
}

// The backend validates source passages before saving these observations. The
// frontend still rejects incomplete/duplicate legacy records when deciding
// whether a zero-issue report contains enough distinct checks to show.
export function verifiedAiChecks(report) {
  if (!Array.isArray(report?.verifiedChecks)) return [];
  const seen = new Set();
  return report.verifiedChecks.filter(check => {
    if (!check || !['DOCUMENT', 'DELIVERABLE_REQUIREMENTS', 'OFFICIAL_TEMPLATE'].includes(check.source)
        || !String(check.aspect || '').trim() || !String(check.documentEvidence || '').trim()
        || (check.source !== 'DOCUMENT' && !String(check.requirement || '').trim())) return false;
    // The backend counts independent submitted-PDF passages, even when the
    // provider describes one passage under two different aspects or sources.
    const key = String(check.documentEvidence).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function aiReviewEvidenceCount(report) {
  const criteria = Array.isArray(report?.coverage?.criteria) ? report.coverage.criteria : [];
  const counts = new Map();
  for (const item of criteria) counts.set(item?.id, (counts.get(item?.id) || 0) + 1);
  const quotes = verifiedAiChecks(report).map(check => check.documentEvidence);
  for (const item of criteria) {
    if (item?.assessment !== 'APPEARS_ADDRESSED' || !/^[CT][1-9]\d*$/.test(item.id || '')
        || counts.get(item.id) !== 1
        || !['OFFICIAL_TEMPLATE', 'DELIVERABLE_REQUIREMENTS'].includes(item.source)
        || !String(item.requirement || '').trim() || !String(item.explanation || '').trim()
        || !String(item.documentEvidence || '').trim()
        || !Number.isInteger(item.location?.page) || item.location.page < 1) continue;
    quotes.push(item.documentEvidence);
  }
  return new Set(quotes.map(quote => String(quote).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim())).size;
}

export function hasCompletedTemplateChecklist(report) {
  const rows = report?.coverage?.criteria;
  return report?.outcome === 'NO_ISSUES_IN_CHECKED_AREAS' && Array.isArray(rows) && rows.length > 0
    && report.coverage.omittedCriteria === 0 && rows.every((row, index) => row?.id === `T${index + 1}`
      && row.source === 'OFFICIAL_TEMPLATE' && String(row.requirement || '').trim()
      && String(row.explanation || '').trim() && row.explanation.length <= 400
      && (row.assessment === 'NOT_APPLICABLE' || (row.assessment === 'APPEARS_ADDRESSED'
        && String(row.documentEvidence || '').trim() && Number.isInteger(row.location?.page) && row.location.page > 0)));
}

export function aiReviewAssessment(row) {
  // Earlier saved results used this exact backend-generated wrapper for positive quote failures.
  // Do not reclassify a model's own manual concern or a row linked to an actual finding.
  if (row?.assessment !== 'CHECK_MANUALLY' || row.documentEvidence || row.location
      || ['verifiedCheckIndexes', 'findingIndexes', 'missingSectionIndexes', 'verificationNoteIndexes']
        .some(key => row[key]?.length)) return row;
  const match = String(row.explanation || '').match(/^Check .+ in the PDF(?: \(AI-cited page \d+\))?\. (?:The cited page contains visual content, but the quotation could not be matched to readable text\.|The quotation could not be matched to the PDF's readable text\.|Gemini did not provide a supporting quotation for this assessment\.|The supporting text could not be located on a PDF page\.) Gemini's unconfirmed observation: (.+)$/s);
  return match ? { ...row, assessment: 'UNVERIFIED',
    explanation: `The supporting quotation could not be verified. Unverified AI observation: ${match[1]}` } : row;
}

function hasUnresolvedInstructionAssessments(report) {
  const criteria = report?.coverage?.criteria;
  return Array.isArray(criteria) && criteria.some(item => ['CHECK_MANUALLY', 'NEEDS_ATTENTION'].includes(aiReviewAssessment(item)?.assessment));
}

// Old zero-evidence completed reports can be empty or claim a clean result in
// prose. Two distinct grounded observations are required before the UI may
// report no actionable issues in the checked areas.
export function isInconclusiveAiReviewReport(report) {
  if (!report) return true;
  if ((report.verificationNotes?.length || hasUnresolvedInstructionAssessments(report))
      && !(report.outcome === 'ISSUES_IDENTIFIED' || (report.findings || report.flags || []).length
        || (report.missingRequiredSections || report.missingSections || []).length)) return true;
  if (report.outcome === 'INCONCLUSIVE') return true;
  if (report.outcome === 'ISSUES_IDENTIFIED') return false;
  if (report.coverage?.criteria?.some(row => aiReviewAssessment(row)?.assessment === 'UNVERIFIED')) return true;
  if (report.outcome === 'NO_ISSUES_IN_CHECKED_AREAS') return !hasCompletedTemplateChecklist(report) && aiReviewEvidenceCount(report) < 2;
  return !((report.findings || report.flags || []).length
    || (report.missingRequiredSections || report.missingSections || []).length)
    && aiReviewEvidenceCount(report) < 2;
}

export function aiReviewReportStatus(report) {
  if (!isInconclusiveAiReviewReport(report)) return 'Reviewed';
  return report?.verificationNotes?.length || hasUnresolvedInstructionAssessments(report)
    ? 'Needs manual verification' : 'Limited review coverage';
}

export function aiReviewReportSummary(report) {
  const status = aiReviewReportStatus(report);
  if (status === 'Limited review coverage') {
    const checks = aiReviewEvidenceCount(report);
    return `Review finished with limited coverage: ${checks} supported observation${checks === 1 ? '' : 's'} recorded. This does not establish a no-issues result or mean the PDF is empty or incorrect.`;
  }
  if (status === 'Needs manual verification') {
    return 'Review finished with checks needing manual verification. Inspect the cited areas in the original PDF.';
  }
  return report?.summary || 'AI Review is available.';
}

export function artifactAiReview(response, field) {
  if (!response || !field) return null;
  if (field.definitionId && response.artifactAiReviews?.[field.definitionId]) {
    return response.artifactAiReviews[field.definitionId];
  }
  // A legacy single-PDF deliverable has no definitionId, but the backend
  // persists its review under <deliverableId>:legacy. Read that scoped result
  // (or the legacy mirror) even after the field-review map becomes nonempty.
  if (!field.definitionId && field.id === 'documentPdf') {
    return response.artifactAiReviews?.[`${response.deliverableId}:legacy`]
      || response.aiReviewState || null;
  }
  if ((response.artifactAiReviews == null || !Object.keys(response.artifactAiReviews).length)
      && !field.definitionId) {
    return response.aiReviewState || null;
  }
  return null;
}

export function isArtifactAiReviewCurrent(response, field) {
  const review = artifactAiReview(response, field);
  if (!review || review.status !== 'COMPLETED' || !review.report) return false;
  if (artifactAiReviewChange(response, field)) return false;
  const currentUrl = String(response?.values?.[field?.id] || '').trim();
  if (review.sourceUrl) return String(review.sourceUrl).trim() === currentUrl;
  return isAiReportCurrent({ ...response, aiReviewState: review, aiReport: {
    ...review.report,
    status: 'Current',
    generatedAt: review.generatedAt,
    sourceResponseUpdatedAt: review.sourceResponseUpdatedAt
  }});
}

export function artifactObservedFileHistory(response, field) {
  const histories = response?.observedFileHistoryByField || {};
  return histories[field?.definitionId || field?.id]
    || (!field?.definitionId && field?.id === 'documentPdf' ? histories[`${response?.deliverableId}:legacy`] : null)
    || (!Object.keys(histories).length ? response?.observedFileHistory : null)
    || null;
}

export function artifactAiReviewChange(response, field) {
  const review = artifactAiReview(response, field);
  const reviewedAt = recordedTimestamp(review?.sourceVerifiedAt) ?? recordedTimestamp(review?.report ? review.generatedAt
    : review?.previousGeneratedAt || review?.lastSubstantiveGeneratedAt);
  if (reviewedAt == null) return null;
  const changes = artifactObservedFileHistory(response, field)?.observations || [];
  // Rechecking identical contents updates lastObservedAt, not the time of a
  // change. Prefer Drive's actual edit time so a new review made before the
  // monitor catches up is not incorrectly marked outdated.
  return changes.filter(item => ['CONTENT_CHANGED', 'SOURCE_CHANGED'].includes(item.changeType))
    .map(item => ({ ...item, changedAt: recordedTimestamp(item.driveModifiedTime) ?? recordedTimestamp(item.firstObservedAt) }))
    .filter(item => item.changedAt != null && item.changedAt > reviewedAt)
    .sort((a, b) => b.changedAt - a.changedAt)[0] || null;
}

export function artifactAiReportForDisplay(response, field) {
  const review = artifactAiReview(response, field);
  if (isArtifactAiReviewCurrent(response, field)) return review.report;
  if (!artifactAiReviewChange(response, field) || review?.status !== 'COMPLETED') return null;
  const sameSource = review.sourceUrl
    ? review.sourceUrl === String(response?.values?.[field?.id] || '').trim()
    : review.sourceResponseUpdatedAt === (response?.updatedAt || response?.submittedAt);
  return sameSource ? review.report || null : null;
}

export function artifactAiReviewStatus(response, field) {
  if (!field?.aiReviewEnabled) return 'Not applicable';
  const review = artifactAiReview(response, field);
  if (isArtifactAiReviewCurrent(response, field)) {
    return aiReviewReportStatus(review.report);
  }
  if (review?.status === 'UNCERTAIN') return 'Retry required';
  if (review?.status === 'RUNNING') return 'Reviewing';
  if (artifactAiReviewChange(response, field)) return 'Outdated';
  return 'Not reviewed';
}

export function aiReviewStatus(response) {
  const review = response?.aiReviewState;
  if (review?.sourceResponseUpdatedAt && review.sourceResponseUpdatedAt !== (response.updatedAt || response.submittedAt)) return 'Not reviewed';
  if (isAiReportCurrent(response)) return aiReviewReportStatus(response.aiReport);
  if (review?.status === 'UNCERTAIN') return 'Retry required';
  if (review?.status === 'RUNNING') return 'Reviewing';
  if (review?.status === 'UNAVAILABLE') return 'Unavailable';
  return 'Not reviewed';
}

function normalizeStoredAttempt(attempt) {
  const sourceSummary = attempt.checkSummary || attempt.aiSummary || '';
  const historicalAiReport = attempt.aiReport?.status === 'Current' && HISTORICAL_PLACEHOLDER_SUMMARIES.has(attempt.aiReport.summary);
  const historicalDocumentCheck = attempt.aiReport?.type === ['Tier', '1 File Check'].join(' ') || attempt.aiReport?.type === 'Document Check';
  const storedDocumentCheck = attempt.documentCheck || (
    historicalDocumentCheck
      ? {
          ...attempt.aiReport,
          checkedAt: attempt.aiReport.generatedAt,
          checkedBy: attempt.aiReport.generatedBy,
          type: 'Document Check'
        }
      : null
  );
  const storedAiReport = historicalDocumentCheck ? null : attempt.aiReport;
  const flags = (attempt.flags || [])
    .map((flag) => flag === 'PDF OK' ? 'Drive link format accepted' : flag)
    .filter((flag) => !['AI Checked', 'Checked'].includes(flag))
    .filter((flag) => !(historicalAiReport && ['Template-like', 'Too Short'].includes(flag)));

  return {
    ...attempt,
    flags,
    primaryStatus: attempt.primaryStatus || attempt.reviewStatus || 'Received',
    checkSummary: HISTORICAL_PLACEHOLDER_SUMMARIES.has(sourceSummary) ? '' : sourceSummary,
    documentCheck: historicalAiReport ? null : storedDocumentCheck,
    aiReport: historicalAiReport ? null : storedAiReport,
    history: attempt.history || []
  };
}

export function calculateDaysLate(dueAt, submittedAt) {
  const due = new Date(dueAt);
  const submitted = new Date(submittedAt);
  if (submitted <= due) return 0;
  const diff = submitted.getTime() - due.getTime();
  return Math.max(1, Math.ceil(diff / 86_400_000));
}

export async function hashArchiveRecord(input) {
  const payload = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function formatDateTime(value) {
  const date = parseDisplayDate(value);
  if (!date) return 'Not available';
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

export function formatDate(value) {
  const date = parseDisplayDate(value);
  if (!date) return 'Not available';
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

export function formatTime(value) {
  const date = parseDisplayDate(value);
  if (!date) return 'Not available';
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function parseDisplayDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function statusDisplayLabel(status) {
  const labels = {
    'ready for review': 'Looks filled',
    'looks substantially filled': 'Looks filled',
    'needs manual verification': 'Check in PDF'
  };
  return labels[String(status || '').toLowerCase()] || status;
}

export function statusTone(status) {
  const key = String(status).toLowerCase();
  if (['retry required', 'inconclusive', 'limited review coverage', 'needs manual verification', 'check in pdf'].includes(key)) return 'warning';
  if (['reviewing', 'review limits'].includes(key)) return 'info';
  if (/^\d+\s+days?\s+late$/.test(key)) return 'warning';
  if (['pdf ok', 'accepted', 'verified', 'on time', 'active', 'ready', 'ready for review', 'looks substantially filled', 'looks filled', 'connected', 'imported', 'published', 'submitted', 'file accessible', 'no issues'].includes(key)) return 'success';
  if (['archived', 'reviewed'].includes(key)) return 'maroon';
  if (['needs review', 'template-like', 'too short', 'missing', 'blank', '#n/a', 'needs check', 'outdated', 'starter data', 'late', 'needs attention', 'needs attention — sparse content', 'could not determine'].includes(key)) return 'warning';
  if (['not pdf', 'editable link', 'inaccessible', 'blocked', 'could not check', 'no file link'].includes(key)) return 'danger';
  if (['checked', 'checking', 'received'].includes(key)) return 'info';
  return 'neutral';
}

export function makeDriveViewUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

export function firstSubmissionLink(values) {
  return Object.values(values || {}).find((value) => /^https?:\/\//i.test(String(value || '').trim())) || '';
}

export function deliverableUsesDocumentCheck(deliverable) {
  return Boolean(deliverable?.fields?.some((field) => field.pdfRequired && field.documentCheckPolicy !== 'OFF'));
}

export function reviewableSubmissionFields(deliverable) {
  return (deliverable?.fields || []).filter((field) => field.pdfRequired && field.documentCheckPolicy !== 'OFF');
}

export function aiReviewableSubmissionFields(deliverable) {
  return (deliverable?.fields || []).filter((field) => field.pdfRequired && field.aiReviewEnabled !== false && field.documentCheckPolicy !== 'OFF');
}
