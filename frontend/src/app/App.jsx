import { Navigate, Route, Routes } from 'react-router-dom';
import { DevelopmentRolePreview } from '../components/layout/DevelopmentRolePreview.jsx';
import { StaffApplicationShell } from '../components/layout/StaffApplicationShell.jsx';
import { StudentApplicationShell } from '../components/layout/StudentApplicationShell.jsx';
import { APPLICATION_ROLES, getRoleHome, useApplicationRole } from '../hooks/useApplicationRole.js';
import { WorkflowProvider } from './WorkflowContext.jsx';
import { useWorkspaceSession } from './WorkspaceSession.jsx';
import { RoleBoundary } from './RoleBoundary.jsx';
import { ArchivePage } from '../pages/ArchivePage.jsx';
import { AdviserViewPage } from '../pages/AdviserViewPage.jsx';
import { CommandCenterPage } from '../pages/CommandCenterPage.jsx';
import { FormsPage } from '../pages/FormsPage.jsx';
import { PublicSubmissionPage } from '../pages/PublicSubmissionPage.jsx';
import { RegisterPage } from '../pages/RegisterPage.jsx';
import { ReviewPage } from '../pages/ReviewPage.jsx';
import { StudentStatusPage } from '../pages/StudentStatusPage.jsx';
import { TrackerPage } from '../pages/TrackerPage.jsx';
import { WorkspacePage } from '../pages/WorkspacePage.jsx';

export default function App() {
  return (
    <WorkflowProvider>
      <Routes>
        <Route path="/w/:workspaceKey/submit/:slug" element={<PublicSubmissionPage />} />
        <Route path="/submit/:slug" element={<PublicSubmissionPage />} />
        <Route path="/register" element={<StudentApplicationShell><RegisterPage /></StudentApplicationShell>} />
        <Route path="/login" element={<StudentApplicationShell><RegisterPage /></StudentApplicationShell>} />
        <Route path="/student" element={(
          <RoleBoundary allow={[APPLICATION_ROLES.STUDENT]}>
            <StudentApplicationShell><StudentStatusPage /></StudentApplicationShell>
          </RoleBoundary>
        )} />
        <Route path="/" element={(
          <RoleBoundary allow={[APPLICATION_ROLES.ADMIN]}>
            <StaffApplicationShell><CommandCenterPage /></StaffApplicationShell>
          </RoleBoundary>
        )} />
        <Route path="/forms" element={(
          <RoleBoundary allow={[APPLICATION_ROLES.ADMIN]}>
            <StaffApplicationShell><FormsPage /></StaffApplicationShell>
          </RoleBoundary>
        )} />
        <Route path="/tracker" element={(
          <RoleBoundary allow={[APPLICATION_ROLES.ADMIN, APPLICATION_ROLES.ADVISER]}>
            <StaffApplicationShell><TrackerPage /></StaffApplicationShell>
          </RoleBoundary>
        )} />
        <Route path="/review" element={(
          <RoleBoundary allow={[APPLICATION_ROLES.ADMIN]}>
            <StaffApplicationShell><ReviewPage /></StaffApplicationShell>
          </RoleBoundary>
        )} />
        <Route path="/adviser" element={(
          <RoleBoundary allow={[APPLICATION_ROLES.ADMIN, APPLICATION_ROLES.ADVISER]}>
            <StaffApplicationShell><AdviserViewPage /></StaffApplicationShell>
          </RoleBoundary>
        )} />
        <Route path="/archive" element={(
          <RoleBoundary allow={[APPLICATION_ROLES.ADMIN]}>
            <StaffApplicationShell><ArchivePage /></StaffApplicationShell>
          </RoleBoundary>
        )} />
        <Route path="/workspace" element={(
          <RoleBoundary allow={[APPLICATION_ROLES.ADMIN]}>
            <StaffApplicationShell><WorkspacePage /></StaffApplicationShell>
          </RoleBoundary>
        )} />
        <Route path="*" element={<RoleHomeRedirect />} />
      </Routes>
      <DevelopmentRolePreview enabled={import.meta.env.DEV} />
    </WorkflowProvider>
  );
}

function RoleHomeRedirect() {
  const role = useApplicationRole();
  let workspaceSession = null;
  try {
    workspaceSession = useWorkspaceSession();
  } catch {
    // outside workspace session boundary
  }
  const session = workspaceSession?.session;

  if (!import.meta.env.DEV && workspaceSession?.sessionStatus === 'error') {
    return <div role="alert">{workspaceSession.sessionError || 'Session could not be loaded.'}</div>;
  }

  if (!import.meta.env.DEV && (workspaceSession?.sessionStatus === 'loading' || session === null)) {
    return null;
  }

  return <Navigate to={getRoleHome(role)} replace />;
}
