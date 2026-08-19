import { getTrackerColumn } from './workflow.js';

const pdfField = {
  id: 'documentPdf',
  label: 'PDF Drive Link',
  type: 'drive',
  required: true,
  pdfRequired: true
};

const linkField = {
  id: 'primaryLink',
  label: 'Submission Link',
  type: 'url',
  required: true,
  pdfRequired: false
};

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
      ? `Submit your ${label} as a PDF Drive file.`
      : `Submit the required link for ${label}.`,
    pdfRequired,
    status: 'Published'
  };
}

export function buildDeliverableFormPayload(state, source) {
  const column = getTrackerColumn(state, source.trackerColumn);
  const shortTitle = column?.label || source.shortTitle || source.trackerColumn;
  return {
    ...source,
    title: source.title || `${shortTitle} Submission`,
    shortTitle,
    dueAt: `${String(source.dueAt || dateAt2359()).slice(0, 16)}:00+08:00`,
    audience: 'Students',
    status: 'Published',
    fields: source.pdfRequired ? [pdfField] : [linkField]
  };
}

export function dateAt2359(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T23:59`;
}
