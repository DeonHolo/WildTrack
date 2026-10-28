import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Anchor, Badge, Button, Checkbox, Group, Modal, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { Sparkle } from '@phosphor-icons/react';
import { AiBatchActions, AiBatchProgress, AiBatchSelectionSummary } from '../review/AiBatchPresentation.jsx';
import { getTemplateChecklistBatch, prepareTemplateChecklistBatch, getDocumentTemplatePreviewUrl } from '../../lib/api.js';

const running = item => ['QUEUED', 'PREPARING'].includes(item.state);
const eligible = (item, rerun = false) => item.pdfState === 'READY' && item.versionId && (rerun ? ['DRAFT', 'APPROVED'] : ['UNPREPARED', 'FAILED']).includes(item.state);
const labels = { UNPREPARED: 'Not prepared', QUEUED: 'Queued', PREPARING: 'Preparing', DRAFT: 'Draft ready', APPROVED: 'Approved', FAILED: 'Needs retry' };

export function TemplateChecklistBatch(props) {
  return <Batch key={props.workspaceId} {...props} />;
}

function Batch({ workspaceId, children }) {
  const [items, setItems] = useState([]);
  const [opened, setOpened] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [selected, setSelected] = useState([]);
  const [retryAcknowledged, setRetryAcknowledged] = useState(false);
  const [rerunSaved, setRerunSaved] = useState(false);
  const [replacementAcknowledged, setReplacementAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const scope = generation.current;
    setLoading(true);
    try {
      const next = await getTemplateChecklistBatch(workspaceId);
      if (scope !== generation.current) return null;
      setItems(next); setError('');
      return next;
    } catch (e) {
      if (scope === generation.current) setError(e?.message || 'Template preparation progress could not be loaded.');
      return null;
    } finally { if (scope === generation.current) setLoading(false); }
  }, [workspaceId]);
  useEffect(() => {
    load();
    return () => { generation.current += 1; };
  }, [load]);
  const pending = items.filter(running).length;
  useEffect(() => {
    if (!pending || loading) return undefined;
    const timer = setTimeout(load, 4000);
    return () => clearTimeout(timer);
  }, [pending, loading, load]);

  const choose = async () => {
    setSavedOnly(false); setRerunSaved(false); setReplacementAcknowledged(false); setOpened(true); setSelected([]); setRetryAcknowledged(false);
    const next = await load();
    if (next) setSelected(next.filter(item => eligible(item) && item.state === 'UNPREPARED').map(item => item.templateId));
  };
  const checkSaved = async () => {
    setSavedOnly(true); setOpened(true); setSelected([]); setRetryAcknowledged(false); setReplacementAcknowledged(false);
    await load();
  };
  const chooseReruns = enabled => {
    setSavedOnly(false); setRerunSaved(enabled); setReplacementAcknowledged(false); setRetryAcknowledged(false);
    setSelected(items.filter(item => eligible(item, enabled) && (enabled || item.state === 'UNPREPARED')).map(item => item.templateId));
  };
  const chosen = items.filter(item => eligible(item, rerunSaved) && selected.includes(item.templateId));
  const retries = chosen.filter(item => item.state === 'FAILED').length;
  const start = async () => {
    const scope = generation.current;
    setBusy(true); setError('');
    try {
      const next = await prepareTemplateChecklistBatch(workspaceId, chosen.map(item => ({
        templateId: item.templateId, versionId: item.versionId, expectedRevision: item.revision, ...(rerunSaved ? { rerun: true } : {})
      })));
      if (scope !== generation.current) return;
      setItems(next); setOpened(false); setSelected([]);
    } catch (e) {
      if (scope === generation.current) {
        // A lost response can still have queued work. Reload its state, never repeat the POST.
        await load(); setSelected([]); setRetryAcknowledged(false); setReplacementAcknowledged(false);
        setError(e?.message || 'The request could not be confirmed. Check the saved preparation progress before trying again.');
      }
    } finally { if (scope === generation.current) setBusy(false); }
  };
  const drafts = items.filter(item => item.state === 'DRAFT').length;
  const approved = items.filter(item => item.state === 'APPROVED').length;
  const failed = items.filter(item => item.state === 'FAILED').length;
  const finished = drafts + approved + failed;
  return <>
    <div className="panel-header">
      <div><h2>Official templates</h2><p>Maintain one comparison template per checkable PDF artifact. Replacing a template keeps its deliverable and artifact mapping.</p></div>
      <Group gap="sm">{children}<Button variant="default" leftSection={<Sparkle size={18} aria-hidden="true" />} onClick={choose}>Prepare AI drafts</Button></Group>
    </div>
    {error && !opened && <Alert color="orange" role="alert" mb="md">{error}<Button variant="default" loading={loading} onClick={load} ml="sm">Check progress</Button></Alert>}
    {(pending || drafts || failed) > 0 && <div style={{ marginBottom: '1rem' }}>
      <AiBatchProgress color={pending ? 'blue' : failed ? 'orange' : 'green'}
        title={pending ? 'Preparing template AI drafts' : failed ? 'Template preparation needs attention' : 'Template drafts ready'}
        summary={`${drafts} ${drafts === 1 ? 'draft' : 'drafts'} ready · ${approved} approved · ${pending} preparing${failed ? ` · ${failed} ${failed === 1 ? 'needs' : 'need'} retry` : ''}`}
        value={finished / Math.max(1, finished + pending) * 100} animated={pending > 0}
        message={pending ? 'Preparation runs on the server. You can leave this page and return to its saved progress.' : 'Check each Review checklist against its Template PDF, then select Approve checklist to use it in AI Review. Document Check already uses the template.'}
        actions={<Button variant="default" loading={loading} onClick={checkSaved}>Check saved drafts</Button>} />
    </div>}
    <Modal opened={opened} onClose={() => { if (!busy) setOpened(false); }} title={savedOnly ? 'Saved template AI drafts' : rerunSaved ? 'Rerun template AI drafts' : 'Prepare template AI drafts'} centered size="lg"
      closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy} closeButtonProps={{ 'aria-label': 'Close template preparation window' }}>
      <Stack gap="md">
        {error && <Alert color="red" role="alert">{error}</Alert>}
        {savedOnly ? <Text>Open a Review checklist to inspect, edit, approve or rerun its AI draft. Opening it does not send an AI request.</Text>
          : <><Checkbox label="Rerun saved AI drafts" checked={rerunSaved} disabled={loading || busy} onChange={event => chooseReruns(event.currentTarget.checked)} />
            <AiBatchSelectionSummary summary={`${chosen.length} template ${chosen.length === 1 ? 'draft' : 'drafts'} to ${rerunSaved ? 'rerun' : 'prepare'}`}
              detail={rerunSaved ? 'Select the saved Review checklists to replace with new AI drafts.' : 'Existing drafts and approved checklists will be kept.'} /></>}
        {loading ? <Text>Checking saved template checklists…</Text> : <ScrollArea.Autosize mah="45vh" type="auto" offsetScrollbars>
          <Stack gap="sm">{items.map(item => <Paper key={item.templateId} withBorder p="sm">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              {savedOnly ? <Text fw={600}>{item.title}</Text> : <Checkbox label={item.title} disabled={!eligible(item, rerunSaved)} checked={selected.includes(item.templateId) && Boolean(eligible(item, rerunSaved))}
                onChange={e => { const checked = e.currentTarget.checked; setSelected(current => checked ? [...current, item.templateId] : current.filter(id => id !== item.templateId)); }} />}
              <Badge color={item.state === 'APPROVED' ? 'green' : item.state === 'FAILED' ? 'orange' : 'blue'} style={{ flexShrink: 0 }}>{labels[item.state] || item.state}</Badge>
            </Group>
            {item.pdfState !== 'READY' && <Text size="sm" mt="xs">The template PDF is not ready. Open the template to check its file.</Text>}
            <Anchor size="sm" mt="xs" display="inline-block" href={getDocumentTemplatePreviewUrl(workspaceId, item.templateId)} target="_blank" rel="noopener noreferrer">Open checklist</Anchor>
          </Paper>)}</Stack>
          {!items.length && <Text>No official templates are available in this workspace.</Text>}
        </ScrollArea.Autosize>}
        {!savedOnly && <Text size="sm">This prepares Review checklist drafts from the official template PDFs. It does not run AI Review on submissions or approve a checklist. Preparation sends the PDFs to Gemini and uses AI tokens.</Text>}
        {!savedOnly && rerunSaved && <Checkbox checked={replacementAcknowledged} onChange={event => setReplacementAcknowledged(event.currentTarget.checked)}
          label="Replace the selected saved Review checklists"
          description="A successful rerun replaces the checklist and its edits. There is no Undo. AI Review must wait for approval again. Existing AI Review results and Document Check results are kept." />}
        {!savedOnly && retries > 0 && <Checkbox checked={retryAcknowledged} onChange={e => setRetryAcknowledged(e.currentTarget.checked)}
          label={`I agree to retry ${retries} failed ${retries === 1 ? 'preparation' : 'preparations'}`}
          description="Previous attempts may already have used tokens. Retrying can use additional tokens or incur charges." />}
        {savedOnly ? <Group justify="space-between"><Button variant="default" disabled={loading || !items.some(item => eligible(item,true))} onClick={() => chooseReruns(true)}>Rerun saved AI drafts</Button><Button variant="default" onClick={() => setOpened(false)}>Close</Button></Group>
          : <AiBatchActions onCancel={() => setOpened(false)} onConfirm={start} busy={busy} disabled={loading || !chosen.length || retries > 0 && !retryAcknowledged || rerunSaved && !replacementAcknowledged} confirmLabel={rerunSaved ? 'Rerun AI drafts' : 'Prepare drafts'} />}
      </Stack>
    </Modal>
  </>;
}
