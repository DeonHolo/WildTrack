import { ActionIcon, Badge, Button, Card, CloseButton, Divider, Group, Menu, Modal, MultiSelect, Paper, Select, Stack, Table, Text, TextInput, ThemeIcon, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { ArrowRight, Check, Plus, PlusCircle, ShieldCheck, Trash, User, UserPlus, UsersThree, Warning, WarningCircle, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { assignAdviserTeam, getStaffProfiles, revokeStaffAccess, unassignAdviserTeam, upsertStaffEmail } from '../../lib/api.js';

export function StaffManagementPanel({ workspaceId, students = [], projectMetadata = [] }) {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('ADVISER');
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allTeamCodes = useMemo(() => {
    const set = new Set();
    (students || []).forEach((s) => { if (s.teamCode) set.add(s.teamCode); });
    (projectMetadata || []).forEach((p) => { if (p.groupCode) set.add(p.groupCode); });
    return [...set].sort();
  }, [students, projectMetadata]);

  const teamToAdviserMap = useMemo(() => {
    const map = new Map();
    (staffList || []).forEach((staff) => {
      if (staff.enabled !== false) {
        (staff.assignedTeams || []).forEach((team) => {
          map.set(team.toLowerCase(), staff);
        });
      }
    });
    return map;
  }, [staffList]);

  async function loadStaff() {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const data = await getStaffProfiles(workspaceId);
      setStaffList(Array.isArray(data) ? data : []);
    } catch (err) {
      setStaffList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStaff();
  }, [workspaceId]);

  function handleOpenAdd() {
    setEmail('');
    setRole('ADVISER');
    setSelectedTeams([]);
    setError('');
    setModalOpen(true);
  }

  async function handleSaveStaff(e) {
    e?.preventDefault?.();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Please enter a Google email.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const profile = await upsertStaffEmail(workspaceId, trimmedEmail, [role]);
      if (role === 'ADVISER' && selectedTeams.length > 0 && profile?.googleSubject) {
        for (const teamCode of selectedTeams) {
          const currentHolder = teamToAdviserMap.get(teamCode.toLowerCase());
          if (currentHolder && currentHolder.googleSubject !== profile.googleSubject) {
            await unassignAdviserTeam(workspaceId, currentHolder.googleSubject, teamCode);
          }
          await assignAdviserTeam(workspaceId, profile.googleSubject, teamCode);
        }
      }
      notifications.show({
        color: 'green',
        title: 'Staff member added',
        message: `${trimmedEmail} is now assigned as ${role === 'ADMIN' ? 'Administrator' : 'Adviser'}.`
      });
      setModalOpen(false);
      loadStaff();
    } catch (err) {
      setError(err?.message || 'Failed to save staff member.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignTeam(staff, teamCode) {
    const currentHolder = teamToAdviserMap.get(teamCode.toLowerCase());
    if (currentHolder && currentHolder.googleSubject !== staff.googleSubject) {
      modals.openConfirmModal({
        title: 'Transfer team assignment?',
        children: (
          <Text size="sm">
            Team <strong>{teamCode}</strong> is currently assigned to <strong>{currentHolder.googleEmail}</strong>.
            Transfer this team to <strong>{staff.googleEmail}</strong>?
          </Text>
        ),
        labels: { confirm: 'Transfer team', cancel: 'Cancel' },
        confirmProps: { color: 'wildtrackMaroon' },
        onConfirm: async () => {
          try {
            await unassignAdviserTeam(workspaceId, currentHolder.googleSubject, teamCode);
            await assignAdviserTeam(workspaceId, staff.googleSubject, teamCode);
            notifications.show({ color: 'green', message: `Team ${teamCode} transferred to ${staff.googleEmail}.` });
            loadStaff();
          } catch (err) {
            notifications.show({ color: 'red', message: err?.message || 'Failed to transfer team.' });
          }
        }
      });
      return;
    }

    try {
      await assignAdviserTeam(workspaceId, staff.googleSubject, teamCode);
      notifications.show({ color: 'green', message: `Team ${teamCode} assigned to ${staff.googleEmail}.` });
      loadStaff();
    } catch (err) {
      notifications.show({ color: 'red', message: err?.message || 'Failed to assign team.' });
    }
  }

  async function handleUnassignTeam(staff, teamCode) {
    try {
      await unassignAdviserTeam(workspaceId, staff.googleSubject, teamCode);
      notifications.show({ color: 'gray', message: `Team ${teamCode} unassigned from ${staff.googleEmail}.` });
      loadStaff();
    } catch (err) {
      notifications.show({ color: 'red', message: err?.message || 'Failed to unassign team.' });
    }
  }

  function handleRevokeAccess(staff) {
    modals.openConfirmModal({
      title: 'Revoke staff access?',
      children: (
        <Text size="sm">
          Revoke all staff access and team assignments for <strong>{staff.googleEmail}</strong>?
        </Text>
      ),
      labels: { confirm: 'Revoke access', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await revokeStaffAccess(workspaceId, staff.googleSubject);
          notifications.show({ color: 'red', message: `Staff access revoked for ${staff.googleEmail}.` });
          loadStaff();
        } catch (err) {
          notifications.show({ color: 'red', message: err?.message || 'Failed to revoke staff access.' });
        }
      }
    });
  }

  return (
    <section className="panel wt-staff-panel" aria-label="Staff and advisers">
      <div className="panel-header">
        <div>
          <Group gap="xs" align="center">
            <UsersThree size={22} weight="duotone" aria-hidden="true" />
            <h2>Staff & Advisers</h2>
          </Group>
          <p>Assign Google emails and capstone teams to instructors and advisers.</p>
        </div>
        <Button
          variant="default"
          leftSection={<UserPlus size={18} aria-hidden="true" />}
          onClick={handleOpenAdd}
        >
          Add staff / adviser
        </Button>
      </div>

      {staffList.filter((s) => s.enabled !== false).length === 0 ? (
        <Paper p="lg" withBorder radius="md" ta="center">
          <Text c="dimmed" size="sm">No staff or advisers registered in this workspace yet.</Text>
        </Paper>
      ) : (
        <Stack gap="sm">
          {staffList.filter((s) => s.enabled !== false).map((staff) => {
            const isAdmin = staff.roles?.includes('ADMIN');
            const isPending = staff.googleSubject?.startsWith('pending:');
            const assigned = staff.assignedTeams || [];
            const unassignedTeams = allTeamCodes.filter((tc) => !assigned.includes(tc));

            return (
              <Paper key={staff.id || staff.googleSubject} p="md" withBorder radius="md" className="wt-staff-card">
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                  <Stack gap={4}>
                    <Group gap="xs" align="center">
                      <Text fw={600} size="sm">{staff.googleEmail}</Text>
                      <Badge
                        size="sm"
                        variant="light"
                        color={isAdmin ? 'wildtrackMaroon' : 'blue'}
                      >
                        {isAdmin ? 'Administrator' : 'Adviser'}
                      </Badge>
                      {isPending ? (
                        <Badge size="xs" variant="outline" color="orange">Pending first sign-in</Badge>
                      ) : (
                        <Badge size="xs" variant="dot" color="green">Active</Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {isAdmin ? 'Institution-wide access to all workspace features and review.' : 'Scoped to review submissions for assigned capstone teams.'}
                    </Text>
                  </Stack>

                  <Group gap="xs" align="center">
                    {!isAdmin && !isPending && unassignedTeams.length > 0 ? (
                      <Menu shadow="md" width={220} position="bottom-end">
                        <Menu.Target>
                          <Button variant="default" size="xs" leftSection={<Plus size={14} />}>
                            Assign team
                          </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Label>Available teams</Menu.Label>
                          {unassignedTeams.map((teamCode) => {
                            const currentHolder = teamToAdviserMap.get(teamCode.toLowerCase());
                            return (
                              <Menu.Item
                                key={teamCode}
                                onClick={() => handleAssignTeam(staff, teamCode)}
                                rightSection={currentHolder ? <Text size="10px" c="orange">Held</Text> : null}
                              >
                                {teamCode}
                              </Menu.Item>
                            );
                          })}
                        </Menu.Dropdown>
                      </Menu>
                    ) : null}

                    <Tooltip label="Revoke staff permissions">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={`Revoke access for ${staff.googleEmail}`}
                        onClick={() => handleRevokeAccess(staff)}
                      >
                        <Trash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>

                {!isAdmin ? (
                  <>
                    <Divider my="xs" />
                    <Group gap={6} align="center" wrap="wrap">
                      <Text size="xs" fw={500} c="dimmed" mr={4}>Assigned teams ({assigned.length}):</Text>
                      {assigned.length === 0 ? (
                        <Text size="xs" c="dimmed">No teams assigned yet.</Text>
                      ) : (
                        assigned.map((teamCode) => (
                          <Badge
                            key={teamCode}
                            size="sm"
                            variant="outline"
                            color="blue"
                            rightSection={
                              <CloseButton
                                size="xs"
                                aria-label={`Unassign ${teamCode}`}
                                onClick={() => handleUnassignTeam(staff, teamCode)}
                              />
                            }
                          >
                            {teamCode}
                          </Badge>
                        ))
                      )}
                    </Group>
                  </>
                ) : null}
              </Paper>
            );
          })}
        </Stack>
      )}

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add staff member or adviser"
        centered
      >
        <form onSubmit={handleSaveStaff}>
          <Stack gap="md">
            {error ? <Text color="red" size="sm">{error}</Text> : null}
            <TextInput
              label="Google Email"
              placeholder="adviser@gmail.com"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <Select
              label="Role"
              required
              value={role}
              onChange={setRole}
              data={[
                { value: 'ADVISER', label: 'Adviser (team-scoped review)' },
                { value: 'ADMIN', label: 'Administrator (full workspace access)' }
              ]}
            />
            {role === 'ADVISER' ? (
              <MultiSelect
                label="Assign capstone teams"
                placeholder="Select teams"
                searchable
                clearable
                data={allTeamCodes}
                value={selectedTeams}
                onChange={setSelectedTeams}
              />
            ) : null}
            <Group justify="flex-end" gap="xs" mt="sm">
              <Button variant="default" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" loading={saving} color="wildtrackMaroon">Save staff member</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </section>
  );
}
