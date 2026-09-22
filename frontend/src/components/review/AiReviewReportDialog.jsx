import { Alert, Modal, ScrollArea, Stack, Text } from '@mantine/core';
import { AiReviewReport } from './AiReviewReport.jsx';
import { formatDateTime } from '../../lib/workflow.js';

export function AiReviewReportDialog({ opened, onClose, report, review, fieldLabel = 'PDF' }) {
  const previous = !report && Boolean(review?.previousReport);
  const displayReport = report || review?.previousReport;
  if (!displayReport) return null;
  const inconclusive = previous && ['NO_GROUNDED_FINDINGS', 'FINDINGS_FILTERED'].includes(review?.failureCode);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`AI Review: ${fieldLabel}`}
      size="70rem"
      centered
      scrollAreaComponent={ScrollArea.Autosize}
      transitionProps={{ duration: 0 }}
      classNames={{ content: 'wt-ai-review-dialog', body: 'wt-ai-review-dialog-body' }}
      closeButtonProps={{ 'aria-label': 'Close AI Review details' }}
    >
      <Stack gap="md">
        {previous ? (
          <Alert color="orange" title={inconclusive ? 'Latest AI Review inconclusive' : review?.status === 'RUNNING'
            ? 'Latest AI Review still running' : 'Latest AI Review did not finish'}>
            {review?.message || (inconclusive
              ? 'No source-grounded findings were established in the latest run.'
              : 'The latest run has not produced a usable new report.')}
            {' '}The report below is from an earlier saved run. It is not a result of the latest attempt.
          </Alert>
        ) : null}
        {previous ? (
          <Text size="sm" fw={700}>Previously saved AI Review{review?.previousGeneratedAt
            ? ` · ${formatDateTime(review.previousGeneratedAt)}` : ''}</Text>
        ) : review?.generatedAt ? (
          <Text size="sm" c="dimmed">Reviewed {formatDateTime(review.generatedAt)}</Text>
        ) : null}
        <AiReviewReport report={displayReport} />
        <Text size="sm" c="dimmed">
          AI Review is advisory first-pass feedback. Staff should verify the cited document evidence and requirement sources before making an academic decision.
        </Text>
      </Stack>
    </Modal>
  );
}
