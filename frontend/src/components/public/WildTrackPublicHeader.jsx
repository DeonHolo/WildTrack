import { Button, Container, Group, Text, ThemeIcon } from '@mantine/core';
import { FilePdf, SignOut } from '@phosphor-icons/react';
import { Link, useNavigate } from 'react-router-dom';
import { useWorkflow } from '../../app/WorkflowContext.jsx';

export function WildTrackPublicHeader({ subtitle }) {
  const navigate = useNavigate();
  const { state, logoutStudentAccount } = useWorkflow();
  const activeAccount = state.studentAccounts.find(
    (account) => account.email.toLowerCase() === String(state.activeAccountEmail || '').toLowerCase()
  );

  function logout() {
    logoutStudentAccount();
    navigate('/student');
  }

  return (
    <header className="wt-public-header">
      <Container size="md" className="wt-public-header-inner">
        <Link className="wt-public-brand" to="/" aria-label="WildTrack home">
          <ThemeIcon size={40} radius="sm" color="wildtrackGold.5" c="wildtrackMaroon.9" variant="filled">
            <FilePdf size={22} weight="duotone" aria-hidden="true" />
          </ThemeIcon>
          <span>
            <Text component="strong" fw={750} size="md">WildTrack</Text>
            <Text component="small" c="dimmed" size="xs">{subtitle || 'Capstone submissions'}</Text>
          </span>
        </Link>

        <Group component="nav" gap="xs" wrap="wrap" justify="flex-end" aria-label="Student access">
          <Button component={Link} to="/student" variant="default" size="sm">Student dashboard</Button>
          {activeAccount ? (
            <>
              <Text className="wt-account-email" c="dimmed" size="xs">{activeAccount.email}</Text>
              <Button variant="default" size="sm" leftSection={<SignOut size={17} />} onClick={logout}>Log out</Button>
            </>
          ) : null}
        </Group>
      </Container>
    </header>
  );
}
