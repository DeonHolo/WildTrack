import { useCallback, useEffect, useState } from 'react';
import { Accordion, Alert, Anchor, Button, Group, Loader, Paper, Stack, Text, Title, Tooltip } from '@mantine/core';
import { useParams, useSearchParams } from 'react-router-dom';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { useWorkspaceResource } from '../hooks/useWorkspaceResource.js';
import { ResourceBoundary } from '../components/ResourceBoundary.jsx';
import { TemplateChecklistEditor } from '../components/workspace/TemplateChecklistEditor.jsx';
import { getDocumentTemplateFileUrl, getDocumentTemplateStructure, getDocumentTemplatePdfState,
  getDocumentTemplatePdfUrl, retryDocumentTemplatePdf } from '../lib/api.js';

const emptyTemplate = () => null;

export function TemplatePreviewPage() {
  const { templateId } = useParams();
  const [query] = useSearchParams();
  const { activeWorkspaceId, session } = useWorkspaceSession();
  const adviserOnly = session?.roles?.includes('ADVISER') && !session.roles.includes('ADMIN');
  const workspaceId = query.get('workspaceId') || activeWorkspaceId;
  const load = useCallback(async id => {
    const [structure, pdf] = await Promise.all([
      getDocumentTemplateStructure(id, templateId), getDocumentTemplatePdfState(id, templateId)
    ]);
    if (structure.sha256 !== pdf.sourceSha256) return { templateChanged: true };
    return { ...structure, pdf };
  }, [templateId]);
  const { data, status, error, reload } = useWorkspaceResource(workspaceId, load, emptyTemplate);
  useEffect(() => {
    if (!['PENDING', 'PROCESSING'].includes(data?.pdf?.state)) return undefined;
    const timer = setTimeout(() => reload({ background: true }), 3000);
    return () => clearTimeout(timer);
  }, [data, error, reload]);
  return <Stack gap="lg" maw={session?.roles?.includes('ADMIN') ? 1600 : 960} mx="auto" p="lg">
    <Group justify="space-between" align="flex-start">
      <div><Text size="sm" c="dimmed">Official template</Text>
        <Title order={1}>{data?.originalFilename || data?.displayName || 'Template preview'}</Title>
        {data?.displayName && data.displayName !== data.originalFilename ? <Text size="sm">{data.displayName}</Text> : null}
      </div>
      <Anchor href={adviserOnly ? '/adviser' : '/workspace'}>{adviserOnly ? 'Back to my teams' : 'Back to workspace'}</Anchor>
    </Group>
    <ResourceBoundary status={status} error={error} onRetry={reload}>
      {data?.templateChanged ? <Alert color="orange" title="Template changed">
        <Stack gap="sm"><Text>The template changed while loading. Reload to view its current PDF.</Text>
          <Button variant="default" onClick={() => reload()} style={{ alignSelf: 'flex-start' }}>Reload template</Button>
        </Stack>
      </Alert> : data ? <>
        <div className={`template-review-layout${session?.roles?.includes('ADMIN') && data.pdf.state === 'READY' ? ' template-review-layout--editable' : ''}`}>
          <TemplatePdfView key={`${workspaceId}:${templateId}:${data.pdf.versionId}`} workspaceId={workspaceId} templateId={templateId}
            pdf={data.pdf} canRetry={session?.roles?.includes('ADMIN') && data.pdf.retryable !== false} onReload={reload} />
          {session?.roles?.includes('ADMIN') && data.pdf.state === 'READY' ? <TemplateChecklistEditor key={`checklist:${workspaceId}:${templateId}:${data.pdf.versionId}`} workspaceId={workspaceId} templateId={templateId} versionId={data.pdf.versionId} /> : null}
        </div>
        <Paper withBorder className="template-headings">
          <Accordion variant="default">
            <Accordion.Item value="headings">
              <Group gap="xs" wrap="nowrap" pr="md">
                <Accordion.Control style={{ flex: 1 }}><Text component="span" fw={600} size="lg">Template headings</Text></Accordion.Control>
                <Tooltip multiline withArrow w={320} events={{hover:true,focus:true,touch:true}}
                  label="Shows the section headings found in the Template PDF. Document Check looks for matching headings in submissions. AI Review uses the Review checklist to assess what those sections contain.">
                  <Button variant="subtle" size="compact-xs" radius="xl" aria-label="About Template headings">?</Button>
                </Tooltip>
              </Group>
              <Accordion.Panel>
                <Stack gap="md">
                  <Text size="sm">{data.detectedHeadings.length} of {data.expectedHeadings.length} expected body sections detected in this template</Text>
                  <section aria-label="Template body sections"><Text fw={600}>Detected body sections</Text>
                    <HeadingList headings={data.detectedHeadings} empty="No matching headings were detected in the template body." />
                  </section>
                  {data.expectedHeadings.some(heading => !data.detectedHeadings.includes(heading)) ? <section aria-label="Template sections not detected">
                    <Text fw={600}>Expected sections not detected</Text>
                    <HeadingList headings={data.expectedHeadings.filter(heading => !data.detectedHeadings.includes(heading))} />
                  </section> : null}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Paper>
      </> : null}
    </ResourceBoundary>
  </Stack>;
}

function TemplatePdfView({ workspaceId, templateId, pdf, canRetry, onReload }) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  const url = getDocumentTemplatePdfUrl(workspaceId, templateId, pdf.versionId);
  const retry = async () => {
    setRetrying(true);
    setRetryError('');
    try {
      await retryDocumentTemplatePdf(workspaceId, templateId, pdf.versionId);
      await onReload();
    } catch (error) {
      setRetryError(error?.message || 'PDF preparation could not be restarted.');
    } finally {
      setRetrying(false);
    }
  };
  return <Paper withBorder p="lg" className="template-review-panel template-pdf-panel">
    <Group justify="space-between" wrap="wrap" gap="sm">
      <Title order={2} size="h3">Template PDF</Title>
      <Group gap="sm">
        {pdf.state === 'READY' ? <Button component="a" variant="default" href={url} target="_blank" rel="noopener noreferrer">Open PDF</Button> : null}
        {pdf.originalAvailable ? <Button component="a" variant="default" href={getDocumentTemplateFileUrl(workspaceId, templateId)} target="_blank" rel="noopener noreferrer">Original file</Button> : null}
      </Group>
    </Group>
    {pdf.state === 'READY' ? <iframe title="Official template PDF" src={url} className="template-pdf-frame" />
      : pdf.state === 'FAILED' ? <Alert color="orange" title="Template PDF unavailable" mt="md">
        <Stack gap="sm"><Text>{pdf.error || 'The template PDF could not be prepared.'}</Text>
          {canRetry && pdf.originalAvailable ? <Button variant="default" loading={retrying} onClick={retry} style={{ alignSelf: 'flex-start' }}>Retry PDF preparation</Button> : null}
        </Stack>
      </Alert> : <Alert color="blue" mt="md"><Group gap="sm"><Loader size="sm" /><Text>Preparing template PDF…</Text></Group></Alert>}
    {retryError ? <Alert color="red" role="alert" mt="md">{retryError}</Alert> : null}
  </Paper>;
}

function HeadingList({ headings, empty }) {
  return headings.length ? <ul>{headings.map((heading, index) => <li key={`${heading}:${index}`}>{heading}</li>)}</ul>
    : <Text size="sm" c="dimmed">{empty}</Text>;
}
