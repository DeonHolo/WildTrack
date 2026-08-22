export const browserStorageKeys = Object.freeze({
  workflow: 'wildtrack.v2.workflow',
  workspacePrefix: 'wildtrack.v2.workspace.',
  workspaceCatalog: 'wildtrack.v2.workspaces',
  activeWorkspace: 'wildtrack.v2.active-workspace',
  studentAccounts: 'wildtrack.v2.student-accounts',
  activeStudentAccount: 'wildtrack.v2.active-student-account',
  previewRole: 'wildtrack.v2.preview-role',
  previewAdviser: 'wildtrack.v2.preview-adviser',
  developmentPreviewOpen: 'wildtrack.v2.dev-preview-open'
});

export function readStorageWithMigration(currentKey, previousSuffix, validate = () => true) {
  const currentValue = localStorage.getItem(currentKey);
  if (currentValue !== null) return currentValue;

  const priorKey = findPriorKey(currentKey, previousSuffix, validate);
  if (!priorKey) return null;

  const priorValue = localStorage.getItem(priorKey);
  if (priorValue === null) return null;

  localStorage.setItem(currentKey, priorValue);
  localStorage.removeItem(priorKey);
  return priorValue;
}

function findPriorKey(currentKey, previousSuffix, validate) {
  for (let index = 0; index < localStorage.length; index += 1) {
    const candidateKey = localStorage.key(index);
    if (!candidateKey || candidateKey === currentKey || candidateKey.startsWith('wildtrack.')) continue;
    if (!candidateKey.endsWith(previousSuffix)) continue;

    const candidateValue = localStorage.getItem(candidateKey);
    if (candidateValue !== null && validate(candidateValue)) return candidateKey;
  }
  return null;
}

export function isJsonStorageValue(value) {
  try {
    return Boolean(JSON.parse(value));
  } catch {
    return false;
  }
}
