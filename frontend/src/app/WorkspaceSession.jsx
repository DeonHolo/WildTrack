import { useWorkflow } from './WorkflowContext.jsx';

export function useWorkspaceSession() {
  const workflow = useWorkflow();
  const session = workflow.session;

  return {
    session,
    sessionStatus: workflow.sessionStatus,
    sessionError: workflow.sessionError,
    account: session?.authenticated && session.email
      ? { email: session.email, name: session.name || '' }
      : null,
    workspaces: workflow.workspaces,
    activeWorkspace: workflow.activeWorkspace,
    activeWorkspaceId: workflow.activeWorkspaceId,
    needsWorkspaceChoice: workflow.needsWorkspaceChoice,
    workspaceCatalogStatus: workflow.workspaceCatalogStatus,
    workspaceCatalogError: workflow.workspaceCatalogError,
    refreshWorkspaceCatalog: workflow.refreshWorkspaceCatalog,
    refreshSession: workflow.refreshSession,
    switchWorkspace: workflow.switchWorkspace,
    logoutStudentAccount: workflow.logoutStudentAccount,
    logoutStaffSession: workflow.logoutStaffSession
  };
}
