
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
    const value = String(values[field.id] || '').trim();
    if (field.required && !value) {
      errors[field.id] = `${field.label} is required.`;
      continue;
    }
    if (!value || field.type === 'textarea') continue;

    const linkError = validateUrl(value);
    if (linkError) {
      errors[field.id] = linkError;
      continue;
    }

    if (field.pdfRequired) {
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

export function validateUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return 'Use a valid http or https link.';
    return '';
  } catch {
    return 'Use a complete link, including https://.';
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

export function isDocumentCheckUnavailable(response) {
  return response?.documentCheck?.status === 'Unavailable';
}

export function isAiReportCurrent(response) {
  if (response?.aiReport?.status !== 'Current' || !response.aiReport.generatedAt) return false;
  const sourceTimestamp = response.updatedAt || response.submittedAt;
  return response.aiReport.sourceResponseUpdatedAt === sourceTimestamp;
}

export function aiReviewStatus(response) {
  if (isAiReportCurrent(response)) return 'Reviewed';
  const review = response?.aiReviewState;
  if (review?.sourceResponseUpdatedAt && review.sourceResponseUpdatedAt !== (response.updatedAt || response.submittedAt)) return 'Not reviewed';
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

export function statusTone(status) {
  const key = String(status).toLowerCase();
  if (key === 'retry required') return 'warning';
  if (key === 'reviewing') return 'info';
  if (['pdf ok', 'accepted', 'verified', 'on time', 'active', 'ready', 'ready for review', 'connected', 'imported', 'published', 'submitted', 'file accessible'].includes(key)) return 'success';
  if (['archived', 'reviewed'].includes(key)) return 'maroon';
  if (['needs review', 'template-like', 'too short', 'missing', 'blank', '#n/a', 'needs check', 'outdated', 'starter data', 'late', 'needs attention'].includes(key)) return 'warning';
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
  return Boolean(deliverable?.fields?.some((field) => field.pdfRequired));
}
