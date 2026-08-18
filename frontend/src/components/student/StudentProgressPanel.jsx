import { Group, Paper, Progress, Text, Title } from '@mantine/core';

export function StudentProgressPanel({ activeColumns, groupProgress, student }) {
  const teamPercent = groupProgress.teamSize
    ? Math.round((groupProgress.submittedMembers / groupProgress.teamSize) * 100)
    : 0;

  return (
    <Paper className="wt-student-progress" withBorder radius="sm">
      <div className="wt-student-section-head">
        <div>
          <Title order={2}>Progress</Title>
          <Text size="sm" c="dimmed">Your class-record values and a concise team submission overview.</Text>
        </div>
      </div>

      <div className="wt-student-progress-body">
        <section aria-labelledby="personal-tracker-heading">
          <Text id="personal-tracker-heading" fw={750} mb="sm">Your tracker values</Text>
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

        <section className="wt-team-progress" aria-labelledby="team-progress-heading">
          <Group justify="space-between" align="baseline" gap="md">
            <Text id="team-progress-heading" fw={750}>Team submissions</Text>
            <Text size="sm" fw={750}>{groupProgress.submittedMembers}/{groupProgress.teamSize} members</Text>
          </Group>
          <Progress value={teamPercent} color="wildtrackMaroon.7" size="sm" mt="sm" aria-label={`${teamPercent}% of team members have submitted`} />
          <Text size="sm" c="dimmed" mt="sm">
            {groupProgress.names.length
              ? `Members with a recorded response: ${groupProgress.names.join(', ')}.`
              : 'No team member has a recorded response yet.'}
          </Text>
        </section>
      </div>
    </Paper>
  );
}

function formatTrackerValue(value) {
  if (value === '' || value === undefined || value === null) return 'Blank';
  return String(value);
}
