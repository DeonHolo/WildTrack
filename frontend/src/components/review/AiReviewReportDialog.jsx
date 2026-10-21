import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { AiReviewReport } from './AiReviewReport.jsx';
import { ProviderFailureDetails } from './ProviderFailureDetails.jsx';
import { formatDateTime, makeDriveViewUrl, validateUrl } from '../../lib/workflow.js';

export function AiReviewReportDialog({ opened, onClose, report, review, documentChange = null, fileLink = '', deliverableTitle = 'Submission' }) {
  const previous = !report && Boolean(review?.previousReport || review?.lastSubstantiveReport);
  const displayReport = report || review?.previousReport || review?.lastSubstantiveReport;
  if (!displayReport) return null;
  const pdfUrl = makeDriveViewUrl(fileLink);
  const inconclusive = previous && ['NO_GROUNDED_FINDINGS', 'FINDINGS_FILTERED', 'INSUFFICIENT_REVIEW_EVIDENCE']
    .includes(review?.failureCode);

  return (
    <Modal.Root
      opened={opened}
      onClose={onClose}
      size="52rem"
      centered
      transitionProps={{ duration: 0 }}
      classNames={{ content: 'wt-ai-review-dialog', body: 'wt-ai-review-dialog-body' }}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header style={{ gap: 12 }}>
          <Modal.Title style={{ flex: 1, minWidth: 0 }}>AI Review: {deliverableTitle}</Modal.Title>
          <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            {pdfUrl && !validateUrl(pdfUrl) ? (
              <Button component="a" href={pdfUrl} target="_blank" rel="noreferrer" variant="default" size="xs"
                leftSection={<ArrowSquareOut size={15} aria-hidden="true" />}>
                Open PDF
              </Button>
            ) : null}
            <Modal.CloseButton aria-label="Close AI Review details" />
          </Group>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            {documentChange ? (
              <Alert color="orange" title="AI Review may be outdated" role="alert">
                Document Check detected changed PDF content. This saved AI Review may describe an earlier file state.
                {' '}Run AI Review again to review the updated PDF. Automatic Document Check does not run AI Review.
              </Alert>
            ) : null}
            {previous ? (
              <Alert color="orange" title={inconclusive ? 'Latest AI Review inconclusive' : review?.status === 'OUTDATED'
                ? 'Review settings changed; report is historical' : review?.status === 'RUNNING'
                  ? 'Latest AI Review still running' : 'Latest AI Review did not finish'}>
                {review?.message || (inconclusive
                  ? 'No source-grounded findings were established in the latest run.'
                  : 'The latest run has not produced a usable new report.')}
                {' '}The report below is from an earlier saved run. It is not a result of the latest attempt.
              </Alert>
            ) : null}
            {review?.status === 'UNCERTAIN'
              ? <ProviderFailureDetails diagnostic={review.failureDiagnostics} failureCode={review.failureCode} /> : null}
            {previous ? (
              <Text size="sm" fw={700}>Previously saved AI Review{(review?.previousGeneratedAt || review?.lastSubstantiveGeneratedAt)
                ? ` · ${formatDateTime(review.previousGeneratedAt || review.lastSubstantiveGeneratedAt)}` : ' · date unavailable'}</Text>
            ) : review?.generatedAt ? (
              <Text size="sm" className="wt-ai-review-reference">Reviewed {formatDateTime(review.generatedAt)}</Text>
            ) : review?.lastSubstantiveGeneratedAt ? (
              <Text size="sm" className="wt-ai-review-reference">Last substantive review · {formatDateTime(review.lastSubstantiveGeneratedAt)}</Text>
            ) : null}
            <AiReviewReport report={displayReport} deliverableTitle={deliverableTitle} />
            {review?.lastSubstantiveReport && !sameReport(review.lastSubstantiveReport, displayReport) ? (
              <details className="wt-ai-review-earlier">
                <summary>Earlier substantive review · {review.lastSubstantiveGeneratedAt ? formatDateTime(review.lastSubstantiveGeneratedAt) : 'date unavailable'}</summary>
                <AiReviewReport report={review.lastSubstantiveReport} deliverableTitle={deliverableTitle} />
              </details>
            ) : null}
            <Text size="sm" className="wt-ai-review-reference">
              AI Review is advisory first-pass feedback. Staff should verify the cited document evidence and requirement sources before making an academic decision.
            </Text>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

function sameReport(first, second) {
  return first === second || JSON.stringify(first) === JSON.stringify(second);
}
