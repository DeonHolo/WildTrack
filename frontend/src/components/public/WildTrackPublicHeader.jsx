import { Button, Container, Group, Text } from '@mantine/core';
import { SignOut } from '@phosphor-icons/react';
import { Link, useNavigate } from 'react-router-dom';
import { useWorkspaceSession } from '../../app/WorkspaceSession.jsx';
import { WildTrackMark } from '../layout/WildTrackMark.jsx';

export function WildTrackPublicHeader({ subtitle }) {
  const navigate = useNavigate();
  const { account: activeAccount, logoutStudentAccount } = useWorkspaceSession();

  function logout() {
    logoutStudentAccount();
    navigate('/student');
  }

  return (
    <header className="wt-public-header">
      <Container size="md" className="wt-public-header-inner">
        <Link className="wt-public-brand" to="/" aria-label="WildTrack home">
          <WildTrackMark className="wt-public-brand-mark" size={40} />
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
          ) : (
            <Button component={Link} to="/login" variant="default" size="sm">Continue with Google</Button>
          )}
        </Group>
      </Container>
    </header>
  );
}
