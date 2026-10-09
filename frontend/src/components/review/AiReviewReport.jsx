import { useState } from 'react';
import { Alert, Button, Stack, Text } from '@mantine/core';
import { isInconclusiveAiReviewReport, verifiedAiChecks } from '../../lib/workflow.js';

const CHECK_SOURCE_LABELS = {
  DOCUMENT: 'Submitted document',
  DELIVERABLE_REQUIREMENTS: 'Deliverable requirements',
  OFFICIAL_TEMPLATE: 'Official template'
};
const LEGACY_VERIFICATION = /^Mapped-template (?:body heading|transaction artifact)/i;

export function AiReviewReport({ report }) {
  if (!report) return null;
  const originalFindings = report.findings || legacyFindings(report.flags);
  const legacyNotes = originalFindings.filter(isLegacyVerification).map(legacyVerification);
  const findings = uniqueByClaim(originalFindings.filter(finding => !isLegacyVerification(finding)));
  const missing = report.missingRequiredSections || legacyMissingSections(report.missingSections);
  const sharedSectionSource = missing[0]?.source && missing.every(item => item.source === missing[0].source)
    ? missing[0].source : null;
  const verificationNotes = uniqueByClaim([...(report.verificationNotes || []), ...legacyNotes]);
  const sectionNotes = verificationNotes.filter(note => sectionVerification(note));
  const artifactNotes = groupArtifactNotes(verificationNotes.filter(note => !sectionVerification(note)));
  const checks = verifiedAiChecks(report).filter(check => !findings.some(finding => sameCheck(finding, check)));
  const issueCount = findings.length + missing.length;
  const glossary = groupGlossary(findings);
  const reviewAreaCount = glossary.length + (missing.length ? 1 : 0);
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
        <Text fw={700}>{outcome}</Text>
        <Text mt={4} size="sm">
          {issueCount} recorded issue{issueCount === 1 ? '' : 's'} in {reviewAreaCount} review area{reviewAreaCount === 1 ? '' : 's'} · {verificationNotes.length} to verify
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
        <section aria-label="Issues to review">
          <Stack gap="md">
            {glossary.filter(group => !group.terms).map((group, index) => <FindingRow key={`finding-${index}`} finding={group.finding} />)}
            {missing.length ? <article className="wt-ai-review-row">
              <h3>Check section coverage</h3>
              <Text>The saved report could not locate these required sections. Confirm their presence or equivalent headings in the PDF before requesting changes.</Text>
              <ul>{missing.map((item, index) => <li key={index}>{item.section || 'Unnamed required section'}
                {item.requirement && referenceKey(item.requirement) !== referenceKey(item.section)
                  ? <Text className="wt-ai-review-reference" size="sm">Reference: {item.requirement}</Text> : null}
                {item.source && !sharedSectionSource ? <Text component="span" className="wt-ai-review-reference" size="sm"> — {CHECK_SOURCE_LABELS[item.source] || item.source}</Text> : null}
              </li>)}</ul>
              {sharedSectionSource ? <Text className="wt-ai-review-reference" size="sm">Reference: {CHECK_SOURCE_LABELS[sharedSectionSource] || sharedSectionSource}</Text> : null}
            </article> : null}
            {glossary.filter(group => group.terms).map((group, index) => <GlossaryRow key={`glossary-${index}`} group={group} />)}
          </Stack>
        </section>
      ) : null}
      {verificationNotes.length ? (
        <details className="wt-ai-review-secondary">
          <summary>Verify in PDF ({verificationNotes.length})</summary>
          <Text size="sm" mt="sm">These observations require confirmation before requesting a revision.</Text>
          <Stack gap="md" mt="sm">
            {sectionNotes.length ? <SectionVerificationRow notes={sectionNotes} /> : null}
            {artifactNotes.map((group, index) => group.artifact
              ? <ArtifactVerificationRow key={`artifact-${index}`} group={group} />
              : <FindingRow key={`note-${index}`} finding={group.note} />)}
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

function FindingRow({ finding }) {
  const explanation = finding.explanation || finding.issue || '';
  const title = finding.title;
  const nextAction = specificAction(finding);
  return (
    <article className="wt-ai-review-row">
      {title ? <h3>{title}</h3> : null}
      {explanation && normalized(explanation) !== normalized(title) ? <Text size="sm" mt={6}>{explanation}</Text> : null}
      {nextAction ? <Text size="sm" mt="sm">{nextAction}</Text> : null}
      <Evidence finding={finding} />
    </article>
  );
}

function Evidence({ finding }) {
  const sourceLabel = CHECK_SOURCE_LABELS[finding.source];
  if (!finding.evidence && !finding.requirement && !finding.location) return null;
  return (
    <div className="wt-ai-review-evidence">
        <Stack gap="md" mt="sm">
          {finding.evidence ? <Passage label="Submitted document" text={finding.evidence} /> : null}
          {finding.requirement ? finding.requirement.length > 160
            ? <Passage label={sourceLabel ? `Reference: ${sourceLabel}` : 'Reference'} text={finding.requirement} />
            : <Text className="wt-ai-review-reference" size="sm">Reference: {sourceLabel ? `${sourceLabel} · ` : ''}{finding.requirement}</Text> : null}
          {finding.location?.page || finding.location?.section ? (
            <Text size="sm" className="wt-ai-review-reference">
              Location: {[finding.location.page && `page ${finding.location.page}`, finding.location.section].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </Stack>
    </div>
  );
}

function glossaryTerm(finding) {
  const issue = finding.explanation || finding.issue || '';
  const term = issue.match(/\b(?:acronym|abbreviation)\s+["'“]?([a-z0-9-]+)["'”]?\s+/i)?.[1];
  const section = issue.match(/\bsection\s+(\d+(?:\.\d+)+)\b/i)?.[1];
  if (!term || !/^[A-Z][A-Z0-9-]{1,14}$/.test(term) || !section || !/not\s+defined|undefined/i.test(issue)) return null;
  return { term, section };
}

function specificAction(finding) {
  const action = finding.nextAction || '';
  return [
    'Review the cited evidence and decide whether a revision is needed.',
    'Open the submitted PDF and confirm this area before requesting a revision.',
    'Open the original PDF and confirm this observation before requesting a revision.',
    'Review the cited passage and decide whether a revision is needed.',
    'Compare the cited document evidence with the requirement before requesting a revision.'
  ].some(generic => normalized(action) === normalized(generic)) ? '' : action;
}

function groupGlossary(findings) {
  const groups = [];
  for (const finding of findings) {
    const parsed = glossaryTerm(finding);
    if (!parsed || !finding.requirement) { groups.push({ finding }); continue; }
    const key = [finding.source || '', referenceKey(finding.requirement), parsed.section].join('|');
    let group = groups.find(item => item.key === key);
    if (!group) { group = { key, section: parsed.section, terms: [], findings: [] }; groups.push(group); }
    if (!group.terms.includes(parsed.term)) group.terms.push(parsed.term);
    group.findings.push(finding);
  }
  return groups;
}

function GlossaryRow({ group }) {
  return <article className="wt-ai-review-row">
    <h3>Small correction: review glossary definitions</h3>
    <Text>The report flags {group.terms.join(', ')} as undefined in section {group.section}. Check these terms together, including whether each is actually an acronym or abbreviation.</Text>
    <Evidence finding={{ requirement: group.findings[0].requirement, source: group.findings[0].source }} />
    <details className="wt-ai-review-originals">
      <summary>Original glossary observations ({group.findings.length})</summary>
      <Stack gap="md" mt="sm">{group.findings.map((finding, index) => <FindingRow key={index} finding={finding} />)}</Stack>
    </details>
  </article>;
}

function sectionVerification(note) {
  return (note.explanation || note.issue || '').match(/^The required section ["'“]([^"'”]+)["'”] could not be located\.?$/i)?.[1]
    || note.sectionCheck || null;
}

function SectionVerificationRow({ notes }) {
  const sharedSource = notes[0].source && notes.every(note => note.source === notes[0].source) ? notes[0].source : null;
  return <article className="wt-ai-review-row">
    <h3>Verify section coverage in the PDF</h3>
    <Text>The saved report could not locate these headings. Check the original PDF, including equivalent headings, before requesting changes.</Text>
    <ul>{notes.map((note, index) => <li key={index}>
      {sectionVerification(note)}
      {note.source && !sharedSource ? <span className="wt-ai-review-reference"> — {CHECK_SOURCE_LABELS[note.source] || note.source}</span> : null}
    </li>)}</ul>
    {sharedSource ? <Text className="wt-ai-review-reference" size="sm">Reference: {CHECK_SOURCE_LABELS[sharedSource] || sharedSource}</Text> : null}
    <details className="wt-ai-review-originals">
      <summary>Original section observations ({notes.length})</summary>
      <Stack gap="md" mt="sm">{notes.map((note, index) => <FindingRow key={index} finding={note} />)}</Stack>
    </details>
  </article>;
}

function groupArtifactNotes(notes) {
  const groups = [];
  for (const note of notes) {
    const match = (note.explanation || note.issue || '').match(/^Text extraction could not verify ["'“]([^"'”]+)["'”] in (.+?)\. (?=Its label|No substantive|The matching label)/i);
    if (!match || !note.requirement) { groups.push({ note }); continue; }
    const [, artifact, context] = match;
    const key = [note.source || '', referenceKey(note.requirement), artifact.toLocaleLowerCase()].join('|');
    let group = groups.find(item => item.key === key);
    if (!group) { group = { key, artifact, notes: [], contexts: [] }; groups.push(group); }
    group.notes.push(note);
    if (!group.contexts.includes(context)) group.contexts.push(context);
  }
  return groups;
}

function ArtifactVerificationRow({ group }) {
  return <article className="wt-ai-review-row">
    <h3>Verify {group.artifact} in the PDF</h3>
    <Text>The saved report could not confirm this artifact in the following locations. Check them in the original PDF before requesting changes.</Text>
    <ul>{group.contexts.map(context => <li key={context}>{context}</li>)}</ul>
    <Evidence finding={{ requirement: group.notes[0].requirement, source: group.notes[0].source }} />
    <details className="wt-ai-review-originals">
      <summary>Original artifact observations ({group.notes.length})</summary>
      <Stack gap="md" mt="sm">{group.notes.map((note, index) => <FindingRow key={index} finding={note} />)}</Stack>
    </details>
  </article>;
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
      <Text size="sm" className="wt-ai-review-reference">{CHECK_SOURCE_LABELS[check.source] || 'Submitted document'}</Text>
      <Evidence finding={{ evidence: check.documentEvidence, requirement: check.requirement, location: check.location }} />
    </article>
  );
}

function isLegacyVerification(finding) { return LEGACY_VERIFICATION.test(finding.issue || ''); }
function legacyVerification(finding) {
  const quoted = (finding.issue || '').match(/'([^']+)'/);
  const templateEvidence = /^(?:Mapped official-template|Mapped-template)/i.test(finding.evidence || '');
  return {
    ...finding, title: quoted ? `Verify ${quoted[1]}` : 'Verify template comparison',
    sectionCheck: /^Mapped-template body heading/i.test(finding.issue || '') ? quoted?.[1] : null,
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
function referenceKey(text) { return String(text || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim(); }
function legacyFindings(flags) { return (flags || []).map(issue => ({ issue: String(issue), source: '', evidence: '' })); }
function legacyMissingSections(sections) { return (sections || []).map(section => ({ section: String(section), source: '', requirement: '' })); }
