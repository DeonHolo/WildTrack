import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Center,
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
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { useWorkspaceResource } from '../hooks/useWorkspaceResource.js';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope.js';
import {
  addStaff,
  assignTeam,
  emptyStaffAccess,
  loadStaffAccess,
  revokeStaff,
  unassignTeam
} from '../lib/staffAccessClient.js';

export function StaffAccessPage() {
  const { activeWorkspaceId: workspaceId } = useWorkspaceSession();
  const isCurrentScope = useWorkspaceScope(workspaceId);
  const { data, setData, status, error: loadError, reload } = useWorkspaceResource(workspaceId, loadStaffAccess, emptyStaffAccess);
  const profiles = data.profiles;
  const teamCodes = data.teamCodes;
  const [addOpen, setAddOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(null); // profile being assigned teams
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('ADVISER');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setAddOpen(false);
    setLinkOpen(null);
    setNewEmail('');
    setSelectedTeam('');
    setError('');
  }, [isCurrentScope]);

  async function handleAdd(event) {
    event.preventDefault();
    if (!isCurrentScope()) return;
    setError('');
    try {
      const updated = await addStaff(workspaceId, newEmail.trim(), newRole);
      if (!isCurrentScope()) return;
      setData((current) => ({
        ...current,
        profiles: [...current.profiles.filter((p) => p.googleSubject !== updated.googleSubject), updated]
      }));
      setAddOpen(false);
      setNewEmail('');
    } catch (saveError) {
      if (!isCurrentScope()) return;
      setError(saveError.message || 'Could not save the staff email.');
    }
  }

  async function handleAssign(profile) {
    if (!isCurrentScope() || !selectedTeam || profile.googleSubject?.startsWith('pending:')) return;
    try {
      await assignTeam(workspaceId, profile.googleSubject, selectedTeam);
      if (!isCurrentScope()) return;
      setData((current) => ({ ...current, profiles: current.profiles.map((p) => (
        p.googleSubject === profile.googleSubject && !p.assignedTeams.includes(selectedTeam)
          ? { ...p, assignedTeams: [...p.assignedTeams, selectedTeam] } : p
      )) }));
      setSelectedTeam('');
    } catch (assignError) {
      if (!isCurrentScope()) return;
      setError(assignError.message || 'Could not assign the team.');
    }
  }

  async function handleUnassign(profile, teamCode) {
    if (!isCurrentScope()) return;
    setError('');
    try {
      await unassignTeam(workspaceId, profile.googleSubject, teamCode);
      if (!isCurrentScope()) return;
      setData((current) => ({ ...current, profiles: current.profiles.map((p) => (
        p.googleSubject === profile.googleSubject
          ? { ...p, assignedTeams: p.assignedTeams.filter((t) => t !== teamCode) } : p
      )) }));
    } catch (saveError) {
      if (!isCurrentScope()) return;
      setError(saveError.message || 'Could not remove the team assignment.');
    }
  }

  function confirmRevoke(profile) {
    modals.openConfirmModal({
      title: 'Revoke this staff account?',
      children: <Text size="sm">This removes active WildTrack staff access for {profile.googleEmail}.</Text>,
      labels: { confirm: 'Revoke access', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        if (!isCurrentScope()) return;
        setError('');
        try {
          await revokeStaff(workspaceId, profile.googleSubject);
          await reload();
        } catch (saveError) {
          if (!isCurrentScope()) return;
          setError(saveError.message || 'Could not revoke staff access.');
        }
      }
    });
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

          {error && !addOpen && !linkOpen ? <Alert color="red" role="alert">{error}</Alert> : null}
          {status === 'loading' ? (
            <Center mih={200}><Loader size="sm" aria-label="Loading staff profiles" /></Center>
          ) : status === 'error' ? (
            <Paper withBorder radius="sm" p="xl"><Stack gap="sm" align="flex-start"><Text c="red">{loadError}</Text><Button variant="default" onClick={reload}>Try again</Button></Stack></Paper>
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
                          <Group gap="xs">
                          <Button
                            variant="subtle"
                            size="compact-sm"
                            leftSection={<LinkSimple size={15} />}
                            onClick={() => { setLinkOpen(profile); setSelectedTeam(teamCodes[0] || ''); }}
                            disabled={!profile.roles.includes('ADVISER')}
                          >
                            Assign teams
                          </Button>
                          <Button color="red" variant="subtle" size="compact-sm" onClick={() => confirmRevoke(profile)}>Revoke</Button>
                          </Group>
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
