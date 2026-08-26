import { initialState, seedWorkspaces } from './seedData.js';
import { browserStorageKeys, isJsonStorageValue, readStorageWithMigration } from './browserStorage.js';

const STORAGE_KEY = browserStorageKeys.workflow;
const WORKSPACE_STORAGE_PREFIX = browserStorageKeys.workspacePrefix;
const WORKSPACE_CATALOG_KEY = browserStorageKeys.workspaceCatalog;
const ACTIVE_WORKSPACE_KEY = browserStorageKeys.activeWorkspace;
const STUDENT_ACCOUNTS_KEY = browserStorageKeys.studentAccounts;
const ACTIVE_STUDENT_ACCOUNT_KEY = browserStorageKeys.activeStudentAccount;
export const DEFAULT_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
export const DRIVE_CHECK_UNAVAILABLE_MESSAGE = 'This submitted file has not been checked yet.';
const HISTORICAL_PLACEHOLDER_SUMMARIES = new Set([
  'PDF link opens and contains readable SRS sections. Requirements traceability still needs review.',
  'File opens, but several sections appear close to the provided template.',
  'File opens, but extracted content appears too short for the selected deliverable.',
  'File opens and contains readable capstone sections. Review can proceed from this submission.'
]);

export function loadWorkspaceCatalog() {
  try {
    const raw = readStorageWithMigration(WORKSPACE_CATALOG_KEY, '.v2.workspaces', isJsonStorageValue);
    const stored = JSON.parse(raw || 'null');
    return Array.isArray(stored) && stored.length ? stored : seedWorkspaces;
  } catch {
    return seedWorkspaces;
  }
}

export function saveWorkspaceCatalog(workspaces) {
  localStorage.setItem(WORKSPACE_CATALOG_KEY, JSON.stringify(workspaces));
}

export function loadActiveWorkspaceId(workspaces = loadWorkspaceCatalog()) {
  const stored = readStorageWithMigration(ACTIVE_WORKSPACE_KEY, '.v2.active-workspace');
  return workspaces.some((workspace) => workspace.id === stored)
    ? stored
    : workspaces[0]?.id || DEFAULT_WORKSPACE_ID;
}

export function saveActiveWorkspaceId(workspaceId) {
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
}

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

export function loadStudentAccounts(fallback = []) {
  try {
    const raw = readStorageWithMigration(STUDENT_ACCOUNTS_KEY, '.v2.student-accounts', isJsonStorageValue);
    const stored = JSON.parse(raw || 'null');
    const accounts = Array.isArray(stored) ? stored : fallback;
    return accounts.map((account) => ({
      ...account,
      workspaceClaims: account.workspaceClaims || {}
    }));
  } catch {
    return fallback.map((account) => ({ ...account, workspaceClaims: account.workspaceClaims || {} }));
  }
}

// Ticket 09: account identities and Google subjects never persist to browser storage.
export function saveStudentAccounts() {
  // Intentionally empty. Accounts live only in memory and on the backend session.
}

export function loadActiveStudentAccountEmail(fallback = '') {
  return readStorageWithMigration(ACTIVE_STUDENT_ACCOUNT_KEY, '.v2.active-student-account') || fallback || '';
}

// Ticket 09: active account email is session-scoped in memory, not browser storage.
export function saveActiveStudentAccountEmail() {
  // Intentionally empty.
}

export function materializeStudentSession(workflowState, workspaceId) {
  const fallbackAccounts = workflowState.studentAccounts || [];
  const accounts = loadStudentAccounts(fallbackAccounts);
  const activeEmail = loadActiveStudentAccountEmail(workflowState.activeAccountEmail);
  const materializedAccounts = accounts.map((account) => {
    const hasWorkspaceClaims = Object.keys(account.workspaceClaims || {}).length > 0;
    const storedClaim = account.studentNumber && !hasWorkspaceClaims
      ? {
          studentNumber: account.studentNumber,
          studentName: account.studentName || '',
          teamCode: account.teamCode || '',
          claimedAt: account.claimedAt || account.createdAt
        }
      : null;
    const workspaceClaim = account.workspaceClaims?.[workspaceId] || storedClaim;
    return {
      ...account,
      workspaceClaims: {
        ...(account.workspaceClaims || {}),
        ...(storedClaim && !account.workspaceClaims?.[workspaceId] ? { [workspaceId]: storedClaim } : {})
      },
      studentNumber: workspaceClaim?.studentNumber || '',
      studentName: workspaceClaim?.studentName || '',
      teamCode: workspaceClaim?.teamCode || '',
      claimedAt: workspaceClaim?.claimedAt || ''
    };
  });
  const activeAccount = materializedAccounts.find((account) => account.email.toLowerCase() === String(activeEmail).toLowerCase());
  if (accounts.length && !localStorage.getItem(STUDENT_ACCOUNTS_KEY)) saveStudentAccounts(materializedAccounts);
  return {
    ...workflowState,
    studentAccounts: materializedAccounts,
    activeAccountEmail: activeAccount?.email || '',
    activeStudentNumber: activeAccount?.studentNumber || ''
  };
}

