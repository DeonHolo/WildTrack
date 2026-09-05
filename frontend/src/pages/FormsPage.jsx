import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { FormEditorModal } from '../components/forms/FormEditorModal.jsx';
import { PublishedFormsTable } from '../components/forms/PublishedFormsTable.jsx';
import { buildDeliverableFormPayload, makeDeliverableFormDraft } from '../lib/forms.js';
import { listDeliverables, saveDeliverable, unpublishDeliverable } from '../lib/submissionClient.js';
import {
  getActiveTrackerColumns,
  getTrackerColumn,
  getWorkspacePublicKey,
  sortDeliverables
} from '../lib/workflow.js';

export function FormsPage() {
  const { state } = useWorkflow();
  const { activeWorkspace, activeWorkspaceId } = useWorkspaceSession();
  const [deliverables, setDeliverables] = useState([]);
  const [formsError, setFormsError] = useState('');
  const workspaceRef = useRef(activeWorkspaceId);
  const activeColumns = useMemo(() => getActiveTrackerColumns(state), [state]);
  const orderedDeliverables = useMemo(() => sortDeliverables(state, deliverables), [deliverables, state]);
  const pendingSuggestions = state.classRecord.pendingFormSuggestions || state.classRecord.importSummary?.suggestedForms || [];
  const workspaceKey = getWorkspacePublicKey(activeWorkspace);
  const [editor, setEditor] = useState({ opened: false, form: null });
  const [copyStatus, setCopyStatus] = useState('');
  const columnOptions = activeColumns.map((column) => ({ value: column.key, label: column.label }));

  useEffect(() => {
    workspaceRef.current = activeWorkspaceId;
    let cancelled = false;
    setFormsError('');
    setDeliverables([]);
    if (!activeWorkspaceId) {
      return undefined;
    }
    listDeliverables(activeWorkspaceId)
      .then((items) => { if (!cancelled) setDeliverables(items); })
      .catch((error) => { if (!cancelled) setFormsError(error.message || 'Forms could not be loaded.'); });
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  function formForColumn(columnKey) {
    const column = getTrackerColumn(state, columnKey) || activeColumns[0];
    const existing = deliverables.find((item) => item.trackerColumn === column?.key);
    return existing ? editableForm(existing) : makeDeliverableFormDraft(state, column?.key || columnKey);
  }

  function openCreate() {
    const firstUnpublishedColumn = activeColumns.find((column) => (
      !deliverables.some((deliverable) => deliverable.trackerColumn === column.key)
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

  async function saveForm(source) {
    const payload = buildDeliverableFormPayload(state, source);
    const workspaceId = activeWorkspaceId;
    setFormsError('');
    try {
      const saved = await saveDeliverable(workspaceId, payload);
      if (workspaceRef.current !== workspaceId) return;
      setDeliverables((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      notifications.show({
        color: 'green',
        title: source.id ? 'Form updated' : 'Form published',
        message: `${payload.shortTitle} keeps one stable public link.`
      });
      closeEditor();
    } catch (error) {
      if (workspaceRef.current !== workspaceId) return;
      const message = error.message || 'The form could not be saved.';
      setFormsError(message);
      notifications.show({ color: 'red', title: 'Form not saved', message });
    }
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
      onConfirm: () => setPublishedStatus(item, false)
    });
  }

  async function setPublishedStatus(item, published) {
    const workspaceId = activeWorkspaceId;
    setFormsError('');
    try {
      const saved = published
        ? await saveDeliverable(workspaceId, { ...item, status: 'Published' })
        : await unpublishDeliverable(workspaceId, item);
      if (workspaceRef.current !== workspaceId) return;
      setDeliverables((current) => current.map((currentItem) => currentItem.id === saved.id ? saved : currentItem));
      notifications.show({ color: 'green', message: published
        ? `${item.shortTitle} is accepting responses again.`
        : `${item.shortTitle} is no longer accepting responses.` });
    } catch (error) {
      if (workspaceRef.current !== workspaceId) return;
      const message = error.message || 'The form status could not be changed.';
      setFormsError(message);
      notifications.show({ color: 'red', title: 'Form not updated', message });
    }
  }

  function republish(item) {
    return setPublishedStatus(item, true);
  }

  async function publishSuggestions() {
    const workspaceId = activeWorkspaceId;
    setFormsError('');
    try {
      const saved = [];
      for (const suggestion of pendingSuggestions) {
        const draft = formForColumn(suggestion.trackerColumn);
        saved.push(await saveDeliverable(workspaceId, buildDeliverableFormPayload(state, {
          ...draft,
          title: suggestion.title || draft.title,
          dueAt: String(suggestion.dueAt || draft.dueAt).slice(0, 16),
          pdfRequired: suggestion.pdfRequired ?? draft.pdfRequired
        })));
      }
      if (workspaceRef.current !== workspaceId) return;
      setDeliverables((current) => {
        const savedKeys = new Set(saved.map((item) => item.trackerColumn));
        return [...current.filter((item) => !savedKeys.has(item.trackerColumn)), ...saved];
      });
      notifications.show({ color: 'green', message: `${saved.length} suggested form${saved.length === 1 ? '' : 's'} published.` });
    } catch (error) {
      if (workspaceRef.current !== workspaceId) return;
      const message = error.message || 'Suggested forms could not be published.';
      setFormsError(message);
      notifications.show({ color: 'red', title: 'Suggested forms not published', message });
    }
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

      {formsError ? <Alert color="red" role="alert">{formsError}</Alert> : null}

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
              onClick={publishSuggestions}
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
