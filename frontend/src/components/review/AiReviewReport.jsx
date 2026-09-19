import { Stack, Text } from '@mantine/core';

const SOURCE_LABELS = {
  DOCUMENT: 'Document evidence',
  DELIVERABLE_REQUIREMENTS: 'Deliverable Instructions',
  OFFICIAL_TEMPLATE: 'Official template'
};

export function AiReviewReport({ report }) {
  if (!report) return null;
  const findings = report.findings || legacyFindings(report.flags);
  const missingRequiredSections = report.missingRequiredSections || legacyMissingSections(report.missingSections);

  return (
    <Stack gap="sm" className="wt-ai-review-report">
      <Text size="md" lh={1.55}>{report.summary}</Text>
      {findings.map((finding, index) => (
        <Text size="sm" lh={1.55} key={`${finding.source || 'legacy'}:${finding.issue}:${index}`}>
          <strong>{sourceLabel(finding.source)}:</strong> {finding.issue}
          {finding.evidence ? <Text component="span" c="dimmed"> Evidence: {finding.evidence}</Text> : null}
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

function sourceLabel(source) {
  return SOURCE_LABELS[source] || 'Finding';
}

function legacyFindings(flags) {
  return (flags || []).map((issue) => ({ issue: String(issue), source: '', evidence: '' }));
}

function legacyMissingSections(sections) {
  return (sections || []).map((section) => ({ section: String(section), source: '', requirement: '' }));
}
