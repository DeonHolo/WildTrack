import { useId, useState } from 'react';
import { Alert, Badge, Button, Group, Stack, Text } from '@mantine/core';
import { isInconclusiveAiReviewReport, verifiedAiChecks } from '../../lib/workflow.js';

const CHECK_SOURCE_LABELS = {
  DOCUMENT: 'Submitted document',
  DELIVERABLE_REQUIREMENTS: 'Deliverable requirements',
  OFFICIAL_TEMPLATE: 'Official template'
};
const LEGACY_VERIFICATION = /^Mapped-template (?:body heading|transaction artifact)/i;

export function AiReviewReport({ report }) {
  const reportId = useId();
  if (!report) return null;
  const originalFindings = report.findings || legacyFindings(report.flags);
  const legacyNotes = originalFindings.filter(isLegacyVerification).map(legacyVerification);
  const findings = uniqueByClaim(originalFindings.filter(finding => !isLegacyVerification(finding)));
  const missing = report.missingRequiredSections || legacyMissingSections(report.missingSections);
  const verificationNotes = uniqueByClaim([...(report.verificationNotes || []), ...legacyNotes]);
  const checks = verifiedAiChecks(report).filter(check => !findings.some(finding => sameCheck(finding, check)));
  const issueCount = findings.length + missing.length;
  const inconclusive = issueCount === 0 && (
    verificationNotes.length > 0 || report.outcome === 'INCONCLUSIVE' || isInconclusiveAiReviewReport({
      ...report, findings, verificationNotes
    })
  );
  const noIssues = issueCount === 0 && !inconclusive && checks.length >= 2;
  const outcome = inconclusive ? 'Inconclusive' : noIssues ? 'No issues in checked areas' : 'Issues identified';

  return (
    <Stack gap="lg" className="wt-ai-review-report">
      <div className="wt-ai-review-outcome">
        <Badge color={inconclusive ? 'orange' : noIssues ? 'green' : 'red'} variant="light">{outcome}</Badge>
        <Text mt="xs" size="sm">{outcomeLabel({ inconclusive, noIssues, issueCount })}</Text>
        <Text mt={4} size="sm" c="dimmed">
          {issueCount} supported issue{issueCount === 1 ? '' : 's'} · {verificationNotes.length} to verify
        </Text>
      </div>
      {inconclusive ? (
        <Alert color="orange" title="Inconclusive AI Review" role="status">
          Unresolved checks or limited evidence prevent a no-issues conclusion. Use the original PDF to verify the areas below.
        </Alert>
      ) : noIssues ? (
        <Alert color="green" title="No actionable issues identified in the checked areas" role="status">
          {checks.length} distinct observations supported by submitted PDF evidence. This is advisory feedback, not approval or a guarantee of full compliance.
        </Alert>
      ) : null}
      {issueCount ? (
        <section aria-labelledby={`${reportId}-issues`}>
          <Text id={`${reportId}-issues`} fw={700}>Issues to review</Text>
          <Stack gap="md" mt="sm">
            {findings.map((finding, index) => <FindingRow key={`finding-${index}`} finding={finding} />)}
            {missing.map((item, index) => (
              <FindingRow key={`missing-${index}`} finding={{
                title: item.section || 'Required section is missing',
                issue: item.section ? `The required section “${item.section}” could not be located.` : 'A required section could not be located.',
                requirement: item.requirement, source: item.source
              }} />
            ))}
          </Stack>
        </section>
      ) : null}
      {verificationNotes.length ? (
        <details className="wt-ai-review-secondary">
          <summary>Verify in PDF ({verificationNotes.length})</summary>
          <Text size="sm" c="dimmed" mt="sm">These observations require confirmation before requesting a revision.</Text>
          <Stack gap="md" mt="sm">
            {verificationNotes.map((note, index) => <FindingRow key={`note-${index}`} finding={note} verification />)}
          </Stack>
        </details>
      ) : null}
      {checks.length ? (
        <details className="wt-ai-review-secondary">
          <summary>Observed checks ({checks.length})</summary>
          <Stack gap="md" mt="sm">
            {checks.map((check, index) => <CheckRow key={`check-${index}`} check={check} />)}
          </Stack>
        </details>
      ) : null}
      <details className="wt-ai-review-secondary">
        <summary>Coverage and limits</summary>
        {report.limitations?.map((limit, index) => <Text key={index} size="sm" mt="sm">{limit}</Text>)}
        {!report.limitations?.length ? <Text size="sm" mt="sm">This report covers only the cited checks. It does not establish full academic compliance.</Text> : null}
      </details>
    </Stack>
  );
}

