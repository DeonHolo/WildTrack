import { Badge, Group, Text } from '@mantine/core';
import { formatDateTime } from '../lib/workflow.js';

export function ResponseTimingSummary({ timing }) {
  if (!timing?.effectiveSubmittedAt) return null;
  return (
    <Group gap="xs" wrap="wrap">
      <Text size="xs" c="dimmed">
        Effective submission {formatDateTime(timing.effectiveSubmittedAt)} · {timing.effectiveReason || 'Initial submission'}
      </Text>
      <Badge color={timing.late ? 'red' : 'green'} variant="light">
        {timing.late ? `${timing.daysLate || 1} day${timing.daysLate === 1 ? '' : 's'} late` : 'On time'}
      </Badge>
    </Group>
  );
}
