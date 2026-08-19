import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea
} from '@mantine/core';
import { CheckCircle, PlusCircle } from '@phosphor-icons/react';
import { dateAt2359 } from '../../lib/forms.js';
import { slugify } from '../../lib/workflow.js';

export function FormEditorModal({
  opened,
  initialForm,
  columns,
  workspaceKey,
  onClose,
  onColumnChange,
  onSave
}) {
  const [draft, setDraft] = useState(initialForm);

  useEffect(() => {
    if (opened) setDraft(initialForm);
  }, [initialForm, opened]);

  const editing = Boolean(draft?.id);
  const shortTitle = draft?.shortTitle || columns.find((column) => column.value === draft?.trackerColumn)?.label || 'form';
  const generatedSlug = draft?.slug || slugify(draft?.title || `${shortTitle} Submission`);
  const modalTitle = editing ? `Edit ${shortTitle} form` : 'Publish a form';
  const dateTime = useMemo(() => splitLocalDateTime(draft?.dueAt), [draft?.dueAt]);

  if (!draft) return null;

  function changeColumn(value) {
    const next = onColumnChange(value);
    setDraft(next);
  }

  function submit(event) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <Modal opened={opened} onClose={onClose} title={modalTitle} size="lg" centered>
      <form onSubmit={submit}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {editing
              ? 'Changes keep the existing public link and all recorded responses.'
              : 'Choose a mapped deliverable, confirm its deadline, and publish one reusable link.'}
          </Text>
          <Select
            label="Deliverable"
            description="Loaded from the connected Tracker columns."
            data={columns}
            value={draft.trackerColumn}
            onChange={changeColumn}
            disabled={editing}
            required
          />
          <TextInput
            label="Form title"
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.currentTarget.value }))}
            required
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" className="wt-date-time-grid">
            <TextInput
              label="Due date"
              aria-label="Due date"
              type="date"
              value={dateTime.date}
              onChange={(event) => setDraft((current) => ({ ...current, dueAt: joinLocalDateTime(event.currentTarget.value, dateTime.time) }))}
              required
            />
            <TextInput
              label="Due time"
              aria-label="Due time"
              type="time"
              value={dateTime.time}
              onChange={(event) => setDraft((current) => ({ ...current, dueAt: joinLocalDateTime(dateTime.date, event.currentTarget.value) }))}
              required
            />
          </SimpleGrid>
          <Select
            label="Document rule"
            data={[
              { value: 'pdf', label: 'PDF Drive link only' },
              { value: 'link', label: 'General link fields' }
            ]}
            value={draft.pdfRequired ? 'pdf' : 'link'}
            onChange={(value) => setDraft((current) => ({ ...current, pdfRequired: value === 'pdf' }))}
          />
          <Textarea
            label="Instructions"
            value={draft.instructions}
            onChange={(event) => setDraft((current) => ({ ...current, instructions: event.currentTarget.value }))}
            autosize
            minRows={3}
            maxRows={7}
          />
          <div className="wt-generated-link-preview">
            <Text size="xs" fw={750} c="dimmed">Public link</Text>
            <Text component="code" size="sm">/w/{workspaceKey}/submit/{generatedSlug}</Text>
          </div>
          <Group justify="flex-end" gap="sm">
            <Button type="button" variant="default" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              color="wildtrackMaroon"
              leftSection={editing ? <CheckCircle size={18} /> : <PlusCircle size={18} />}
            >
              {editing ? 'Save changes' : 'Publish form'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function splitLocalDateTime(value) {
  const clean = String(value || dateAt2359()).slice(0, 16);
  const [date = '', time = '23:59'] = clean.split('T');
  return { date, time };
}

function joinLocalDateTime(date, time) {
  return `${date || splitLocalDateTime().date}T${time || '23:59'}`;
}
