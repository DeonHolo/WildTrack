import { Alert, Button, Group, Loader, Modal, Select, Stack, Tabs, Text } from '@mantine/core';
import { ArrowSquareOut, Sparkle } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { getStudentAiReview, requestStudentAiReview } from '../../lib/api.js';
import { aiReviewReportStatus, formatDateTime, makeDriveViewUrl } from '../../lib/workflow.js';
import { AiReviewReport } from '../review/AiReviewReport.jsx';
import { AiReviewHelp } from '../review/AiReviewHelp.jsx';
import { DocumentCheckDialog } from '../review/DocumentCheckDialog.jsx';
import { ProviderFailureDetails } from '../review/ProviderFailureDetails.jsx';
import { StatusIndicator } from '../ui.jsx';

export function StudentResultsDialog({ row, workspaceId, onClose }) {
  const artifacts = row.artifacts?.length ? row.artifacts : row.link ? [{
    key: 'legacy', fieldId: null, label: 'Submitted PDF', value: row.link, drivePdf: true,
    documentCheck: row.documentCheck
  }] : [];
  const [selected, setSelected] = useState(artifacts[0]?.key || '');
  const artifact = artifacts.find(item => item.key === selected) || artifacts[0];
  const documentCheck = artifact?.documentCheck || row.documentCheck || null;
  return <Modal opened onClose={onClose} title={row.deliverable.title} size="52rem" centered
    closeButtonProps={{ 'aria-label': 'Close submission results' }} transitionProps={{ duration: 0 }}>
    <Stack gap="md">
      {artifacts.length > 1 ? <Select label="Submitted file" value={artifact?.key || null}
        data={artifacts.map(item => ({ value: item.key, label: item.label }))}
        allowDeselect={false} onChange={setSelected} /> : null}
      {artifact?.retired ? <Alert color="blue" title="Earlier submitted link">
        This link was saved before the form's file fields changed. <a href={makeDriveViewUrl(artifact.value)} target="_blank" rel="noreferrer">Open submitted link</a>.
      </Alert> : null}
      <Tabs defaultValue="document" keepMounted={false}
        styles={{ tab: { whiteSpace: 'normal', textAlign: 'center', paddingInline: 8, lineHeight: 1.35 } }}>
        <Tabs.List aria-label="Submission results" grow style={{ flexWrap: 'nowrap' }}>
          <Tabs.Tab value="document">Document Check</Tabs.Tab>
          <Tabs.Tab value="ai">AI Review</Tabs.Tab>
          <Tabs.Tab value="feedback">Feedback</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="document" pt="md">
          {artifact && (artifact.drivePdf || artifact.reviewablePdf) ? <DocumentCheckDialog open embedded response={row.response}
            documentCheck={documentCheck} fileLink={artifact.value}
            initialTab={documentCheck ? 'result' : 'history'} historyOnly={!documentCheck}
            observedHistory={row.response?.observedFileHistoryByField?.[artifact.fieldId] || row.response?.observedFileHistory || null}
            historyTarget={artifact.fieldId ? { workspaceId, responseId: row.response.id, fieldId: artifact.fieldId } : null}
            audience="student" allowRecheck={false} onClose={onClose} />
            : <Text size="sm">No submitted PDF is available for Document Check.</Text>}
        </Tabs.Panel>
        <Tabs.Panel value="ai" pt="md">
          {artifact && (artifact.drivePdf || artifact.reviewablePdf) ? <StudentAiReviewPanel key={`${workspaceId}:${row.response.id}:${artifact.fieldId}:${artifact.value}`}
            workspaceId={workspaceId} responseId={row.response.id} fieldId={artifact.fieldId}
            fileLink={artifact.value} deliverableTitle={row.deliverable.title} />
            : <Text size="sm">Add a PDF link to your response before opening AI Review.</Text>}
        </Tabs.Panel>
        <Tabs.Panel value="feedback" pt="md">
          {row.feedback ? <Stack gap="sm">
            <Text size="sm" c="dimmed">{row.feedback.author}</Text>
            <Text className="wt-modal-long-copy">{row.feedback.note}</Text>
          </Stack> : <Text size="sm" c="dimmed">No adviser feedback has been shared for this response yet.</Text>}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  </Modal>;
}

