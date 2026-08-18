import { AppShell as MantineAppShell, Button, Container, Group, Text } from '@mantine/core';
import { SignOut } from '@phosphor-icons/react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useWorkflow } from '../../app/WorkflowContext.jsx';
import { WildTrackBrand } from './WildTrackBrand.jsx';

export function StudentApplicationShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, logoutStudentAccount } = useWorkflow();
  const activeAccount = state.studentAccounts.find(
    (account) => account.email.toLowerCase() === String(state.activeAccountEmail || '').toLowerCase()
  );

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
            <Button
              component={Link}
              to="/student"
              variant={location.pathname === '/student' ? 'light' : 'subtle'}
              color="wildtrackMaroon"
              aria-current={location.pathname === '/student' ? 'page' : undefined}
            >
              Dashboard
            </Button>
            {activeAccount ? (
              <>
                <Text className="wt-student-email" size="xs" c="dimmed">{activeAccount.email}</Text>
                <Button variant="default" leftSection={<SignOut size={17} />} onClick={logout}>Log out</Button>
              </>
            ) : (
              <Button component={Link} to="/login" variant="default">Sign in or register</Button>
            )}
          </Group>
        </Container>
      </MantineAppShell.Header>
      <MantineAppShell.Main id="wildtrack-main">{children}</MantineAppShell.Main>
    </MantineAppShell>
  );
}
