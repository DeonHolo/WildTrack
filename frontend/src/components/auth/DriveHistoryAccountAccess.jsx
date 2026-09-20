import { Alert, Button, Menu, Text } from '@mantine/core';
import { GoogleLogo } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useWorkspaceSession } from '../../app/WorkspaceSession.jsx';
import { disconnectDriveHistoryConsent, getDriveHistoryConsentStatus } from '../../lib/api.js';

/** A compact account control; no persistent consent or success overlay follows navigation. */
export function DriveHistoryAccountAccess() {
  const { session } = useWorkspaceSession();
  const identity = session?.authenticated ? (session.googleSubject || session.email || '') : '';
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    setConnected(false);
    setError('');
    if (!identity) return () => { current = false; };
    getDriveHistoryConsentStatus()
      .then(status => { if (current) setConnected(Boolean(status?.configured && status?.connected)); })
      .catch(() => { if (current) setConnected(false); });
    return () => { current = false; };
  }, [identity]);

  if (!identity || !connected) return null;

  async function disconnect() {
    setBusy(true);
    setError('');
    try {
      await disconnectDriveHistoryConsent();
      setConnected(false);
    } catch (failure) {
      setError(failure.message || 'Drive history could not be disconnected.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Menu position="bottom-end" shadow="md" width={260} withinPortal closeOnItemClick={false}>
      <Menu.Target>
        <Button size="compact-sm" variant="subtle" aria-label="Drive history settings" title="Drive history settings" p={5}>
          <GoogleLogo size={18} aria-hidden="true" />
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Drive history</Menu.Label>
        <Text size="xs" px="sm" pb="xs">Read-only Google Drive metadata is connected to this account.</Text>
        <Menu.Item color="red" disabled={busy} onClick={disconnect}>Disconnect Drive history</Menu.Item>
        {error ? <Alert mx="xs" my="xs" color="red" role="alert">{error}</Alert> : null}
      </Menu.Dropdown>
    </Menu>
  );
}
