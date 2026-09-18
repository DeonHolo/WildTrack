import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
  ArrowUp,
  Check,
  Copy,
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
  ACADEMIC_FIELD_TYPES,
  CHOICE_FIELD_TYPES,
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
  { value: 'drive', label: 'Google Drive PDF' },
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
  const [newType, setNewType] = useState('shortText');
  const [previewOpened, setPreviewOpened] = useState(false);
  const initializedScope = useRef('');
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
      ? makeEditableDeliverableForm(next)
      : makeNewDraft(state, activeColumns);
    setDraft(initial || null);
    setBaseline(initial ? snapshot(initial) : '');
    setSelectedId(initial?.fields?.find((field) => field.active !== false)?.id || '');
    setSaveState('idle');
    setSaveError('');
  }, [activeWorkspaceId, activeColumns, editing, formId, state, status]);

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
  const retiredFields = draft.fields.filter((field) => field.active === false);
  const published = String(draft.status || '').toLowerCase() === 'published';

  function updateDraft(changes) {
    setDraft((current) => ({ ...current, ...changes }));
    setSaveState('idle');
    setSaveError('');
  }

  function updateField(fieldId, changes) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => field.id === fieldId ? normalizeEditorField({ ...field, ...changes }) : field)
    }));
    setSaveState('idle');
    setSaveError('');
  }

  function addQuestion() {
    let field = newQuestion(newType);
    if (newType === 'academicStudentNumber' && draft.fields.some((item) => item.type === 'academicStudentNumber' && item.active !== false)) return;
    setDraft((current) => ({ ...current, fields: [...current.fields, field] }));
    setSelectedId(field.id);
  }

  function duplicateQuestion(field) {
    if (field.type === 'academicStudentNumber') return;
    const copy = duplicateField(field);
    setDraft((current) => {
      const index = current.fields.findIndex((item) => item.id === field.id);
      const fields = [...current.fields];
      fields.splice(index + 1, 0, copy);
      return { ...current, fields };
    });
    setSelectedId(copy.id);
  }

  function moveQuestion(fieldId, direction) {
    setDraft((current) => {
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

  function retireQuestion(field) {
    if (field.type === 'academicStudentNumber') return;
    updateField(field.id, { active: false });
    const next = activeFields.find((item) => item.id !== field.id);
    setSelectedId(next?.id || '');
  }

  function restoreQuestion(field) {
    updateField(field.id, { active: true });
    setSelectedId(field.id);
  }

  function refreshAcademicSuggestions() {
    setDraft((current) => ({ ...current, fields: mergeAcademicSuggestions(current.fields, state.students || []) }));
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
                <Text size="xs" c="dimmed">Public URL: /w/{workspaceKey}/submit/{draft.slug || 'generated-after-save'}</Text>
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
                first={index === 0}
                last={index === activeFields.length - 1}
                onSelect={() => setSelectedId(field.id)}
                onUpdate={(changes) => updateField(field.id, changes)}
                onMove={(direction) => moveQuestion(field.id, direction)}
                onDuplicate={() => duplicateQuestion(field)}
                onRetire={() => retireQuestion(field)}
                hasAnotherAnchor={activeFields.some((item) => item.id !== field.id && item.type === 'academicStudentNumber')}
              />
            ))}
          </Stack>

          <Paper withBorder p="md" radius="md" className="wt-form-editor-add-card">
            <Group align="flex-end" gap="sm" wrap="wrap">
              <Select label="Add question" value={newType} data={FIELD_TYPES} allowDeselect={false} onChange={(value) => value && setNewType(value)} flex={1} miw={220} />
              <Button leftSection={<Plus size={17} />} onClick={addQuestion}>Add</Button>
            </Group>
          </Paper>

          {retiredFields.length ? (
            <Paper withBorder p="md" radius="md">
              <Stack gap="sm">
                <div><Text fw={750}>Retired questions</Text><Text size="xs" c="dimmed">Historical answers remain attached to these persisted field identities.</Text></div>
                {retiredFields.map((field) => (
                  <Group key={field.id} justify="space-between" gap="sm">
                    <div><Text size="sm" fw={650}>{field.label}</Text><Text size="xs" c="dimmed">{typeLabel(field.type)}</Text></div>
                    <Button size="xs" variant="default" onClick={() => restoreQuestion(field)}>Restore</Button>
                  </Group>
                ))}
              </Stack>
            </Paper>
          ) : null}
        </Stack>

        <Paper withBorder p="md" radius="md" className="wt-form-editor-side">
          <Stack gap="xs">
            <Text fw={750}>Form status</Text>
            <Text size="sm" c="dimmed">Save keeps the current publication state. Publish makes the stable public URL accept responses.</Text>
            <Divider my="xs" />
            <Text size="sm"><Text component="span" fw={700}>Questions </Text>{activeFields.length}</Text>
            <Text size="sm"><Text component="span" fw={700}>Retired </Text>{retiredFields.length}</Text>
            <Text size="sm"><Text component="span" fw={700}>Academic fields </Text>{activeFields.filter((field) => ACADEMIC_FIELD_TYPES.has(field.type)).length}</Text>
          </Stack>
        </Paper>
      </div>

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

function QuestionCard({ field, selected, first, last, onSelect, onUpdate, onMove, onDuplicate, onRetire, hasAnotherAnchor }) {
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
    <Paper withBorder p={{ base: 'md', sm: 'lg' }} radius="md" className={`wt-question-card${selected ? ' is-selected' : ''}`} onClick={onSelect}>
      <Stack gap="md">
        <Group justify="space-between" gap="sm" align="center">
          <Group gap="xs"><Text fw={800}>Question</Text><Badge variant="light">{typeLabel(field.type)}</Badge>{isAnchor ? <Badge color="wildtrackMaroon" variant="light">Identity anchor</Badge> : null}</Group>
          <Group gap={4}>
            <ActionIcon variant="subtle" aria-label={`Move ${field.label} up`} disabled={first} onClick={(event) => { event.stopPropagation(); onMove(-1); }}><ArrowUp size={17} /></ActionIcon>
            <ActionIcon variant="subtle" aria-label={`Move ${field.label} down`} disabled={last} onClick={(event) => { event.stopPropagation(); onMove(1); }}><ArrowDown size={17} /></ActionIcon>
            <ActionIcon variant="subtle" aria-label={`Duplicate ${field.label}`} disabled={isAnchor} onClick={(event) => { event.stopPropagation(); onDuplicate(); }}><Copy size={17} /></ActionIcon>
            <ActionIcon variant="subtle" color="red" aria-label={`Retire ${field.label}`} disabled={isAnchor} onClick={(event) => { event.stopPropagation(); onRetire(); }}><Trash size={17} /></ActionIcon>
          </Group>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Field label" value={field.label} required onChange={(event) => onUpdate({ label: event.currentTarget.value })} />
          <Select label="Field type" value={field.type} data={FIELD_TYPES.map((item) => ({ ...item, disabled: item.value === 'academicStudentNumber' && hasAnotherAnchor }))} allowDeselect={false} disabled={isAnchor}
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