export function createWorkspaceInitialState(workspace) {
  const cloned = JSON.parse(JSON.stringify(initialState));
  if (!workspace) return cloned;
  cloned.workspaceId = workspace.id;
  cloned.classRecord.name = workspace.name;
  cloned.classRecord.trackerSheet = `${workspace.courseCode || workspace.program} Tracker`;
  if (workspace.id !== DEFAULT_WORKSPACE_ID) {
    cloned.classRecord.status = 'Starter data';
    cloned.classRecord.sources = Object.fromEntries(
      Object.entries(cloned.classRecord.sources).map(([key, source]) => [
        key,
        { ...source, status: 'Starter data', sheetUrl: '', connectedAt: '', csvUrl: '' }
      ])
    );
    const courseKey = slugify(workspace.courseCode || workspace.program || 'capstone');
    const workspaceNames = [
      'MENDOZA, ALTHEA NICOLE R.',
      'NAVARRO, GABRIEL LUIS T.',
      'LIM, SOFIA ISABEL M.',
      'RAMOS, ETHAN MIGUEL C.',
      'VILLANUEVA, CLARISSE MAE D.',
      'CASTILLO, NATHANIEL JOSE P.'
    ];
    const studentMap = new Map();
    cloned.students = cloned.students.map((student, index) => {
      const teamSuffix = String(Math.floor(index / 2) + 1).padStart(2, '0');
      const mapped = {
        ...student,
        studentNumber: `CS-${String(index + 1).padStart(4, '0')}`,
        name: workspaceNames[index] || `STUDENT ${index + 1}`,
        teamCode: `${workspace.academicYear?.replace(/-/g, '') || '2526'}-${courseKey}-${teamSuffix}`,
        section: workspace.courseCode || workspace.program,
        adviser: index < 4 ? 'Dr. Elena Mercado' : 'Prof. Adrian Flores'
      };
      studentMap.set(student.studentNumber, mapped);
      return mapped;
    });
    const projectNames = [
      ['CodeCompass: Programming Practice Companion', 'CodeCompass'],
      ['LabLink: Computing Laboratory Scheduler', 'LabLink']
    ];
    cloned.projectMetadata = cloned.projectMetadata.map((project, index) => ({
      ...project,
      groupCode: cloned.students[index * 2]?.teamCode || `${courseKey}-${index + 1}`,
      projectTitle: projectNames[index]?.[0] || project.projectTitle,
      softwareName: projectNames[index]?.[1] || project.softwareName,
      adviserName: cloned.students[index * 2]?.adviser || 'Unassigned'
    }));
    cloned.attempts = cloned.attempts.map((attempt) => {
      const mapped = studentMap.get(attempt.studentNumber);
      return mapped ? {
        ...attempt,
        id: `${attempt.id}-${courseKey}`,
        studentNumber: mapped.studentNumber,
        studentName: mapped.name,
        teamCode: mapped.teamCode
      } : attempt;
    });
    cloned.archives = [];
    cloned.studentAccounts = [];
    cloned.activeAccountEmail = '';
    cloned.activeStudentNumber = '';
    cloned.activity = [
      { id: `act-starter-${workspace.id}`, at: new Date().toISOString(), text: `Loaded starter records for ${workspace.name}.` }
    ];
  }
  return cloned;
}

export function loadWorkflowState(workspaceId = DEFAULT_WORKSPACE_ID, workspace = null) {
  try {
    const workspaceKey = `${WORKSPACE_STORAGE_PREFIX}${workspaceId}`;
    const storedWorkspace = readStorageWithMigration(
      workspaceKey,
      `.v2.workspace.${workspaceId}`,
      isJsonStorageValue
    );
    const stored = storedWorkspace || (workspaceId === DEFAULT_WORKSPACE_ID
      ? readStorageWithMigration(STORAGE_KEY, '.v2.workflow', isJsonStorageValue)
      : '');
    if (!stored) return materializeStudentSession(createWorkspaceInitialState(workspace), workspaceId);
    const parsed = JSON.parse(stored);
    const workspaceInitial = createWorkspaceInitialState(workspace);
    const isBlankStoredSeed = workspaceId === seedWorkspaces[1]?.id &&
      !(parsed.students || []).length &&
      !(parsed.deliverables || []).length &&
      Object.values(parsed.classRecord?.sources || {}).every((source) => (
        !source?.sheetUrl && source?.status === 'Not connected'
      ));
    if (isBlankStoredSeed) {
      saveWorkflowState(workspaceInitial, workspaceId);
      return materializeStudentSession(workspaceInitial, workspaceId);
    }
    return materializeStudentSession({
      ...workspaceInitial,
      ...parsed,
      workspaceId,
      deliverables: dedupeDeliverables(parsed.deliverables || workspaceInitial.deliverables).map((deliverable) => ({
        ...deliverable,
        status: deliverable.status || 'Published',
        shortTitle: deliverable.shortTitle || deliverable.trackerColumn || deliverable.title,
        instructions: normalizeDeliverableInstructions(deliverable),
        fields: (deliverable.fields || [])
          .filter((field) => field.id !== 'notes')
          .map((field) => field.pdfRequired ? { ...field, label: 'PDF Drive Link' } : field)
      })),
      attempts: (parsed.attempts || workspaceInitial.attempts).map(normalizeStoredAttempt),
      trackerColumns: parsed.trackerColumns || workspaceInitial.trackerColumns,
      projectMetadata: parsed.projectMetadata || workspaceInitial.projectMetadata || [],
      classRecord: {
        ...workspaceInitial.classRecord,
        ...(parsed.classRecord || {}),
        name: workspace?.name || (parsed.classRecord || {}).name || workspaceInitial.classRecord.name,
        trackerSheet: workspace && (parsed.classRecord || {}).sources?.tracker?.status === 'Not connected'
          ? `${workspace.courseCode || workspace.program} Tracker`
          : (parsed.classRecord || {}).trackerSheet || workspaceInitial.classRecord.trackerSheet,
        sources: {
          ...(workspaceInitial.classRecord.sources || {}),
          ...((parsed.classRecord || {}).sources || {})
        },
        importWarnings: (parsed.classRecord || {}).importWarnings || [],
        importSummary: (parsed.classRecord || {}).importSummary || null
      },
      templates: parsed.templates || workspaceInitial.templates,
      studentAccounts: parsed.studentAccounts || workspaceInitial.studentAccounts,
      activeAccountEmail: parsed.activeAccountEmail || '',
      activeStudentNumber: parsed.activeStudentNumber || ''
    }, workspaceId);
  } catch {
    return materializeStudentSession(createWorkspaceInitialState(workspace), workspaceId);
  }
}

