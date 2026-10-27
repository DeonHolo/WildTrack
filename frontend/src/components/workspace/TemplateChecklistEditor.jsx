import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { CaretDown, CaretRight, Trash } from '@phosphor-icons/react';
import { ConfirmDialog } from '../ui.jsx';
import { getDocumentTemplateChecklist, prepareDocumentTemplateChecklist, saveDocumentTemplateChecklist, approveDocumentTemplateChecklist } from '../../lib/api.js';
import './TemplateChecklistEditor.css';

const blank = () => ({ title: '', instruction: '', sourceQuote: '', section: '', page: '', applicability: 'REQUIRED', condition: '', _sourceEditable: true });
const labels = { UNPREPARED: 'Not prepared', QUEUED: 'Preparing', PREPARING: 'Preparing', DRAFT: 'Draft', APPROVED: 'Approved', FAILED: 'Needs retry' };

export function TemplateChecklistEditor({ workspaceId, templateId, versionId }) {
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [versionChanged, setVersionChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [toRemove, setToRemove] = useState(null);
  const [errors, setErrors] = useState({});
  const errorSummary = useRef(null);
  const disclosureId = useId();
  const storageKey = `template-checklist-draft:${workspaceId}:${templateId}:${versionId}`;
  const setChanged = value => { dirtyRef.current = value; setDirty(value); };
  const apply = useCallback(next => { setView(next); setItems(next.items || []); setChanged(false); setError(''); setConflict(false); setErrors({}); try { sessionStorage.removeItem(storageKey); } catch { /* Storage can be unavailable. */ } }, [storageKey]);
  const load = useCallback(async (replace = false) => {
    try {
      const next = await getDocumentTemplateChecklist(workspaceId, templateId);
      if (next.versionId !== versionId) {
        setVersionChanged(true); setConflict(true);
        setError('The template changed. Reload this page to view its current PDF and checklist.');
        return;
      }
      if (!dirtyRef.current || replace) {
        let saved;
        try { saved = !replace && JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { /* Ignore unavailable or malformed storage. */ }
        if (saved && Array.isArray(saved.items) && saved.versionId === versionId) {
          setView({ ...next, revision: saved.revision }); setItems(saved.items.map(item => item.sourceQuote?.trim() ? item : { ...item, _sourceEditable: true })); setChanged(true);
          if (saved.revision !== next.revision || next.versionId !== versionId) { setConflict(true); setError('The saved checklist changed since these edits. Your unsaved edits have been restored.'); }
        } else apply(next);
      }
      else setView(current => current && ['QUEUED', 'PREPARING'].includes(current.state) ? { ...current, state: next.state } : current);
    } catch (e) { setError(e?.message || 'The checklist could not be loaded.'); }
    finally { setLoading(false); }
  }, [workspaceId, templateId, versionId, storageKey, apply]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!['QUEUED', 'PREPARING'].includes(view?.state)) return undefined;
    const timer = setInterval(() => load(), 3000);
    return () => clearInterval(timer);
  }, [view?.state, load]);
  useEffect(() => {
    if (!dirty || !view) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ versionId, revision: view.revision, items })); } catch { /* Editing remains available without storage. */ }
  }, [dirty, items, view, storageKey, versionId]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    const navigation = event => {
      const anchor = event.target.closest?.('a[href]');
      if (anchor && !anchor.target && !window.confirm('You have unsaved checklist changes. Leave without saving?')) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', navigation, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', navigation, true); };
  }, [dirty]);
  const change = (index, field, value) => { setItems(current => current.map((item, i) => i === index ? { ...item, [field]: value, ...(field === 'applicability' && value !== 'CONDITIONAL' ? { condition: '' } : {}) } : item)); setChanged(true); };
  const validate = () => {
    const next = {};
    if (!items.length) next.list = 'Add at least one checklist item.';
    items.forEach((item, index) => {
      const row = {};
      if (!item.title?.trim()) row.title = 'Enter a title.';
      if (!item.instruction?.trim()) row.instruction = 'Enter an instruction.';
      if (!item.sourceQuote?.trim()) row.sourceQuote = 'Enter the source quote.';
      if (!Number.isInteger(Number(item.page)) || Number(item.page) < 1 || (view?.pdfPages && Number(item.page) > view.pdfPages)) row.page = 'Enter a valid PDF page.';
      if (item.applicability === 'CONDITIONAL' && !item.condition?.trim()) row.condition = 'Enter the condition.';
      if (Object.keys(row).length) next[index] = row;
    });
    setErrors(next);
    if (Object.keys(next).length) { const first = Object.keys(next).find(key => key !== 'list'); if (first !== undefined) setOpen(Number(first)); setTimeout(() => errorSummary.current?.focus(), 0); return false; }
    return true;
  };
  const action = async type => {
    setConfirm(''); setBusy(true); setError('');
    try {
      const payload = { versionId: view.versionId || versionId, expectedRevision: view.revision };
      const next = type === 'prepare' ? await prepareDocumentTemplateChecklist(workspaceId, templateId, payload)
        : type === 'approve' ? await approveDocumentTemplateChecklist(workspaceId, templateId, payload)
          : await saveDocumentTemplateChecklist(workspaceId, templateId, { ...payload, items: items.map(({ _sourceEditable, ...item }) => ({ ...item, page: Number(item.page) })) });
      apply(next);
    } catch (e) { setError(e?.message || 'The checklist could not be updated.'); if (e?.status === 409) setConflict(true); }
    finally { setBusy(false); }
  };
  const preparing = ['QUEUED', 'PREPARING'].includes(view?.state);
  return <Paper withBorder p="lg" className="template-review-panel template-checklist">
    <Stack gap="md" className="template-checklist-body">
      <Group justify="space-between"><Title order={2} size="h3">Review checklist</Title>{view && <Badge color={view.state === 'APPROVED' ? 'green' : view.state === 'DRAFT' ? 'orange' : 'blue'}>{labels[view.state] || view.state}</Badge>}</Group>
      <Text>Check the PDF for missing items and mistakes, including examples. Approved wording is used for student reviews.</Text>
      {error && <Alert color="red" role="alert">{error} {conflict && <Button variant="default" onClick={() => { if (!dirty || window.confirm('Discard unsaved changes and reload the checklist?')) { if (versionChanged) window.location.reload(); else load(true); } }}>{versionChanged ? 'Reload template' : 'Reload checklist'}</Button>}</Alert>}
      {!view ? loading ? <Text>Loading checklist…</Text> : <Button variant="default" onClick={() => { setLoading(true); load(); }}>Retry loading</Button> : <>
        {view.state === 'FAILED' && <Alert color="orange">{view.error || 'Checklist preparation failed.'}</Alert>}
        {preparing && <Alert color="blue">Preparing the draft. You can leave this page and return later.</Alert>}
        {view.state === 'APPROVED' && <Text>Editing and saving this checklist requires approval again.</Text>}
        {Object.keys(errors).length > 0 && <Alert color="red" role="alert" tabIndex={-1} ref={errorSummary}>Check the highlighted fields before saving. {errors.list}</Alert>}
        <Stack gap="xs" className="template-checklist-items" tabIndex={0} aria-label="Checklist items">{items.map((item, index) => <Paper withBorder p="sm" key={index}>
          <Button variant="subtle" fullWidth className="checklist-disclosure" leftSection={open === index ? <CaretDown aria-hidden="true" /> : <CaretRight aria-hidden="true" />} aria-expanded={open === index} aria-controls={`${disclosureId}-${index}`} onClick={() => setOpen(open === index ? null : index)}>{item.title || `Item ${index + 1}`}</Button>
          {open === index && <Stack gap="sm" mt="sm" id={`${disclosureId}-${index}`}>
            <TextInput label="Title" value={item.title || ''} error={errors[index]?.title} onChange={e => change(index, 'title', e.currentTarget.value)} />
            <Textarea label="Instruction" autosize minRows={6} className="checklist-instruction" value={item.instruction || ''} error={errors[index]?.instruction} onChange={e => change(index, 'instruction', e.currentTarget.value)} />
            {item._sourceEditable ? <>
              <Textarea label="Template excerpt" description="Copy the relevant text from the template PDF." autosize minRows={3} value={item.sourceQuote || ''} error={errors[index]?.sourceQuote} onChange={e => change(index, 'sourceQuote', e.currentTarget.value)} />
              <TextInput label="Source section (optional)" value={item.section || ''} onChange={e => change(index, 'section', e.currentTarget.value)} />
            </> : <Text size="sm" className="checklist-source">Source: {item.section || 'Official template'} · PDF page {item.page}</Text>}
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <NumberInput label="PDF page" min={1} max={view.pdfPages || undefined} value={item.page ?? ''} error={errors[index]?.page} onChange={value => change(index, 'page', value)} />
            <Select label="Applicability" data={[{ value: 'REQUIRED', label: 'Required' }, { value: 'OPTIONAL', label: 'Optional' }, { value: 'CONDITIONAL', label: 'Conditional' }]} value={item.applicability} allowDeselect={false} onChange={value => change(index, 'applicability', value)} />
            </SimpleGrid>
            {item.applicability === 'CONDITIONAL' && <TextInput label="Condition" value={item.condition || ''} error={errors[index]?.condition} onChange={e => change(index, 'condition', e.currentTarget.value)} />}
            <Button color="red" variant="subtle" className="checklist-remove" leftSection={<Trash size={18} aria-hidden="true" />} disabled={busy || preparing} onClick={() => setToRemove(index)}>Remove item</Button>
          </Stack>}
        </Paper>)}</Stack>
        <Group className="template-checklist-actions"><Button variant="default" disabled={preparing || busy} onClick={() => { setItems(current => [...current, blank()]); setOpen(items.length); setChanged(true); }}>Add item</Button>
          {['UNPREPARED', 'FAILED'].includes(view.state) && !items.length && <Button variant="default" disabled={preparing || busy || dirty || conflict} onClick={() => setConfirm('prepare')}>{view.state === 'FAILED' ? 'Retry AI draft' : 'Prepare AI draft'}</Button>}
          <Button disabled={!dirty || preparing || busy || conflict} loading={busy} onClick={() => { if (validate()) action('save'); }}>Save draft</Button>
          <Button disabled={!items.length || dirty || preparing || busy || conflict || view.state !== 'DRAFT'} onClick={() => setConfirm('approve')}>Approve checklist</Button></Group>
      </>}
    </Stack>
    <Modal opened={Boolean(confirm)} onClose={() => setConfirm('')} title={confirm === 'prepare' ? 'Prepare an AI draft?' : 'Approve this checklist?'}>
      <Stack><Text>{confirm === 'prepare' ? 'Preparing a draft uses AI tokens. Review and approval are still required.' : 'Confirm that you checked the saved checklist against the template PDF.'}</Text><Group justify="flex-end"><Button variant="default" onClick={() => setConfirm('')}>Cancel</Button><Button onClick={() => action(confirm)}>{confirm === 'prepare' ? 'Prepare draft' : 'Confirm approval'}</Button></Group></Stack>
    </Modal>
    <ConfirmDialog open={toRemove !== null} title="Remove checklist item?" intent="danger" confirmLabel="Remove item"
      description={`“${items[toRemove]?.title || 'Untitled item'}” will be permanently removed when you save the draft. There is no Undo for this action.`}
      onClose={() => setToRemove(null)} onConfirm={() => {
        setItems(current => current.filter((_, index) => index !== toRemove));
        setToRemove(null); setOpen(null); setChanged(true);
      }} />
  </Paper>;
}
