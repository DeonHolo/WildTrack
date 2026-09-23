import { Badge, Group, Text } from '@mantine/core';
import { formatDateTime } from '../lib/workflow.js';

export function ResponseTimingSummary({ timing, showEffective = true }) {
  if (!timing?.effectiveSubmittedAt) return null;
  return (
    <Group gap="xs" wrap="wrap">
      {showEffective ? <Text size="xs" c="dimmed">
        Effective submission {formatDateTime(timing.effectiveSubmittedAt)} · {timing.effectiveReason || 'Initial submission'}
      </Text> : null}
      <Badge color={timing.late ? 'red' : 'green'} variant="light">
        {timing.late ? `${timing.daysLate || 1} day${timing.daysLate === 1 ? '' : 's'} late` : 'On time'}
      </Badge>
    </Group>
  );
}
