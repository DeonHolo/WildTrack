import { Checkbox, Group, Modal, Stack, Text, Button } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';

function deadlineLabel(dueAt) {
  if (!dueAt) return 'No deadline set';
  // WildTrack records local academic deadlines in Asia/Manila. Avoid letting
  // the browser's own timezone silently change the displayed calendar day.
  const local = String(dueAt).replace('T', ' ').slice(0, 16);
  return `Due ${local} (Asia/Manila)`;
}

export function MonitorSettingsDialog({ opened, workspaceName, settings, saving, error, onClose, onSave }) {
  const deliverables = settings?.deliverables || [];
  const [selectedIds, setSelectedIds] = useState([]);
  const initializedForOpen = useRef(false);

  useEffect(() => {
    if (!opened) {
      initializedForOpen.current = false;
    } else if (!initializedForOpen.current && settings) {
      setSelectedIds(deliverables.filter((item) => item.enabled).map((item) => item.id));
      initializedForOpen.current = true;
    }
  }, [opened, settings]);

  const validIds = new Set(deliverables.map((item) => item.id));
  const selected = selectedIds.filter((id) => validIds.has(id));
  const selectedSet = new Set(selected);
  const selectedCount = selectedSet.size;

  return (
    <Modal opened={opened} onClose={saving ? () => {} : onClose} closeOnEscape={!saving}
      closeOnClickOutside={!saving} withCloseButton={!saving}
      title="Configure deadline PDF monitoring" centered size="lg">
      <Stack gap="md">
        <Text size="sm">Choose which deliverables in <strong>{workspaceName || 'this workspace'}</strong> receive automatic Google Drive PDF checks. Other workspaces are unaffected.</Text>
        <Text size="sm" c="dimmed">Monitoring is {settings?.enabled ? 'enabled' : 'disabled'} for this workspace. Saving these selections does not change that switch.</Text>
        <Group justify="space-between" gap="xs" wrap="wrap">
          <Text size="sm" fw={700}>{selectedCount} of {deliverables.length} deliverables selected</Text>
          <Group gap="xs">
            <Button size="compact-sm" variant="subtle" disabled={saving || !deliverables.length || selectedCount === deliverables.length}
              onClick={() => setSelectedIds(deliverables.map((item) => item.id))}>Select all</Button>
            <Button size="compact-sm" variant="subtle" disabled={saving || !selectedCount}
              onClick={() => setSelectedIds([])}>Select none</Button>
          </Group>
        </Group>
        {deliverables.length ? (
          <Checkbox.Group value={selected} onChange={setSelectedIds}>
            <Stack gap="sm">
              {deliverables.map((item) => (
                <Checkbox key={item.id} value={item.id} disabled={saving}
                  label={item.title || 'Untitled deliverable'}
                  description={deadlineLabel(item.dueAt)} />
              ))}
            </Stack>
          </Checkbox.Group>
        ) : <Text size="sm" c="dimmed">No eligible deliverables are available for PDF monitoring in this workspace.</Text>}
        {!selectedCount ? <Text size="sm" role="status">No deliverables selected. No automatic PDF scans will run, even if workspace monitoring is enabled.</Text> : null}
        {error ? <Text size="sm" c="red" role="alert">{error}</Text> : null}
        <Group justify="flex-end" gap="sm" wrap="wrap">
          <Button variant="default" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button color="wildtrackMaroon" loading={saving} onClick={() => onSave(selected)}>Save deliverables</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
