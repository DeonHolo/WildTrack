import { Button, Stack, Text } from '@mantine/core';
import { verifiedAiChecks } from '../../lib/workflow.js';

const SOURCES = {
  DELIVERABLE_REQUIREMENTS: 'Deliverable requirements',
  OFFICIAL_TEMPLATE: 'Official template'
};
const STATES = {
  EVIDENCE_RECORDED: ['Evidence recorded', 'blue.8'],
  ISSUE_RECORDED: ['Issue identified', 'orange.8'],
  NEEDS_VERIFICATION: ['Needs manual verification', 'orange.8'],
  NOT_CHECKED: ['Not checked', 'dimmed']
};
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const authority = item => item?.source === 'DOCUMENT'
  || Boolean(SOURCES[item?.source] && hasText(item?.requirement));

// Coverage references the original saved arrays, before presentation grouping or
// deduplication. Invalid references must never make an area look checked.
function references(indexes, items, validItem) {
  if (!Array.isArray(indexes) || !Array.isArray(items)) return { valid: false, items: [] };
  const unique = new Set(indexes);
  if (unique.size !== indexes.length || indexes.some(index => !Number.isInteger(index)
      || index < 0 || index >= items.length || !validItem(items[index]))) {
    return { valid: false, items: [] };
  }
  return { valid: true, items: indexes.map(index => items[index]) };
}

function coverageRows(report) {
  const criteria = report.coverage.criteria;
  const validChecks = new Set(verifiedAiChecks(report));
  const usedChecks = new Set();
  const ids = criteria.map(item => item?.id);
  return criteria.map((item, index) => {
    const validIdentity = /^C[1-9]\d*$/.test(item?.id || '') && ids.indexOf(item.id) === ids.lastIndexOf(item.id)
      && hasText(item.requirement) && Boolean(SOURCES[item.source]);
    const checks = references(item?.verifiedCheckIndexes, report.verifiedChecks || [], check => validChecks.has(check));
    const findings = references(item?.findingIndexes, report.findings || [], finding =>
      hasText(finding?.issue) && hasText(finding?.evidence) && authority(finding));
    const missing = references(item?.missingSectionIndexes, report.missingRequiredSections || [], section =>
      hasText(section?.section) && Boolean(SOURCES[section?.source]) && hasText(section?.requirement));
    const notes = references(item?.verificationNoteIndexes, report.verificationNotes || [], note =>
      hasText(note?.issue) && authority(note) && (hasText(note?.evidence) || Boolean(SOURCES[note?.source])));
    const valid = validIdentity && !checks.items.some(check => usedChecks.has(check))
      && [checks, findings, missing, notes].every(refs => refs.valid);
    const supportedState = findings.items.length || missing.items.length ? 'ISSUE_RECORDED'
      : notes.items.length ? 'NEEDS_VERIFICATION' : checks.items.length ? 'EVIDENCE_RECORDED' : 'NOT_CHECKED';
    const status = valid && item.status === supportedState ? supportedState : 'NOT_CHECKED';
    if (status !== 'NOT_CHECKED') checks.items.forEach(check => usedChecks.add(check));
    return {
      key: `${item?.id || 'unknown'}-${index}`,
      requirement: hasText(item?.requirement) ? item.requirement : 'Review area details unavailable',
      source: SOURCES[item?.source], status,
      invalid: !valid || item?.status !== supportedState,
      checks: status !== 'NOT_CHECKED' ? checks.items : [],
      findings: status !== 'NOT_CHECKED' ? findings.items : [],
      missing: status !== 'NOT_CHECKED' ? missing.items : [],
      notes: status !== 'NOT_CHECKED' ? notes.items : []
    };
  });
}

