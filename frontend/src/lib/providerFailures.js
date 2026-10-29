function providerName(diagnostic, service) {
  return diagnostic?.provider === 'drive' || service === 'Google Drive' || service === 'Drive' ? 'Drive' : 'Gemini';
}

function errorCode(diagnostic, failureCode) {
  const code = diagnostic?.reasonCode || failureCode || diagnostic?.code || '';
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : '';
}

export function providerFailureLabel(diagnostic, failureCode, service = 'Gemini') {
  const name = providerName(diagnostic, service);
  const status = diagnostic?.httpStatus ?? diagnostic?.upstreamStatus;
  if (Number.isInteger(status) && status >= 100 && status <= 599) return `${name} HTTP ${status}`;
  const code = errorCode(diagnostic, failureCode);
  return code ? `${name} · ${code}` : '';
}

export function providerRetryAdvice(diagnostic, failureCode, service = 'Gemini') {
  const name = providerName(diagnostic, service);
  const status = diagnostic?.httpStatus ?? diagnostic?.upstreamStatus;
  const code = errorCode(diagnostic, failureCode);
  if (status === 429 || ['RATE_LIMIT', 'RATE_LIMITED'].includes(code))
    return `${name} rate limit reached. Try again later.`;
  if (name === 'Drive' && status === 403 && (!code || code === 'UPSTREAM_ERROR'))
    return 'Drive refused this request. Try again later; temporary limits may apply.';
  if (status >= 500 || ['TIMEOUT', 'PROVIDER_TIMEOUT', 'PROVIDER_CONNECTION_FAILED'].includes(code))
    return 'Try again later. The service may be temporarily unavailable.';
  return '';
}
