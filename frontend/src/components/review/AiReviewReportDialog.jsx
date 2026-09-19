import { Modal, ScrollArea, Stack, Text } from '@mantine/core';
import { AiReviewReport } from './AiReviewReport.jsx';
import { formatDateTime } from '../../lib/workflow.js';

export function AiReviewReportDialog({ opened, onClose, report, review, fieldLabel = 'PDF' }) {
  if (!report) return null;

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
        {review?.generatedAt ? (
          <Text size="sm" c="dimmed">Reviewed {formatDateTime(review.generatedAt)}</Text>
        ) : null}
        <AiReviewReport report={report} />
        <Text size="sm" c="dimmed">
          AI Review is advisory first-pass feedback. Staff should verify the cited document evidence and requirement sources before making an academic decision.
        </Text>
      </Stack>
    </Modal>
  );
}
