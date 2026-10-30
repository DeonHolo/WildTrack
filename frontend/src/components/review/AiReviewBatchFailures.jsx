import { useRef } from 'react';
import { ActionIcon, Anchor, Group, Stack, Text, Tooltip } from '@mantine/core';
import { Info, Warning } from '@phosphor-icons/react';
import { aiBatchFailureGroups, isAiBatchAccessRestriction } from '../../lib/aiReviewBatch.js';
import { TemplateChecklistNotices } from './TemplateChecklistNotices.jsx';
import { ProviderFailureDetails } from './ProviderFailureDetails.jsx';
import { AI_REVIEW_VERIFICATION_EXPLANATION } from './AiReviewHelp.jsx';

export function AiReviewBatchFailures({ entries, onOpenReview }) {
  const groups = aiBatchFailureGroups(entries.filter(entry => entry.resultStatus !== 'TEMPLATE_APPROVAL_REQUIRED'));
  const showGroup = group => <FailureGroup key={`${group.advisory}:${group.message}`} group={group} onOpenReview={onOpenReview} />;
  return <Stack gap="sm">
    {groups.filter(group => group.advisory && !group.limited).map(showGroup)}
    {groups.filter(group => group.advisory && group.limited).map(showGroup)}
    <TemplateChecklistNotices entries={entries} />
    {groups.filter(group => !group.advisory).map(showGroup)}
  </Stack>;
}

function FailureGroup({ group, onOpenReview }) {
  const details = useRef(null);
  const showAffected = () => {
    details.current.open = true;
    details.current.querySelector('summary')?.focus();
  };
  const warningLabel = group.entries.some(isAiBatchAccessRestriction)
    ? 'Show PDFs with access restrictions'
    : group.limited ? 'Show PDFs with review limits'
      : group.advisory ? 'Show PDFs with items to check' : 'Show PDFs with failed AI Reviews';
  return <div>
      <Group gap="xs" wrap="nowrap" align="flex-start">
        {warningLabel ? <Tooltip disabled={!group.limited} label={AI_REVIEW_VERIFICATION_EXPLANATION} multiline w={320} withArrow
          events={{ hover: true, focus: true, touch: true }}><ActionIcon color={group.advisory ? 'blue.7' : 'yellow.7'} variant="transparent" size={20}
          style={{ minHeight: 20, flexShrink: 0 }}
          aria-label={warningLabel} title={group.limited ? undefined : warningLabel} onClick={showAffected}>
          {group.advisory ? <Info size={16} aria-hidden="true" /> : <Warning size={16} weight="fill" aria-hidden="true" />}
        </ActionIcon></Tooltip> : null}
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
              {onOpenReview && entry.target?.responseId
                ? <Anchor component="button" type="button" size="sm" onClick={() => onOpenReview(entry)}
                    aria-label={`View AI Review: ${[name, context].filter(Boolean).join(' — ')}`}>{name}</Anchor>
                : url ? <Anchor size="sm" href={url} target="_blank" rel="noopener noreferrer">{name}</Anchor> : <span>{name}</span>}
              {context ? ` — ${context}` : ` — Submission ${index + 1}`}
              {entry.failureDetail ? ` (${entry.failureDetail})` : ''}
              {entry.failureDiagnostics ? <ProviderFailureDetails diagnostic={entry.failureDiagnostics}
                service={entry.failureDiagnostics.provider === 'drive' ? 'Google Drive' : 'Gemini'} /> : null}
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