export function AiReviewCoverage({ report, onOpenRecords }) {
  const coverage = report?.coverage;
  if (!coverage || !Array.isArray(coverage.criteria)) return (
    <section aria-label="Review coverage">
      <Text component="h3" size="sm" fw={700} m={0}>Review coverage</Text>
      <Text size="sm" c="dimmed" mt={4}>A requirement checklist was not recorded for this saved review.</Text>
    </section>
  );
  const rows = coverageRows(report);
  const omitted = Number.isInteger(coverage.omittedCriteria) && coverage.omittedCriteria >= 0
    ? coverage.omittedCriteria : 0;
  const supporting = rows.filter(row => ['EVIDENCE_RECORDED', 'ISSUE_RECORDED'].includes(row.status)).length;
  const manual = rows.filter(row => row.status === 'NEEDS_VERIFICATION').length;
  const unchecked = rows.filter(row => row.status === 'NOT_CHECKED').length + omitted;
  return (
    <section aria-label="Review coverage">
      <Stack gap="xs">
        <Text component="h3" size="sm" fw={700} m={0}>Review coverage</Text>
        {rows.length || omitted ? <>
          <Text size="sm">{supporting} of {rows.length + omitted} supplied review areas have supporting records.</Text>
          <Text size="sm">{manual} need manual verification · {unchecked} not checked</Text>
        </> : <Text size="sm">No applicable requirement checklist was available for this review.</Text>}
        <Text size="sm" c="dimmed">Evidence recorded means content was found. It does not confirm that a requirement is satisfied or that the submission is approved.</Text>
        {hasText(coverage.scopeNote) ? <Text size="sm" c="dimmed">{coverage.scopeNote}</Text> : null}
        {omitted ? <Text size="sm">{omitted} additional supplied review {omitted === 1 ? 'area was' : 'areas were'} outside this checklist and remain unchecked.</Text> : null}
        {rows.length ? <details className="wt-ai-evidence-group">
          <summary>See review areas ({rows.length})</summary>
          <Stack gap="md" mt="sm">
            {rows.map(row => <article key={row.key} className="wt-ai-review-row">
              <Text size="sm" fw={700} c={STATES[row.status][1]}>{STATES[row.status][0]}</Text>
              <Text fw={600} mt={4}>{row.requirement}</Text>
              {row.source ? <Text size="sm" className="wt-ai-review-reference">Source: {row.source}</Text> : null}
              {row.status === 'NOT_CHECKED' ? <Text size="sm" mt="xs">
                {row.invalid ? 'The saved checklist references could not be matched to this report. ' : ''}
                No supporting record was retained for this area. Review it in the original PDF.
              </Text> : <Stack gap="sm" mt="xs">
                {row.checks.map((check, index) => <CoverageRecord key={`check-${index}`} title={check.aspect}
                  label="Supporting observation" location={check.location} />)}
                {row.findings.map((finding, index) => <CoverageRecord key={`finding-${index}`} title={finding.title || finding.issue}
                  label="Recorded concern" location={finding.location} />)}
                {row.missing.map((section, index) => <Text key={`missing-${index}`} size="sm">Not located in the saved review: {section.section}. Confirm its presence or an equivalent section in the original PDF.</Text>)}
                {row.notes.map((note, index) => <CoverageRecord key={`note-${index}`} title={note.title || note.issue}
                  label="Item to verify" location={note.location} />)}
                {onOpenRecords ? <div>
                  {row.checks.length ? <Button variant="subtle" size="compact-sm" onClick={() => onOpenRecords('checks')}>Open supporting observations</Button> : null}
                  {row.findings.length || row.missing.length ? <Button variant="subtle" size="compact-sm" onClick={() => onOpenRecords('issues')}>Open recorded issues</Button> : null}
                  {row.notes.length ? <Button variant="subtle" size="compact-sm" onClick={() => onOpenRecords('notes')}>Open items to verify</Button> : null}
                </div> : null}
              </Stack>}
            </article>)}
          </Stack>
        </details> : null}
        {[1, 2].includes(coverage.completedPasses) && hasText(coverage.followupNotice)
          ? <Text size="sm" c="dimmed">{coverage.followupNotice}</Text> : null}
      </Stack>
    </section>
  );
}

function CoverageRecord({ title, label, location }) {
  const page = Number.isInteger(location?.page) && location.page > 0 ? `PDF page ${location.page}` : '';
  const section = hasText(location?.section) ? location.section : '';
  return <div>
    <Text size="sm">{label}: {title.length > 160 ? `${title.slice(0, 157)}…` : title}</Text>
    {page || section ? <Text size="sm" c="dimmed">{[page, section].filter(Boolean).join(' · ')}</Text> : null}
  </div>;
}
