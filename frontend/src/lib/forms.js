import { getTrackerColumn } from './workflow.js';

export const CHOICE_FIELD_TYPES = new Set(['dropdown', 'multipleChoice', 'checkboxes']);
export const ACADEMIC_FIELD_TYPES = new Set([
  'academicStudentNumber',
  'academicStudentName',
  'academicTeamCode',
  'academicSection'
]);
export const ACADEMIC_FIELD_ORDER = [
  'academicStudentNumber',
  'academicStudentName',
  'academicTeamCode',
  'academicSection'
];

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

export function academicFieldSuggestions() {
  return [
    academicField('studentNumber', 'Student Number', 'academicStudentNumber', true),
    academicField('studentName', 'Student Name', 'academicStudentName', true),
    academicField('teamCode', 'Team Code', 'academicTeamCode', true),
    academicField('section', 'Section', 'academicSection', false)
  ];
}

export function mergeAcademicSuggestions(fields = [], students = []) {
  const suggestions = academicFieldSuggestions(students);
  const active = fields.filter((field) => field.active !== false);
  const existingTypes = new Set(fields.map((field) => field.type));
  const reactivatedStudentNumber = !active.some((field) => field.type === 'academicStudentNumber')
    ? fields.find((field) => field.type === 'academicStudentNumber')
    : null;
  const academic = ACADEMIC_FIELD_ORDER.map((type) => {
    const current = active.find((field) => field.type === type);
    if (current) return current;
    if (type === 'academicStudentNumber' && reactivatedStudentNumber) {
      return { ...reactivatedStudentNumber, active: true };
    }
    if (!existingTypes.has(type)) return suggestions.find((field) => field.type === type);
    return null;
  }).filter(Boolean);
  const activeOther = active.filter((field) => !ACADEMIC_FIELD_TYPES.has(field.type));
  const retired = fields.filter((field) => field.active === false && field !== reactivatedStudentNumber);
  return [...academic, ...activeOther, ...retired];
}

export function applyAcademicSuggestionReview(fields = [], orderedTypes = ACADEMIC_FIELD_ORDER, selectedTypes = ACADEMIC_FIELD_ORDER) {
  const selected = new Set(selectedTypes);
  selected.add('academicStudentNumber');
  const suggestions = new Map(academicFieldSuggestions().map((field) => [field.type, field]));
  const academicFields = fields.filter((field) => ACADEMIC_FIELD_TYPES.has(field.type));
  const selectedAcademic = [];
  const chosen = new Set();

  for (const type of orderedTypes) {
    if (!ACADEMIC_FIELD_TYPES.has(type) || !selected.has(type)) continue;
    const existing = academicFields.find((field) => field.type === type && field.active !== false)
      || academicFields.find((field) => field.type === type);
    if (existing) {
      chosen.add(existing);
      selectedAcademic.push(existing.active === false ? { ...existing, active: true } : existing);
    } else {
      selectedAcademic.push(suggestions.get(type));
    }
  }

  const activeOther = fields.filter((field) => field.active !== false && !ACADEMIC_FIELD_TYPES.has(field.type));
  const retiredHistorical = fields.flatMap((field) => {
    if (!ACADEMIC_FIELD_TYPES.has(field.type)) return field.active === false ? [field] : [];
    if (chosen.has(field)) return [];
    return field.definitionId ? [{ ...field, active: false }] : [];
  });
  return [...selectedAcademic.filter(Boolean), ...activeOther, ...retiredHistorical];
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
    documentCheckPolicy: type === 'drive' ? 'AUTO' : 'OFF',
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
