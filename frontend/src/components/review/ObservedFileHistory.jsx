import { Badge, Group, Stack, Text } from '@mantine/core';
import { formatDateTime } from '../../lib/workflow.js';

export function ObservedFileHistory({ history }) {
  if (!history) return null;
  const observations = history.observations || [];
  return (
    <Stack gap={5} mt="xs" data-testid="observed-file-history">
      <Text size="xs" fw={750}>WildTrack observed file history</Text>
      <Text size="xs" c="dimmed">{history.coverageMessage}</Text>
      <Text size="xs" c="dimmed">{history.olderRevisionHistoryMessage}</Text>
      {observations.length ? observations.map((observation, index) => (
        <Stack key={`${observation.firstObservedAt}-${observation.contentIdentifier || index}`} gap={2} pl="xs">
          <Group gap="xs" wrap="wrap">
            <Badge size="xs" variant="light" color={observation.changeType === 'CONTENT_CHANGED' ? 'orange' : 'gray'}>
              {changeLabel(observation.changeType)}
            </Badge>
            <Text size="xs" c="dimmed">Observed {formatDateTime(observation.firstObservedAt)}</Text>
          </Group>
          {observation.lastObservedAt && observation.lastObservedAt !== observation.firstObservedAt ? (
            <Text size="xs" c="dimmed">Seen again {formatDateTime(observation.lastObservedAt)}</Text>
          ) : null}
          <Text size="xs" c="dimmed">
            Drive modified {observation.driveModifiedTime ? formatDateTime(observation.driveModifiedTime) : 'Unavailable'}
          </Text>
          <Text size="xs" c="dimmed">
            Content identifier {observation.contentIdentifier || 'Unavailable'}
          </Text>
          <Text size="xs" c="dimmed">
            Modified by {observation.modifiedBy || 'Unavailable'} · {observation.editorMetadataSource || 'Google Drive File metadata'}
          </Text>
        </Stack>
      )) : <Text size="xs" c="dimmed">No persisted Document Check observation is available for this file.</Text>}
    </Stack>
  );
}

function changeLabel(type) {
  if (type === 'CONTENT_CHANGED') return 'Content changed';
  if (type === 'METADATA_CHANGED') return 'Metadata changed';
  if (type === 'SOURCE_CHANGED') return 'Source changed';
  if (type === 'FIRST_OBSERVED') return 'First observed';
  if (type === 'METADATA_OBSERVED') return 'Metadata observed';
  return 'Observed version';
}
