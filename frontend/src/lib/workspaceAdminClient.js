import {
  createTrackerColumn,
  getStaffMonitoring,
  getTemplates,
  getWorkspaceSources,
  importSheetSource,
  updateTrackerColumn as updateBackendTrackerColumn
} from './api.js';
import {
  emptyDomainState,
  mapDeliverables,
  mapProjects,
  mapSources,
  mapStudents,
  mapTemplates,
  mapTrackerColumns
} from './backendDomain.js';
import { saveDeliverable } from './submissionClient.js';

export function emptyWorkspaceAdmin() {
  return {
    ...emptyDomainState(),
    classRecord: { sources: {}, importSummary: null, pendingFormSuggestions: [], importedColumns: [] },
    backendSync: { status: '', lastError: '', lastLoadedAt: null }
  };
}

export async function loadWorkspaceAdmin(workspaceId) {
  const [monitoring, templates, sources] = await Promise.all([
    getStaffMonitoring(workspaceId),
    getTemplates(workspaceId),
    getWorkspaceSources(workspaceId)
  ]);
  const trackerColumns = mapTrackerColumns(monitoring.trackerColumns || []);
  return {
    ...emptyWorkspaceAdmin(),
    students: mapStudents(monitoring.students || [], monitoring.trackerRows || []),
    projectMetadata: mapProjects(monitoring.projects || []),
    trackerColumns,
    deliverables: mapDeliverables(monitoring.deliverables || []),
    templates: mapTemplates(templates || []),
    classRecord: {
      sources: mapSources(sources || []),
      importSummary: null,
      pendingFormSuggestions: [],
      importedColumns: trackerColumns.map((column) => column.sourceColumn || column.label)
    },
    backendSync: { status: 'Backend data loaded.', lastError: '', lastLoadedAt: new Date().toISOString() }
  };
}

export async function importWorkspaceSheet(workspaceId, sourceType, payload) {
  const imported = await importSheetSource(sourceType, payload, workspaceId);
  const state = await loadWorkspaceAdmin(workspaceId);
  const suggestions = (imported.deadlineSuggestions || []).map((item) => ({
    trackerColumn: item.trackerColumnKey,
    shortTitle: item.trackerColumnKey,
    title: item.title,
    dueAt: item.dueAt,
    pdfRequired: item.pdfRequired,
    sourceValue: item.sourceValue,
    sourceRowNumber: item.sourceRowNumber
  }));
  const label = sourceType === 'teamFormation' ? 'Team Formation' : sourceType === 'projectMonitor' ? 'Software Project Monitor' : 'Tracker';
  const details = imported.details || {};
  state.classRecord.importSummary = {
    sourceType: label,
    resultStatus: (imported.warnings || []).length ? 'Imported with warnings' : 'Imported',
    studentsFound: imported.studentsFound,
    officialIdsFound: imported.officialIdsFound,
    groupsFound: imported.groupsFound,
    columnsFound: imported.columnsFound,
    metrics: details.metrics || {},
    detectedFields: details.detectedFields || [],
    missingFields: details.missingFields || [],
    deadlineRows: details.deadlineRows || [],
    suggestedForms: suggestions,
    warnings: imported.warnings || []
  };
  state.classRecord.pendingFormSuggestions = suggestions;
  return { ok: true, state, importSummary: state.classRecord.importSummary, suggestedForms: suggestions };
}

export async function publishSuggestedForms(workspaceId, state, suggestions) {
  const saved = [];
  for (const suggestion of suggestions || []) {
    const column = state.trackerColumns.find((item) => item.key === suggestion.trackerColumn);
    const existing = state.deliverables.find((item) => item.trackerColumn === suggestion.trackerColumn);
    const shortTitle = column?.label || suggestion.shortTitle || suggestion.trackerColumn;
    saved.push(await saveDeliverable(workspaceId, {
      id: existing?.id || '',
      slug: existing?.slug || slugify(suggestion.title || `${shortTitle} Submission`),
      title: suggestion.title || `${shortTitle} Submission`,
      shortTitle,
      dueAt: normalizeDueAt(suggestion.dueAt),
      trackerColumn: suggestion.trackerColumn,
      status: 'Published',
      instructions: suggestion.pdfRequired ? `Submit your ${shortTitle} as a PDF Drive file.` : `Submit the required link for ${shortTitle}.`,
      fields: suggestion.pdfRequired
        ? [{ id: 'documentPdf', label: 'PDF Drive Link', type: 'drive', required: true, pdfRequired: true }]
        : [{ id: 'primaryLink', label: 'Submission Link', type: 'url', required: true, pdfRequired: false }]
    }));
  }
  return saved;
}

export async function addTrackerColumn(workspaceId, label, currentColumns) {
  const clean = String(label || '').trim();
  if (!clean) throw new Error('Enter a tracker column name.');
  const displayOrder = currentColumns.length;
  const saved = await createTrackerColumn(workspaceId, {
    columnKey: clean,
    label: clean,
    sourceColumn: clean,
    sourceColumnIndex: displayOrder,
    displayOrder,
    active: true,
    pdfRequired: false
  });
  return mapTrackerColumns([saved])[0];
}

export async function updateTrackerColumn(workspaceId, column, updates) {
  const payload = { ...column, ...updates };
  const saved = await updateBackendTrackerColumn(workspaceId, column.id, {
    columnKey: payload.key,
    label: payload.label,
    sourceColumn: payload.sourceColumn || payload.label,
    sourceColumnIndex: payload.sourceColumnIndex,
    displayOrder: payload.displayOrder,
    active: payload.active,
    pdfRequired: payload.pdfRequired
  });
  return mapTrackerColumns([saved])[0];
}

function slugify(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeDueAt(value) {
  const text = String(value || '');
  if (/[zZ]|[+-]\d\d:\d\d$/.test(text)) return text;
  return text.length === 16 ? `${text}:00+08:00` : `${text}+08:00`;
}
