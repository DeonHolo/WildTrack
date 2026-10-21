import { Text } from '@mantine/core';
import { verifiedAiChecks } from '../../lib/workflow.js';

const SOURCES = {
  DELIVERABLE_REQUIREMENTS: 'Deliverable requirements',
  OFFICIAL_TEMPLATE: 'Official template'
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

export function AiReviewCoverage({ report }) {
  const coverage = report?.coverage;
  const hasChecklist = Array.isArray(coverage?.criteria);
  const rows = hasChecklist ? coverageRows(report) : [];
  const unchecked = rows.filter(row => row.status === 'NOT_CHECKED');
  const omitted = Number.isInteger(coverage?.omittedCriteria) && coverage.omittedCriteria > 0
    ? coverage.omittedCriteria : 0;
  return <section aria-label="Saved review scope">
    <Text size="sm" mt="sm">This is a first-pass summary of selected checks, not a check of every PDF section or an approval.</Text>
    {!hasChecklist ? <Text size="sm" mt="sm">A requirement checklist was not recorded for this saved review.</Text>
      : !rows.length && !omitted ? <Text size="sm" mt="sm">No applicable requirement checklist was available for this review.</Text> : null}
    {unchecked.length ? <>
      <Text size="sm" mt="sm">No supporting record was saved for these selected template or instruction items:</Text>
      <ul>{unchecked.map(row => <li key={row.key}>{row.requirement}</li>)}</ul>
    </> : null}
    {rows.some(row => row.invalid) ? <Text size="sm" mt="sm">Some saved checklist references could not be matched to this report.</Text> : null}
    {omitted ? <Text size="sm" mt="sm">{omitted} additional template or instruction {omitted === 1 ? 'item was' : 'items were'} outside the saved checklist.</Text> : null}
    {[1, 2].includes(coverage?.completedPasses) && hasText(coverage?.followupNotice)
      ? <Text size="sm" mt="sm">{coverage.followupNotice}</Text> : null}
  </section>;
}
