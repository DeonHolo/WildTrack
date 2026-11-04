const LINK_ARTIFACT_TYPES = new Set([
  'drive',
  'googleform',
  'googlesheet',
  'drivefolder',
  'url'
]);

export function isSubmissionArtifactField(field) {
  if (!field || field.active === false) return false;
  if (field.pdfRequired) return true;
  return LINK_ARTIFACT_TYPES.has(String(field.type || '').trim().toLowerCase());
}

export function submissionArtifactFields(fields = []) {
  return fields.filter(isSubmissionArtifactField);
}

// Keep earlier answers visible without treating an old field as a new PDF submission.
export function savedRetiredArtifactFields(deliverable, response) {
  return [...(deliverable?.fields || []), ...(deliverable?.retiredFields || [])]
    .filter((field, index, fields) => field.active === false
      && fields.findIndex(candidate => candidate.id === field.id) === index
      && isSubmissionArtifactField({ ...field, active: true })
      && /^https?:\/\//i.test(String(response?.values?.[field.id] || '').trim()));
}
