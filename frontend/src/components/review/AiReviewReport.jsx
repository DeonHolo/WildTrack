import { useId, useState } from 'react';
import { Alert, Button, Stack, Text } from '@mantine/core';
import { isInconclusiveAiReviewReport, verifiedAiChecks } from '../../lib/workflow.js';

const SOURCE_LABELS = {
  DOCUMENT: 'Document evidence',
  DELIVERABLE_REQUIREMENTS: 'Deliverable Instructions',
  OFFICIAL_TEMPLATE: 'Official template'
};
const CHECK_SOURCE_LABELS = {
  DOCUMENT: 'Submitted PDF',
  DELIVERABLE_REQUIREMENTS: 'Deliverable instructions',
  OFFICIAL_TEMPLATE: 'Official template'
};

export function AiReviewReport({ report }) {
  const [showCheckDetails, setShowCheckDetails] = useState(false);
  const checkDetailsId = useId();
  if (!report) return null;
  const findings = report.findings || legacyFindings(report.flags);
  const uniqueFindings = findings.filter((finding, index) =>
    findings.findIndex(candidate => [candidate.source, candidate.issue, candidate.evidence, candidate.requirement]
      .every((value, part) => normalized(value) === normalized(
        [finding.source, finding.issue, finding.evidence, finding.requirement][part]))) === index);
  const missingRequiredSections = report.missingRequiredSections || legacyMissingSections(report.missingSections);
  const checks = verifiedAiChecks(report)
    .filter(check => !uniqueFindings.some(finding =>
      normalized(check.aspect) === normalized(finding.issue)
      && normalized(check.source) === normalized(finding.source)
      && normalized(check.documentEvidence) === normalized(finding.evidence)
      && normalized(check.requirement) === normalized(finding.requirement)));
  // The provider/server narrative often restates the same two structured findings
  // in different words, so sentence-level text matching cannot remove the duplicate.
  // When evidence-backed findings exist, show those once with their exact source
  // passages instead of a second, unstructured account of the same concerns.
  const summary = uniqueFindings.length || missingRequiredSections.length || checks.length ? '' : report.summary;
  const inconclusive = isInconclusiveAiReviewReport(report);
  const hasActionableIssues = Boolean(uniqueFindings.length || missingRequiredSections.length);
  const templateChecks = checks.filter(check => check.source === 'OFFICIAL_TEMPLATE').length;
  const instructionChecks = checks.filter(check => check.source === 'DELIVERABLE_REQUIREMENTS').length;
  const documentChecks = checks.length - templateChecks - instructionChecks;
  const checkSummary = [
    `${checks.length} distinct ${checks.length === 1 ? 'observation' : 'observations'} supported by submitted PDF evidence`,
    ...(templateChecks ? [`${templateChecks} mapped to the official template`] : []),
    ...(instructionChecks ? [`${instructionChecks} mapped to deliverable instructions`] : []),
    ...(documentChecks ? [`${documentChecks} based on the PDF alone`] : [])
  ].join(' · ');

  return (
    <Stack gap="sm" className="wt-ai-review-report">
      {inconclusive ? (
        <Alert color="orange" title="Inconclusive AI Review" role="status">
          {checks.length
            ? 'This review did not establish enough distinct verified checks to support a no-issue result.'
            : 'This run produced no source-grounded findings or verified checks.'}{' '}
          That does not mean the PDF was verified or has no issues.
          {summary ? <Text size="sm" mt="xs">{summary}</Text> : null}
        </Alert>
      ) : summary ? <Text size="md" lh={1.55}>{summary}</Text> : null}
      {!inconclusive && checks.length && !hasActionableIssues ? (
        <Alert color="green" title="No actionable issues identified in the checked areas" role="status">
          {checkSummary}. This is not a guarantee of full compliance or approval.
        </Alert>
      ) : null}
      {hasActionableIssues && checks.length ? <Text fw={700}>Issues to review</Text> : null}
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
      {checks.length ? (
        <Stack gap="xs" aria-label="Verified observations">
          {hasActionableIssues || inconclusive ? (
            <Text size="sm" c="dimmed">{checkSummary}. These observations are not a guarantee of full compliance or approval.</Text>
          ) : null}
          <Button variant="subtle" size="xs" w="fit-content" px={0}
            aria-expanded={showCheckDetails} aria-controls={checkDetailsId}
            onClick={() => setShowCheckDetails(value => !value)}>
            {showCheckDetails ? 'Hide supporting evidence' : `Show supporting evidence (${checks.length})`}
          </Button>
          {showCheckDetails ? (
            <Stack gap="xs" id={checkDetailsId}>
              {checks.map((check, index) => (
                <Text size="sm" lh={1.55} key={`${check.source || 'document'}:${check.aspect}:${index}`}>
                  <strong>{check.aspect}</strong> ({CHECK_SOURCE_LABELS[check.source]}).
                  {check.documentEvidence ? <Text component="span" c="dimmed"> Document evidence: {check.documentEvidence}</Text> : null}
                  {check.requirement ? <Text component="span" c="dimmed"> Authority: {check.requirement}</Text> : null}
                </Text>
              ))}
            </Stack>
          ) : null}
        </Stack>
      ) : null}
      {report.limitations?.length ? (
        <Text size="sm" lh={1.55} c="dimmed"><strong>Review limits:</strong> {report.limitations.join(' ')}</Text>
      ) : null}
      {report.suggestedAction && (hasActionableIssues || !checks.length)
        ? <Text size="sm" lh={1.55}><strong>Suggested action:</strong> {report.suggestedAction}</Text> : null}
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
