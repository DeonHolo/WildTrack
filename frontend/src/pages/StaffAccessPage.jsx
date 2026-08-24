import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  ThemeIcon
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { UsersThree, UserPlus, LinkSimple } from '@phosphor-icons/react';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import {
  assignAdviserTeam,
  getStaffProfiles,
  unassignAdviserTeam,
  upsertStaffEmail
} from '../lib/api.js';

export function StaffAccessPage() {
  const { state, activeWorkspace } = useWorkflow();
  const [profiles, setProfiles] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(null); // profile being assigned teams
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('ADVISER');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [error, setError] = useState('');

  const workspaceId = activeWorkspace?.id;
  const teamCodes = useMemo(
    () => [...new Set(state.students.map((student) => student.teamCode).filter(Boolean))].sort(),
    [state.students]
  );

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) return undefined;
    getStaffProfiles(workspaceId)
      .then((list) => { if (!cancelled) setProfiles(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setProfiles([]); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  async function handleAdd(event) {
    event.preventDefault();
    setError('');
    try {
      const updated = await upsertStaffEmail(workspaceId, newEmail.trim(), [newRole]);
      setProfiles((current) => [...(current || []).filter((p) => p.googleSubject !== updated.googleSubject), updated]);
      setAddOpen(false);
      setNewEmail('');
    } catch (saveError) {
      setError(saveError.message || 'Could not save the staff email.');
    }
  }

  async function handleAssign(profile) {
    if (!selectedTeam || !profile.googleSubject?.startsWith('pending:') === false) return; // only bound subjects get teams
    try {
      await assignAdviserTeam(workspaceId, profile.googleSubject, selectedTeam);
      setProfiles((current) => (current || []).map((p) => (
        p.googleSubject === profile.googleSubject && !p.assignedTeams.includes(selectedTeam)
          ? { ...p, assignedTeams: [...p.assignedTeams, selectedTeam] }
          : p
      )));
      setSelectedTeam('');
    } catch (assignError) {
      setError(assignError.message || 'Could not assign the team.');
    }
  }

  async function handleUnassign(profile, teamCode) {
    await unassignAdviserTeam(workspaceId, profile.googleSubject, teamCode);
    setProfiles((current) => (current || []).map((p) => (
      p.googleSubject === profile.googleSubject
        ? { ...p, assignedTeams: p.assignedTeams.filter((t) => t !== teamCode) }
        : p
    )));
  }

  return (
    <main className="wt-staff-root">
      <Container size="lg" py="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Group gap="sm" align="center">
              <ThemeIcon color="wildtrackMaroon.7" variant="light" radius="sm" size={38}>
                <UsersThree size={21} weight="duotone" aria-hidden="true" />
              </ThemeIcon>
              <div>
                <Title order={2}>Staff access</Title>
                <Text size="sm" c="dimmed">Manage adviser and admin access for this workspace.</Text>
              </div>
            </Group>
            <Button leftSection={<UserPlus size={17} />} onClick={() => setAddOpen(true)}>
              Add staff email
            </Button>
          </Group>

          {profiles === null ? (
            <Center mih={200}><Loader size="sm" aria-label="Loading staff profiles" /></Center>
          ) : profiles.length === 0 ? (
            <Paper withBorder radius="sm" p="xl">
              <Text c="dimmed">No staff configured yet. Add the first Google email to grant access.</Text>
            </Paper>
          ) : (
            <Paper withBorder radius="sm">
              <Table verticalSpacing="sm" horizontalSpacing="md" aria-label="Staff access list">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Google email</Table.Th>
                    <Table.Th>Roles</Table.Th>
                    <Table.Th>Assigned teams</Table.Th>
                    <Table.Th><span className="wt-visually-hidden">Actions</span></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {profiles.map((profile) => (
                    <Table.Tr key={profile.googleSubject + ':' + profile.roles.join()}>
                      <Table.Td>
                        <Text size="sm" ff="monospace">{profile.googleEmail}</Text>
                        {profile.googleSubject.startsWith('pending:') && (
                          <Text size="xs" c="dimmed">Binds on first verified sign-in</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6}>
                          {profile.roles.map((role) => (
                            <Badge key={role} variant="light" color="wildtrackMaroon.7">{role}</Badge>
                          ))}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        {profile.assignedTeams.length === 0 ? (
                          <Text size="sm" c="dimmed">No teams assigned</Text>
                        ) : (
                          <Group gap={5}>
                            {profile.assignedTeams.map((teamCode) => (
                              <Badge
                                key={teamCode}
                                variant="outline"
                                rightSection={
                                  <Button
                                    variant="subtle"
                                    size="compact-xs"
                                    aria-label={'Remove ' + teamCode}
                                    onClick={() => handleUnassign(profile, teamCode)}
                                  >×</Button>
                                }
                              >{teamCode}</Badge>
                            ))}
                          </Group>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {!profile.googleSubject.startsWith('pending:') && (
                          <Button
                            variant="subtle"
                            size="compact-sm"
                            leftSection={<LinkSimple size={15} />}
                            onClick={() => { setLinkOpen(profile); setSelectedTeam(teamCodes[0] || ''); }}
                            disabled={!profile.roles.includes('ADVISER')}
                          >
                            Assign teams
                          </Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}

          <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add staff Google email" centered>
            <form onSubmit={handleAdd}>
              <Stack gap="sm">
                <TextInput
                  label="Google email"
                  placeholder="adviser@cit.edu"
                  required
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.currentTarget.value)}
                />
                <Select
                  label="Role"
                  data={['ADVISER', 'ADMIN']}
                  value={newRole}
                  onChange={(value) => setNewRole(value || 'ADVISER')}
                />
                <Text size="xs" c="dimmed">
                  Access binds to the verified Google account on its first sign-in.
                </Text>
                {error && <Text size="sm" c="red">{error}</Text>}
                <Button type="submit">Save staff access</Button>
              </Stack>
            </form>
          </Modal>

          <Modal opened={Boolean(linkOpen)} onClose={() => setLinkOpen(null)} title="Assign teams" centered>
            <Stack gap="sm">
              <Select
                label="Team code"
                data={teamCodes}
                value={selectedTeam}
                onChange={(value) => setSelectedTeam(value || '')}
              />
              <Button
                onClick={() => linkOpen && handleAssign(linkOpen)}
                disabled={!selectedTeam}
              >
                Assign team
              </Button>
            </Stack>
          </Modal>
        </Stack>
      </Container>
    </main>
  );
}
