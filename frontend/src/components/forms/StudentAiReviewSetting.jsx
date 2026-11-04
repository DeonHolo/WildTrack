import { Alert, Button, Checkbox, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { getStudentAiReviewSetting, saveStudentAiReviewSetting } from '../../lib/api.js';

export function StudentAiReviewSetting({ workspaceId, deliverableId }) {
  const [state, setState] = useState({ loading: true, enabled: false, error: '' });
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    generation.current++;
    setState({ loading: true, enabled: false, error: '' });
    Promise.resolve().then(() => getStudentAiReviewSetting(workspaceId, deliverableId))
      .then(data => { if (active) setState({ loading: false, enabled: data.enabled, error: '' }); })
      .catch(error => { if (active) setState({ loading: false, enabled: false, error: error.message || 'This setting could not be loaded.' }); });
    return () => { active = false; generation.current++; };
  }, [workspaceId, deliverableId, reload]);
  async function change(enabled) {
    const current = generation.current;
    setState(current => ({ ...current, loading: true, error: '' }));
    try {
      const saved = await saveStudentAiReviewSetting(workspaceId, deliverableId, enabled);
      if (current !== generation.current) return;
      setState({ loading: false, enabled: saved.enabled, error: '' });
    } catch (error) {
      if (current !== generation.current) return;
      setState(current => ({ ...current, loading: false, error: error.message || 'This setting could not be saved.' }));
    }
  }
  return <Stack gap="xs">
    <Checkbox label="Allow students to run AI Review" checked={state.enabled}
      disabled={state.loading || Boolean(state.error)} onChange={event => change(event.currentTarget.checked)} />
    <Text size="sm" c="dimmed">Students can run it for their own submitted PDFs until a review is saved. Failed attempts can be retried. Turning this off keeps saved AI Reviews available to them.</Text>
    {state.loading ? <Loader size="xs" aria-label="Saving student AI Review setting" /> : null}
    {state.error ? <Alert color="red" role="alert">{state.error}
      <Button variant="subtle" size="xs" onClick={() => setReload(value => value + 1)}>Try again</Button>
    </Alert> : null}
  </Stack>;
}
