import { AppShell as MantineAppShell, Button, Container, Group, Text } from '@mantine/core';
import { SignOut } from '@phosphor-icons/react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useWorkspaceSession } from '../../app/WorkspaceSession.jsx';
import { WildTrackBrand } from './WildTrackBrand.jsx';

export function StudentApplicationShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { account: activeAccount, logoutStudentAccount } = useWorkspaceSession();
  const isAccessRoute = ['/login', '/register'].includes(location.pathname);

  function logout() {
    logoutStudentAccount();
    navigate('/login');
  }

  return (
    <MantineAppShell className="wt-student-shell" header={{ height: 68 }} padding={0}>
      <a className="wt-skip-link" href="#wildtrack-main">Skip to content</a>
      <MantineAppShell.Header className="wt-student-header">
        <Container size="xl" h="100%" className="wt-student-header-inner">
          <WildTrackBrand compact to="/student" />
          <Group component="nav" aria-label="Student navigation" gap="xs" wrap="nowrap">
            {!(isAccessRoute || (activeAccount && location.pathname === '/student')) ? (
              <Button
                className="wt-student-dashboard-link"
                component={Link}
                to="/student"
                variant="default"
                aria-current={location.pathname === '/student' ? 'page' : undefined}
              >
                Student dashboard
              </Button>
            ) : null}
            {activeAccount ? (
              <>
                <Text className="wt-student-email" size="xs" c="dimmed">{activeAccount.email}</Text>
                <Button variant="default" leftSection={<SignOut size={17} />} onClick={logout}>Log out</Button>
              </>
            ) : isAccessRoute ? null : (
              <Button component={Link} to="/login" variant="default">Continue with Google</Button>
            )}
          </Group>
        </Container>
      </MantineAppShell.Header>
      <MantineAppShell.Main id="wildtrack-main">{children}</MantineAppShell.Main>
    </MantineAppShell>
  );
}
