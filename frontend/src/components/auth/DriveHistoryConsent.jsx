import { Alert, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWorkspaceSession } from '../../app/WorkspaceSession.jsx';
import { getDriveHistoryConsentStatus, startDriveHistoryConsent } from '../../lib/api.js';
import { requiresDriveHistoryConsent } from '../../lib/driveHistoryLogin.js';
import { isPublicInformationPath } from '../../lib/publicInformation.js';

const DISMISS_PREFIX = 'wildtrack.drive-history-consent-dismissed:';
const FAILURE_RESULTS = ['declined', 'unavailable', 'error'];

function callbackMessage(result) {
  if (result === 'declined') return 'Drive permission was not granted. You can retry when you are ready.';
  if (result === 'unavailable') return 'Google Drive permission is temporarily unavailable. Please try again later.';
  if (result === 'error') return 'Google Drive permission could not be completed. Please try again.';
  return '';
}


export function DriveHistoryConsent() {
  const { session } = useWorkspaceSession();
  let location;
  let navigate;
  try { location = useLocation(); navigate = useNavigate(); } catch { /* Also supports embedded tests outside a router. */ }
  const identity = session?.authenticated ? (session.googleSubject || session.email || '') : '';
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const required = requiresDriveHistoryConsent(session) || session?.driveHistoryRequired === true;
  const publicInformation = isPublicInformationPath(location?.pathname ?? window.location.pathname);

  useEffect(() => {
    let active = true;
    setStatus(null);
    setError('');
    setOutcome('');
    setDismissed(false);
    if (!identity || required || publicInformation) return () => { active = false; };
    const key = DISMISS_PREFIX + identity;
    const query = new URLSearchParams(location?.search ?? window.location.search);
    const result = query.get('driveHistory') || '';
    // A failed callback remains visible even if an earlier optional prompt was skipped.
    setOutcome(FAILURE_RESULTS.includes(result) ? result : '');
    try { setDismissed(!FAILURE_RESULTS.includes(result) && sessionStorage.getItem(key) === '1'); } catch { /* Storage is optional. */ }
    if (result) {
      query.delete('driveHistory');
      const pathname = location?.pathname || window.location.pathname;
      const search = query.toString() ? `?${query}` : '';
      if (navigate) navigate({ pathname, search }, { replace: true, state: location?.state });
      else window.history.replaceState(window.history.state, '', `${pathname}${search}`);
    }
    getDriveHistoryConsentStatus()
      .then(value => { if (active) setStatus(value); })
      .catch(() => { if (active) setStatus({ configured: false, connected: false }); });
    return () => { active = false; };
  }, [identity, required, publicInformation]);

  if (!identity || required || publicInformation || status?.required || !status || status.connected || dismissed
      || (!status.configured && !outcome)) return null;

  function skip() {
    try { sessionStorage.setItem(DISMISS_PREFIX + identity, '1'); } catch { /* Storage is optional. */ }
    setDismissed(true);
  }

  async function continueConsent() {
    setBusy(true);
    setError('');
    try {
      const latest = await getDriveHistoryConsentStatus();
      setStatus(latest);
      if (latest.connected) return;
      if (!latest.configured) throw new Error('Drive permission is not available yet. Please contact your WildTrack administrator.');
      await startDriveHistoryConsent();
    } catch (failure) {
      setError(failure?.message || 'Google Drive permission could not be opened.');
    } finally { setBusy(false); }
  }

  const message = error || callbackMessage(outcome);
  return (
    <Paper
      withBorder shadow="md" radius="md" p="md"
      role="region" aria-label="Google Drive history access"
      style={{ position: 'fixed', zIndex: 1100, right: 16, bottom: 16, width: 'min(410px, calc(100vw - 32px))', background: 'var(--mantine-color-body)' }}
    >
      <Stack gap="sm">
        <Text fw={750}>Allow file history from Google Drive?</Text>
        <Text size="sm">Google separately asks for read-only Drive metadata access to show available file history for your submitted PDFs and revisions that Google still retains.</Text>
        <Text size="xs" c="dimmed">WildTrack does not modify your Drive files or promise complete revision history. You can skip this permission and continue submitting, or disconnect it later from your account area.</Text>
        {message ? <Alert color="red" role="alert">{message}</Alert> : null}
        <Group gap="xs" justify="flex-end" wrap="wrap">
          <Button size="sm" variant="default" disabled={busy} onClick={skip}>Skip for now</Button>
          <Button size="sm" loading={busy} onClick={continueConsent}>{outcome || error ? 'Retry Drive permission' : 'Allow Drive history'}</Button>
        </Group>
      </Stack>
    </Paper>
  );
}