export function StudentAiReviewPanel({ workspaceId, responseId, fieldId, fileLink, deliverableTitle }) {
  const [state, setState] = useState({ loading: true, starting: false, data: null, error: '' });
  const [confirmRetry, setConfirmRetry] = useState(false);
  const generation = useRef(0);
  const requestSequence = useRef(0);
  const pollTimer = useRef(null);
  const reload = useRef(null);
  useEffect(() => {
    const current = ++generation.current;
    setState({ loading: true, starting: false, data: null, error: '' });
    setConfirmRetry(false);
    async function load() {
      window.clearTimeout(pollTimer.current);
      const request = ++requestSequence.current;
      try {
        const data = await getStudentAiReview(workspaceId, responseId, fieldId);
        if (generation.current !== current || requestSequence.current !== request) return;
        setState(previous => ({ ...previous, loading: false, data, error: '' }));
        if (data.review?.status === 'RUNNING') pollTimer.current = window.setTimeout(load, 4000);
      } catch (error) {
        if (generation.current !== current || requestSequence.current !== request) return;
        setState(previous => ({ ...previous, loading: false,
          data: [401, 403].includes(error.status) ? null : previous.data,
          error: error.message || 'AI Review could not be loaded. Try again.' }));
      }
    }
    reload.current = load;
    load();
    return () => { generation.current++; requestSequence.current++; window.clearTimeout(pollTimer.current); };
  }, [workspaceId, responseId, fieldId]);

  async function run(acknowledged = false) {
    if (state.starting || !state.data?.canRun) return;
    const current = generation.current;
    const request = ++requestSequence.current;
    window.clearTimeout(pollTimer.current);
    setConfirmRetry(false);
    setState(previous => ({ ...previous, starting: true, error: '' }));
    try {
      const data = await requestStudentAiReview(workspaceId, responseId, fieldId, acknowledged,
        acknowledged ? state.data.review?.retryToken : null);
      if (generation.current !== current || requestSequence.current !== request) return;
      setState(previous => ({ ...previous, data, starting: false }));
      if (data.review?.status === 'RUNNING') pollTimer.current = window.setTimeout(() => reload.current?.(), 4000);
    } catch (error) {
      if (generation.current !== current || requestSequence.current !== request) return;
      setState(previous => ({ ...previous, starting: false, error: error.message || 'AI Review could not start. Try again.' }));
    }
  }
  const review = state.data?.review;
  const report = review?.report || review?.previousReport || review?.lastSubstantiveReport;
  const running = state.starting || review?.status === 'RUNNING';
  return <Stack gap="md">
    <Group justify="space-between" align="center">
      <Group gap="xs"><Text fw={700}>AI Review</Text><AiReviewHelp /></Group>
      {fileLink ? <Button component="a" href={makeDriveViewUrl(fileLink)} target="_blank" rel="noreferrer" variant="default" size="xs"
        leftSection={<ArrowSquareOut size={15} aria-hidden="true" />}>Open PDF</Button> : null}
    </Group>
    {state.loading ? <Group role="status"><Loader size="sm" /><Text size="sm">Loading saved AI Review…</Text></Group> : null}
    {state.error ? <Alert color="red" role="alert">{state.error}<Button variant="subtle" size="xs" onClick={() => reload.current?.()}>Check status</Button></Alert> : null}
    {running ? <Alert color="blue" title="AI Review is running" icon={<Loader size="sm" />} role="status">
      {state.starting ? 'Preparing your submitted PDF on the server. You can close this window and return to its progress.' : review.message || state.data.message}
    </Alert> : null}
    {!state.loading && !running && !report ? <Text size="sm" c="dimmed">{review?.status === 'UNCERTAIN' ? review.message : state.data?.message}</Text> : null}
    {review?.status === 'UNCERTAIN' ? <ProviderFailureDetails diagnostic={review.failureDiagnostics} failureCode={review.failureCode} /> : null}
    {report ? <>
      <StatusIndicator status={aiReviewReportStatus(report)} />
      {!review.report ? <Alert color="orange" title="Previously saved AI Review">This report is from an earlier PDF or review setting. It may not describe your current file.</Alert> : null}
      <AiReviewReport report={report} deliverableTitle={deliverableTitle} pdfUrl={makeDriveViewUrl(fileLink)}
        reviewedOn={review.generatedAt || review.previousGeneratedAt ? `Reviewed on ${formatDateTime(review.generatedAt || review.previousGeneratedAt)}` : ''} />
      <Text size="sm" c="dimmed">AI Review can make mistakes. Check the cited PDF pages and ask your instructor about anything unclear.</Text>
    </> : null}
    {state.data?.canRun ? <Button color="wildtrackMaroon" loading={state.starting} disabled={running}
      leftSection={<Sparkle size={17} aria-hidden="true" />}
      onClick={() => review?.status === 'UNCERTAIN' ? setConfirmRetry(true) : run()}>
      {review?.status === 'UNCERTAIN' ? 'Retry AI Review' : 'Run AI Review'}
    </Button> : null}
    <Modal opened={confirmRetry} onClose={() => setConfirmRetry(false)} title="Retry AI Review?" centered size="sm">
      <Stack><Text size="sm">The previous attempt did not produce a saved review. Retrying sends another AI request and may use additional AI tokens.</Text>
        <Group justify="flex-end"><Button variant="default" onClick={() => setConfirmRetry(false)}>Cancel</Button>
          <Button onClick={() => run(true)}>Retry AI Review</Button></Group></Stack>
    </Modal>
  </Stack>;
}
