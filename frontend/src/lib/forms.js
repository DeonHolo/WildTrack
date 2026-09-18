import { getTrackerColumn } from './workflow.js';

export const CHOICE_FIELD_TYPES = new Set(['dropdown', 'multipleChoice', 'checkboxes']);
export const ACADEMIC_FIELD_TYPES = new Set([
  'academicStudentNumber',
  'academicStudentName',
  'academicTeamCode',
  'academicSection'
]);

export function createLocalKey(prefix = 'item') {
  const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${token}`;
}

export function defaultSubmissionField(pdfRequired = false) {
  return pdfRequired
    ? {
        id: 'documentPdf', definitionId: null, label: 'PDF Drive Link', helpText: '', type: 'drive', required: true,
        pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true, active: true, options: []
      }
    : {
        id: 'primaryLink', definitionId: null, label: 'Submission Link', helpText: '', type: 'url', required: true,
        pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false, active: true, options: []
      };
}

export function academicFieldSuggestions(students = []) {
  const suggestions = [
    academicField('studentNumber', 'Student Number', 'academicStudentNumber', true),
    academicField('studentName', 'Student Name', 'academicStudentName', true),
    academicField('teamCode', 'Team Code', 'academicTeamCode', true)
  ];
  if (students.some((student) => String(student.section || '').trim())) {
    suggestions.push(academicField('section', 'Section', 'academicSection', false));
  }
  return suggestions;
}

export function mergeAcademicSuggestions(fields = [], students = []) {
  const active = fields.filter((field) => field.active !== false);
  const retired = fields.filter((field) => field.active === false);
  const existingTypes = new Set(active.map((field) => field.type));
  const additions = academicFieldSuggestions(students).filter((field) => !existingTypes.has(field.type));
  const combined = [...active, ...additions];
  const academicOrder = ['academicStudentNumber', 'academicStudentName', 'academicTeamCode', 'academicSection'];
  const academic = academicOrder
    .map((type) => combined.find((field) => field.type === type))
    .filter(Boolean);
  const other = combined.filter((field) => !ACADEMIC_FIELD_TYPES.has(field.type));
  return [...academic, ...other, ...retired];
}

export function makeDeliverableFormDraft(state, columnKey, now = new Date()) {
  const column = getTrackerColumn(state, columnKey);
  const key = column?.key || columnKey || 'SRS';
  const label = column?.label || key;
  const pdfRequired = Boolean(column?.pdfRequired);
  return {
    id: '',
    slug: '',
    title: `${label} Submission`,
    shortTitle: label,
    dueAt: dateAt2359(now),
    trackerColumn: key,
    instructions: pdfRequired
      ? `Paste the Google Drive link to your final ${label} PDF.`
      : `Submit the required link for ${label}.`,
    pdfRequired,
    fields: [...academicFieldSuggestions(state?.students || []), defaultSubmissionField(pdfRequired)],
    status: 'Unpublished',
    updatedAt: null
  };
}

export function makeEditableDeliverableForm(item) {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    shortTitle: item.shortTitle,
    dueAt: String(item.dueAt || '').slice(0, 16),
    trackerColumn: item.trackerColumn,
    instructions: item.instructions || '',
    pdfRequired: [...(item.fields || []), ...(item.retiredFields || [])].some((field) => field.pdfRequired && field.active !== false),
    fields: [...(item.fields || []), ...(item.retiredFields || [])].map(normalizeEditorField),
    status: item.status || 'Unpublished',
    updatedAt: item.updatedAt || null
  };
}

export function buildDeliverableFormPayload(state, source, status = source.status || 'Unpublished') {
  const column = getTrackerColumn(state, source.trackerColumn);
  const shortTitle = column?.label || source.shortTitle || source.trackerColumn;
  return {
    ...source,
    title: source.title || `${shortTitle} Submission`,
    shortTitle,
    dueAt: `${String(source.dueAt || dateAt2359()).slice(0, 16)}:00+08:00`,
    audience: 'Students',
    status,
    expectedUpdatedAt: source.updatedAt || null,
    fields: source.fields?.length ? source.fields.map(normalizeEditorField) : [defaultSubmissionField(Boolean(source.pdfRequired))]
  };
}

export function duplicateField(field) {
  const duplicate = normalizeEditorField(field);
  return {
    ...duplicate,
    definitionId: null,
    id: createLocalKey('field'),
    label: duplicate.label ? `${duplicate.label} copy` : 'Question copy',
    active: true,
    options: (duplicate.options || []).map((option) => ({
      id: null,
      _localKey: createLocalKey('option'),
      label: option.label
    }))
  };
}

export function newQuestion(type = 'shortText') {
  const choice = CHOICE_FIELD_TYPES.has(type);
  return normalizeEditorField({
    id: createLocalKey('field'),
    definitionId: null,
    label: ACADEMIC_LABELS[type] || 'New question',
    helpText: '',
    type,
    required: type === 'academicStudentNumber',
    pdfRequired: type === 'drive',
    documentCheckPolicy: type === 'drive' ? 'AUTO' : 'OFF',
    aiReviewEnabled: type === 'drive',
    active: true,
    options: choice ? [newChoiceOption('Option 1'), newChoiceOption('Option 2')] : []
  });
}

export function newChoiceOption(label = 'New option') {
  return { id: null, _localKey: createLocalKey('option'), label };
}

export function normalizeEditorField(field) {
  const type = field?.type || 'url';
  return {
    ...field,
    id: field?.id || createLocalKey('field'),
    definitionId: field?.definitionId || null,
    label: field?.label || ACADEMIC_LABELS[type] || 'Submission field',
    helpText: field?.helpText || '',
    type,
    required: field?.required !== false,
    pdfRequired: type === 'drive',
    documentCheckPolicy: type === 'drive' ? field?.documentCheckPolicy || 'AUTO' : 'OFF',
    aiReviewEnabled: type === 'drive' && Boolean(field?.aiReviewEnabled),
    active: field?.active !== false,
    options: (field?.options || []).map((option) => ({
      id: option?.id || null,
      _localKey: option?._localKey || option?.id || createLocalKey('option'),
      label: option?.label || ''
    }))
  };
}

export function dateAt2359(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T23:59`;
}

function academicField(id, label, type, required) {
  return normalizeEditorField({
    id,
    definitionId: null,
    label,
    helpText: '',
    type,
    required,
    active: true,
    options: []
  });
}

const ACADEMIC_LABELS = {
  academicStudentNumber: 'Student Number',
  academicStudentName: 'Student Name',
  academicTeamCode: 'Team Code',
  academicSection: 'Section'
};
