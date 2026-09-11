import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Paper,
  Progress,
  Skeleton,
  Stack,
  Text,
  Title,
  VisuallyHidden
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { PlusCircle, Prohibit } from '@phosphor-icons/react';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { useWorkspaceResource } from '../hooks/useWorkspaceResource.js';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope.js';
import { FormEditorModal } from '../components/forms/FormEditorModal.jsx';
import { PublishedFormsTable } from '../components/forms/PublishedFormsTable.jsx';
import { buildDeliverableFormPayload, makeDeliverableFormDraft } from '../lib/forms.js';
import { saveDeliverable, unpublishAllDeliverables, unpublishDeliverable } from '../lib/submissionClient.js';
import { emptyFormsState, loadFormsState } from '../lib/formsClient.js';
import {
  getActiveTrackerColumns,
  getTrackerColumn,
  getWorkspacePublicKey,
  sortDeliverables
} from '../lib/workflow.js';

export function FormsPage() {
  const { activeWorkspace, activeWorkspaceId } = useWorkspaceSession();
  const { data: state, setData: setState, status: formsStatus, error: loadError, reload } = useWorkspaceResource(
    activeWorkspaceId,
    loadFormsState,
    emptyFormsState,
    'forms'
  );
  const deliverables = state.deliverables;
  const [formsError, setFormsError] = useState('');
  const isCurrentScope = useWorkspaceScope(activeWorkspaceId);
  const activeColumns = useMemo(() => getActiveTrackerColumns(state), [state]);
  const orderedDeliverables = useMemo(() => sortDeliverables(state, deliverables), [deliverables, state]);
  const workspaceKey = getWorkspacePublicKey(activeWorkspace);
  const [editor, setEditor] = useState({ opened: false, form: null });
  const [copyStatus, setCopyStatus] = useState('');
  const [bulkUnpublishing, setBulkUnpublishing] = useState(false);
  const [bulkUnpublishCount, setBulkUnpublishCount] = useState(0);
  const columnOptions = activeColumns.map((column) => ({ value: column.key, label: column.label }));
  const publishedDeliverables = useMemo(
    () => orderedDeliverables.filter((item) => item.status !== 'Unpublished'),
    [orderedDeliverables]
  );

  useEffect(() => {
    setFormsError('');
    setEditor({ opened: false, form: null });
    setCopyStatus('');
    setBulkUnpublishing(false);
    setBulkUnpublishCount(0);
  }, [isCurrentScope]);

  useEffect(() => {
    if (!bulkUnpublishing) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [bulkUnpublishing]);

  useEffect(() => {
    if (formsStatus === 'error') setEditor({ opened: false, form: null });
  }, [formsStatus]);

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
    if (!isCurrentScope()) return;
    const payload = buildDeliverableFormPayload(state, source);
    const workspaceId = activeWorkspaceId;
    setFormsError('');
    try {
      const saved = await saveDeliverable(workspaceId, payload);
      if (!isCurrentScope()) return;
      setState((current) => ({
        ...current,
        deliverables: [...current.deliverables.filter((item) => item.id !== saved.id), saved]
      }));
      notifications.show({
        color: 'green',
        title: source.id ? 'Form updated' : 'Form published',
        message: `${payload.shortTitle} keeps one stable public link.`
      });
      closeEditor();
    } catch (error) {
      if (!isCurrentScope()) return;
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
      if (!isCurrentScope()) return;
      setCopyStatus(`${item.shortTitle} form link copied`);
      notifications.show({ color: 'green', message: `${item.shortTitle} form link copied.` });
    } catch {
      if (!isCurrentScope()) return;
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

  function confirmUnpublishAll() {
    if (!publishedDeliverables.length) return;
    const publishedIds = new Set(publishedDeliverables.map((item) => item.id));
    const responseCount = state.attempts.filter((attempt) => publishedIds.has(attempt.deliverableId)).length;
    modals.openConfirmModal({
      title: `Unpublish all ${publishedDeliverables.length} published forms?`,
      children: (
        <Stack gap="xs">
          <Text size="sm">All current public form links in this workspace will stop accepting new responses.</Text>
          <Text size="sm" fw={700}>
            {responseCount} existing response{responseCount === 1 ? '' : 's'} will remain recorded. Forms can be republished later.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Unpublish all', cancel: 'Keep published' },
      confirmProps: { color: 'red' },
      centered: true,
      onConfirm: unpublishAll
    });
  }

  async function unpublishAll() {
    if (!isCurrentScope() || !publishedDeliverables.length) return;
    const workspaceId = activeWorkspaceId;
    const targetCount = publishedDeliverables.length;
    setFormsError('');
    setBulkUnpublishCount(targetCount);
    setBulkUnpublishing(true);
    try {
      const saved = await unpublishAllDeliverables(workspaceId);
      if (!isCurrentScope()) return;
      setState((current) => ({ ...current, deliverables: saved }));
      notifications.show({
        color: 'green',
        title: 'Forms unpublished',
        message: `${targetCount} public form${targetCount === 1 ? '' : 's'} stopped accepting responses.`
      });
    } catch (error) {
      if (!isCurrentScope()) return;
      const latest = await reload();
      if (!isCurrentScope()) return;
      const remaining = Array.isArray(latest?.deliverables)
        ? latest.deliverables.filter((item) => item.status !== 'Unpublished').length
        : null;
      const completed = remaining === 0;
      const message = completed
        ? 'The cleanup completed on the server, but the browser lost the final response. The latest form status has been restored.'
        : error?.message || 'The forms could not be unpublished. No partial browser-side batch will continue in the background.';
      setFormsError(completed ? '' : message);
      notifications.show({
        color: completed ? 'green' : 'red',
        title: completed ? 'Forms unpublished' : 'Cleanup not completed',
        message
      });
    } finally {
      if (isCurrentScope()) {
        setBulkUnpublishing(false);
        setBulkUnpublishCount(0);
      }
    }
  }

  async function setPublishedStatus(item, published) {
    if (!isCurrentScope()) return;
    const workspaceId = activeWorkspaceId;
    setFormsError('');
    try {
      const saved = published
        ? await saveDeliverable(workspaceId, { ...item, status: 'Published' })
        : await unpublishDeliverable(workspaceId, item);
      if (!isCurrentScope()) return;
      setState((current) => ({
        ...current,
        deliverables: current.deliverables.map((currentItem) => currentItem.id === saved.id ? saved : currentItem)
      }));
      notifications.show({ color: 'green', message: published
        ? `${item.shortTitle} is accepting responses again.`
        : `${item.shortTitle} is no longer accepting responses.` });
    } catch (error) {
      if (!isCurrentScope()) return;
      const message = error.message || 'The form status could not be changed.';
      setFormsError(message);
      notifications.show({ color: 'red', title: 'Form not updated', message });
    }
  }

  function republish(item) {
    return setPublishedStatus(item, true);
  }

  return (
    <Stack gap="lg" className="wt-forms-page">
      <header className="wt-staff-page-heading">
        <div>
          <Text size="xs" fw={750} tt="uppercase" c="wildtrackMaroon.7">Submission links</Text>
          <Title order={1}>Forms</Title>
          <Text c="dimmed">Publish and maintain one student submission form per deliverable.</Text>
        </div>
        <Group gap="sm">
          {publishedDeliverables.length ? (
            <Button
              variant="default"
              color="red"
              leftSection={<Prohibit size={18} />}
              onClick={confirmUnpublishAll}
              disabled={bulkUnpublishing}
            >
              Unpublish all
            </Button>
          ) : null}
          <Button color="wildtrackMaroon" leftSection={<PlusCircle size={18} />} onClick={openCreate} disabled={!activeColumns.length || bulkUnpublishing}>
            Publish form
          </Button>
        </Group>
      </header>

      {bulkUnpublishing ? (
        <Paper className="wt-bulk-unpublish-progress" withBorder p="md" role="status" aria-live="polite" aria-label="Unpublishing all forms">
          <Group justify="space-between" align="flex-start" gap="md">
            <div>
              <Text fw={750}>Unpublishing {bulkUnpublishCount} form{bulkUnpublishCount === 1 ? '' : 's'}...</Text>
              <Text size="sm" c="dimmed">WildTrack is completing this cleanup as one server-side batch. Keep this page open until it finishes.</Text>
            </div>
            <Text size="sm" fw={700} c="dimmed">In progress</Text>
          </Group>
          <Progress mt="sm" value={100} animated color="wildtrackMaroon" aria-label="Bulk unpublish in progress" />
        </Paper>
      ) : null}

      {formsStatus === 'loading' ? (
        <Paper withBorder p="lg" role="status" aria-label="Loading published forms">
          <Stack gap="md">
            <Skeleton height={24} width="35%" animate={false} />
            {[0, 1, 2].map((row) => <Skeleton key={row} height={56} animate={false} />)}
          </Stack>
        </Paper>
      ) : null}
      {formsError || loadError ? <Alert color="red" role="alert" aria-label="Form error">{formsError || loadError}</Alert> : null}
      {loadError ? <Stack gap="xs">
        {formsStatus === 'ready' ? <Text size="sm">Showing previously loaded forms. Updates could not be checked.</Text> : null}
        <Button variant="default" onClick={() => reload()}>Retry loading forms</Button>
      </Stack> : null}

      {formsStatus === 'ready' ? <PublishedFormsTable
        deliverables={orderedDeliverables}
        workspaceKey={workspaceKey}
        onCopy={copyLink}
        onEdit={openEditor}
        onRepublish={republish}
        onUnpublish={confirmUnpublish}
        actionsDisabled={bulkUnpublishing}
      /> : null}
      <VisuallyHidden role="status" aria-live="polite">{copyStatus}</VisuallyHidden>

      <FormEditorModal
        opened={editor.opened && formsStatus === 'ready'}
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
    fields: item.fields || [],
    status: item.status || 'Published'
  };
}
