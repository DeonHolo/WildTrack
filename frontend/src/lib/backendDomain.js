import { mapDeliverable } from './submissionClient.js';

export function mapProjects(items = []) {
  return items.map((project) => ({
    id: project.id,
    groupCode: project.groupCode,
    sourceGroupCode: project.sourceGroupCode || project.groupCode,
    projectTitle: project.projectTitle || '',
    softwareName: project.softwareName || '',
    description: project.description || '',
    proposalRemarks: project.proposalRemarks || '',
    demoComments: project.demoComments || '',
    adviserName: project.adviserName || '',
    status: project.projectStatus || '',
    category: project.category || ''
  }));
}

export function mapTrackerColumns(items = []) {
  return items.map((column) => ({
    id: column.id,
    key: column.columnKey,
    label: column.label,
    sourceColumn: column.sourceColumn,
    sourceColumnIndex: column.sourceColumnIndex,
    displayOrder: column.displayOrder,
    active: column.active,
    pdfRequired: column.pdfRequired
  }));
}

export function mapStudents(studentItems = [], trackerRows = []) {
  const records = studentItems.map((student) => ({
    rowKey: student.id,
    studentNumber: student.studentNumber || '',
    name: student.studentName || '',
    teamCode: student.teamCode || '',
    teamFormationCode: student.teamFormationCode || '',
    memberNumber: student.memberNumber || '',
    section: student.sectionName || '',
    adviser: student.adviserName || '',
    softwareTitle: student.softwareTitle || '',
    currentActive: student.currentActive !== false,
    email: student.institutionalEmail || '',
    milestones: {}
  }));
  if (!trackerRows.length) return records;

  const byStudentNumber = new Map(records
    .filter((student) => student.studentNumber)
    .map((student) => [normalizeStudentNumber(student.studentNumber), student]));
  const byTeamMember = new Map(records.map((student) => [
    `${normalize(student.teamCode)}::${normalize(student.memberNumber)}`,
    student
  ]));

  return trackerRows.map((row) => {
    const matched = row.studentNumber
      ? byStudentNumber.get(normalizeStudentNumber(row.studentNumber))
      : byTeamMember.get(`${normalize(row.teamCode)}::${normalize(row.memberNumber)}`);
    return {
      ...(matched || {}),
      rowKey: row.id,
      studentNumber: row.studentNumber || matched?.studentNumber || '',
      name: row.studentName || matched?.name || '',
      teamCode: row.teamCode || matched?.teamCode || '',
      teamFormationCode: matched?.teamFormationCode || '',
      memberNumber: row.memberNumber || matched?.memberNumber || '',
      section: row.sectionName || matched?.section || '',
      adviser: row.adviserName || matched?.adviser || '',
      softwareTitle: matched?.softwareTitle || '',
      email: matched?.email || '',
      milestones: Object.fromEntries((row.cells || []).map((cell) => [cell.columnKey, cell.rawValue || '']))
    };
  });
}

export function mapDeliverables(items = []) {
  return items.map(mapDeliverable);
}

export function mapTemplates(items = []) {
  return items.map((template) => ({
    id: template.id,
    deliverable: template.deliverableKey,
    fieldId: template.fieldId || null,
    name: template.displayName,
    originalFilename: template.originalFilename,
    contentType: template.contentType,
    sha256: template.sha256,
    extractedCharacterCount: template.extractedCharacterCount,
    status: 'Active',
    extractedAt: template.updatedAt
  }));
}

export function mapSources(items = []) {
  const sources = {};
  for (const source of items) {
    const key = source.sourceType === 'TEAM_FORMATION'
      ? 'teamFormation'
      : source.sourceType === 'PROJECT_MONITOR' ? 'projectMonitor' : 'tracker';
    sources[key] = {
      status: source.status === 'IMPORTED' ? 'Imported' : source.status === 'CONNECTED' ? 'Connected' : 'Not connected',
      sheetUrl: source.sheetUrl || '',
      displayName: source.displayName || '',
      connectedAt: source.connectedAt || ''
    };
  }
  return sources;
}

