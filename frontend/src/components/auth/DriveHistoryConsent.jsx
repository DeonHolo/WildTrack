import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useWorkspaceSession } from '../../app/WorkspaceSession.jsx';
import { getDriveHistoryConsentStatus, startDriveHistoryConsent } from '../../lib/api.js';

const DISMISS_PREFIX = 'wildtrack.drive-history-consent-dismissed:';

export function DriveHistoryConsent() {
  const { session } = useWorkspaceSession();
  const identity = session?.authenticated ? (session.googleSubject || session.email || '') : '';
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    setStatus(null);
    if (!identity) return () => { active = false; };
    const key = DISMISS_PREFIX + identity;
    const result = new URLSearchParams(window.location.search).get('driveHistory');
    if (['declined', 'unavailable', 'error'].includes(result)) {
      try { sessionStorage.setItem(key, '1'); } catch { /* Storage is optional. */ }
    }
    try { setDismissed(sessionStorage.getItem(key) === '1'); } catch { setDismissed(false); }
    getDriveHistoryConsentStatus()
      .then(value => { if (active) setStatus(value); })
      .catch(() => { if (active) setStatus({ configured: false, connected: false }); });
    return () => { active = false; };
  }, [identity]);

  if (!identity || !status?.configured || status.connected || dismissed) return null;

  function skip() {
    try { sessionStorage.setItem(DISMISS_PREFIX + identity, '1'); } catch { /* Storage is optional. */ }
    setDismissed(true);
  }

  return (
    <Paper
      withBorder shadow="md" radius="md" p="md"
      role="region" aria-label="Google Drive history access"
      style={{ position: 'fixed', zIndex: 1100, right: 16, bottom: 16, width: 'min(410px, calc(100vw - 32px))', background: 'var(--mantine-color-body)' }}
    >
      <Stack gap="sm">
        <Text fw={750}>Allow file history from Google Drive?</Text>
        <Text size="sm">You are signed in to WildTrack. Google separately asks for read-only Drive metadata access so file history can become available for your submitted PDFs and for other submissions of the same file.</Text>
        <Text size="xs" c="dimmed">WildTrack will not browse unrelated files or modify your Drive. You can skip this permission and continue submitting normally, or disconnect it later from your account area.</Text>
        <Group gap="xs" justify="flex-end" wrap="wrap">
          <Button size="sm" variant="default" onClick={skip}>Skip for now</Button>
          <Button size="sm" onClick={startDriveHistoryConsent}>Allow Drive history</Button>
        </Group>
      </Stack>
    </Paper>
  );
}