function FindingRow({ finding, verification = false }) {
  const explanation = finding.explanation || finding.issue || '';
  const title = finding.title || conciseTitle(explanation);
  const nextAction = finding.nextAction || (verification
    ? 'Open the submitted PDF and confirm this area before requesting a revision.'
    : 'Review the cited evidence and decide whether a revision is needed.');
  return (
    <article className="wt-ai-review-row">
      <Text fw={700}>{title}</Text>
      {explanation && normalized(explanation) !== normalized(title) ? <Text size="sm" mt={6}>{explanation}</Text> : null}
      <Text size="sm" mt="sm"><strong>Next step:</strong> {nextAction}</Text>
      <Evidence finding={finding} />
    </article>
  );
}

function Evidence({ finding }) {
  const [open, setOpen] = useState(false);
  if (!finding.evidence && !finding.requirement && !finding.location) return null;
  return (
    <details className="wt-ai-review-evidence" open={open}>
      <summary onClick={event => { event.preventDefault(); setOpen(value => !value); }}>View evidence</summary>
      {open ? (
        <Stack gap="md" mt="sm">
          {finding.evidence ? <Passage label="Submitted document" text={finding.evidence} /> : null}
          {finding.requirement ? <Passage label="Requirement" text={finding.requirement} /> : null}
          {finding.location?.page || finding.location?.section ? (
            <Text size="sm" c="dimmed">
              Location: {[finding.location.page && `page ${finding.location.page}`, finding.location.section].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </Stack>
      ) : null}
    </details>
  );
}

function Passage({ label, text }) {
  const [full, setFull] = useState(false);
  const long = text.length > 420;
  const excerpt = long && !full ? `${text.slice(0, 420).replace(/\s+\S*$/, '')}…` : text;
  return (
    <div>
      <Text size="sm" fw={700}>{label}</Text>
      <Text size="sm" mt={4} className="wt-ai-review-passage">{excerpt}</Text>
      {long ? <Button variant="subtle" size="compact-xs" mt={4} onClick={() => setFull(value => !value)}>
        {full ? 'Show short excerpt' : 'View full passage'}
      </Button> : null}
    </div>
  );
}

function CheckRow({ check }) {
  return (
    <article className="wt-ai-review-row">
      <Text fw={700} size="sm">{check.aspect}</Text>
      <Text size="sm" c="dimmed">{CHECK_SOURCE_LABELS[check.source] || 'Submitted document'}</Text>
      <Evidence finding={{ evidence: check.documentEvidence, requirement: check.requirement, location: check.location }} />
    </article>
  );
}

function outcomeLabel({ inconclusive, noIssues, issueCount }) {
  if (inconclusive) return 'Some checked areas still require manual verification.';
  if (noIssues) return 'The checked areas did not produce supported issues.';
  return `${issueCount} supported issue${issueCount === 1 ? '' : 's'} ${issueCount === 1 ? 'requires' : 'require'} review.`;
}
function conciseTitle(issue) {
  const first = String(issue || 'Review observation').split(/(?<=[.!?])\s/)[0];
  return first.length > 96 ? `${first.slice(0, 93).replace(/\s+\S*$/, '')}…` : first;
}
function isLegacyVerification(finding) { return LEGACY_VERIFICATION.test(finding.issue || ''); }
function legacyVerification(finding) {
  const quoted = (finding.issue || '').match(/'([^']+)'/);
  const templateEvidence = /^(?:Mapped official-template|Mapped-template)/i.test(finding.evidence || '');
  return {
    ...finding, title: quoted ? `Verify ${quoted[1]}` : 'Verify template comparison',
    issue: 'This older text-based comparison requires confirmation in the original PDF.',
    nextAction: 'Confirm section applicability, equivalent headings, and graphical content before requesting a revision.',
    evidence: templateEvidence ? '' : finding.evidence,
    requirement: finding.requirement || (templateEvidence ? finding.evidence : '')
  };
}
function uniqueByClaim(findings) {
  return findings.filter((finding, index) => findings.findIndex(candidate =>
    [candidate.source, candidate.issue, candidate.evidence, candidate.requirement].every((value, part) =>
      normalized(value) === normalized([finding.source, finding.issue, finding.evidence, finding.requirement][part]))
  ) === index);
}
function sameCheck(finding, check) {
  return normalized(finding.issue) === normalized(check.aspect) && normalized(finding.source) === normalized(check.source)
    && normalized(finding.evidence) === normalized(check.documentEvidence) && normalized(finding.requirement) === normalized(check.requirement);
}
function normalized(text) { return String(text || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function legacyFindings(flags) { return (flags || []).map(issue => ({ issue: String(issue), source: '', evidence: '' })); }
function legacyMissingSections(sections) { return (sections || []).map(section => ({ section: String(section), source: '', requirement: '' })); }
