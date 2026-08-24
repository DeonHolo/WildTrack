import { Paper, Text, Title } from '@mantine/core';

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
      </div>
    </Paper>
  );
}

function formatTrackerValue(value) {
  if (value === '' || value === undefined || value === null) return 'Blank';
  return String(value);
}
