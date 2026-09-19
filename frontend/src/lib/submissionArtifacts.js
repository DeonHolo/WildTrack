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
