import { Button, Group, Modal, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IdentificationCard, LinkBreak, Note } from '@phosphor-icons/react';
import { useState } from 'react';

export function StudentProfileSummary({ account, student, project, adviserLabel, onDisconnect }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const hasProjectNotes = Boolean(project?.proposalRemarks || project?.demoComments);

  return (
    <Paper className="wt-student-profile" withBorder radius="sm" p="lg">
      <Group className="wt-student-profile-head" align="flex-start" justify="space-between" wrap="nowrap">
        <Group align="flex-start" gap="md" wrap="nowrap">
          <ThemeIcon color="wildtrackMaroon.7" variant="light" radius="sm" size={42}>
            <IdentificationCard size={23} weight="duotone" aria-hidden="true" />
          </ThemeIcon>
          <Stack gap={2}>
            <Text size="xs" fw={750} tt="uppercase" c="wildtrackMaroon.7">Student profile</Text>
            <Title order={2} className="wt-student-name">{student.name}</Title>
            <Text size="sm" c="dimmed">{account.email}</Text>
          </Stack>
        </Group>
        <Button
          variant="subtle"
          color="wildtrackMaroon"
          leftSection={<LinkBreak size={17} />}
          onClick={onDisconnect}
        >
          Disconnect record
        </Button>
      </Group>

      <SimpleGrid component="dl" className="wt-student-profile-facts" cols={{ base: 2, sm: 4 }} spacing={0} mt="lg">
        <ProfileFact label="Student Number" value={student.studentNumber} />
        <ProfileFact label="Team" value={student.teamCode} />
        <ProfileFact label="Member" value={`#${student.memberNumber || 'Not listed'}`} />
        <ProfileFact label="Adviser" value={adviserLabel} />
      </SimpleGrid>

      <div className="wt-student-project-context">
        <div>
          <Text size="xs" fw={750} tt="uppercase" c="dimmed">Capstone project</Text>
          <Text fw={750}>{project?.projectTitle || 'Project metadata not loaded yet'}</Text>
          <Text size="sm" c="dimmed">
            {[project?.softwareName, project?.category].filter(Boolean).join(' | ') || student.teamCode}
          </Text>
        </div>
        {hasProjectNotes ? (
          <Button variant="default" leftSection={<Note size={17} />} onClick={() => setNotesOpen(true)}>
            View project notes
          </Button>
        ) : null}
      </div>

      <Modal opened={notesOpen} onClose={() => setNotesOpen(false)} title="Project notes" centered size="lg">
        <Stack gap="lg">
          <div>
            <Text fw={750}>Proposal remarks</Text>
            <Text size="sm" c={project?.proposalRemarks ? undefined : 'dimmed'}>
              {project?.proposalRemarks || 'No proposal remarks are recorded.'}
            </Text>
          </div>
          <div>
            <Text fw={750}>Demo comments</Text>
            <Text size="sm" c={project?.demoComments ? undefined : 'dimmed'}>
              {project?.demoComments || 'No demo comments are recorded.'}
            </Text>
          </div>
        </Stack>
      </Modal>
    </Paper>
  );
}

function ProfileFact({ label, value }) {
  return (
    <div className="wt-student-profile-fact">
      <Text component="dt" size="xs" fw={700} c="dimmed">{label}</Text>
      <Text component="dd" size="sm" fw={650}>{value}</Text>
    </div>
  );
}
