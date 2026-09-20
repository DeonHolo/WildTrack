import { Badge, Group, Stack, Text } from '@mantine/core';
import { formatDateTime } from '../../lib/workflow.js';

export function ObservedFileHistory({ history }) {
  if (!history) return null;
  const observations = history.observations || [];
  return (
    <Stack gap="sm" data-testid="observed-file-history">
      <Text fw={750}>WildTrack observed file history</Text>
      <Text size="md" lh={1.5} c="dimmed">{history.coverageMessage || 'File states recorded when WildTrack ran Document Check.'}</Text>
      <Text size="md" lh={1.5} c="dimmed">Google Drive revision metadata, when authorized and available, is shown separately below.</Text>
      {observations.length ? observations.map((observation, index) => (
        <Stack key={`${observation.firstObservedAt}-${observation.contentIdentifier || index}`} gap="xs" className="observed-file-history-entry">
          <Group gap="xs" wrap="wrap">
            <Badge size="sm" variant="light" color={observation.changeType === 'CONTENT_CHANGED' ? 'orange' : 'gray'}>
              {changeLabel(observation.changeType)}
            </Badge>
            <Text size="md" lh={1.5} c="dimmed">Observed {formatDateTime(observation.firstObservedAt)}</Text>
          </Group>
          {observation.lastObservedAt && observation.lastObservedAt !== observation.firstObservedAt ? (
            <Text size="md" lh={1.5} c="dimmed">Seen again {formatDateTime(observation.lastObservedAt)}</Text>
          ) : null}
          <Text size="md" lh={1.5} c="dimmed">
            Drive modified {observation.driveModifiedTime ? formatDateTime(observation.driveModifiedTime) : 'Unavailable'}
          </Text>
          <Text size="md" lh={1.5} c="dimmed" className="observed-file-history-identifier">
            Content identifier {observation.contentIdentifier || 'Unavailable'}
          </Text>
          <Text size="md" lh={1.5} c="dimmed">
            Modified by {observation.modifiedBy || 'Unavailable'} · {observation.editorMetadataSource || 'Google Drive File metadata'}
          </Text>
        </Stack>
      )) : <Text size="md" lh={1.5} c="dimmed">No persisted Document Check observation is available for this file.</Text>}
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
