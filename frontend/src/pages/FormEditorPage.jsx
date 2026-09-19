import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Anchor,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title
} from '@mantine/core';
import {
  ArrowDown,
  ArrowLeft,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowUp,
  Check,
  Copy,
  DotsSixVertical,
  Eye,
  FloppyDisk,
  Plus,
  Prohibit,
  Trash,
  WarningCircle
} from '@phosphor-icons/react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { SubmissionFields } from '../components/public/SubmissionFields.jsx';
import { useWorkspaceResource } from '../hooks/useWorkspaceResource.js';
import {
  ACADEMIC_FIELD_ORDER,
  ACADEMIC_FIELD_TYPES,
  CHOICE_FIELD_TYPES,
  academicFieldSuggestions,
  applyAcademicSuggestionReview,
  buildDeliverableFormPayload,
  dateAt2359,
  duplicateField,
  makeDeliverableFormDraft,
  makeEditableDeliverableForm,
  mergeAcademicSuggestions,
  newChoiceOption,
  newQuestion,
  normalizeEditorField
} from '../lib/forms.js';
import { emptyFormsState, loadFormsState } from '../lib/formsClient.js';
import { saveDeliverable } from '../lib/submissionClient.js';
import { getActiveTrackerColumns, getTrackerColumn, getWorkspacePublicKey } from '../lib/workflow.js';

