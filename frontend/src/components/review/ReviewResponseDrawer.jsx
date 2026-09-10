import {
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Paper,
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
import { compactMissingSections } from './DocumentCheckDialog.jsx';
import {
  artifactAiReview,
  artifactAiReviewStatus,
  artifactDocumentCheck,
  artifactDocumentCheckStatus,
  formatDateTime,
  getProjectMetadata,
  isArtifactAiReviewCurrent,
  isArtifactDocumentCheckCurrent,
  makeDriveViewUrl
} from '../../lib/workflow.js';
import { StatusIndicator } from '../ui.jsx';

export function ReviewResponseDrawer({
  opened,
  response,
  student,
  state,
  deliverable,
  checkingFields = new Set(),
  checkError = '',
  onClose,
  onDocumentCheck,
  onAiReview,
  onAccept,
  onRevoke,
  onArchive
}) {
  if (!response || !student || !deliverable) return null;
  const project = getProjectMetadata(state, student.teamCode || response.teamCode);
  const accepted = response.reviewStatus === 'Accepted';
  const archived = response.archiveStatus === 'Archived';
  const fields = deliverable.fields || [];

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="min(680px, 96vw)"
      title={`Review ${student.name}`}
      aria-label={`Review ${student.name}`}
      classNames={{ content: 'wt-review-drawer', header: 'wt-review-drawer-header', body: 'wt-review-drawer-body' }}
    >
      <Stack gap="lg">
        {checkError ? <Alert color="red" role="alert">{checkError}</Alert> : null}
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

        <Divider />

        <section className="wt-review-detail-section" aria-labelledby="submission-artifacts-heading">
          <Stack gap="sm">
            <div>
              <Text component="h3" id="submission-artifacts-heading" fw={750}>Submission artifacts</Text>
              <Text size="xs" c="dimmed">Only PDF artifacts configured for review are sent through Document Check or AI Review.</Text>
            </div>
            {fields.map((field) => (
              <ArtifactCard
                key={field.definitionId || field.id}
                response={response}
                field={field}
                checking={checkingFields.has(artifactKey(response.id, field))}
                onDocumentCheck={() => onDocumentCheck?.(field)}
                onAiReview={() => onAiReview?.(field)}
              />
            ))}
          </Stack>
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
            <Button variant="default" leftSection={<ArrowCounterClockwise size={17} />} onClick={onRevoke}>
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

function ArtifactCard({ response, field, checking, onDocumentCheck, onAiReview }) {
  const value = String(response.values?.[field.id] || '').trim();
  const reviewablePdf = Boolean(field.pdfRequired && field.documentCheckPolicy !== 'OFF');
  const report = artifactDocumentCheck(response, field);
  const checkStatus = reviewablePdf ? artifactDocumentCheckStatus(response, field) : 'Not applicable';
  const aiState = artifactAiReview(response, field);
  const aiCurrent = isArtifactAiReviewCurrent(response, field);
  const aiStatus = artifactAiReviewStatus(response, field);
  const aiReport = aiCurrent ? aiState?.report : null;
  const missingPreview = compactMissingSections(report?.missingSections, 4);

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Text fw={750} size="sm">{field.label}</Text>
            <Text size="xs" c="dimmed">{fieldTypeLabel(field)}</Text>
          </div>
          {reviewablePdf ? <StatusIndicator status={checkStatus} /> : null}
        </Group>
        {value ? (
          <Button component="a" href={makeDriveViewUrl(value)} target="_blank" rel="noreferrer" variant="default"
            size="xs" leftSection={<ArrowSquareOut size={15} aria-hidden="true" />}>
            Open submitted link
          </Button>
        ) : <StatusIndicator status="No file link" />}

        {reviewablePdf ? (
          <>
            <Group gap="xs">
              <Button variant="light" color="wildtrackMaroon" size="xs" leftSection={<MagnifyingGlass size={15} />}
                loading={checking} disabled={!value} onClick={onDocumentCheck}>
                {isArtifactDocumentCheckCurrent(response, field) ? 'View Document Check' : field.documentCheckPolicy === 'MANUAL' ? 'Check document' : 'Check again'}
              </Button>
              {field.aiReviewEnabled ? (
                <Button variant="light" color="wildtrackGold" size="xs" leftSection={<Sparkle size={15} />}
                  disabled={!isArtifactDocumentCheckCurrent(response, field)} onClick={onAiReview}>
                  {aiStatus === 'Retry required' ? 'Retry AI review' : aiCurrent ? 'Rerun AI Review' : 'Run AI Review'}
                </Button>
              ) : null}
            </Group>
            {report ? (
              <Stack gap={3}>
                <Text size="sm">{report.summary || 'Document Check completed.'}</Text>
                {report.redFlags?.length ? <Group gap="xs">{report.redFlags.map((flag) => <Badge key={flag} color="orange" variant="light" radius="sm">{flag}</Badge>)}</Group> : null}
                {missingPreview ? <Text size="xs" c="dimmed">Template headings not detected: {missingPreview}</Text> : null}
              </Stack>
            ) : <Text size="xs" c="dimmed">No Document Check result is available for this PDF yet.</Text>}
            {field.aiReviewEnabled ? (
              <Stack gap={3}>
                <Group justify="space-between"><Text size="xs" fw={750}>AI Review</Text><StatusIndicator status={aiStatus} /></Group>
                {aiReport ? (
                  <ScrollArea.Autosize mah={180} type="auto" offsetScrollbars>
                    <Stack gap={3} pr="sm">
                      <Text size="sm">{aiReport.summary}</Text>
                      {aiReport.flags?.length ? <Text size="xs"><strong>Flags:</strong> {aiReport.flags.join(', ')}</Text> : null}
                      {aiReport.missingSections?.length ? <Text size="xs"><strong>Missing or weak:</strong> {aiReport.missingSections.join(', ')}</Text> : null}
                      {aiReport.suggestedAction ? <Text size="xs"><strong>Suggested action:</strong> {aiReport.suggestedAction}</Text> : null}
                    </Stack>
                  </ScrollArea.Autosize>
                ) : <Text size="xs" c="dimmed">{aiState?.message || 'No current AI Review is available for this PDF.'}</Text>}
              </Stack>
            ) : null}
          </>
        ) : (
          <Text size="xs" c="dimmed">This artifact is recorded for submission evidence only. Document Check and AI Review are disabled.</Text>
        )}
      </Stack>
    </Paper>
  );
}

function artifactKey(responseId, field) {
  return `${responseId}:${field.definitionId || field.id}`;
}

function fieldTypeLabel(field) {
  return ({
    drive: 'Google Drive PDF',
    googleForm: 'Google Form',
    googleSheet: 'Google Sheet',
    driveFolder: 'Google Drive folder',
    textarea: 'Text response',
    url: 'Link'
  })[field.type] || 'Submission field';
}
