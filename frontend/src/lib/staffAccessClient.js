import {
  assignAdviserTeam,
  getStaffMonitoring,
  getStaffDirectory,
  saveStaffDirectory,
  getStaffProfiles,
  revokeStaffAccess,
  saveStaffProfile,
  unassignAdviserTeam,
  upsertStaffEmail
} from './api.js';

export function emptyStaffAccess() {
  return { profiles: [], teamCodes: [], students: [], projectMetadata: [], teams: [], workspaceIds: [] };
}

export async function loadStaffDirectory() {
  const directory = await getStaffDirectory();
  return { ...emptyStaffAccess(), ...directory, profiles: directory.profiles.map(({ profile, assignments }) => ({
    ...profile, assignedTeams: assignments.map(a => a.workspaceId + '::' + a.teamCode)
  })) };
}

export function saveStaff(_workspaceId, payload) {
  const { teamCodes, ...rest } = payload;
  return saveStaffDirectory({ ...rest, assignments: (teamCodes || []).map(value => {
    const [workspaceId, teamCode] = value.split('::');
    return { workspaceId, teamCode };
  }) });
}

export async function loadStaffProfiles(workspaceId) {
  const profiles = await getStaffProfiles(workspaceId);
  return Array.isArray(profiles) ? profiles : [];
}

export async function loadStaffAccess(workspaceId) {
  const [profiles, monitoring] = await Promise.all([
    loadStaffProfiles(workspaceId),
    getStaffMonitoring(workspaceId)
  ]);
  return {
    profiles,
    students: monitoring.students || [],
    projectMetadata: monitoring.projects || [],
    teamCodes: [...new Set((monitoring.students || []).map((student) => student.teamCode).filter(Boolean))].sort()
  };
}

export function addStaff(workspaceId, googleEmail, role) {
  return upsertStaffEmail(workspaceId, googleEmail, [role]);
}

export function assignTeam(workspaceId, googleSubject, teamCode) {
  return assignAdviserTeam(workspaceId, googleSubject, teamCode);
}

export function unassignTeam(workspaceId, googleSubject, teamCode) {
  return unassignAdviserTeam(workspaceId, googleSubject, teamCode);
}

export function revokeStaff(workspaceId, googleSubject) {
  return revokeStaffAccess(workspaceId, googleSubject);
}
