import { useCallback } from 'react';
import { Alert, Anchor, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useParams, useSearchParams } from 'react-router-dom';
import { useWorkspaceSession } from '../app/WorkspaceSession.jsx';
import { useWorkspaceResource } from '../hooks/useWorkspaceResource.js';
import { ResourceBoundary } from '../components/ResourceBoundary.jsx';
import { getDocumentTemplateFileUrl, getDocumentTemplateStructure } from '../lib/api.js';

const emptyTemplate = () => null;

export function TemplatePreviewPage() {
  const { templateId } = useParams();
  const [query] = useSearchParams();
  const { activeWorkspaceId } = useWorkspaceSession();
  const workspaceId = query.get('workspaceId') || activeWorkspaceId;
  const load = useCallback(id => getDocumentTemplateStructure(id, templateId), [templateId]);
  const { data, status, error, reload } = useWorkspaceResource(workspaceId, load, emptyTemplate);
  return <Stack gap="lg" maw={960} mx="auto" p="lg">
    <Group justify="space-between" align="flex-start">
      <div><Text size="sm" c="dimmed">Official template</Text>
        <Title order={1}>{data?.originalFilename || data?.displayName || 'Template preview'}</Title>
        {data?.displayName && data.displayName !== data.originalFilename ? <Text size="sm">{data.displayName}</Text> : null}
      </div>
      <Anchor href="/workspace">Back to workspace</Anchor>
    </Group>
    <ResourceBoundary status={status} error={error} onRetry={reload}>
      {data ? <>
        <Paper withBorder p="md">
          <Stack gap="md">
            <Title order={2} size="h3">Template headings</Title>
            <Text size="sm">{data.detectedHeadings.length} of {data.expectedHeadings.length} expected body sections detected in this template</Text>
            <section aria-label="Template body sections"><Text fw={600}>Detected body sections</Text>
              <HeadingList headings={data.detectedHeadings} empty="No matching headings were detected in the template body." />
            </section>
            {data.expectedHeadings.some(heading => !data.detectedHeadings.includes(heading)) ? <section aria-label="Template sections not detected">
              <Text fw={600}>Expected sections not detected</Text>
              <HeadingList headings={data.expectedHeadings.filter(heading => !data.detectedHeadings.includes(heading))} />
            </section> : null}
          </Stack>
        </Paper>
        <Paper withBorder p="lg">
          <Group justify="space-between"><Title order={2} size="h3">Template content</Title>
            <Button component="a" variant="default" href={getDocumentTemplateFileUrl(workspaceId, templateId)} target="_blank" rel="noopener noreferrer">Original file</Button>
          </Group>
          <Text size="sm" c="dimmed" mt="xs">Formatting may differ in this text preview.</Text>
          {data.extractedText ? <Text component="div" mt="md" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{data.extractedText}</Text>
            : <Alert color="orange" mt="md">No readable text was extracted. Open the original file to inspect it.</Alert>}
        </Paper>
      </> : null}
    </ResourceBoundary>
  </Stack>;
}

function HeadingList({ headings, empty }) {
  return headings.length ? <ul>{headings.map((heading, index) => <li key={`${heading}:${index}`}>{heading}</li>)}</ul>
    : <Text size="sm" c="dimmed">{empty}</Text>;
}
