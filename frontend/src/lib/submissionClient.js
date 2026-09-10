import {
  clearDraft,
  confirmStudentAssociation,
  deleteDocumentTemplate,
  getDeliverables,
  getDraft,
  getMyAssociation,
  getMyResponse,
  getPublicSubmissionForm,
  saveBackendDeliverable,
  saveDraft,
  submitResponse,
  uploadDocumentTemplate,
  uploadDriveDocumentTemplate
} from './api.js';

export async function listDeliverables(workspaceId) {
  const deliverables = await getDeliverables(workspaceId);
  return (deliverables || []).map(mapDeliverable);
}

export async function saveDeliverable(workspaceId, payload) {
  return mapDeliverable(await saveBackendDeliverable(workspaceId, payload));
}

export function unpublishDeliverable(workspaceId, deliverable) {
  return saveDeliverable(workspaceId, { ...deliverable, status: 'Unpublished' });
}

export function saveSubmissionTemplate(workspaceId, payload) {
  return payload.sourceType === 'drive'
    ? uploadDriveDocumentTemplate(workspaceId, {
        deliverableKey: payload.deliverable,
        fieldId: payload.fieldId || null,
        displayName: payload.name,
        driveUrl: payload.driveUrl
      })
    : uploadDocumentTemplate(workspaceId, {
        deliverableKey: payload.deliverable,
        fieldId: payload.fieldId || null,
        displayName: payload.name,
        file: payload.file
      });
}

export function removeSubmissionTemplate(workspaceId, templateId) {
  return deleteDocumentTemplate(workspaceId, templateId);
}

export async function openPublicSubmission(workspaceKey, slug) {
  const payload = await getPublicSubmissionForm(workspaceKey, slug);
  if (!payload?.deliverable) return null;
  return {
    workspace: payload.workspace,
    deliverable: mapDeliverable(payload.deliverable)
  };
}

export async function loadSubmissionState(workspaceId, deliverableId) {
  const [association, draft, response] = await Promise.all([
    getMyAssociation(workspaceId),
    getDraft(workspaceId, deliverableId),
    getMyResponse(workspaceId, deliverableId)
  ]);
  const ownedResponse = response ? { ...response, values: parseValues(response.valuesJson) } : null;
  const savedDraft = draft?.present ? draft : null;
  // A newer draft is unfinished work on the submitted response; an older draft
  // must not roll back a submission made from another session.
  const useDraft = savedDraft && (!response || Date.parse(savedDraft.updatedAt) >= Date.parse(response.updatedAt));
  return {
    association: association || null,
    draft: savedDraft,
    response: ownedResponse,
    values: useDraft ? savedDraft.values || {} : ownedResponse?.values || {}
  };
}

export function saveSubmissionDraft(workspaceId, deliverableId, values, revision) {
  return saveDraft(workspaceId, deliverableId, values, revision);
}

export function commitSubmission(workspaceId, deliverableId, values, revision) {
  return submitResponse(workspaceId, deliverableId, values, revision);
}

export function confirmSubmissionAssociation(workspaceId, studentNumber) {
  return confirmStudentAssociation(workspaceId, studentNumber);
}

export function clearSubmissionDraft(workspaceId, deliverableId) {
  return clearDraft(workspaceId, deliverableId);
}

export function describeSubmissionError(error) {
  if (error?.status === 401) return 'Your Google session expired. Continue with Google again.';
  if (error?.status === 403) return 'This account is not allowed to submit in this workspace.';
  if (error?.status === 404) return 'This submission form is no longer available.';
  return error?.message || 'The response could not be saved. Try again.';
}

export function mapDeliverable(deliverable) {
  const pdfRequired = Boolean(deliverable?.pdfRequired);
  const fieldItems = Array.isArray(deliverable?.fields) && deliverable.fields.length
    ? deliverable.fields.map(mapSubmissionField)
    : [legacyField(pdfRequired)];
  return {
    id: deliverable.id,
    slug: deliverable.slug,
    title: deliverable.title,
    shortTitle: deliverable.trackerColumnKey,
    dueAt: normalizeDueAt(deliverable.dueAt),
    trackerColumn: deliverable.trackerColumnKey,
    audience: 'Students',
    status: titleCase(deliverable.status || 'PUBLISHED'),
    instructions: deliverable.instructions || '',
    pdfRequired: fieldItems.some((field) => field.active !== false && field.pdfRequired),
    fields: fieldItems.filter((field) => field.active !== false),
    retiredFields: fieldItems.filter((field) => field.active === false)
  };
}

function mapSubmissionField(field) {
  const type = ({
    DRIVE_PDF: 'drive',
    GOOGLE_FORM: 'googleForm',
    GOOGLE_SHEET: 'googleSheet',
    DRIVE_FOLDER: 'driveFolder',
    TEXTAREA: 'textarea',
    GENERAL_URL: 'url'
  })[field.fieldType] || 'url';
  return {
    definitionId: field.id || null,
    id: field.fieldKey || field.id,
    label: field.label || 'Submission field',
    type,
    required: field.required !== false,
    pdfRequired: type === 'drive',
    documentCheckPolicy: type === 'drive' ? field.documentCheckPolicy || 'AUTO' : 'OFF',
    aiReviewEnabled: type === 'drive' && Boolean(field.aiReviewEnabled),
    active: field.active !== false
  };
}

function legacyField(pdfRequired) {
  return pdfRequired
    ? { definitionId: null, id: 'documentPdf', label: 'PDF Drive Link', type: 'drive', required: true, pdfRequired: true, documentCheckPolicy: 'AUTO', aiReviewEnabled: true, active: true }
    : { definitionId: null, id: 'primaryLink', label: 'Submission Link', type: 'url', required: true, pdfRequired: false, documentCheckPolicy: 'OFF', aiReviewEnabled: false, active: true };
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/(^|[_\s-]+)(\w)/g, (_, prefix, letter) => `${prefix ? ' ' : ''}${letter.toUpperCase()}`);
}

function normalizeDueAt(value) {
  const text = String(value || '');
  if (!text || /[zZ]|[+-]\d\d:\d\d$/.test(text)) return text;
  return `${text}+08:00`;
}

function parseValues(valuesJson) {
  if (!valuesJson) return {};
  if (typeof valuesJson === 'object') return valuesJson;
  try {
    return JSON.parse(valuesJson);
  } catch {
    return {};
  }
}