export function mapResponse(response) {
  return {
    id: response.id,
    deliverableId: response.deliverableId,
    studentNumber: response.studentNumber || '',
    studentName: response.studentName || '',
    teamCode: response.teamCode || '',
    googleSubject: response.googleSubject || '',
    googleEmailSnapshot: response.googleEmail || '',
    submittedAt: response.submittedAt,
    updatedAt: response.updatedAt,
    values: parseValues(response.valuesJson),
    flags: [],
    feedback: [],
    acceptance: null,
    archiveStatus: 'Not Archived',
    reviewStatus: 'Received',
    primaryStatus: 'Received'
  };
}

export function applyReviewState(response, reviewState = {}) {
  const acceptance = reviewState.acceptance || null;
  const accepted = acceptance && sameInstant(acceptance.sourceResponseUpdatedAt, response.updatedAt || response.submittedAt);
  const fieldNeedsReview = Object.values(response.artifactChecks || {}).some((report) => report?.attentionRequired);
  return {
    ...response,
    feedback: reviewState.feedback || [],
    acceptance: accepted ? acceptance : null,
    flags: accepted ? [...new Set([...(response.flags || []), 'Accepted'])] : (response.flags || []).filter((flag) => flag !== 'Accepted'),
    reviewStatus: accepted ? 'Accepted' : (response.documentCheck?.attentionRequired || fieldNeedsReview) ? 'Needs Review' : 'Received',
    primaryStatus: accepted ? 'Accepted' : (response.documentCheck?.attentionRequired || fieldNeedsReview) ? 'Needs Review' : 'Received'
  };
}

export function applyFileCheck(response, report) {
  if (!report) return response;
  const status = report.status === 'UNAVAILABLE' ? 'Unavailable' : report.status;
  return {
    ...response,
    flags: [...new Set([...(response.flags || []), ...(report.flags || [])])],
    checkSummary: report.summary || '',
    fileCheckStatus: status,
    fileCheckError: '',
    documentCheck: {
      ...report,
      type: 'Document Check',
      status: report.status === 'UNAVAILABLE' ? 'Unavailable' : 'Current',
      reportId: report.id
    }
  };
}

export function applyFieldChecks(response, reports = {}) {
  const normalized = Object.fromEntries(Object.entries(reports || {}).map(([fieldId, report]) => [fieldId, normalizeFileCheck(report)]));
  const allFlags = Object.values(normalized).flatMap((report) => report?.flags || []);
  const first = Object.values(normalized)[0] || null;
  return {
    ...response,
    artifactChecks: normalized,
    flags: [...new Set([...(response.flags || []), ...allFlags])],
    ...(response.documentCheck || !first ? {} : {
      documentCheck: first,
      checkSummary: first.summary || '',
      fileCheckStatus: first.status
    })
  };
}

export function emptyDomainState() {
  return {
    students: [],
    trackerColumns: [],
    projectMetadata: [],
    deliverables: [],
    attempts: [],
    templates: [],
    archives: [],
    classRecord: { sources: {}, importSummary: null, pendingFormSuggestions: [] }
  };
}

function parseValues(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeStudentNumber(value) {
  return normalize(value).replace(/[^a-z0-9]/g, '');
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function sameInstant(first, second) {
  const firstTime = Date.parse(first || '');
  const secondTime = Date.parse(second || '');
  return Number.isFinite(firstTime) && firstTime === secondTime;
}

export function applyAiReview(response, review) {
  return { ...response, aiReviewState: review || null, aiReport: review?.status === 'COMPLETED' && review.report ? {
    ...review.report, status: 'Current', generatedAt: review.generatedAt,
    sourceResponseUpdatedAt: review.sourceResponseUpdatedAt, sourceVerified: review.sourceVerified,
    reused: review.reused
  } : null };
}

export function applyFieldAiReviews(response, reviews = {}) {
  const artifactAiReviews = { ...(response.artifactAiReviews || {}) };
  for (const [fieldId, review] of Object.entries(reviews || {})) {
    artifactAiReviews[fieldId] = review || null;
  }
  return { ...response, artifactAiReviews };
}

function normalizeFileCheck(report) {
  if (!report) return null;
  return {
    ...report,
    type: 'Document Check',
    status: report.status === 'UNAVAILABLE' ? 'Unavailable' : report.status === 'BLOCKED' ? 'Current' : 'Current',
    reportId: report.id
  };
}
