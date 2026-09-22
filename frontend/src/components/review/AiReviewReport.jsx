import { Alert, Stack, Text } from '@mantine/core';
import { isInconclusiveAiReviewReport } from '../../lib/workflow.js';

const SOURCE_LABELS = {
  DOCUMENT: 'Document evidence',
  DELIVERABLE_REQUIREMENTS: 'Deliverable Instructions',
  OFFICIAL_TEMPLATE: 'Official template'
};

export function AiReviewReport({ report }) {
  if (!report) return null;
  const findings = report.findings || legacyFindings(report.flags);
  const uniqueFindings = findings.filter((finding, index) =>
    findings.findIndex(candidate => [candidate.source, candidate.issue, candidate.evidence, candidate.requirement]
      .every((value, part) => normalized(value) === normalized(
        [finding.source, finding.issue, finding.evidence, finding.requirement][part]))) === index);
  const missingRequiredSections = report.missingRequiredSections || legacyMissingSections(report.missingSections);
  // The provider/server narrative often restates the same two structured findings
  // in different words, so sentence-level text matching cannot remove the duplicate.
  // When evidence-backed findings exist, show those once with their exact source
  // passages instead of a second, unstructured account of the same concerns.
  const summary = uniqueFindings.length || missingRequiredSections.length ? '' : report.summary;
  const noGroundedFindings = isInconclusiveAiReviewReport(report);

  return (
    <Stack gap="sm" className="wt-ai-review-report">
      {noGroundedFindings ? (
        <Alert color="orange" title="Inconclusive AI Review" role="status">
          This run produced no source-grounded findings. That does not mean the PDF was verified or has no issues.
          {summary ? <Text size="sm" mt="xs">{summary}</Text> : null}
        </Alert>
      ) : summary ? <Text size="md" lh={1.55}>{summary}</Text> : null}
      {uniqueFindings.map((finding, index) => (
        <Text size="sm" lh={1.55} key={`${finding.source || 'legacy'}:${finding.issue}:${index}`}>
          <strong>{sourceLabel(finding.source)}:</strong> {finding.issue}
          {finding.evidence && !sameClaim(finding.evidence, finding.issue)
            ? <Text component="span" c="dimmed"> Evidence: {finding.evidence}</Text> : null}
          {finding.requirement ? <Text component="span" c="dimmed"> Authority: {finding.requirement}</Text> : null}
        </Text>
      ))}
      {missingRequiredSections.length ? (
        <Text size="sm" lh={1.55}>
          <strong>Missing required sections:</strong>{' '}
          {missingRequiredSections.map((item) => item.source
            ? `${item.section} (${sourceLabel(item.source)})`
            : item.section).join(', ')}
        </Text>
      ) : null}
      {report.limitations?.length ? (
        <Text size="sm" lh={1.55} c="dimmed"><strong>Review limits:</strong> {report.limitations.join(' ')}</Text>
      ) : null}
      {report.suggestedAction ? <Text size="sm" lh={1.55}><strong>Suggested action:</strong> {report.suggestedAction}</Text> : null}
    </Stack>
  );
}

function normalized(text) {
  return String(text || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function sameClaim(left, right) {
  return Boolean(normalized(left)) && normalized(left) === normalized(right);
}

function sourceLabel(source) {
  return SOURCE_LABELS[source] || 'Finding';
}

function legacyFindings(flags) {
  return (flags || []).map((issue) => ({ issue: String(issue), source: '', evidence: '' }));
}

function legacyMissingSections(sections) {
  return (sections || []).map((section) => ({ section: String(section), source: '', requirement: '' }));
}
