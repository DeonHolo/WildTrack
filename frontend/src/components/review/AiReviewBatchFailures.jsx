import { useRef } from 'react';
import { ActionIcon, Anchor, Group, Stack, Text } from '@mantine/core';
import { FileLock } from '@phosphor-icons/react';
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
  return <div>
      <Group gap="xs" wrap="nowrap" align="flex-start">
        {group.entries.some(isAiBatchAccessRestriction) ? <ActionIcon color="orange" variant="light" size="sm"
          aria-label="Show PDFs with access restrictions" title="Show PDFs with access restrictions" onClick={showAffected}>
          <FileLock size={16} aria-hidden="true" />
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
