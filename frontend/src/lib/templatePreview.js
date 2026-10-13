import { getDocumentTemplatePreviewUrl } from './api.js';

export function artifactTemplatePreviewUrl(templates, workspaceId, deliverable, field) {
  if (!workspaceId || !deliverable || !field) return '';
  const key = String(deliverable.trackerColumn || deliverable.shortTitle || deliverable.title || '').trim().toLowerCase();
  const fieldId = field.definitionId || `${deliverable.id}:legacy`;
  const matching = (templates || []).filter(template => String(template.deliverable || '').trim().toLowerCase() === key);
  const template = matching.find(item => item.fieldId === fieldId) || matching.find(item => !item.fieldId);
  return template?.id ? getDocumentTemplatePreviewUrl(workspaceId, template.id) : '';
}
