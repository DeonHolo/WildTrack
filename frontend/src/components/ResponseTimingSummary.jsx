import { Badge, Group, Stack, Text } from '@mantine/core';
import { formatDateTime } from '../lib/workflow.js';

export function ResponseTimingSummary({ timing, compact = false }) {
  if (!timing?.effectiveSubmittedAt) return null;
  const contributors = timing.contributors || [];
  const evidence = timing.artifactEvidence || [];
  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="wrap">
        <Text size="xs" c="dimmed">
          Effective submission {formatDateTime(timing.effectiveSubmittedAt)} · {timing.effectiveReason || 'Initial submission'}
        </Text>
        <Badge color={timing.late ? 'red' : 'green'} variant="light">
          {timing.late ? `${timing.daysLate || 1} day${timing.daysLate === 1 ? '' : 's'} late` : 'On time'}
        </Badge>
      </Group>
      {!compact ? (
        <details>
          <summary>Timing evidence</summary>
          <Stack gap={3} mt={4}>
            {contributors.map((item, index) => (
              <Text key={`${item.type}-${item.timestamp}-${index}`} size="xs" c="dimmed">
                {contributorLabel(item.type)}: {formatDateTime(item.timestamp)}{item.fieldLabel ? ` · ${item.fieldLabel}` : ''}
              </Text>
            ))}
            {evidence.map((item, index) => (
              <Text
                key={`${item.fieldId || item.fieldKey}-${index}`}
                size="xs"
                c={item.contentEvidenceStatus === 'UNAVAILABLE' || item.contentEvidenceStatus === 'VERIFIED_CHANGE_TIME_UNAVAILABLE' ? 'orange' : 'dimmed'}
              >
                {item.fieldLabel || item.fieldKey}: {item.message}
              </Text>
            ))}
          </Stack>
        </details>
      ) : null}
    </Stack>
  );
}

function contributorLabel(type) {
  if (type === 'MATERIAL_ARTIFACT_SAVE') return 'Material artifact save';
  if (type === 'VERIFIED_PDF_CONTENT_CHANGE') return 'Verified PDF content change';
  return 'Initial submission';
}
