import { ActionIcon, Group, Paper, Text, Title, Tooltip } from '@mantine/core';
import { Info } from '@phosphor-icons/react';

const TRACKER_VALUE_HELP = 'Numbers show days late. 0 means submitted on time.';

export function StudentProgressPanel({ activeColumns, student }) {
  return (
    <Paper className="wt-student-progress" withBorder radius="sm">
      <div className="wt-student-section-head">
        <div>
          <Title order={2}>Progress</Title>
          <Text size="sm" c="dimmed">Your current class-record tracker values.</Text>
        </div>
      </div>

      <div className="wt-student-progress-body">
        <section aria-labelledby="personal-tracker-heading">
          <Group gap={6} mb="sm" wrap="nowrap">
            <Text id="personal-tracker-heading" fw={750}>Your tracker values</Text>
            <Tooltip label={TRACKER_VALUE_HELP} withArrow events={{ hover: true, focus: true, touch: true }}>
              <ActionIcon
                aria-label="Explain tracker values"
                color="wildtrackMaroon"
                radius="sm"
                size={30}
                variant="subtle"
              >
                <Info size={16} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
          </Group>
          {activeColumns.length ? (
            <dl className="wt-personal-tracker-values">
              {activeColumns.map((column) => (
                <div key={column.id}>
                  <Text component="dt" size="xs" c="dimmed">{column.label}</Text>
                  <Text component="dd" size="sm" fw={750}>{formatTrackerValue(student.milestones?.[column.key])}</Text>
                </div>
              ))}
            </dl>
          ) : (
            <Text size="sm" c="dimmed">Tracker columns have not been connected yet.</Text>
          )}
        </section>
      </div>
    </Paper>
  );
}

function formatTrackerValue(value) {
  if (value === '' || value === undefined || value === null) return 'Blank';
  return String(value);
}
