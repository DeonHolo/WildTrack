import { Alert, NativeSelect, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useWorkflow } from '../../app/WorkflowContext.jsx';

export function StudentWorkspacePicker() {
  const { workspaces, activeWorkspaceId, needsWorkspaceChoice, switchWorkspace } = useWorkflow();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');

  if (!workspaces?.length) return null;
  if (workspaces.length === 1) {
    return <Text size="sm" c="dimmed">Workspace: {workspaces[0].name}</Text>;
  }

  async function chooseWorkspace(event) {
    const workspaceId = event.currentTarget.value;
    if (!workspaceId) return;
    setError('');
    setSwitching(true);
    try {
      const result = await switchWorkspace(workspaceId);
      if (!result?.ok) setError(result?.error || 'This workspace could not be opened. Try again.');
    } catch (error) {
      setError(error.message || 'This workspace could not be opened. Try again.');
    } finally {
      setSwitching(false);
    }
  }

  return (
    <Stack gap="xs" className="wt-student-workspace-picker">
      <NativeSelect
        label="Workspace"
        description="Choose your class and term. You can change this here later."
        value={needsWorkspaceChoice ? '' : activeWorkspaceId || ''}
        onChange={chooseWorkspace}
        disabled={switching}
        data={[
          { value: '', label: 'Choose your workspace', disabled: true },
          ...workspaces.map((workspace) => ({
            value: workspace.id,
            label: [workspace.name, ...[workspace.courseCode, workspace.academicYear, workspace.semester]
              .filter((detail) => detail && !workspace.name?.includes(detail))].filter(Boolean).join(' · ')
          }))
        ]}
      />
      {switching ? <Text size="sm" c="dimmed" role="status">Opening workspace…</Text> : null}
      {error ? <Alert color="red" role="alert">{error}</Alert> : null}
    </Stack>
  );
}
