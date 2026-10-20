import { useRef } from 'react';
import { ActionIcon, Anchor, Group, Stack, Text } from '@mantine/core';
import { Warning } from '@phosphor-icons/react';
import { aiBatchFailureGroups, isAiBatchAccessRestriction } from '../../lib/aiReviewBatch.js';

export function AiReviewBatchFailures({ entries }) {
  return <Stack gap="sm">
    {aiBatchFailureGroups(entries).map(group => <FailureGroup key={group.message} group={group} />)}
  </Stack>;
}

function FailureGroup({ group }) {
  const details = useRef(null);
  const showAffected = () => {
    details.current.open = true;
    details.current.querySelector('summary')?.focus();
  };
  const warningLabel = group.entries.some(isAiBatchAccessRestriction)
    ? 'Show PDFs with access restrictions'
    : group.advisory ? 'Show PDFs with review limits' : '';
  return <div>
      <Group gap="xs" wrap="nowrap" align="flex-start">
        {warningLabel ? <ActionIcon color="yellow.7" variant="transparent" size={20}
          style={{ minHeight: 20, flexShrink: 0 }}
          aria-label={warningLabel} title={warningLabel} onClick={showAffected}>
          <Warning size={16} weight="fill" aria-hidden="true" />
        </ActionIcon> : null}
        <Text size="sm">{group.message}</Text>
      </Group>
      <details ref={details} className="wt-ai-batch-details">
        <summary>See affected PDFs</summary>
        <Stack component="ul" gap="xs" style={{ margin: 0, paddingInlineStart: 20 }}>
          {group.entries.map((entry, index) => {
            const identity = entry.identity || entry.preview || {};
            const name = identity.fileName || identity.deliverableTitle || 'PDF submission';
            const context = [identity.fileName && identity.deliverableTitle, identity.studentName, identity.artifactLabel].filter(Boolean).join(' — ');
            const url = safeDriveUrl(identity.sourceUrl);
            return <Text component="li" size="sm" key={`${entry.target?.responseId}:${entry.target?.fieldId}:${index}`}>
              {url ? <Anchor size="sm" href={url} target="_blank" rel="noopener noreferrer">{name}</Anchor> : <span>{name}</span>}
              {context ? ` — ${context}` : ` — Submission ${index + 1}`}
              {entry.failureDetail ? ` (${entry.failureDetail.toLowerCase()})` : ''}
            </Text>;
          })}
        </Stack>
      </details>
    </div>;
}

function safeDriveUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.host === 'drive.google.com' ? url.href : '';
  } catch { return ''; }
}
