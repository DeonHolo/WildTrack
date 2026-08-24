import {
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  ScrollArea,
  Stack,
  Text,
  Title
} from '@mantine/core';
import {
  Archive,
  ArrowCounterClockwise,
  ArrowSquareOut,
  CheckCircle,
  MagnifyingGlass,
  Sparkle
} from '@phosphor-icons/react';
import { compactMissingSections, documentCheckStatus } from './DocumentCheckDialog.jsx';
import {
  firstSubmissionLink,
  formatDateTime,
  getProjectMetadata,
  isAiReportCurrent,
  isDocumentCheckCurrent,
  makeDriveViewUrl
} from '../../lib/workflow.js';
import { StatusIndicator } from '../ui.jsx';

export function ReviewResponseDrawer({
  opened,
  response,
  student,
  state,
  deliverable,
  documentCheckEnabled,
  onClose,
  onDocumentCheck,
  onAiReview,
  onAccept,
  onRevoke,
  onArchive
}) {
  if (!response || !student || !deliverable) return null;
  const fileLink = firstSubmissionLink(response.values);
  const project = getProjectMetadata(state, student.teamCode || response.teamCode);
  const report = response.documentCheck;
  const aiReport = response.aiReport;
  const accepted = response.reviewStatus === 'Accepted';
  const archived = response.archiveStatus === 'Archived';
  const checkRunning = response.fileCheckStatus === 'Checking';
  const missingPreview = compactMissingSections(report?.missingSections, 4);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="min(620px, 96vw)"
      title={`Review ${student.name}`}
      aria-label={`Review ${student.name}`}
      classNames={{ content: 'wt-review-drawer', header: 'wt-review-drawer-header', body: 'wt-review-drawer-body' }}
    >
      <Stack gap="lg">
        <section className="wt-review-drawer-identity">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text size="xs" fw={750} tt="uppercase" c="wildtrackMaroon.7">{deliverable.shortTitle} response</Text>
              <Title order={2} size="h3">{student.name}</Title>
              <Text size="sm" c="dimmed" className="wt-tabular">{student.studentNumber} | {student.teamCode || response.teamCode}</Text>
              <Text size="xs" c="dimmed" mt={4}>Saved {formatDateTime(response.updatedAt || response.submittedAt)}</Text>
            </div>
            <StatusIndicator status={archived ? 'Archived' : response.reviewStatus || 'Received'} />
          </Group>
        </section>

        <Group gap="sm" className="wt-review-drawer-file-actions">
          {fileLink ? (
            <Button
              component="a"
              href={makeDriveViewUrl(fileLink)}
              target="_blank"
              rel="noreferrer"
              variant="default"
              leftSection={<ArrowSquareOut size={17} aria-hidden="true" />}
              aria-label="Open submitted file"
            >
              Open submitted file
            </Button>
          ) : <StatusIndicator status="No file link" />}
          {documentCheckEnabled ? (
            <Button
              variant="light"
              color="wildtrackMaroon"
              leftSection={<MagnifyingGlass size={17} aria-hidden="true" />}
              loading={checkRunning}
              onClick={onDocumentCheck}
            >
              {isDocumentCheckCurrent(response) ? 'View Document Check' : 'Check document'}
            </Button>
          ) : null}
          <Button
            variant="light"
            color="wildtrackGold"
            leftSection={<Sparkle size={17} />}
            disabled={!documentCheckEnabled || !isDocumentCheckCurrent(response)}
            onClick={onAiReview}
          >
            {isAiReportCurrent(response) ? 'Rerun AI Review' : 'Run AI Review'}
          </Button>
        </Group>

        <Divider />

        <section className="wt-review-detail-section" aria-labelledby="document-check-detail-heading">
          <Group justify="space-between" gap="sm">
            <Text component="h3" id="document-check-detail-heading" fw={750}>Document Check</Text>
            <StatusIndicator status={documentCheckEnabled ? documentCheckStatus(response) : 'Not checked'} />
          </Group>
          {documentCheckEnabled ? (
            <>
              <Text size="sm">{report?.summary || response.checkSummary || 'This response has not been checked yet.'}</Text>
              {report?.redFlags?.length ? (
                <Group gap="xs">{report.redFlags.map((flag) => <Badge key={flag} color="orange" variant="light" radius="sm">{flag}</Badge>)}</Group>
              ) : null}
              {missingPreview ? <Text size="xs" c="dimmed">Template headings not detected: {missingPreview}</Text> : null}
              {report?.document ? (
                <Text size="xs" c="dimmed" className="wt-tabular">
                  {report.document.pageCount} pages | {report.document.extractedCharacterCount.toLocaleString()} readable characters
                </Text>
              ) : null}
            </>
          ) : <Text size="sm" c="dimmed">This link-based deliverable does not require PDF Document Check.</Text>}
        </section>

        <section className="wt-review-detail-section" aria-labelledby="ai-review-detail-heading">
          <Group justify="space-between" gap="sm">
            <Text component="h3" id="ai-review-detail-heading" fw={750}>AI Review</Text>
            <StatusIndicator status={isAiReportCurrent(response) ? 'Reviewed' : 'Not reviewed'} />
          </Group>
          {isAiReportCurrent(response) ? (
            <ScrollArea.Autosize mah={220} type="auto" offsetScrollbars>
              <Stack gap="xs" pr="sm">
                <Text size="sm">{aiReport.summary}</Text>
                {aiReport.flags?.length ? <Text size="xs"><strong>Flags:</strong> {aiReport.flags.join(', ')}</Text> : null}
                {aiReport.missingSections?.length ? <Text size="xs"><strong>Missing or weak:</strong> {aiReport.missingSections.join(', ')}</Text> : null}
                {aiReport.suggestedAction ? <Text size="xs"><strong>Suggested action:</strong> {aiReport.suggestedAction}</Text> : null}
              </Stack>
            </ScrollArea.Autosize>
          ) : (
            <Text size="sm" c="dimmed">No current AI Review is available for this response.</Text>
          )}
        </section>

        <section className="wt-review-detail-section" aria-labelledby="project-context-heading">
          <Text component="h3" id="project-context-heading" fw={750}>Project context</Text>
          <Text size="sm" fw={650}>{project?.projectTitle || 'Project metadata not loaded yet.'}</Text>
          {project?.softwareName ? <Text size="xs" c="dimmed">Software: {project.softwareName}</Text> : null}
          {project?.proposalRemarks ? <Text size="xs" c="dimmed">{project.proposalRemarks}</Text> : null}
        </section>

        {response.acceptance ? (
          <Text size="xs" c="dimmed">
            Accepted by {response.acceptance.acceptedBy} ({response.acceptance.acceptedByRole}) on {formatDateTime(response.acceptance.acceptedAt)}.
          </Text>
        ) : null}

        <Divider />
        <Group justify="flex-end" gap="sm" className="wt-review-decision-actions">
          {accepted ? (
            <Button variant="default" leftSection={<ArrowCounterClockwise size={17} />} disabled={archived} onClick={onRevoke}>
              Revoke acceptance
            </Button>
          ) : (
            <Button variant="default" leftSection={<CheckCircle size={17} aria-hidden="true" />} onClick={onAccept}>
              Accept response
            </Button>
          )}
          <Button color="wildtrackMaroon" leftSection={<Archive size={17} aria-hidden="true" />} disabled={!accepted || archived} onClick={onArchive}>
            {archived ? 'Archived' : 'Archive response'}
          </Button>
        </Group>
      </Stack>
    </Drawer>
  );
}
