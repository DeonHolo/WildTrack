import {
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Paper,
  Stack,
  Text,
  Title
} from '@mantine/core';
import {
  Archive,
  ArrowCounterClockwise,
  ArrowSquareOut,
  CheckCircle,
  Eye,
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
import { ResponseTimingSummary } from '../ResponseTimingSummary.jsx';
import { submissionArtifactFields } from '../../lib/submissionArtifacts.js';

export function ReviewResponseDrawer({
  opened,
  response,
  student,
  state,
  deliverable,
  checkingFields = new Set(),
  checkingAiFields = new Set(),
  driveAccessCheck = null,
  checkError = '',
  onClose,
  onDocumentCheck,
  onDriveAccessCheck,
  onFileHistory,
  onViewAiReview,
  onAiReview,
  onAccept,
  onRevoke,
  onArchive
}) {
  if (!response || !student || !deliverable) return null;
  const project = getProjectMetadata(state, student.teamCode || response.teamCode);
  const hasProjectContext = [project?.projectTitle, project?.softwareName, project?.proposalRemarks]
    .some((value) => String(value || '').trim());
  const accepted = response.reviewStatus === 'Accepted';
  const archived = response.archiveStatus === 'Archived';
  const fields = submissionArtifactFields(deliverable.fields || []);

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
              <ResponseTimingSummary timing={response.timing} />
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
            {fields.length ? fields.map((field) => (
              <ArtifactCard
                key={field.definitionId || field.id}
                response={response}
                field={field}
                checking={checkingFields.has(artifactKey(response.id, field))}
                reviewing={checkingAiFields.has(`${response.id}:${field.definitionId || field.id}`)}
                driveAccessCheck={driveAccessCheck?.key === artifactKey(response.id, field)
                  && driveAccessCheck?.source === String(response.values?.[field.id] || '').trim() ? driveAccessCheck : null}
                onDocumentCheck={() => onDocumentCheck?.(field)}
                onDriveAccessCheck={() => onDriveAccessCheck?.(field)}
                onFileHistory={() => onFileHistory?.(field)}
                onViewAiReview={() => onViewAiReview?.(field)}
                onAiReview={() => onAiReview?.(field)}
              />
            )) : <Text size="sm" c="dimmed">No file or link artifacts were submitted for this response.</Text>}
          </Stack>
        </section>

        {hasProjectContext ? (
          <section className="wt-review-detail-section" aria-labelledby="project-context-heading">
            <Text component="h3" id="project-context-heading" fw={750}>Project context</Text>
            {project?.projectTitle ? <Text size="sm" fw={650}>{project.projectTitle}</Text> : null}
            {project?.softwareName ? <Text size="xs" c="dimmed">Software: {project.softwareName}</Text> : null}
            {project?.proposalRemarks ? <Text size="xs" c="dimmed">{project.proposalRemarks}</Text> : null}
          </section>
        ) : null}

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

function ArtifactCard({ response, field, checking, reviewing, driveAccessCheck, onDocumentCheck, onDriveAccessCheck, onFileHistory, onViewAiReview, onAiReview }) {
  const value = String(response.values?.[field.id] || '').trim();
  const reviewablePdf = Boolean(field.pdfRequired && field.documentCheckPolicy !== 'OFF');
  const report = artifactDocumentCheck(response, field);
  const checkStatus = reviewablePdf ? artifactDocumentCheckStatus(response, field) : 'Not applicable';
  const aiState = artifactAiReview(response, field);
  const aiCurrent = isArtifactAiReviewCurrent(response, field);
  const aiStatus = artifactAiReviewStatus(response, field);
  const aiReport = aiCurrent ? aiState?.report : null;
  const previousAiReport = !aiCurrent && aiState?.previousReport && aiState?.sourceUrl === value
    ? aiState.previousReport : null;
  const inconclusiveAttempt = aiState?.status === 'UNCERTAIN'
    && ['NO_GROUNDED_FINDINGS', 'FINDINGS_FILTERED', 'INSUFFICIENT_REVIEW_EVIDENCE'].includes(aiState.failureCode);
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
          <Group gap="xs">
            <Button component="a" href={makeDriveViewUrl(value)} target="_blank" rel="noreferrer" variant="default"
              size="xs" leftSection={<ArrowSquareOut size={15} aria-hidden="true" />}>
              {artifactOpenLabel(field)}
            </Button>
              {field.type === 'drive' && (!reviewablePdf || !report) ? (
                <Button variant="light" color="wildtrackMaroon" size="xs" onClick={onFileHistory}>File history</Button>
            ) : null}
          </Group>
        ) : <StatusIndicator status="No file link" />}

        {reviewablePdf ? (
          <>
            <Group gap="xs" wrap="wrap" className="wt-review-artifact-actions">
              <Button variant="light" color="wildtrackMaroon" size="xs" leftSection={<MagnifyingGlass size={15} />}
                loading={checking} disabled={!value} onClick={onDocumentCheck}>
                {isArtifactDocumentCheckCurrent(response, field) ? 'View Document Check' : field.documentCheckPolicy === 'MANUAL' ? 'Check document' : 'Check again'}
              </Button>
              {aiReport || previousAiReport ? (
                <Button variant="light" color="wildtrackMaroon" size="xs" leftSection={<Eye size={15} aria-hidden="true" />}
                  onClick={onViewAiReview}>
                  {previousAiReport ? 'View previous AI Review' : 'View AI Review'}
                </Button>
              ) : null}
              {field.aiReviewEnabled ? (
                <Button variant="default" size="xs" loading={Boolean(driveAccessCheck?.running)} disabled={!value || reviewing}
                  onClick={onDriveAccessCheck}>Check Drive API access</Button>
              ) : null}
              {field.aiReviewEnabled ? (
                <Button variant="light" color="wildtrackGold" size="xs" leftSection={<Sparkle size={15} />}
                  loading={reviewing} disabled={reviewing || aiStatus === 'Reviewing' || !isArtifactDocumentCheckCurrent(response, field)} onClick={onAiReview}>
                  {reviewing || aiStatus === 'Reviewing' ? 'AI Review running'
                    : aiStatus === 'Retry required' ? 'Retry AI review' : aiCurrent ? 'Rerun AI Review' : 'Run AI Review'}
                </Button>
              ) : null}
            </Group>
            {driveAccessCheck?.result ? <Alert color={driveAccessCheck.result.status === 'ACCESSIBLE' ? 'green' : 'orange'}
              title={`Drive API access: ${driveAccessCheck.result.status.replaceAll('_', ' ').toLowerCase()}`}>
              <Text size="sm">{driveAccessCheck.result.message}</Text>
              {driveAccessCheck.result.step ? <Text size="xs" c="dimmed">Checked stage: {driveAccessCheck.result.step}</Text> : null}
            </Alert> : null}
            {report ? (
              <Stack gap={3}>
                <Text size="sm">{report.summary || 'Document Check completed.'}</Text>
                {report.redFlags?.length ? <Group gap="xs">{report.redFlags.map((flag) => <Badge key={flag} color="orange" variant="light" radius="sm">{flag}</Badge>)}</Group> : null}
                {missingPreview ? <Text size="xs" c="dimmed">Template headings not detected: {missingPreview}</Text> : null}
              </Stack>
            ) : <Text size="xs" c="dimmed">No Document Check result is available for this PDF yet.</Text>}
            {field.aiReviewEnabled ? (
              <Stack gap={3}>
                <Group justify="space-between"><Text size="xs" fw={750}>AI Review</Text><StatusIndicator status={reviewing ? 'Reviewing' : aiStatus} /></Group>
                {inconclusiveAttempt ? (
                  <Text size="sm" c="orange.8">Latest AI Review inconclusive.{' '}
                    {aiState?.message || (aiState?.failureCode === 'INSUFFICIENT_REVIEW_EVIDENCE'
                      ? 'The new run established fewer than two independent verified checks.'
                      : 'The new run produced no source-grounded findings.')}{' '}The latest attempt was inconclusive; it did not verify this PDF.</Text>
                ) : aiState?.status === 'UNCERTAIN' ? (
                  <Text size="sm" c="orange.8">Latest AI Review did not finish successfully. Retry only after reviewing the reported error.</Text>
                ) : null}
                {previousAiReport ? (
                  <Text size="xs" c="dimmed">A previously saved AI Review is available. It is historical, not the result of the latest attempt.</Text>
                ) : null}
                {reviewing && aiReport ? (
                  <Text size="xs" c="dimmed">A new review is running. The previous report remains available until the new result is saved.</Text>
                ) : null}
                {aiReport ? (
                  <Text size="sm" c="dimmed" lineClamp={3}>{aiReport.summary}</Text>
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

function artifactOpenLabel(field) {
  if (field?.type === 'drive' || field?.pdfRequired) return 'Open PDF';
  if (field?.type === 'googleForm') return 'Open form';
  if (field?.type === 'googleSheet') return 'Open sheet';
  if (field?.type === 'driveFolder') return 'Open folder';
  return 'Open link';
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
