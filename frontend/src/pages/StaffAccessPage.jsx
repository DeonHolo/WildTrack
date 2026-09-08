import { Container, Stack, Title } from '@mantine/core';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { StaffManagementPanel } from '../components/workspace/StaffManagementPanel.jsx';

export function StaffAccessPage() {
  const { activeWorkspaceId } = useWorkspaceSession();
  return <Container size="xl" py="xl"><Stack><Title order={1}>Staff access</Title>
    <StaffManagementPanel workspaceId={activeWorkspaceId} />
  </Stack></Container>;
}