function normalizeDeliverableInstructions(deliverable) {
  const text = String(deliverable.instructions || '');
  const hasOldPdfWarning = /editable google docs|frozen at the timestamp|editable document links/i.test(text);
  const hasPdfField = (deliverable.fields || []).some((field) => field.pdfRequired);
  if (hasPdfField && hasOldPdfWarning) {
    return `Submit your ${deliverable.shortTitle || deliverable.trackerColumn || 'document'} as a PDF Drive file.`;
  }
  return text;
}

export function saveWorkflowState(state, workspaceId = state.workspaceId || DEFAULT_WORKSPACE_ID) {
  localStorage.setItem(`${WORKSPACE_STORAGE_PREFIX}${workspaceId}`, JSON.stringify({ ...state, workspaceId }));
}

export function resetWorkflowState(workspaceId = DEFAULT_WORKSPACE_ID, workspace = null) {
  localStorage.removeItem(`${WORKSPACE_STORAGE_PREFIX}${workspaceId}`);
  if (workspaceId === DEFAULT_WORKSPACE_ID) localStorage.removeItem(STORAGE_KEY);
  return materializeStudentSession(createWorkspaceInitialState(workspace), workspaceId);
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
  (state.trackerColumns || initialState.trackerColumns || []).forEach((column, index) => {
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
  const columns = state.trackerColumns || initialState.trackerColumns;
  return columns.filter((column) => column.active !== false);
}

export function getTrackerColumn(state, key) {
  const columns = state.trackerColumns || initialState.trackerColumns;
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

export function buildPublishedSheetCsvUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  try {
    const url = new URL(text);
    const gid = url.searchParams.get('gid') || '0';

    if (url.pathname.includes('/pubhtml')) {
      url.pathname = url.pathname.replace('/pubhtml', '/pub');
      url.searchParams.set('gid', gid);
      url.searchParams.set('single', 'true');
      url.searchParams.set('output', 'csv');
      return url.toString();
    }

    if (url.pathname.includes('/pub')) {
      url.searchParams.set('output', 'csv');
      return url.toString();
    }

    const normalId = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/i)?.[1];
    if (normalId) {
      return `https://docs.google.com/spreadsheets/d/${normalId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
    }
  } catch {
    return '';
  }

  return '';
}

export async function importPublicClassRecord(sheetUrl, existingStudents = []) {
  return importPublicSheetSource('tracker', { sheetUrl }, { students: existingStudents });
}

export async function importPublicSheetSource(sourceType, payload, current) {
  const sheetUrl = payload.sheetUrl;
  const csvUrl = buildPublishedSheetCsvUrl(sheetUrl);
  if (!csvUrl) {
    return {
      ok: false,
      sourceType,
      error: 'Use a valid Google Sheet link or published Sheet URL.'
    };
  }

  let response;
  try {
    response = await fetch(csvUrl, { cache: 'no-store' });
  } catch {
    return {
      ok: false,
      sourceType,
      csvUrl,
      error: 'Could not fetch the published Sheet. If the Sheet is private, use a published/public link for this public Sheet import.'
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      sourceType,
      csvUrl,
      error: `Google Sheets returned ${response.status}. Check that the Sheet is published or public.`
    };
  }

  const csvText = await response.text();
  const parsed = parseCsv(csvText);
  const usableRows = parsed.filter((row) => row.some((cell) => String(cell || '').trim()));
  if (usableRows.length < 2) {
    return {
      ok: false,
      sourceType,
      csvUrl,
      error: 'The Sheet did not contain a header row and student rows.'
    };
  }

  if (sourceType === 'teamFormation') return normalizeTeamFormationRows(usableRows, current, csvUrl, payload.mappingOverrides);
  if (sourceType === 'projectMonitor') return normalizeProjectMonitorRows(usableRows, current, csvUrl, payload.mappingOverrides);
  return normalizeTrackerRows(usableRows, current, csvUrl, payload.mappingOverrides);
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows.map((items) => items.map((item) => String(item || '').trim()));
}

function normalizeTeamFormationRows(rows, current, csvUrl, mappingOverrides = null) {
  const headerInfo = findBestHeaderRow(rows, inferIdentityColumns, scoreTeamFormationHeader);
  const headers = headerInfo.headers;
  const identity = applyColumnOverrides(headers, inferIdentityColumns(headers), mappingOverrides);
  const warnings = [];
  const existingByNumber = new Map((current.students || []).map((student) => [normalizeStudentNumber(student.studentNumber), student]));
  const existingByTeamMember = new Map((current.students || []).map((student) => [makeTeamMemberKey(student.teamCode, student.memberNumber), student]));

  const detectedFields = [
    identity.studentNumber >= 0 ? 'Student Number' : '',
    identity.studentName >= 0 || identity.lastName >= 0 || identity.firstName >= 0 ? 'Student Name' : '',
    identity.teamCode >= 0 ? 'Team Code' : '',
    identity.memberNumber >= 0 ? 'Member Number' : '',
    identity.email >= 0 ? 'Institutional Email' : ''
  ].filter(Boolean);
  const missingFields = [
    identity.studentNumber < 0 ? 'Student Number' : '',
    identity.studentName < 0 && identity.lastName < 0 && identity.firstName < 0 ? 'Student Name' : '',
    identity.teamCode < 0 ? 'Team Code' : ''
  ].filter(Boolean);
  const mappings = mappingSuggestions(headers, identity, [
    { key: 'studentNumber', label: 'Student number', required: true },
    { key: 'studentName', label: 'Student name' },
    { key: 'lastName', label: 'Last name' },
    { key: 'firstName', label: 'First name' },
    { key: 'teamCode', label: 'Team code', required: true },
    { key: 'memberNumber', label: 'Member number' },
    { key: 'email', label: 'Institutional email' }
  ]);
  const optionalFields = [
    identity.memberNumber < 0 ? 'Member Number' : '',
    identity.email < 0 ? 'Institutional Email' : ''
  ].filter(Boolean);
  const unrecognizedFields = unrecognizedHeaders(headers, identity);
  if (missingFields.length) {
    return {
      ok: false,
      sourceType: 'teamFormation',
      csvUrl,
      error: `This Sheet does not match Team Formation. Missing: ${missingFields.join(', ')}.`,
      importSummary: {
        sourceType: 'Team Formation',
        resultStatus: 'Import blocked',
        headerRow: headerInfo.index + 1,
        headers,
        mappings,
        detectedFields,
        missingFields,
        optionalFields,
        unrecognizedFields,
        skippedRows: [],
        metrics: {},
        warnings: []
      }
    };
  }

  let skippedRows = 0;
  const skippedRowDetails = [];
  const students = rows.slice(headerInfo.index + 1).map((row, rowIndex) => {
    const studentNumber = getCell(row, identity.studentNumber);
    const name = getStudentNameFromIdentity(row, identity);
    const teamCode = getCell(row, identity.teamCode);
    const memberNumber = getCell(row, identity.memberNumber);
    if (!studentNumber || !name || !teamCode) {
      skippedRows += 1;
      skippedRowDetails.push({ rowNumber: headerInfo.index + rowIndex + 2, reason: 'Missing Student Number, name, or team code' });
      return null;
    }
    const existing = existingByNumber.get(normalizeStudentNumber(studentNumber)) || existingByTeamMember.get(makeTeamMemberKey(teamCode, memberNumber)) || {};
    return {
      ...existing,
      rowKey: existing.rowKey || `team-formation-${headerInfo.index + rowIndex + 2}`,
      studentNumber,
      name,
      teamCode,
      memberNumber: Number(memberNumber) || memberNumber || existing.memberNumber || '',
      section: getCell(row, identity.section) || existing.section || 'IT332',
      adviser: resolveAdviser(current, teamCode, getCell(row, identity.adviser), existing.adviser),
      email: getCell(row, identity.email) || existing.email || '',
      milestones: existing.milestones || {}
    };
  }).filter(Boolean);

  if (skippedRows) {
    warnings.push(`Skipped ${skippedRows} Team Formation row${skippedRows === 1 ? '' : 's'} without Student Number, name, or team code.`);
  }
  if (identity.memberNumber < 0) warnings.push('Member Number was not found; team membership order will be blank.');
  if (identity.email < 0) warnings.push('Institutional Email was not found; account matching will use Student Number.');

  const metrics = {
    students: students.length,
    officialIds: students.filter((student) => student.studentNumber).length,
    teams: new Set(students.map((student) => student.teamCode).filter(Boolean)).size,
    memberNumbers: students.filter((student) => String(student.memberNumber || '').trim()).length,
    institutionalEmails: students.filter((student) => student.email).length,
    skippedRows
  };

  return {
    ok: true,
    sourceType: 'teamFormation',
    csvUrl,
    headers,
    identity,
    students,
    warnings,
    importSummary: {
      sourceType: 'Team Formation',
      resultStatus: warnings.length ? 'Imported with warnings' : 'Imported',
      studentsFound: students.length,
      officialIdsFound: students.filter((student) => student.studentNumber).length,
      columnsFound: headers.length,
      headerRow: headerInfo.index + 1,
      headers,
      mappings,
      detectedFields,
      missingFields: [],
      optionalFields,
      unrecognizedFields,
      skippedRows: skippedRowDetails,
      metrics,
      warnings
    }
  };
}

function normalizeTrackerRows(rows, current, csvUrl, mappingOverrides = null) {
  const headerInfo = findBestHeaderRow(rows, inferIdentityColumns, scoreTrackerHeader);
  const headers = headerInfo.headers;
  const identity = applyColumnOverrides(headers, inferIdentityColumns(headers), mappingOverrides);
  const identityIndexes = new Set(Object.values(identity).filter((index) => index >= 0));
  const trackerColumns = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => header && !identityIndexes.has(index))
    .map(({ header }, index) => ({
      id: `col-import-${slugify(header) || index}`,
      key: header,
      label: header,
      sourceColumn: header,
      active: true,
      pdfRequired: isLikelyPdfDeliverable(header)
    }));
  const detectedFields = [
    identity.studentName >= 0 || identity.lastName >= 0 || identity.firstName >= 0 ? 'Student Name' : '',
    identity.teamCode >= 0 ? 'Team Code' : '',
    identity.memberNumber >= 0 ? 'Member Number' : '',
    trackerColumns.length ? `${trackerColumns.length} deliverable column${trackerColumns.length === 1 ? '' : 's'}` : ''
  ].filter(Boolean);
  const missingFields = [
    identity.studentName < 0 && identity.lastName < 0 && identity.firstName < 0 ? 'Student Name' : '',
    identity.teamCode < 0 ? 'Team Code' : '',
    trackerColumns.length === 0 ? 'Deliverable columns' : ''
  ].filter(Boolean);
  const mappings = mappingSuggestions(headers, identity, [
    { key: 'studentName', label: 'Student name', required: true },
    { key: 'lastName', label: 'Last name' },
    { key: 'firstName', label: 'First name' },
    { key: 'teamCode', label: 'Team code', required: true },
    { key: 'memberNumber', label: 'Member number' },
    { key: 'studentNumber', label: 'Student number' }
  ]);
  const optionalFields = [
    identity.studentNumber < 0 ? 'Student Number' : '',
    identity.memberNumber < 0 ? 'Member Number' : ''
  ].filter(Boolean);
  // Every remaining Tracker header is a deliverable/progress column by design.
  const unrecognizedFields = [];
  if (missingFields.length) {
    return {
      ok: false,
      sourceType: 'tracker',
      csvUrl,
      error: `This Sheet does not match Tracker. Missing: ${missingFields.join(', ')}.`,
      importSummary: {
        sourceType: 'Tracker',
        resultStatus: 'Import blocked',
        headerRow: headerInfo.index + 1,
        headers,
        mappings,
        detectedFields,
        missingFields,
        optionalFields,
        unrecognizedFields,
        skippedRows: [],
        metrics: {},
        deadlineRows: [],
        suggestedForms: [],
        warnings: []
      }
    };
  }

  const existingStudents = current.students || [];
  const existingByNameTeamMember = new Map(existingStudents.map((student) => [
    makeStudentMatchKey(student.name, student.teamCode, student.memberNumber),
    student
  ]));
  const existingByTeamMember = new Map(existingStudents.map((student) => [
    makeTeamMemberKey(student.teamCode, student.memberNumber),
    student
  ]));

  const warnings = [];
  if (identity.studentNumber < 0) {
    warnings.push('Tracker has no Student Number column. Official IDs are preserved from Team Formation only.');
  }

  let skippedRows = 0;
  const skippedRowDetails = [];
  const deadlineRows = [];
  const trackerRows = rows.slice(headerInfo.index + 1).map((row, rowIndex) => {
    const name = getStudentNameFromIdentity(row, identity);
    const teamCode = getCell(row, identity.teamCode);
    const memberNumber = getCell(row, identity.memberNumber);
    if (!name || !teamCode) {
      const suggestions = detectDeadlineSuggestions(row, headers, trackerColumns);
      if (suggestions.length) {
        deadlineRows.push({ rowNumber: headerInfo.index + rowIndex + 2, suggestions });
      }
      skippedRows += 1;
      skippedRowDetails.push({
        rowNumber: headerInfo.index + rowIndex + 2,
        reason: suggestions.length
          ? `Deadline row with ${suggestions.length} detected value${suggestions.length === 1 ? '' : 's'}`
          : 'Missing student name or team code'
      });
      return null;
    }
    const matchedExisting = existingByTeamMember.get(makeTeamMemberKey(teamCode, memberNumber)) || existingByNameTeamMember.get(makeStudentMatchKey(name, teamCode, memberNumber)) || null;
    const studentNumber = getCell(row, identity.studentNumber) || matchedExisting?.studentNumber || '';
    const milestones = Object.fromEntries(trackerColumns.map((column) => [
      column.key,
      getCell(row, headers.indexOf(column.sourceColumn))
    ]));

    return {
      ...matchedExisting,
      rowKey: matchedExisting?.rowKey || `tracker-${teamCode}-${memberNumber || rowIndex + 1}`,
      studentNumber,
      name: name || `Student ${rowIndex + 1}`,
      teamCode: teamCode || 'Unassigned',
      memberNumber: Number(memberNumber) || memberNumber || '',
      section: getCell(row, identity.section) || matchedExisting?.section || 'IT332',
      adviser: resolveAdviser(current, teamCode, getCell(row, identity.adviser), matchedExisting?.adviser),
      email: getCell(row, identity.email) || '',
      milestones
    };
  }).filter(Boolean);

  const trackerByNumber = new Map(trackerRows.filter((student) => student.studentNumber).map((student) => [normalizeStudentNumber(student.studentNumber), student]));
  const trackerByTeamMember = new Map(trackerRows.map((student) => [makeTeamMemberKey(student.teamCode, student.memberNumber), student]));
  const mergedExisting = existingStudents.length
    ? existingStudents.map((student) => {
      const tracker = trackerByNumber.get(normalizeStudentNumber(student.studentNumber)) || trackerByTeamMember.get(makeTeamMemberKey(student.teamCode, student.memberNumber));
      return tracker ? { ...student, ...tracker, studentNumber: student.studentNumber || tracker.studentNumber, email: student.email || tracker.email } : student;
    })
    : [];
  const mergedKeys = new Set(mergedExisting.map((student) => student.rowKey || makeTeamMemberKey(student.teamCode, student.memberNumber)));
  const unmatchedTrackerRows = trackerRows.filter((student) => !mergedKeys.has(student.rowKey || makeTeamMemberKey(student.teamCode, student.memberNumber)));
  const students = mergedExisting.length ? [...mergedExisting, ...unmatchedTrackerRows] : trackerRows;

  if (skippedRows) {
    warnings.push(`Skipped ${skippedRows} non-student row${skippedRows === 1 ? '' : 's'} without a name and team code.`);
  }
  if (deadlineRows.length) {
    warnings.push(`Detected ${deadlineRows.flatMap((row) => row.suggestions).length} deadline value${deadlineRows.flatMap((row) => row.suggestions).length === 1 ? '' : 's'} from skipped tracker rows.`);
  } else {
    warnings.push('No deadline row was detected. Tracker data was imported without form suggestions.');
  }

  const suggestedForms = deadlineRows.flatMap((row) => row.suggestions);
  const rosterNumbers = new Set(existingStudents.map((student) => normalizeStudentNumber(student.studentNumber)).filter(Boolean));
  const matchedRows = trackerRows.filter((student) => (
    rosterNumbers.has(normalizeStudentNumber(student.studentNumber)) ||
    existingByTeamMember.has(makeTeamMemberKey(student.teamCode, student.memberNumber))
  )).length;
  const metrics = {
    studentRows: trackerRows.length,
    trackerColumns: trackerColumns.length,
    rawProgressCells: trackerRows.length * trackerColumns.length,
    matchedRows,
    unmatchedRows: Math.max(0, trackerRows.length - matchedRows),
    deadlineValues: suggestedForms.length,
    skippedRows
  };
  return {
    ok: true,
    sourceType: 'tracker',
    csvUrl,
    headers,
    identity,
    trackerColumns,
    students,
    warnings,
    deadlineRows,
    suggestedForms,
    importSummary: {
      sourceType: 'Tracker',
      resultStatus: warnings.length ? 'Imported with warnings' : 'Imported',
      studentsFound: trackerRows.length,
      officialIdsFound: students.filter((student) => student.studentNumber).length,
      columnsFound: trackerColumns.length,
      headerRow: headerInfo.index + 1,
      headers,
      mappings,
      detectedFields,
      missingFields: [],
      optionalFields,
      unrecognizedFields,
      skippedRows: skippedRowDetails,
      metrics,
      deadlineRows,
      suggestedForms,
      warnings
    }
  };
}

function normalizeProjectMonitorRows(rows, current, csvUrl, mappingOverrides = null) {
  const headerInfo = findBestHeaderRow(rows, inferProjectMonitorColumns, scoreProjectMonitorHeader);
  const headers = headerInfo.headers;
  const indexes = applyColumnOverrides(headers, inferProjectMonitorColumns(headers), mappingOverrides);
  const warnings = [];
  const detectedFields = [
    indexes.groupCode >= 0 ? 'Group Code' : '',
    indexes.projectTitle >= 0 ? 'Project Title' : '',
    indexes.softwareName >= 0 ? 'Software Name' : '',
    indexes.description >= 0 ? 'Description' : '',
    indexes.proposalRemarks >= 0 ? 'Proposal Remarks' : '',
    indexes.demoComments >= 0 ? 'Demo Comments' : '',
    indexes.statusAdviser >= 0 ? 'Status / Adviser' : '',
    indexes.category >= 0 ? 'Category' : ''
  ].filter(Boolean);
  const missingFields = [
    indexes.groupCode < 0 ? 'Group Code' : '',
    indexes.projectTitle < 0 ? 'Project Title' : ''
  ].filter(Boolean);
  const mappings = mappingSuggestions(headers, indexes, [
    { key: 'groupCode', label: 'Group code', required: true },
    { key: 'projectTitle', label: 'Project title', required: true },
    { key: 'softwareName', label: 'Software name' },
    { key: 'description', label: 'Description' },
    { key: 'proposalRemarks', label: 'Proposal remarks' },
    { key: 'demoComments', label: 'Demo comments' },
    { key: 'statusAdviser', label: 'Status / adviser' },
    { key: 'category', label: 'Category' }
  ]);
  const optionalFields = [
    indexes.softwareName < 0 ? 'Software Name' : '',
    indexes.description < 0 ? 'Description' : '',
    indexes.proposalRemarks < 0 ? 'Proposal Remarks' : '',
    indexes.demoComments < 0 ? 'Demo Comments' : '',
    indexes.statusAdviser < 0 ? 'Status / Adviser' : '',
    indexes.category < 0 ? 'Category' : ''
  ].filter(Boolean);
  const unrecognizedFields = unrecognizedHeaders(headers, indexes);
  if (missingFields.length) {
    return {
      ok: false,
      sourceType: 'projectMonitor',
      csvUrl,
      error: `This Sheet does not match Software Project Monitor. Missing: ${missingFields.join(', ')}.`,
      importSummary: {
        sourceType: 'Software Project Monitor',
        resultStatus: 'Import blocked',
        headerRow: headerInfo.index + 1,
        headers,
        mappings,
        detectedFields,
        missingFields,
        optionalFields,
        unrecognizedFields,
        skippedRows: [],
        metrics: {},
        warnings: []
      }
    };
  }
  let skippedRows = 0;
  const skippedRowDetails = [];
  const projectMetadata = rows.slice(headerInfo.index + 1).map((row, rowIndex) => {
    const groupCode = getCell(row, indexes.groupCode);
    if (!groupCode) {
      skippedRows += 1;
      skippedRowDetails.push({ rowNumber: headerInfo.index + rowIndex + 2, reason: 'Missing group code' });
      return null;
    }
    const statusAdviser = getCell(row, indexes.statusAdviser);
    return {
      groupCode,
      projectTitle: getCell(row, indexes.projectTitle),
      softwareName: getCell(row, indexes.softwareName),
      description: getCell(row, indexes.description),
      proposalRemarks: getCell(row, indexes.proposalRemarks),
      demoComments: getCell(row, indexes.demoComments),
      adviserName: statusAdviser,
      status: statusAdviser,
      category: getCell(row, indexes.category)
    };
  }).filter(Boolean);

  if (skippedRows) warnings.push(`Skipped ${skippedRows} Software Project Monitor row${skippedRows === 1 ? '' : 's'} without a group code.`);
  const metrics = {
    groups: projectMetadata.length,
    projectTitles: projectMetadata.filter((project) => project.projectTitle).length,
    softwareNames: projectMetadata.filter((project) => project.softwareName).length,
    descriptions: projectMetadata.filter((project) => project.description).length,
    adviserAssignments: projectMetadata.filter((project) => project.adviserName).length,
    proposalRemarks: projectMetadata.filter((project) => project.proposalRemarks).length,
    demoComments: projectMetadata.filter((project) => project.demoComments).length,
    categories: projectMetadata.filter((project) => project.category).length,
    skippedRows
  };

  return {
    ok: true,
    sourceType: 'projectMonitor',
    csvUrl,
    headers,
    projectMetadata,
    warnings,
    importSummary: {
      sourceType: 'Software Project Monitor',
      resultStatus: warnings.length ? 'Imported with warnings' : 'Imported',
      groupsFound: projectMetadata.length,
      columnsFound: headers.length,
      headerRow: headerInfo.index + 1,
      headers,
      mappings,
      detectedFields,
      missingFields: [],
      optionalFields,
      unrecognizedFields,
      skippedRows: skippedRowDetails,
      metrics,
      warnings
    }
  };
}

function inferIdentityColumns(headers) {
  const normalized = headers.map((header) => normalizeHeader(header));
  return {
    studentNumber: findHeader(normalized, ['studentno', 'studentnumber', 'studentid', 'schoolid', 'idnumber', 'studno']),
    studentName: findExactHeader(normalized, ['nameofstudent', 'studentname', 'name']),
    lastName: findHeader(normalized, ['lastname', 'surname', 'familyname']),
    firstName: findHeader(normalized, ['firstname', 'givenname']),
    teamCode: findHeader(normalized, ['teamformation', 'teamcode', 'team']),
    memberNumber: findHeader(normalized, ['member', 'memberno', 'membernumber']),
    section: findHeader(normalized, ['section', 'classsection']),
    adviser: findExactHeader(normalized, ['adviser', 'advisor', 'advisername', 'advisorname', 'facultyadviser', 'capstoneadviser', 'teacher', 'instructor']),
    email: findHeader(normalized, ['email', 'gmail', 'googleaccount', 'citeduaccount', 'institutionalemail', 'citaccount'])
  };
}

function applyColumnOverrides(headers, inferred, overrides) {
  if (!overrides) return inferred;
  return Object.fromEntries(Object.entries(inferred).map(([key, currentIndex]) => {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) return [key, currentIndex];
    const requested = String(overrides[key] || '').trim();
    return [key, requested ? headers.findIndex((header) => header === requested) : -1];
  }));
}

function mappingSuggestions(headers, indexes, definitions) {
  return definitions.map(({ key, label, required = false }) => ({
    key,
    label,
    required,
    sourceColumn: indexes[key] >= 0 ? headers[indexes[key]] : ''
  }));
}

function unrecognizedHeaders(headers, indexes) {
  const recognized = new Set(Object.values(indexes).filter((index) => index >= 0));
  return headers.filter((header, index) => header && !recognized.has(index));
}

function findBestHeaderRow(rows, inferColumns, scoreHeader) {
  let best = { index: 0, headers: rows[0].map((header) => header.trim()), score: -1 };
  rows.slice(0, 20).forEach((row, index) => {
    const headers = row.map((header) => header.trim());
    const score = scoreHeader(inferColumns(headers), headers);
    if (score > best.score) {
      best = { index, headers, score };
    }
  });
  return best;
}

function scoreTeamFormationHeader(identity) {
  let score = 0;
  if (identity.studentNumber >= 0) score += 3;
  if (identity.teamCode >= 0) score += 3;
  if (identity.memberNumber >= 0) score += 2;
  if (identity.studentName >= 0) score += 2;
  if (identity.lastName >= 0) score += 1;
  if (identity.firstName >= 0) score += 1;
  if (identity.email >= 0) score += 1;
  return score;
}

function scoreTrackerHeader(identity, headers) {
  const identityScore = scoreTeamFormationHeader(identity);
  const trackerWords = ['prob', 'convergence', 'rrl', 'proposal', 'srs', 'sdd', 'source', 'demo', 'peer'];
  const trackerScore = headers
    .map((header) => normalizeHeader(header))
    .filter((header) => trackerWords.some((word) => header.includes(word)))
    .length;
  return identityScore + trackerScore;
}

function scoreProjectMonitorHeader(indexes) {
  let score = 0;
  if (indexes.groupCode >= 0) score += 3;
  if (indexes.projectTitle >= 0) score += 2;
  if (indexes.softwareName >= 0) score += 2;
  if (indexes.description >= 0) score += 1;
  if (indexes.proposalRemarks >= 0) score += 1;
  if (indexes.demoComments >= 0) score += 1;
  if (indexes.statusAdviser >= 0) score += 1;
  return score;
}

function getStudentNameFromIdentity(row, identity) {
  const fullName = getCell(row, identity.studentName);
  if (fullName) return fullName;

  const lastName = getCell(row, identity.lastName);
  const firstName = getCell(row, identity.firstName);
  if (lastName && firstName) return `${lastName}, ${firstName}`;
  return lastName || firstName || '';
}

function resolveAdviser(current, teamCode, explicitAdviser, existingAdviser) {
  if (isUsableAdviserName(explicitAdviser)) return explicitAdviser;
  const project = getProjectMetadata(current, teamCode);
  if (isUsableAdviserName(project?.adviserName)) return project.adviserName;
  if (isUsableAdviserName(existingAdviser) && existingAdviser !== 'Sir Ralph Laviste') return existingAdviser;
  return 'Unassigned';
}

function inferProjectMonitorColumns(headers) {
  const normalized = headers.map((header) => normalizeHeader(header));
  return {
    groupCode: findHeader(normalized, ['groupcode', 'teamcode', 'teamformation']),
    projectTitle: findHeader(normalized, ['projecttitle', 'title']),
    softwareName: findHeader(normalized, ['softwarename', 'software']),
    description: findHeader(normalized, ['description']),
    proposalRemarks: findHeader(normalized, ['proposalremarks', 'proposal']),
    demoComments: findHeader(normalized, ['democomments', 'demo']),
    statusAdviser: findHeader(normalized, ['statusadviser', 'adviser', 'advisor', 'status']),
    category: findHeader(normalized, ['category'])
  };
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findHeader(headers, candidates) {
  return headers.findIndex((header) => candidates.some((candidate) => header === candidate || header.includes(candidate)));
}

function findExactHeader(headers, candidates) {
  return headers.findIndex((header) => candidates.includes(header));
}

function getCell(row, index) {
  if (index < 0 || index === undefined || index === null) return '';
  return String(row[index] || '').trim();
}

function isLikelyPdfDeliverable(header) {
  const key = normalizeHeader(header);
  return ['rrl', 'projectproposal', 'srs', 'sdd', 'adviserassessment'].includes(key);
}

function makeStudentMatchKey(name, teamCode, memberNumber) {
  return `${normalizeLoose(name)}::${normalizeLoose(teamCode)}::${String(memberNumber || '').trim()}`;
}

function makeTeamMemberKey(teamCode, memberNumber) {
  return `${normalizeLoose(teamCode)}::${String(memberNumber || '').trim()}`;
}

function detectDeadlineSuggestions(row, headers, trackerColumns) {
  return trackerColumns
    .map((column) => {
      const raw = getCell(row, headers.indexOf(column.sourceColumn));
      const dueAt = coerceDueAt(raw);
      if (!dueAt) return null;
      return {
        trackerColumn: column.key,
        shortTitle: column.label,
        title: `${column.label} Submission`,
        dueAt,
        pdfRequired: column.pdfRequired,
        sourceValue: raw
      };
    })
    .filter(Boolean);
}

function coerceDueAt(value) {
  const text = String(value || '').trim();
  if (!text || /^#N\/A$/i.test(text)) return '';
  const timestampMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const parsed = timestampMatch
    ? new Date(
        Number(timestampMatch[3].length === 2 ? `20${timestampMatch[3]}` : timestampMatch[3]),
        Number(timestampMatch[1]) - 1,
        Number(timestampMatch[2]),
        timestampMatch[4] === undefined ? 23 : Number(timestampMatch[4]),
        timestampMatch[5] === undefined ? 59 : Number(timestampMatch[5]),
        timestampMatch[6] === undefined ? 0 : Number(timestampMatch[6])
      )
    : new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function applyClassRecordImport(current, payload, imported) {
  const sourceType = imported.sourceType || payload.sourceType || 'tracker';
  const sourceName = sourceType === 'teamFormation'
    ? 'Team Formation'
    : sourceType === 'projectMonitor'
      ? 'Software Project Monitor'
      : payload.trackerSheet || 'Tracker';
  const nextSources = {
    ...(current.classRecord.sources || {}),
    [sourceType]: {
      name: sourceName,
      sheetUrl: payload.sheetUrl,
      status: imported.ok ? 'Imported' : 'Needs Attention',
      connectedAt: new Date().toISOString(),
      csvUrl: imported.csvUrl || ''
    }
  };

  return {
    ...current,
    classRecord: {
      ...current.classRecord,
      name: payload.name || current.classRecord.name,
      sheetUrl: sourceType === 'tracker' ? payload.sheetUrl : current.classRecord.sheetUrl,
      sheetId: extractSheetId(payload.sheetUrl),
      trackerSheet: payload.trackerSheet || current.classRecord.trackerSheet,
      connectedAt: new Date().toISOString(),
      status: imported.ok ? 'Imported' : 'Needs Attention',
      importedColumns: imported.headers || current.classRecord.importedColumns || [],
      importWarnings: imported.warnings || [],
      importSummary: imported.importSummary || null,
      pendingFormSuggestions: sourceType === 'tracker'
        ? imported.suggestedForms || imported.importSummary?.suggestedForms || []
        : current.classRecord.pendingFormSuggestions || [],
      importError: imported.ok ? '' : imported.error,
      csvUrl: sourceType === 'tracker' ? imported.csvUrl || '' : current.classRecord.csvUrl,
      sourceType: imported.ok ? 'Published Sheet CSV' : current.classRecord.sourceType,
      sources: nextSources
    },
    students: imported.ok && imported.students ? imported.students : current.students,
    trackerColumns: imported.ok && imported.trackerColumns ? imported.trackerColumns : current.trackerColumns,
    projectMetadata: imported.ok && imported.projectMetadata ? imported.projectMetadata : current.projectMetadata,
    activity: [{
      id: `act-${Date.now()}`,
      at: new Date().toISOString(),
      text: imported.ok
        ? `Imported ${sourceName}.`
        : `Class record import needs attention: ${imported.error}`
    }, ...current.activity]
  };
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


