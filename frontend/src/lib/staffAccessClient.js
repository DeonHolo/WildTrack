import {
  assignAdviserTeam,
  getStaffMonitoring,
  getStaffProfiles,
  revokeStaffAccess,
  saveStaffProfile,
  unassignAdviserTeam,
  upsertStaffEmail
} from './api.js';

export function emptyStaffAccess() {
  return { profiles: [], teamCodes: [], students: [], projectMetadata: [] };
}

export async function loadStaffDirectory(workspaceId) {
  return { ...emptyStaffAccess(), profiles: await loadStaffProfiles(workspaceId) };
}

export function saveStaff(workspaceId, payload) { return saveStaffProfile(workspaceId, payload); }

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
