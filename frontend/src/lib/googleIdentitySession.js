const GOOGLE_AUTO_PROMPT_SUPPRESSION_KEY = 'wildtrack.google-auto-prompt-disabled';

export function isGoogleAutoPromptSuppressed() {
  try {
    return window.sessionStorage.getItem(GOOGLE_AUTO_PROMPT_SUPPRESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

export function clearGoogleAutoPromptSuppression() {
  try {
    window.sessionStorage.removeItem(GOOGLE_AUTO_PROMPT_SUPPRESSION_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export function disableGoogleAutoSelect() {
  try {
    window.sessionStorage.setItem(GOOGLE_AUTO_PROMPT_SUPPRESSION_KEY, 'true');
  } catch {
    // The Google SDK call below still prevents automatic selection when possible.
  }
  window.google?.accounts?.id?.disableAutoSelect?.();
}
