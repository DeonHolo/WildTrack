import { Alert, Button, Divider, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { ArrowRight, CheckCircle, PencilSimple } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { FormArtwork } from './FormArtwork.jsx';

export function SubmissionResult({ result, identity, onEdit }) {
  const title = result.unchanged ? 'No changes saved' : result.updated ? 'Response updated' : 'Response received';
  const description = result.unchanged
    ? 'Your existing response already contains the same information.'
    : `${result.deliverable.title} is recorded for the class tracker.`;

  return (
    <Stack gap="md">
      <FormArtwork success />
      <Paper className="wt-form-surface wt-success-surface" radius="md" p={{ base: 'lg', sm: 'xl' }}>
        <Stack gap="lg">
          <Group gap="md" align="flex-start" wrap="nowrap">
            <ThemeIcon color="green" variant="light" radius="sm" size={44}>
              <CheckCircle size={27} weight="fill" aria-hidden="true" />
            </ThemeIcon>
            <div>
              <Title order={1} size="h2">{title}</Title>
              <Text c="dimmed" mt={4}>{description}</Text>
            </div>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <div><Text className="wt-meta-label">Student</Text><Text fw={700}>{result.student?.name || identity.studentName}</Text></div>
            <div><Text className="wt-meta-label">Student Number</Text><Text ff="monospace" fw={600}>{result.student?.studentNumber || identity.studentNumber}</Text></div>
            <div><Text className="wt-meta-label">Team</Text><Text ff="monospace" fw={600}>{result.student?.teamCode || identity.teamCode}</Text></div>
            <div><Text className="wt-meta-label">Deliverable</Text><Text fw={700}>{result.deliverable.shortTitle}</Text></div>
          </SimpleGrid>

          <Divider />
          <Group justify="space-between" gap="sm" wrap="wrap">
            <Button variant="default" leftSection={<PencilSimple size={18} />} onClick={onEdit}>Edit response</Button>
            <Button component={Link} to="/student" rightSection={<ArrowRight size={18} />}>Open student dashboard</Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
