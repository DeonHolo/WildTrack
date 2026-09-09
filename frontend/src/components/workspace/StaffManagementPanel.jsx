import { ActionIcon, Alert, Autocomplete, Button, Checkbox, Group, Modal, Paper, ScrollArea, Select, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PencilSimple, Trash, UserPlus, UsersThree } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { emptyStaffAccess, loadStaffDirectory, revokeStaff, saveStaff } from '../../lib/staffAccessClient.js';
import { useWorkspaceResource } from '../../hooks/useWorkspaceResource.js';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope.js';
import { StatusIndicator } from '../ui.jsx';
import { ResourceBoundary } from '../ResourceBoundary.jsx';
import { isUsableAdviserName } from '../../lib/workflow.js';

const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const unique = values => [...new Map(values.filter(Boolean).map(value => [normalize(value), value])).values()].sort();
const ownerSnapshot = profiles => Object.fromEntries(profiles.flatMap(p => (p.assignedTeams || []).map(team => [team, p.googleSubject])));

export function StaffManagementPanel({ workspaceId }) {
  const { data, status, error: loadError, reload } = useWorkspaceResource('staff-directory', loadStaffDirectory, emptyStaffAccess, 'staff-directory-v2');
  const staffList = data.profiles;
  const isCurrentScope = useWorkspaceScope(workspaceId);
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('ADVISER');
  const [name, setName] = useState('');
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [teamsEdited, setTeamsEdited] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [replacement, setReplacement] = useState(null);
  const [owners, setOwners] = useState({});
  const [reactivate, setReactivate] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const imported = useMemo(() => {
    const names = new Map();
    const teams = [];
    const add = (rawName, team, source) => {
      if (team) teams.push(team);
      if (!isUsableAdviserName(rawName)) return;
      const clean = rawName.trim().replace(/\s+/g, ' ');
      const key = normalize(clean);
      const candidate = names.get(key) || { name: clean, bySource: {} };
      candidate.bySource[source] ||= [];
      if (team) candidate.bySource[source].push(team);
      names.set(key, candidate);
    };
    (data.teams || []).forEach(team => {
      const id = team.workspaceId + '::' + team.teamCode;
      teams.push(id);
      team.adviserNames.forEach(name => add(name, id, team.workspaceId));
    });
    const advisers = [...names.values()].map(item => {
      const workspaceIds = Object.keys(item.bySource);
      const source = workspaceIds.map(id => data.teams.find(team => team.workspaceId === id)?.workspaceName || 'Imported workspace').join(', ');
      return { name: item.name, source, teams: unique(Object.values(item.bySource).flat()),
        ambiguous: workspaceIds.length > 1, value: item.name + ' - ' + source };
    });
    return { teams: unique(teams), advisers };
  }, [data.teams]);
  const teamLabel = id => {
    const item = data.teams?.find(team => team.workspaceId + '::' + team.teamCode === id);
    return item ? item.teamCode + ' · ' + item.workspaceName : id.split('::').slice(1).join('::') || id;
  };
  const holderFor = team => staffList.find(p => p.assignedTeams?.some(value => normalize(value) === normalize(team)));
  const duplicate = !editing && staffList.find(p => normalize(p.googleEmail) === normalize(email));
  const additions = selectedTeams.filter(team => !editing?.assignedTeams?.includes(team));
  const removals = (editing?.assignedTeams || []).filter(team => !selectedTeams.includes(team));
  const transfers = selectedTeams.filter(team => {
    const holder = holderFor(team);
    return holder && holder.googleEmail !== editing?.googleEmail;
  });
  const initialRole = editing?.roles?.includes('ADMIN') ? 'ADMIN' : 'ADVISER';
  const roleChanged = editing && role !== initialRole;
  const needsReview = transfers.length > 0 || removals.length > 0 || roleChanged || editing?.enabled === false;
  const teamOptions = unique([...imported.teams, ...(editing?.assignedTeams || [])]).map(team => {
    const holder = holderFor(team);
    return { value: team, label: holder && holder.googleEmail !== editing?.googleEmail
      ? teamLabel(team) + ' — currently ' + (holder.adviserName || holder.googleEmail) : teamLabel(team) };
  });
  useEffect(() => {
    setOpened(false); setRevokeTarget(null); setEditing(null); setEmail(''); setName('');
    setSelectedTeams([]); setError(''); setSaving(false); busy.current = false;
  }, [isCurrentScope]);
  useEffect(() => { if (status === 'error') { setOpened(false); setRevokeTarget(null); } }, [status]);

  function openEditor(profile = null) {
    setTeamSearch('');
    setEditing(profile); setEmail(profile?.googleEmail || '');
    setRole(profile?.roles?.includes('ADMIN') ? 'ADMIN' : 'ADVISER');
    setName(profile?.adviserName || ''); setSelectedTeams(profile?.assignedTeams || []);
    setTeamsEdited(Boolean(profile)); setReplacement(null); setOwners(ownerSnapshot(staffList));
    setReactivate(false); setReviewing(false); setError(''); setOpened(true);
  }
  function selectImported(value) {
    const candidate = imported.advisers.find(item => item.value === value);
    setName(candidate?.name || value); setReviewing(false);
    if (!candidate) return;
    const sharedName = staffList.filter(profile => normalize(profile.adviserName) === normalize(candidate.name)).length > 1;
    if (teamsEdited || candidate.ambiguous || sharedName) setReplacement({ ...candidate, ambiguous: candidate.ambiguous || sharedName });
    else { setSelectedTeams(candidate.teams); setReplacement(null); }
  }
  async function reloadLatest() {
    const latest = await reload();
    if (!latest || !isCurrentScope()) return;
    const profile = latest.profiles.find(p => normalize(p.googleEmail) === normalize(email));
    if (editing && profile) setEditing(profile);
    setOwners(ownerSnapshot(latest.profiles)); setReviewing(false);
    setError('Latest staff assignments loaded. Review your choices before saving.');
  }
  async function submit(event) {
    event?.preventDefault();
    if (busy.current || !isCurrentScope() || duplicate || !role) return;
    if (editing?.enabled === false && !reactivate) { setError('Select Reactivate to restore access.'); return; }
    if (needsReview && !reviewing) { setReviewing(true); return; }
    busy.current = true; setSaving(true); setError('');
    try {
      await saveStaff(workspaceId, { googleEmail: email.trim().toLowerCase(), role: editing && !roleChanged ? null : role,
        adviserName: name.trim(), teamCodes: selectedTeams, teamOwners: owners, workspaceIds: data.workspaceIds,
        expectedRevision: editing?.revision || null, confirmTransfers: reviewing && transfers.length > 0, reactivate });
      if (!isCurrentScope()) return;
      setOpened(false); window.dispatchEvent(new Event('wildtrack:refresh-resources'));
      notifications.show({ color: 'green', message: 'Staff access saved.' }); await reload();
    } catch (failure) {
      if (isCurrentScope()) { setError(failure.message || 'Staff access could not be saved.'); setReviewing(false); }
    } finally { if (isCurrentScope()) { busy.current = false; setSaving(false); } }
  }
  async function revoke() {
    if (busy.current || !isCurrentScope()) return;
    busy.current = true; setSaving(true); setError('');
    try {
      await revokeStaff(workspaceId, revokeTarget.googleSubject);
      if (!isCurrentScope()) return;
      setRevokeTarget(null); window.dispatchEvent(new Event('wildtrack:refresh-resources')); await reload();
    } catch (failure) { if (isCurrentScope()) setError(failure.message || 'Access could not be revoked.'); }
    finally { if (isCurrentScope()) { busy.current = false; setSaving(false); } }
  }

  return <section className="panel wt-staff-panel" aria-label="Staff and advisers">
    <div className="panel-header"><div><Group gap="xs"><UsersThree size={22} /><h2>Staff & Advisers</h2></Group>
      <p>Add Google accounts and choose their capstone teams.</p></div>
      <Button variant="default" leftSection={<UserPlus size={18} />} onClick={() => openEditor()} disabled={status !== 'ready'}>Add staff / adviser</Button>
    </div>
    <ResourceBoundary status={status} error={loadError} onRetry={reload}>
      {!staffList.length ? <Text c="dimmed">No staff or advisers registered yet.</Text> :
        <Stack gap="sm">{staffList.map(profile => <Paper key={profile.id} p="md" withBorder>
          <Group justify="space-between" align="flex-start"><Stack gap={4}>
            {profile.adviserName ? <Text fw={600}>{profile.adviserName}</Text> : null}<Text size="sm">{profile.googleEmail}</Text>
            <Group gap="md">{profile.roles.map(value => <Text key={value} size="xs">{value === 'ADMIN' ? 'Administrator' : 'Adviser'}</Text>)}
              <StatusIndicator status={!profile.enabled ? 'Disabled' : profile.googleSubject.startsWith('pending:') ? 'Pending sign-in' : 'Active'} /></Group>
            <Text size="xs" c="dimmed">{profile.assignedTeams.length ? profile.assignedTeams.map(teamLabel).join(', ') : profile.roles.includes('ADMIN') ? 'Administrator access. No personal teams assigned.' : 'Pending assignment — no team review access.'}</Text>
          </Stack><Group gap="xs"><Button size="xs" variant="default" leftSection={<PencilSimple size={14} />} onClick={() => openEditor(profile)}>Edit access</Button>
            {profile.enabled ? <ActionIcon color="red" variant="subtle" aria-label={'Revoke access for ' + profile.googleEmail}
              onClick={() => { setError(''); setRevokeTarget(profile); }}><Trash size={16} /></ActionIcon> : null}</Group></Group>
          {imported.advisers.length ? <Button mt="xs" variant="subtle" size="xs"
            onClick={() => openEditor(profile)}>Review imported adviser teams</Button> : null}
        </Paper>)}</Stack>}
    </ResourceBoundary>
    <Modal opened={opened && status === 'ready'} onClose={() => { if (!busy.current) setOpened(false); }}
      closeOnEscape={!saving} closeOnClickOutside={!saving} withCloseButton={!saving}
      title={editing ? 'Edit staff access' : 'Add staff member or adviser'} centered size="lg" scrollAreaComponent={ScrollArea.Autosize}>
      <form onSubmit={submit}><Stack gap="md">
        {error ? <Alert color="red"><Text size="sm">{error}</Text><Button size="xs" variant="subtle" onClick={reloadLatest} disabled={saving}>Reload latest assignments</Button></Alert> : null}
        <TextInput label="Google Email" type="email" required value={email} disabled={saving || Boolean(editing)}
          onChange={e => { setEmail(e.currentTarget.value); setReviewing(false); }} placeholder="adviser@gmail.com" />
        <Select label="Role" required allowDeselect={false} value={role} disabled={saving}
          onChange={value => { setRole(value); setReviewing(false); setReplacement(null); }}
          data={[{ value: 'ADVISER', label: 'Adviser (assigned teams)' }, { value: 'ADMIN', label: 'Administrator (institution-wide)' }]} />
        {duplicate ? <Alert color="orange"><Text size="sm">This email already has a staff record. Open it to change access.</Text>
          <Button variant="default" size="xs" onClick={() => openEditor(duplicate)}>Edit existing staff member</Button></Alert> : null}
        <>
          <Autocomplete label="Staff / adviser name" value={name} maxLength={200} disabled={saving} maxDropdownHeight={160} comboboxProps={{ withinPortal: true }}
            placeholder={imported.advisers.length ? 'Choose an imported name or type a name' : 'Enter a name (optional)'}
            data={imported.advisers.map(item => item.value)}
            renderOption={({ option }) => {
              const candidate = imported.advisers.find(item => item.value === option.value);
              return <div style={{ minWidth: 0 }}><Text size="sm" truncate>{candidate?.name}</Text>
                <Text size="xs" c="dimmed">{candidate?.source} · {candidate?.teams.length} teams{candidate?.ambiguous ? ' · Check match' : ''}</Text></div>;
            }}
            onChange={value => { setName(imported.advisers.find(item => item.value === value)?.name || value); setReviewing(false); }} onOptionSubmit={selectImported}
            description="Optional. Choose an imported adviser to suggest their teams, or type a name." />
          {replacement ? <Alert color="blue">
            {replacement.ambiguous ? <Text size="sm" fw={600}>This name has multiple matches or conflicting import details. Verify the source and teams before applying.</Text> : null}
            <Text size="sm">{replacement.value}</Text><Text size="sm">Replace your team selection with {replacement.name}'s imported teams: {replacement.teams.map(teamLabel).join(', ') || 'none'}?</Text>
            <Group mt="xs"><Button size="xs" onClick={() => { setSelectedTeams(replacement.teams); setReplacement(null); setTeamsEdited(true); }}>Replace teams</Button>
              <Button size="xs" variant="default" onClick={() => setReplacement(null)}>Keep my teams</Button></Group></Alert> : null}
          <Stack gap="xs">
            <Group justify="space-between"><Text size="sm" fw={500} id="staff-teams-label">Assigned capstone teams <Text span c="dimmed" size="xs">(optional)</Text></Text>
              <Group gap="sm"><Text size="xs" c="dimmed">{selectedTeams.length} selected</Text>
                {selectedTeams.length ? <Button size="compact-xs" variant="subtle" disabled={saving} onClick={() => { setSelectedTeams([]); setTeamsEdited(true); setReviewing(false); }}>Clear selection</Button> : null}</Group></Group>
            {teamOptions.length ? <>
              <TextInput aria-label="Search capstone teams" placeholder="Search teams or adviser" value={teamSearch} onChange={event => setTeamSearch(event.currentTarget.value)} />
              <Checkbox.Group aria-labelledby="staff-teams-label" value={selectedTeams} onChange={value => { setSelectedTeams(value); setTeamsEdited(true); setReviewing(false); }}>
                <Paper withBorder p="sm" style={{ maxHeight: 176, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                  <Stack gap="sm">{teamOptions.filter(team => normalize(team.label).includes(normalize(teamSearch))).map(team => (
                    <Checkbox key={team.value} value={team.value} label={teamLabel(team.value)} disabled={saving}
                      description={team.label.includes(' — currently ') ? team.label.split(' — ')[1] : undefined} />
                  ))}
                    {!teamOptions.some(team => normalize(team.label).includes(normalize(teamSearch))) ? <Text size="sm" c="dimmed">No matching teams.</Text> : null}
                  </Stack>
                </Paper>
              </Checkbox.Group>
            </> : null}
            <Text size="xs" c="dimmed">{teamOptions.length ? (role === 'ADMIN' ? 'Teams from all active workspaces. Personal assignments do not limit administrator access.' : 'Teams from all active workspaces. These assignments determine this adviser’s team access.') : 'No teams imported yet. Save the adviser now and assign teams after importing.'}</Text>
          </Stack>
        </>
        {editing?.enabled === false ? <Checkbox label="Reactivate this staff member" checked={reactivate}
          onChange={event => { setReactivate(event.currentTarget.checked); setReviewing(false); }} disabled={saving} /> : null}
        {reviewing ? <Alert color="orange" title="Review access changes"><Stack gap="xs">
          {roleChanged ? <Text size="sm">Role: {initialRole} → {role}. This changes institution-wide staff permissions.</Text> : null}
          {additions.length > 0 ? <Text size="sm">Add: {additions.map(teamLabel).join(', ')}</Text> : null}
          {removals.length > 0 ? <Text size="sm">Remove: {removals.map(teamLabel).join(', ')}</Text> : null}
          {transfers.map(team => <Text size="sm" key={team}>{teamLabel(team)}: {holderFor(team)?.googleEmail} → {email}</Text>)}
          {reactivate ? <Text size="sm">Restore this account's staff access.</Text> : null}</Stack></Alert> : null}
        <Group justify="flex-end"><Button variant="default" disabled={saving} onClick={() => setOpened(false)}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={Boolean(duplicate) || Boolean(replacement)}>
            {reviewing ? 'Confirm and save changes' : needsReview ? 'Review changes' : 'Save staff member'}</Button></Group>
      </Stack></form>
    </Modal>
    <Modal opened={Boolean(revokeTarget) && status === 'ready'} onClose={() => { if (!busy.current) setRevokeTarget(null); }}
      closeOnEscape={!saving} closeOnClickOutside={!saving} withCloseButton={!saving} title="Revoke staff access?" centered>
      <Stack><Text>Revoke all staff roles and team assignments for {revokeTarget?.googleEmail}?</Text>
        {error ? <Alert color="red">{error}</Alert> : null}<Group justify="flex-end">
          <Button variant="default" disabled={saving} onClick={() => setRevokeTarget(null)}>Cancel</Button>
          <Button color="red" loading={saving} onClick={revoke}>Revoke access</Button></Group></Stack>
    </Modal>
  </section>;
}
