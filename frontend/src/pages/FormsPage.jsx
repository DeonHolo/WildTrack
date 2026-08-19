import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Stack,
  Text,
  Title,
  VisuallyHidden
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { CheckCircle, PlusCircle } from '@phosphor-icons/react';
import { useWorkflow } from '../app/WorkflowContext.jsx';
import { FormEditorModal } from '../components/forms/FormEditorModal.jsx';
import { PublishedFormsTable } from '../components/forms/PublishedFormsTable.jsx';
import { buildDeliverableFormPayload, makeDeliverableFormDraft } from '../lib/forms.js';
import {
  getActiveTrackerColumns,
  getTrackerColumn,
  getWorkspacePublicKey,
  sortDeliverables
} from '../lib/workflow.js';

export function FormsPage() {
  const {
    state,
    activeWorkspace,
    publishDeliverable,
    removeDeliverable,
    generateFormsFromSuggestions
  } = useWorkflow();
  const activeColumns = useMemo(() => getActiveTrackerColumns(state), [state]);
  const orderedDeliverables = useMemo(() => sortDeliverables(state, state.deliverables), [state]);
  const pendingSuggestions = state.classRecord.pendingFormSuggestions || state.classRecord.importSummary?.suggestedForms || [];
  const workspaceKey = getWorkspacePublicKey(activeWorkspace);
  const [editor, setEditor] = useState({ opened: false, form: null });
  const [copyStatus, setCopyStatus] = useState('');
  const columnOptions = activeColumns.map((column) => ({ value: column.key, label: column.label }));

  function formForColumn(columnKey) {
    const column = getTrackerColumn(state, columnKey) || activeColumns[0];
    const existing = state.deliverables.find((item) => item.trackerColumn === column?.key);
    return existing ? editableForm(existing) : makeDeliverableFormDraft(state, column?.key || columnKey);
  }

  function openCreate() {
    const firstUnpublishedColumn = activeColumns.find((column) => (
      !state.deliverables.some((deliverable) => deliverable.trackerColumn === column.key)
    ));
    const column = firstUnpublishedColumn || activeColumns[0];
    setEditor({ opened: true, form: formForColumn(column?.key || 'SRS') });
  }

  function openEditor(item) {
    setEditor({ opened: true, form: editableForm(item) });
  }

  function closeEditor() {
    setEditor({ opened: false, form: null });
  }

  function saveForm(source) {
    const payload = buildDeliverableFormPayload(state, source);
    publishDeliverable(payload);
    notifications.show({
      color: 'green',
      title: source.id ? 'Form updated' : 'Form published',
      message: `${payload.shortTitle} keeps one stable public link.`
    });
    closeEditor();
  }

  async function copyLink(item, path) {
    const absoluteLink = `${window.location.origin}${path}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(absoluteLink);
      setCopyStatus(`${item.shortTitle} form link copied`);
      notifications.show({ color: 'green', message: `${item.shortTitle} form link copied.` });
    } catch {
      setCopyStatus(`Could not copy the ${item.shortTitle} form link`);
      notifications.show({ color: 'red', message: 'The form link could not be copied.' });
    }
  }

  function confirmUnpublish(item) {
    const responseCount = state.attempts.filter((attempt) => attempt.deliverableId === item.id).length;
    modals.openConfirmModal({
      title: `Unpublish ${item.shortTitle}?`,
      children: (
        <Stack gap="xs">
          <Text size="sm">The public link will stop accepting new responses.</Text>
          <Text size="sm" fw={700}>
            {responseCount} existing response{responseCount === 1 ? '' : 's'} will remain recorded and connected to this deliverable.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Unpublish form', cancel: 'Keep published' },
      confirmProps: { color: 'red' },
      centered: true,
      onConfirm: () => removeDeliverable(item.id)
    });
  }

  function republish(item) {
    publishDeliverable({ ...item, status: 'Published' });
    notifications.show({ color: 'green', message: `${item.shortTitle} is accepting responses again.` });
  }

  return (
    <Stack gap="lg" className="wt-forms-page">
      <header className="wt-staff-page-heading">
        <div>
          <Text size="xs" fw={750} tt="uppercase" c="wildtrackMaroon.7">Submission links</Text>
          <Title order={1}>Forms</Title>
          <Text c="dimmed">Publish and maintain one student submission form per deliverable.</Text>
        </div>
        <Button color="wildtrackMaroon" leftSection={<PlusCircle size={18} />} onClick={openCreate} disabled={!activeColumns.length}>
          Publish form
        </Button>
      </header>

      {pendingSuggestions.length ? (
        <Alert
          color="wildtrackGold"
          variant="light"
          title={`${pendingSuggestions.length} suggested form${pendingSuggestions.length === 1 ? '' : 's'} ready`}
          icon={<CheckCircle size={19} />}
        >
          <Group justify="space-between" gap="md">
            <Text size="sm">WildTrack detected deliverable deadlines in the connected Tracker.</Text>
            <Button
              size="sm"
              variant="light"
              color="wildtrackMaroon"
              onClick={() => generateFormsFromSuggestions(pendingSuggestions)}
            >
              Generate suggested forms
            </Button>
          </Group>
        </Alert>
      ) : null}

      <PublishedFormsTable
        deliverables={orderedDeliverables}
        workspaceKey={workspaceKey}
        onCopy={copyLink}
        onEdit={openEditor}
        onRepublish={republish}
        onUnpublish={confirmUnpublish}
      />
      <VisuallyHidden role="status" aria-live="polite">{copyStatus}</VisuallyHidden>

      <FormEditorModal
        opened={editor.opened}
        initialForm={editor.form}
        columns={columnOptions}
        workspaceKey={workspaceKey}
        onClose={closeEditor}
        onColumnChange={formForColumn}
        onSave={saveForm}
      />
    </Stack>
  );
}

function editableForm(item) {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    shortTitle: item.shortTitle,
    dueAt: String(item.dueAt || '').slice(0, 16),
    trackerColumn: item.trackerColumn,
    instructions: item.instructions || '',
    pdfRequired: item.fields?.some((field) => field.pdfRequired) || false,
    status: item.status || 'Published'
  };
}
