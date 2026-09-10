import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea
} from '@mantine/core';
import { ArrowDown, ArrowUp, CheckCircle, PlusCircle, Trash } from '@phosphor-icons/react';
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

  function updateField(index, changes) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...changes } : field)
    }));
  }

  function addField() {
    setDraft((current) => ({
      ...current,
      fields: [...(current.fields || []), {
        id: newFieldKey(),
        definitionId: null,
        label: 'New submission link',
        type: 'url',
        required: true,
        pdfRequired: false,
        documentCheckPolicy: 'OFF',
        aiReviewEnabled: false,
        active: true
      }]
    }));
  }

  function removeField(index) {
    setDraft((current) => ({ ...current, fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index) }));
  }

  function moveField(index, direction) {
    setDraft((current) => {
      const fields = [...current.fields];
      const target = index + direction;
      if (target < 0 || target >= fields.length) return current;
      [fields[index], fields[target]] = [fields[target], fields[index]];
      return { ...current, fields };
    });
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
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDraft((current) => ({ ...current, title: value }));
            }}
            required
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" className="wt-date-time-grid">
            <TextInput
              label="Due date"
              aria-label="Due date"
              type="date"
              value={dateTime.date}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft((current) => ({ ...current, dueAt: joinLocalDateTime(value, dateTime.time) }));
              }}
              required
            />
            <TextInput
              label="Due time"
              aria-label="Due time"
              type="time"
              value={dateTime.time}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft((current) => ({ ...current, dueAt: joinLocalDateTime(dateTime.date, value) }));
              }}
              required
            />
          </SimpleGrid>
          <Textarea
            label="Instructions"
            value={draft.instructions}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDraft((current) => ({ ...current, instructions: value }));
            }}
            autosize
            minRows={3}
            maxRows={7}
          />
          <Stack gap="sm">
            <Group justify="space-between" align="flex-end">
              <div>
                <Text fw={750}>Submission fields</Text>
                <Text size="xs" c="dimmed">Add each link or response the student must submit. PDF-only review controls appear only for Google Drive PDF fields.</Text>
              </div>
              <Button type="button" variant="default" size="sm" leftSection={<PlusCircle size={16} />} onClick={addField}>
                Add field
              </Button>
            </Group>
            {(draft.fields || []).map((field, index) => (
              <Paper key={field.id} withBorder p="md" radius="md">
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Text size="sm" fw={750}>Field {index + 1}</Text>
                    <Group gap={4}>
                      <Button type="button" variant="subtle" size="compact-sm" aria-label={`Move ${field.label} up`} disabled={index === 0} onClick={() => moveField(index, -1)}><ArrowUp size={16} /></Button>
                      <Button type="button" variant="subtle" size="compact-sm" aria-label={`Move ${field.label} down`} disabled={index === draft.fields.length - 1} onClick={() => moveField(index, 1)}><ArrowDown size={16} /></Button>
                      <Button type="button" variant="subtle" color="red" size="compact-sm" aria-label={`Remove ${field.label}`} disabled={draft.fields.length === 1} onClick={() => removeField(index)}><Trash size={16} /></Button>
                    </Group>
                  </Group>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <TextInput label="Field label" value={field.label} onChange={(event) => updateField(index, { label: event.currentTarget.value })} required />
                    <Select
                      label="Field type"
                      value={field.type}
                      data={FIELD_TYPES}
                      allowDeselect={false}
                      onChange={(value) => {
                        const drive = value === 'drive';
                        updateField(index, {
                          type: value,
                          pdfRequired: drive,
                          documentCheckPolicy: drive ? (field.documentCheckPolicy === 'OFF' ? 'AUTO' : field.documentCheckPolicy || 'AUTO') : 'OFF',
                          aiReviewEnabled: drive ? (field.type === 'drive' ? field.aiReviewEnabled !== false : true) : false
                        });
                      }}
                    />
                  </SimpleGrid>
                  <Checkbox checked={field.required !== false} onChange={(event) => updateField(index, { required: event.currentTarget.checked })} label="Required field" />
                  {field.type === 'drive' ? (
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                      <Select
                        label="Document Check"
                        description="Auto runs after this PDF changes; Manual waits for staff; Off never queues it."
                        value={field.documentCheckPolicy || 'AUTO'}
                        allowDeselect={false}
                        data={[
                          { value: 'AUTO', label: 'Automatic' },
                          { value: 'MANUAL', label: 'Manual' },
                          { value: 'OFF', label: 'Off' }
                        ]}
                        onChange={(value) => updateField(index, {
                          documentCheckPolicy: value,
                          aiReviewEnabled: value === 'OFF' ? false : field.aiReviewEnabled
                        })}
                      />
                      <Checkbox
                        mt="xl"
                        checked={Boolean(field.aiReviewEnabled)}
                        disabled={field.documentCheckPolicy === 'OFF'}
                        onChange={(event) => updateField(index, { aiReviewEnabled: event.currentTarget.checked })}
                        label="Allow AI Review"
                      />
                    </SimpleGrid>
                  ) : null}
                </Stack>
              </Paper>
            ))}
          </Stack>
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

const FIELD_TYPES = [
  { value: 'url', label: 'General URL' },
  { value: 'drive', label: 'Google Drive PDF' },
  { value: 'googleForm', label: 'Google Form' },
  { value: 'googleSheet', label: 'Google Sheet' },
  { value: 'driveFolder', label: 'Google Drive folder' },
  { value: 'textarea', label: 'Long text response' }
];

function newFieldKey() {
  const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `field-${token}`;
}

function splitLocalDateTime(value) {
  const clean = String(value || dateAt2359()).slice(0, 16);
  const [date = '', time = '23:59'] = clean.split('T');
  return { date, time };
}

function joinLocalDateTime(date, time) {
  return `${date || splitLocalDateTime().date}T${time || '23:59'}`;
}
