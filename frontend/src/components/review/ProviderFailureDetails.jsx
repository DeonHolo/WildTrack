import { Text } from '@mantine/core';
import { providerRetryAdvice } from '../../lib/providerFailures.js';

export function ProviderFailureDetails({ diagnostic, failureCode, service = 'Gemini' }) {
  const explanation = diagnostic?.explanation || diagnostic?.reason;
  const retryAdvice = providerRetryAdvice(diagnostic, failureCode, service);
  const fields = Array.isArray(diagnostic?.parameterFields) ? diagnostic.parameterFields.join(', ') : null;
  const rows = [
    ['Service', service],
    ['Step', diagnostic?.stage],
    ['HTTP status', diagnostic?.httpStatus ?? diagnostic?.upstreamStatus],
    ['Google status', diagnostic?.providerStatus],
    ['Failure code', failureCode || diagnostic?.code],
    ['Reason code', diagnostic?.reasonCode],
    ['Parameter', fields],
    ['Cause', diagnostic?.causeType],
    ['Request reference', diagnostic?.requestId],
    ['Model', diagnostic?.model],
    ['Duration', diagnostic?.elapsedMs != null ? `${diagnostic.elapsedMs} ms` : null],
    ['Expected bytes', diagnostic?.expectedBytes],
    ['Received bytes', diagnostic?.actualBytes]
  ].filter(([, value]) => value != null && value !== '');
  return (
    <details className="wt-provider-failure" aria-label={`${service} error details`}>
      <summary>Error details</summary>
      <Text size="sm" mt="xs" style={{ overflowWrap: 'anywhere' }}>
        {explanation || 'No additional error details were saved with this attempt.'}
      </Text>
      {retryAdvice ? <Text size="sm" mt="xs">{retryAdvice}</Text> : null}
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(6rem, 1fr) minmax(0, 2fr)', gap: '0.4rem 0.75rem', fontSize: '0.8rem', marginBottom: 0 }}>
        {rows.map(([label, value]) => <DetailRow key={label} label={label} value={value} />)}
      </dl>
    </details>
  );
}

function DetailRow({ label, value }) {
  return <>
    <dt>{label}</dt>
    <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{String(value)}</dd>
  </>;
}