const FIELD_TYPES = [
  { value: 'shortText', label: 'Short answer' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multipleChoice', label: 'Multiple choice' },
  { value: 'checkboxes', label: 'Checkboxes' },
  { value: 'url', label: 'General URL' },
  { value: 'drive', label: 'Google Drive PDF link' },
  { value: 'googleForm', label: 'Google Form' },
  { value: 'googleSheet', label: 'Google Sheet' },
  { value: 'driveFolder', label: 'Google Drive folder' },
  { value: 'academicStudentNumber', label: 'Student Number' },
  { value: 'academicStudentName', label: 'Student Name' },
  { value: 'academicTeamCode', label: 'Team Code' },
  { value: 'academicSection', label: 'Section' }
];

export function FormEditorPage() {
  const { formId } = useParams();
  const navigate = useNavigate();
  const { activeWorkspace, activeWorkspaceId } = useWorkspaceSession();
  const { data: state, setData: setState, status, error: loadError } = useWorkspaceResource(
    activeWorkspaceId,
    loadFormsState,
    emptyFormsState,
    'forms'
  );
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [previewOpened, setPreviewOpened] = useState(false);
  const [academicReviewOpened, setAcademicReviewOpened] = useState(false);
  const [academicReviewItems, setAcademicReviewItems] = useState([]);
  const initializedScope = useRef('');
  const draftRef = useRef(null);
  const historyRef = useRef({ past: [], future: [] });
  const questionRefs = useRef(new Map());
  const pendingScrollId = useRef('');
  const [historyRevision, setHistoryRevision] = useState(0);
  const [draggingId, setDraggingId] = useState('');
  const editing = Boolean(formId);
  const workspaceKey = getWorkspacePublicKey(activeWorkspace);
  const activeColumns = useMemo(() => getActiveTrackerColumns(state), [state]);
  const dirty = Boolean(draft && baseline && snapshot(draft) !== baseline);

  useEffect(() => {
    if (status !== 'ready') return;
    const scope = `${activeWorkspaceId}:${formId || 'new'}`;
    if (initializedScope.current === scope) return;
    initializedScope.current = scope;
    const next = editing
      ? state.deliverables.find((item) => String(item.id) === String(formId))
      : null;
    const initial = next
      ? withAcademicSuggestions(makeEditableDeliverableForm(next), state.students || [])
      : makeNewDraft(state, activeColumns);
    setDraft(initial || null);
    draftRef.current = initial || null;
    historyRef.current = { past: [], future: [] };
    setHistoryRevision((value) => value + 1);
    setBaseline(initial ? snapshot(initial) : '');
    setSelectedId(initial?.fields?.find((field) => field.active !== false)?.id || '');
    setSaveState('idle');
    setSaveError('');
  }, [activeWorkspaceId, activeColumns, editing, formId, state, status]);

  useEffect(() => {
    if (!pendingScrollId.current || selectedId !== pendingScrollId.current) return;
    const node = questionRefs.current.get(pendingScrollId.current);
    if (!node) return;
    pendingScrollId.current = '';
    node.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [draft, selectedId]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    const handleHistoryShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoDraft();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redoDraft();
      }
    };
    window.addEventListener('keydown', handleHistoryShortcut);
    return () => window.removeEventListener('keydown', handleHistoryShortcut);
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const guardInternalLink = (event) => {
      const anchor = event.target?.closest?.('a[href]');
      if (!anchor || anchor.target === '_blank' || event.defaultPrevented) return;
      let target;
      try {
        target = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (target.origin !== window.location.origin) return;
      if (`${target.pathname}${target.search}${target.hash}` === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
      if (!window.confirm('Leave this form editor? Unsaved changes will be lost.')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', guardInternalLink, true);
    return () => document.removeEventListener('click', guardInternalLink, true);
  }, [dirty]);

  if (status === 'loading' || !draft) {
    if (status === 'ready' && editing && !state.deliverables.some((item) => String(item.id) === String(formId))) {
      return <Alert color="red">This form could not be found in the active workspace.</Alert>;
    }
    return <Stack gap="md"><Skeleton height={52} /><Skeleton height={180} /><Skeleton height={260} /></Stack>;
  }

  const activeFields = draft.fields.filter((field) => field.active !== false);
  const published = String(draft.status || '').toLowerCase() === 'published';
  const canUndo = historyRef.current.past.length > 0 && historyRevision >= 0;
  const canRedo = historyRef.current.future.length > 0 && historyRevision >= 0;
  const publicPath = draft.slug ? `/w/${workspaceKey}/submit/${draft.slug}` : '';

  function commitDraft(nextOrUpdater) {
    const current = draftRef.current || draft;
    const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(current) : nextOrUpdater;
    if (!next || snapshot(next) === snapshot(current)) return;
    historyRef.current = {
      past: [...historyRef.current.past, current].slice(-80),
      future: []
    };
    draftRef.current = next;
    setDraft(next);
    setHistoryRevision((value) => value + 1);
    setSaveState('idle');
    setSaveError('');
  }

  function undoDraft() {
    const history = historyRef.current;
    if (!history.past.length || !draftRef.current) return;
    const previous = history.past[history.past.length - 1];
    historyRef.current = {
      past: history.past.slice(0, -1),
      future: [draftRef.current, ...history.future].slice(0, 80)
    };
    draftRef.current = previous;
    setDraft(previous);
    setHistoryRevision((value) => value + 1);
    setSaveState('idle');
    setSaveError('');
  }

  function redoDraft() {
    const history = historyRef.current;
    if (!history.future.length || !draftRef.current) return;
    const next = history.future[0];
    historyRef.current = {
      past: [...history.past, draftRef.current].slice(-80),
      future: history.future.slice(1)
    };
    draftRef.current = next;
    setDraft(next);
    setHistoryRevision((value) => value + 1);
    setSaveState('idle');
    setSaveError('');
  }

  function updateDraft(changes) {
    commitDraft((current) => ({ ...current, ...changes }));
  }

  function updateField(fieldId, changes) {
    commitDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => field.id === fieldId ? normalizeEditorField({ ...field, ...changes }) : field)
    }));
  }

  function addQuestion() {
    const field = newQuestion('shortText');
    commitDraft((current) => {
      const fields = [...current.fields];
      const selectedIndex = fields.findIndex((item) => item.id === selectedId && item.active !== false);
      const lastActiveIndex = fields.reduce((last, item, index) => item.active !== false ? index : last, -1);
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : lastActiveIndex + 1;
      fields.splice(insertAt, 0, field);
      return { ...current, fields };
    });
    setSelectedId(field.id);
    pendingScrollId.current = field.id;
  }

  function duplicateQuestion(field) {
    if (field.type === 'academicStudentNumber') return;
    const copy = duplicateField(field);
    commitDraft((current) => {
      const index = current.fields.findIndex((item) => item.id === field.id);
      const fields = [...current.fields];
      fields.splice(index + 1, 0, copy);
      return { ...current, fields };
    });
    setSelectedId(copy.id);
  }

  function moveQuestion(fieldId, direction) {
    commitDraft((current) => {
      const active = current.fields.filter((field) => field.active !== false);
      const currentActiveIndex = active.findIndex((field) => field.id === fieldId);
      const targetActive = active[currentActiveIndex + direction];
      if (!targetActive) return current;
      const first = current.fields.findIndex((field) => field.id === fieldId);
      const second = current.fields.findIndex((field) => field.id === targetActive.id);
      const fields = [...current.fields];
      [fields[first], fields[second]] = [fields[second], fields[first]];
      return { ...current, fields };
    });
  }

  function reorderQuestion(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    commitDraft((current) => {
      const fields = [...current.fields];
      const sourceIndex = fields.findIndex((field) => field.id === sourceId);
      const targetIndex = fields.findIndex((field) => field.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const [moved] = fields.splice(sourceIndex, 1);
      const nextTargetIndex = fields.findIndex((field) => field.id === targetId);
      const insertAt = sourceIndex < targetIndex ? nextTargetIndex + 1 : nextTargetIndex;
      fields.splice(insertAt, 0, moved);
      return { ...current, fields };
    });
  }

  function removeQuestion(field) {
    if (field.type === 'academicStudentNumber') return;
    commitDraft((current) => ({
      ...current,
      fields: field.definitionId
        ? current.fields.map((item) => item.id === field.id ? { ...item, active: false } : item)
        : current.fields.filter((item) => item.id !== field.id)
    }));
    const next = activeFields.find((item) => item.id !== field.id);
    setSelectedId(next?.id || '');
  }

  function refreshAcademicSuggestions() {
    const suggestions = academicFieldSuggestions(state.students || []);
    const activeTypes = draft.fields
      .filter((field) => field.active !== false && ACADEMIC_FIELD_TYPES.has(field.type))
      .map((field) => field.type);
    const orderedTypes = [
      ...activeTypes,
      ...ACADEMIC_FIELD_ORDER.filter((type) => !activeTypes.includes(type))
    ];
    setAcademicReviewItems(orderedTypes.map((type) => {
      const existing = draft.fields.find((field) => field.type === type);
      const suggestion = suggestions.find((field) => field.type === type);
      return {
        type,
        label: existing?.label || suggestion?.label || typeLabel(type),
        selected: type === 'academicStudentNumber' || (existing ? existing.active !== false : true),
        locked: type === 'academicStudentNumber'
      };
    }));
    setAcademicReviewOpened(true);
  }

  function toggleAcademicSuggestion(type, selected) {
    if (type === 'academicStudentNumber') return;
    setAcademicReviewItems((items) => items.map((item) => item.type === type ? { ...item, selected } : item));
  }

  function moveAcademicSuggestion(index, direction) {
    setAcademicReviewItems((items) => {
      const target = index + direction;
      if (target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function applyAcademicSuggestions() {
    const orderedTypes = academicReviewItems.map((item) => item.type);
    const selectedTypes = academicReviewItems.filter((item) => item.selected).map((item) => item.type);
    commitDraft((current) => ({
      ...current,
      fields: applyAcademicSuggestionReview(current.fields, orderedTypes, selectedTypes)
    }));
    if (!draftRef.current?.fields.some((field) => field.id === selectedId && field.active !== false)) {
      setSelectedId(draftRef.current?.fields.find((field) => field.active !== false)?.id || '');
    }
    setAcademicReviewOpened(false);
  }

  async function save(nextStatus = draft.status || 'Unpublished') {
    const validationError = validateEditorDraft(draft);
    if (validationError) {
      setSaveError(validationError);
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    setSaveError('');
    try {
      const payload = buildDeliverableFormPayload(state, draft, nextStatus);
      const saved = await saveDeliverable(activeWorkspaceId, payload);
      const editorForm = makeEditableDeliverableForm(saved);
      setState((current) => ({
        ...current,
        deliverables: [...current.deliverables.filter((item) => item.id !== saved.id), saved]
      }));
      setDraft(editorForm);
      draftRef.current = editorForm;
      historyRef.current = { past: [], future: [] };
      setHistoryRevision((value) => value + 1);
      setBaseline(snapshot(editorForm));
      setSaveState('saved');
      if (!formId && saved.id) {
        initializedScope.current = `${activeWorkspaceId}:${saved.id}`;
        navigate(`/forms/${saved.id}/edit`, { replace: true });
      }
    } catch (error) {
      setSaveState('error');
      setSaveError(error?.status === 409
        ? 'A newer version of this form was saved elsewhere. Reload before saving again.'
        : error?.message || 'The form could not be saved. Your draft is still here.');
    }
  }

  function leaveEditor() {
    if (dirty && !window.confirm('Leave this form editor? Unsaved changes will be lost.')) return;
    navigate('/forms');
  }

  return (
    <Stack gap="lg" className="wt-form-editor-page">
      <header className="wt-form-editor-toolbar">
        <Group gap="sm" wrap="nowrap">
          <ActionIcon variant="default" size="lg" aria-label="Back to forms" onClick={leaveEditor}><ArrowLeft size={18} /></ActionIcon>
          <div>
            <Text size="xs" fw={800} tt="uppercase" c="wildtrackMaroon.7">Form editor</Text>
            <Title order={1}>{editing ? 'Edit form' : 'New form'}</Title>
          </div>
        </Group>
        <Group gap="sm">
          <ActionIcon variant="default" size="lg" aria-label="Undo" disabled={!canUndo} onClick={undoDraft}><ArrowCounterClockwise size={18} /></ActionIcon>
          <ActionIcon variant="default" size="lg" aria-label="Redo" disabled={!canRedo} onClick={redoDraft}><ArrowClockwise size={18} /></ActionIcon>
          <Badge variant="light" color={published ? 'green' : 'gray'}>{published ? 'Published' : 'Unpublished'}</Badge>
          <Button variant="default" leftSection={<Eye size={17} />} onClick={() => setPreviewOpened(true)}>Preview</Button>
          <Button variant="default" leftSection={<FloppyDisk size={17} />} loading={saveState === 'saving'} onClick={() => save(draft.status || 'Unpublished')}>Save</Button>
          {published ? (
            <Button variant="light" color="red" leftSection={<Prohibit size={17} />} loading={saveState === 'saving'} onClick={() => save('Unpublished')}>Unpublish</Button>
          ) : (
            <Button color="wildtrackMaroon" leftSection={<Check size={17} />} loading={saveState === 'saving'} onClick={() => save('Published')}>Publish</Button>
          )}
        </Group>
      </header>

      {loadError ? <Alert color="red">{loadError}</Alert> : null}
      {saveError ? <Alert color="red" icon={<WarningCircle size={18} />} role="alert">{saveError}</Alert> : null}
      <Text size="sm" c={saveState === 'saved' ? 'green' : 'dimmed'} role="status">
        {saveState === 'saving' ? 'Saving form…' : saveState === 'saved' ? 'Saved' : dirty ? 'Unsaved changes' : 'No unsaved changes'}
      </Text>

      <div className="wt-form-editor-grid">
        <Stack gap="md" className="wt-form-editor-main">
          <Paper withBorder p={{ base: 'md', sm: 'xl' }} radius="md" className="wt-form-editor-title-card">
            <Stack gap="md">
              <Group justify="space-between" gap="sm" wrap="wrap">
                <Text size="xs" fw={800} tt="uppercase" c="dimmed">Section 1 of 1</Text>
                <Text size="xs" c="dimmed">{activeFields.length} question{activeFields.length === 1 ? '' : 's'}</Text>
              </Group>
              <TextInput label="Form title" value={draft.title} required onChange={(event) => updateDraft({ title: event.currentTarget.value })} />
              <Textarea label="Instructions" value={draft.instructions || ''} autosize minRows={3}
                onChange={(event) => updateDraft({ instructions: event.currentTarget.value })} />
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Select label="Deliverable mapping" value={draft.trackerColumn} data={activeColumns.map((column) => ({ value: column.key, label: column.label }))}
                  allowDeselect={false} disabled={editing} onChange={(value) => value && changeMapping(value)} />
                <TextInput label="Deadline" type="datetime-local" value={String(draft.dueAt || dateAt2359()).slice(0, 16)} required
                  onChange={(event) => updateDraft({ dueAt: event.currentTarget.value })} />
              </SimpleGrid>
              <Group justify="space-between" gap="sm" wrap="wrap">
                <Group gap={6} wrap="wrap">
                  <Text size="xs" c="dimmed">Public URL:</Text>
                  {publicPath ? (
                    <Anchor size="xs" href={publicPath} target="_blank" rel="noreferrer">{publicPath}</Anchor>
                  ) : (
                    <Text size="xs" c="dimmed">Available after first save</Text>
                  )}
                </Group>
                <Button size="xs" variant="subtle" onClick={refreshAcademicSuggestions}>Refresh academic suggestions</Button>
              </Group>
            </Stack>
          </Paper>

          <Stack gap="md">
            {activeFields.map((field, index) => (
              <QuestionCard
                key={field.id}
                field={field}
                selected={selectedId === field.id}
                position={index + 1}
                total={activeFields.length}
                first={index === 0}
                last={index === activeFields.length - 1}
                onSelect={() => setSelectedId(field.id)}
                onUpdate={(changes) => updateField(field.id, changes)}
                onMove={(direction) => moveQuestion(field.id, direction)}
                onDragStart={() => setDraggingId(field.id)}
                onDrop={() => { reorderQuestion(draggingId, field.id); setDraggingId(''); }}
                onDragEnd={() => setDraggingId('')}
                dragging={draggingId === field.id}
                cardRef={(node) => {
                  if (node) questionRefs.current.set(field.id, node);
                  else questionRefs.current.delete(field.id);
                }}
                onDuplicate={() => duplicateQuestion(field)}
                onRemove={() => removeQuestion(field)}
                hasAnotherAnchor={activeFields.some((item) => item.id !== field.id && item.type === 'academicStudentNumber')}
              />
            ))}
          </Stack>

        </Stack>

        <Stack gap="sm" className="wt-form-editor-side">
          <Paper withBorder radius="md" p={6} className="wt-form-editor-action-rail">
            <ActionIcon size="xl" variant="subtle" color="wildtrackMaroon" aria-label="Add question" onClick={addQuestion}>
              <Plus size={24} />
            </ActionIcon>
          </Paper>
          <Paper withBorder p="md" radius="md" className="wt-form-editor-status-card">
            <Stack gap="xs">
              <Text fw={750}>Form status</Text>
              <Text size="sm" c="dimmed">Save keeps the current publication state. Publish makes the stable public URL accept responses.</Text>
              <Divider my="xs" />
              <Text size="sm"><Text component="span" fw={700}>Section </Text>1 of 1</Text>
              <Text size="sm"><Text component="span" fw={700}>Questions </Text>{activeFields.length}</Text>
              <Text size="sm"><Text component="span" fw={700}>Academic fields </Text>{activeFields.filter((field) => ACADEMIC_FIELD_TYPES.has(field.type)).length}</Text>
            </Stack>
          </Paper>
        </Stack>
      </div>

      <Modal opened={academicReviewOpened} onClose={() => setAcademicReviewOpened(false)} title="Review academic fields" size="md" centered>
        <Stack gap="md">
          <Text size="sm" c="dimmed">Choose the academic identity fields to include and arrange the order students will see them.</Text>
          <Stack gap="xs">
            {academicReviewItems.map((item, index) => (
              <Paper key={item.type} withBorder p="sm" radius="sm">
                <Group justify="space-between" gap="sm" wrap="nowrap">
                  <Checkbox
                    label={item.label}
                    checked={item.selected}
                    disabled={item.locked}
                    onChange={(event) => toggleAcademicSuggestion(item.type, event.currentTarget.checked)}
                  />
                  <Group gap={4} wrap="nowrap">
                    <ActionIcon variant="subtle" aria-label={`Move ${item.label} up`} disabled={index === 0}
                      onClick={() => moveAcademicSuggestion(index, -1)}><ArrowUp size={16} /></ActionIcon>
                    <ActionIcon variant="subtle" aria-label={`Move ${item.label} down`} disabled={index === academicReviewItems.length - 1}
                      onClick={() => moveAcademicSuggestion(index, 1)}><ArrowDown size={16} /></ActionIcon>
                  </Group>
                </Group>
                {item.locked ? <Text size="xs" c="dimmed" mt={4}>Required identity anchor</Text> : null}
              </Paper>
            ))}
          </Stack>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAcademicReviewOpened(false)}>Cancel</Button>
            <Button color="wildtrackMaroon" onClick={applyAcademicSuggestions}>Apply</Button>
          </Group>
        </Stack>
      </Modal>
      <PreviewModal opened={previewOpened} onClose={() => setPreviewOpened(false)} draft={draft} students={state.students || []} />
    </Stack>
  );

  function changeMapping(value) {
    const column = getTrackerColumn(state, value);
    if (!column) return;
    updateDraft({
      trackerColumn: column.key,
      shortTitle: column.label,
      pdfRequired: Boolean(column.pdfRequired)
    });
  }
}

function QuestionCard({ field, selected, position, total, first, last, onSelect, onUpdate, onMove, onDragStart, onDrop, onDragEnd, dragging, cardRef, onDuplicate, onRemove, hasAnotherAnchor }) {
  const isChoice = CHOICE_FIELD_TYPES.has(field.type);
  const isPdf = field.type === 'drive';
  const isAnchor = field.type === 'academicStudentNumber';

  function changeType(type) {
    const nextChoice = CHOICE_FIELD_TYPES.has(type);
    onUpdate({
      type,
      pdfRequired: type === 'drive',
      documentCheckPolicy: type === 'drive' ? (field.documentCheckPolicy === 'OFF' ? 'AUTO' : field.documentCheckPolicy || 'AUTO') : 'OFF',
      aiReviewEnabled: type === 'drive' ? (field.type === 'drive' ? field.aiReviewEnabled !== false : true) : false,
      options: nextChoice ? (field.options?.length ? field.options : [newChoiceOption('Option 1'), newChoiceOption('Option 2')]) : []
    });
  }

  return (
    <Paper
      withBorder
      p={{ base: 'md', sm: 'lg' }}
      radius="md"
      ref={cardRef}
      className={`wt-question-card${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
      onClick={onSelect}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); onDrop(); }}
    >
      <Stack gap="md">
        <Group justify="space-between" gap="sm" align="center">
          <Group gap="xs">
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={`Drag ${field.label}`}
              draggable
              onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
              onDragEnd={onDragEnd}
            >
              <DotsSixVertical size={18} />
            </ActionIcon>
            <div>
              <Text size="xs" c="dimmed">Question {position} of {total}</Text>
              <Group gap="xs"><Text fw={800}>Question</Text><Badge variant="light">{typeLabel(field.type)}</Badge>{isAnchor ? <Badge color="wildtrackMaroon" variant="light">Identity anchor</Badge> : null}</Group>
            </div>
          </Group>
          <Group gap={4}>
            <ActionIcon variant="subtle" aria-label={`Move ${field.label} up`} disabled={first} onClick={(event) => { event.stopPropagation(); onMove(-1); }}><ArrowUp size={17} /></ActionIcon>
            <ActionIcon variant="subtle" aria-label={`Move ${field.label} down`} disabled={last} onClick={(event) => { event.stopPropagation(); onMove(1); }}><ArrowDown size={17} /></ActionIcon>
            <ActionIcon variant="subtle" aria-label={`Duplicate ${field.label}`} disabled={isAnchor} onClick={(event) => { event.stopPropagation(); onDuplicate(); }}><Copy size={17} /></ActionIcon>
            <ActionIcon variant="subtle" color="red" aria-label={`Remove ${field.label}`} disabled={isAnchor} onClick={(event) => { event.stopPropagation(); onRemove(); }}><Trash size={17} /></ActionIcon>
          </Group>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Field label" value={field.label} required onChange={(event) => onUpdate({ label: event.currentTarget.value })} />
          <Select label="Field type" value={field.type} data={FIELD_TYPES.map((item) => ({ ...item, disabled: item.value === 'academicStudentNumber' && hasAnotherAnchor }))} allowDeselect={false} disabled={isAnchor}
            classNames={{ dropdown: 'wt-field-type-dropdown' }}
            onChange={(value) => value && changeType(value)} />
        </SimpleGrid>
        <TextInput label="Help text" value={field.helpText || ''} placeholder="Optional guidance shown below the question"
          onChange={(event) => onUpdate({ helpText: event.currentTarget.value })} />
        <Checkbox label="Required" checked={isAnchor || field.required !== false} disabled={isAnchor}
          onChange={(event) => onUpdate({ required: event.currentTarget.checked })} />

        {isChoice ? <ChoiceEditor field={field} onUpdate={onUpdate} /> : null}

        {isPdf ? (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select label="Document Check" value={field.documentCheckPolicy || 'AUTO'} allowDeselect={false}
              data={[{ value: 'AUTO', label: 'Automatic' }, { value: 'MANUAL', label: 'Manual' }, { value: 'OFF', label: 'Off' }]}
              onChange={(value) => onUpdate({ documentCheckPolicy: value })} />
            <Checkbox mt="xl" label="Allow AI Review" checked={Boolean(field.aiReviewEnabled)}
              onChange={(event) => onUpdate({ aiReviewEnabled: event.currentTarget.checked })} />
          </SimpleGrid>
        ) : null}
      </Stack>
    </Paper>
  );
}

function ChoiceEditor({ field, onUpdate }) {
  const options = field.options || [];

  function updateOption(localKey, changes) {
    onUpdate({ options: options.map((option) => option._localKey === localKey ? { ...option, ...changes } : option) });
  }

  function moveOption(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    onUpdate({ options: next });
  }

  return (
    <Stack gap="xs">
      <Text size="sm" fw={700}>Choices</Text>
      {options.map((option, index) => (
        <Group key={option._localKey} gap="xs" wrap="nowrap">
          <TextInput aria-label={`Option ${index + 1}`} value={option.label} flex={1} onChange={(event) => updateOption(option._localKey, { label: event.currentTarget.value })} />
          <ActionIcon variant="subtle" aria-label={`Move option ${index + 1} up`} disabled={index === 0} onClick={() => moveOption(index, -1)}><ArrowUp size={16} /></ActionIcon>
          <ActionIcon variant="subtle" aria-label={`Move option ${index + 1} down`} disabled={index === options.length - 1} onClick={() => moveOption(index, 1)}><ArrowDown size={16} /></ActionIcon>
          <ActionIcon variant="subtle" color="red" aria-label={`Remove option ${index + 1}`} disabled={options.length <= 1}
            onClick={() => onUpdate({ options: options.filter((item) => item._localKey !== option._localKey) })}><Trash size={16} /></ActionIcon>
        </Group>
      ))}
      <Button size="xs" variant="default" leftSection={<Plus size={15} />} onClick={() => onUpdate({ options: [...options, newChoiceOption(`Option ${options.length + 1}`)] })}>Add option</Button>
    </Stack>
  );
}

function PreviewModal({ opened, onClose, draft, students }) {
  const [values, setValues] = useState({});
  const [identity, setIdentity] = useState({ studentNumber: '', studentName: '', teamCode: '' });
  useEffect(() => {
    if (opened) {
      setValues({});
      setIdentity({ studentNumber: '', studentName: '', teamCode: '' });
    }
  }, [opened]);
  return (
    <Modal opened={opened} onClose={onClose} title="Student preview" size="lg" centered>
      <Stack gap="lg" className="wt-public-root">
        <div><Title order={2}>{draft.title}</Title><Text c="dimmed">{draft.instructions}</Text></div>
        <SubmissionFields
          fields={draft.fields.filter((field) => field.active !== false)}
          values={values}
          onValueChange={(fieldId, value) => setValues((current) => ({ ...current, [fieldId]: value }))}
          students={students}
          identity={identity}
          onIdentityChange={setIdentity}
        />
        <Alert color="blue">Preview only. Nothing entered here is submitted or sent to review services.</Alert>
      </Stack>
    </Modal>
  );
}

function makeNewDraft(state, activeColumns) {
  const firstAvailable = activeColumns.find((column) => !state.deliverables.some((deliverable) => deliverable.trackerColumn === column.key)) || activeColumns[0];
  if (!firstAvailable) return null;
  return makeDeliverableFormDraft(state, firstAvailable.key);
}

function withAcademicSuggestions(draft, students) {
  if (!draft) return draft;
  return { ...draft, fields: mergeAcademicSuggestions(draft.fields, students) };
}

function validateEditorDraft(draft) {
  if (!String(draft.title || '').trim()) return 'Enter a form title before saving.';
  if (!String(draft.dueAt || '').trim()) return 'Choose a deadline before saving.';
  const active = draft.fields.filter((field) => field.active !== false);
  if (active.filter((field) => field.type === 'academicStudentNumber').length > 1) return 'Only one Student Number identity anchor can be active.';
  if (!active.length) return 'Add at least one active question before saving.';
  if (active.some((field) => !String(field.label || '').trim())) return 'Every active question needs a label.';
  for (const field of active.filter((item) => CHOICE_FIELD_TYPES.has(item.type))) {
    const labels = (field.options || []).map((option) => String(option.label || '').trim());
    if (!labels.length || labels.some((label) => !label)) return `${field.label} needs nonblank choices.`;
    if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length) return `${field.label} has duplicate choices.`;
  }
  return '';
}

function snapshot(value) {
  return JSON.stringify(value);
}

function typeLabel(type) {
  return FIELD_TYPES.find((item) => item.value === type)?.label || type;
}
