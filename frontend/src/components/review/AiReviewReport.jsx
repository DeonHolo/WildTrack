import { useState } from 'react';
import { Alert, Button, Stack, Text } from '@mantine/core';
import { aiReviewEvidenceCount, aiReviewReportStatus, hasCompletedTemplateChecklist, verifiedAiChecks } from '../../lib/workflow.js';
import { AiReviewCoverage, AiReviewVerificationLimits, assessedEvidenceIndexes, validAssessmentCriteria } from './AiReviewCoverage.jsx';

const CHECK_SOURCE_LABELS = {
  DOCUMENT: 'Submitted document',
  DELIVERABLE_REQUIREMENTS: 'Deliverable requirements',
  OFFICIAL_TEMPLATE: 'Official template'
};
const LEGACY_VERIFICATION = /^Mapped-template (?:body heading|transaction artifact)/i;

export function AiReviewReport({ report, deliverableTitle = '', pdfUrl = '', reviewedOn = '' }) {
  if (!report) return null;
  const missingTemplate = report.limitations?.find(limit => typeof limit === 'string' && limit.startsWith('No official template was supplied'));
  const originalFindings = report.findings || legacyFindings(report.flags);
  const legacyNotes = originalFindings.filter(isLegacyVerification).map(legacyVerification);
  const allFindings = uniqueByClaim(originalFindings.filter(finding => !isLegacyVerification(finding)));
  const allNotes = uniqueByClaim([...(report.verificationNotes || []), ...legacyNotes]);
  const instructionRows = validAssessmentCriteria(report);
  const unverifiedCount = instructionRows.filter(row => row.assessment === 'UNVERIFIED').length;
  const checklistRows = instructionRows.filter(row => row.assessment !== 'UNVERIFIED');
  const linkedEvidence = assessedEvidenceIndexes(report);
  const mismatch = report.documentOverview?.wrongDocument === true;
  const collapseTemplateChecks = mismatch && !(Array.isArray(report.coverage?.criteria) ? report.coverage.criteria : [])
    .some(row => row?.assessment === 'APPEARS_ADDRESSED');
  const findings = uniqueByClaim(originalFindings.filter((finding, index) => !isLegacyVerification(finding)
    && (!linkedEvidence.findingIndexes.has(index) || mismatch && isIdentityMismatch(finding))));
  const allMissing = report.missingRequiredSections || legacyMissingSections(report.missingSections);
  const missing = allMissing.filter((item, index) => !linkedEvidence.missingSectionIndexes.has(index));
  const verificationNotes = uniqueByClaim((report.verificationNotes || []).filter((note, index) => !linkedEvidence.verificationNoteIndexes.has(index)).concat(legacyNotes));
  const allDiagramNotes = allNotes.filter(isDiagramPresenceNote);
  const manualCheckCount = allNotes.length - allDiagramNotes.length + (allDiagramNotes.length ? 1 : 0)
    + instructionRows.filter(row => row.assessment === 'CHECK_MANUALLY'
      && !(row.verificationNoteIndexes || []).some(index => linkedEvidence.verificationNoteIndexes.has(index))).length;
  const checks = verifiedAiChecks(report).filter(check => !findings.some(finding => sameCheck(finding, check)));
  const evidenceCount = aiReviewEvidenceCount(report);
  const grouped = groupGlossary(findings);
  const glossary = grouped.filter(group => group.terms);
  const templateRelated = item => ['OFFICIAL_TEMPLATE', 'DELIVERABLE_REQUIREMENTS'].includes(item.source)
    && !(mismatch && isIdentityMismatch(item));
  const templateCount = (report.coverage?.criteria?.length || 0) + (report.coverage?.omittedCriteria || 0)
    + findings.filter(templateRelated).length + missing.filter(templateRelated).length + verificationNotes.filter(templateRelated).length;
  const issueCount = allFindings.length + allMissing.length;
  const concernCount = groupGlossary(allFindings).filter(group => !group.terms).length + allMissing.length;
  const fixedChecklistComplete = hasCompletedTemplateChecklist(report);
  const reviewStatus = aiReviewReportStatus({ ...report, findings: allFindings, verificationNotes: allNotes });
  const noIssues = reviewStatus === 'No issues';
  const summary = [
    concernCount && `${concernCount} concern${concernCount === 1 ? '' : 's'}`,
    manualCheckCount && `${manualCheckCount} item${manualCheckCount === 1 ? '' : 's'} to check`,
    unverifiedCount && `${unverifiedCount} unverified observation${unverifiedCount === 1 ? '' : 's'}`,
    glossary.length && `${glossary.length} minor check${glossary.length === 1 ? '' : 's'}`
  ].filter(Boolean).join(' · ') || (fixedChecklistComplete
    ? `${instructionRows.length} template instruction${instructionRows.length === 1 ? '' : 's'} assessed`
    : `${evidenceCount} supported observation${evidenceCount === 1 ? '' : 's'}`);

  return (
    <Stack gap="lg" className="wt-ai-review-report">
      {missingTemplate ? <Alert color="orange" title="No official template" role="status">
        AI Review could not compare this PDF against an official template. Findings are limited to the available deliverable instructions and PDF content.
      </Alert> : null}
      <section aria-label="Document overview">
        <div className="wt-ai-review-overview-heading">
          <Text component="h3" fw={700}>Document overview</Text>
          {reviewedOn ? <Text className="wt-ai-review-reference wt-ai-review-date">{reviewedOn}</Text> : null}
        </div>
        {report.documentOverview?.wrongDocument === true && report.documentOverview.actualDocumentType ? (
          <Alert color="orange" role="status" mb="sm">
            This is {report.documentOverview.actualDocumentType}, <strong>NOT</strong> the required {deliverableTitle || 'document'}.
          </Alert>
        ) : null}
        <Text>{report.documentOverview?.text?.trim() || 'A document overview was not saved with this review. Run AI Review again to generate one.'}</Text>
      </section>
      <div className="wt-ai-review-outcome">
        <Text fw={700}>{reviewStatus}</Text>
        <Text mt={4} size="sm">{summary}</Text>
      </div>
      {!noIssues && !issueCount ? (
        <Alert color="orange" title="Needs attention" role="status">
          {manualCheckCount
            ? 'Confirm the items in the review checklist in the original PDF.'
            : 'The saved review left items unassessed. Check the PDF before making your review decision.'}
        </Alert>
      ) : noIssues ? (
        <Alert color="green" title="No issues identified in the checked areas" role="status">
          The AI did not flag concerns or items needing a manual check. This is advisory feedback, not approval.
        </Alert>
      ) : null}
      {unverifiedCount ? <Text size="sm" c="dimmed">WildTrack could not confirm the supporting text for {unverifiedCount} AI observation{unverifiedCount === 1 ? '' : 's'}. See Review notes.</Text> : null}
      {findings.length || missing.length || verificationNotes.length || checklistRows.length || report.coverage?.omittedCriteria > 0 ? (
        <section aria-label="Review checklist">
          <Text component="h3" fw={700}>Review checklist</Text>
          {renderChecklist(collapseTemplateChecks ? findings.filter(item => !templateRelated(item)) : findings,
            collapseTemplateChecks ? missing.filter(item => !templateRelated(item)) : missing,
            collapseTemplateChecks ? verificationNotes.filter(item => !templateRelated(item)) : verificationNotes, pdfUrl)}
          {collapseTemplateChecks && templateCount ? <details className="wt-ai-review-secondary">
            <summary>Template checks ({templateCount})</summary>
            {renderChecklist(findings.filter(templateRelated), missing.filter(templateRelated), verificationNotes.filter(templateRelated), pdfUrl)}
            <AiReviewCoverage report={report} showHeading={false} />
          </details> : !collapseTemplateChecks ? <AiReviewCoverage report={report} showHeading={false} /> : null}
        </section>
      ) : null}
      <details className="wt-ai-review-secondary">
        <summary>Review notes</summary>
        <AiReviewVerificationLimits report={report} />
        {report.limitations?.map((limit, index) => <Text key={index} size="sm" mt="sm">{limit}</Text>)}
      </details>
    </Stack>
  );
}

function renderChecklist(findings, missing, verificationNotes, pdfUrl) {
  const grouped = groupGlossary(findings);
  const concerns = grouped.filter(group => !group.terms);
  const glossary = grouped.filter(group => group.terms);
  const sectionNotes = verificationNotes.filter(note => sectionVerification(note));
  const diagramNotes = verificationNotes.filter(isDiagramPresenceNote);
  const artifactNotes = groupArtifactNotes(verificationNotes.filter(note => !sectionVerification(note) && !isDiagramPresenceNote(note)));
  const sharedSectionSource = missing[0]?.source && missing.every(item => item.source === missing[0].source) ? missing[0].source : null;
  return findings.length || missing.length || verificationNotes.length ? <ol className="wt-ai-review-checklist">
            {concerns.map((group, index) => <li key={`finding-${index}`}><FindingRow finding={group.finding} label="Concern" /></li>)}
            {missing.length ? <li><article className="wt-ai-review-row">
              <Text className="wt-ai-review-item-label">Check in PDF</Text>
              <h3>Check section coverage</h3>
              <Text>Confirm these sections or equivalent headings in the original PDF.</Text>
              <ul>{missing.map((item, index) => <li key={index}>{item.section || 'Unnamed required section'}
                {item.requirement && referenceKey(item.requirement) !== referenceKey(item.section)
                  ? <Evidence finding={{ requirement: item.requirement, source: item.source }} /> : null}
                {item.source && !sharedSectionSource ? <Text component="span" className="wt-ai-review-reference" size="sm"> — {CHECK_SOURCE_LABELS[item.source] || item.source}</Text> : null}
              </li>)}</ul>
              {sharedSectionSource ? <Text className="wt-ai-review-reference" size="sm">Source: {CHECK_SOURCE_LABELS[sharedSectionSource] || sharedSectionSource}</Text> : null}
            </article></li> : null}
            {sectionNotes.length ? <li><SectionVerificationRow notes={sectionNotes} /></li> : null}
            {diagramNotes.length ? <li><DiagramVerificationRow notes={diagramNotes} pdfUrl={pdfUrl} /></li> : null}
            {artifactNotes.map((group, index) => <li key={`note-${index}`}>{group.artifact
              ? <ArtifactVerificationRow group={group} />
              : <FindingRow finding={group.note} label="Check in PDF" />}</li>)}
            {glossary.map((group, index) => <li key={`glossary-${index}`}><GlossaryRow group={group} /></li>)}
          </ol> : null;
}

function FindingRow({ finding, label, hideRequirement = false }) {
  const explanation = finding.explanation || finding.issue || '';
  const title = finding.title;
  const nextAction = specificAction(finding);
  return (
    <article className="wt-ai-review-row">
      {label ? <Text className="wt-ai-review-item-label">{label}</Text> : null}
      {title ? <h3>{title}</h3> : null}
      {explanation && normalized(explanation) !== normalized(title) ? <Text size="sm" mt={6}>{explanation}</Text> : null}
      {nextAction ? <Text size="sm" mt="sm">{nextAction}</Text> : null}
      <Evidence finding={finding} hideRequirement={hideRequirement} />
    </article>
  );
}

function Evidence({ finding, hideRequirement = false }) {
  const sourceLabel = CHECK_SOURCE_LABELS[finding.source];
  const requirement = hideRequirement ? '' : finding.requirement;
  if (!finding.evidence && !requirement && !finding.location) return null;
  const location = [finding.location?.page && `PDF page ${finding.location.page}`, finding.location?.section].filter(Boolean).join(' · ');
  return (
    <details className="wt-ai-review-evidence">
      <summary>{finding.evidence ? 'View supporting text' : requirement ? 'View requirement' : 'View location'}{location ? ` · ${location}` : ''}</summary>
      <Stack gap="sm" mt="sm">
        {finding.evidence ? <Passage text={finding.evidence} quote /> : null}
        {requirement ? requirement.length > 160
          ? <Passage label={`Reference${sourceLabel ? ` · ${sourceLabel}` : ''}`} text={requirement} />
          : <Text className="wt-ai-review-reference" size="sm">Reference: {sourceLabel ? `${sourceLabel} · ` : ''}{requirement}</Text> : null}
      </Stack>
    </details>
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
    <Text className="wt-ai-review-item-label">Minor check</Text>
    <h3>Review glossary definitions</h3>
    <Text>Confirm whether {group.terms.join(', ')} need definitions in section {group.section}.</Text>
    <Evidence finding={{ requirement: group.findings[0].requirement, source: group.findings[0].source }} />
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
    <Text>The saved report could not locate these headings. Check the original PDF, including equivalent headings.</Text>
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

function artifactObservation(note) {
  const match = (note.explanation || note.issue || '').match(/^Text extraction could not verify ["'“]([^"'”]+)["'”] in (.+?)\. (?=Its label|No substantive|The matching label)/i);
  return match ? { artifact: match[1], context: match[2] } : null;
}

function isDiagramPresenceNote(note) {
  return /\b(?:diagram|wireframe)\b/i.test(artifactObservation(note)?.artifact || '');
}

function DiagramVerificationRow({ notes, pdfUrl }) {
  const locations = [];
  const references = [];
  const excerpts = [];
  for (const note of notes) {
    const observation = artifactObservation(note);
    const context = observation.context.replace(/^transaction ["'“](.*)["'”]$/i, '$1');
    const key = `${context}|${note.location?.page || ''}`;
    let location = locations.find(item => item.key === key);
    if (!location) { location = { key, context, page: note.location?.page, artifacts: [] }; locations.push(location); }
    if (!location.artifacts.includes(observation.artifact)) location.artifacts.push(observation.artifact);
    const referenceKey = [note.source || '', note.requirement || ''].join('|');
    if (note.requirement && !references.some(item => item.key === referenceKey)) references.push({ key: referenceKey, note });
    if (note.evidence && !excerpts.includes(note.evidence)) excerpts.push(note.evidence);
  }
  const locationRow = location => <>
    <Text fw={600}>{location.context}</Text>
    <Text size="sm">{location.artifacts.join(', ')}{location.page ? <> · {pdfUrl
      ? <a href={pdfUrl} target="_blank" rel="noreferrer" aria-label={`Open PDF and check page ${location.page}`}>PDF page {location.page}</a>
      : `PDF page ${location.page}`}</> : null}</Text>
  </>;
  return <article className="wt-ai-review-row">
    <h3>Check diagrams in the PDF</h3>
    <Text>Confirm the diagrams at the listed locations. Image detection does not verify their content.</Text>
    {locations.length === 1 ? locationRow(locations[0]) : null}
    <details className="wt-ai-review-evidence">
      <summary>{locations.length === 1 ? 'View supporting details' : `See locations to check (${locations.length})`}</summary>
      <Stack gap="sm" mt="sm">
        {locations.length > 1 ? <ul>{locations.map(location => <li key={location.key}>{locationRow(location)}</li>)}</ul> : null}
        {excerpts.map(text => <Passage key={text} text={text} quote />)}
        {references.map(({ key, note }) => <Passage key={key}
          label={`Reference${CHECK_SOURCE_LABELS[note.source] ? ` · ${CHECK_SOURCE_LABELS[note.source]}` : ''}`}
          text={note.requirement} />)}
      </Stack>
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
    <Text>The saved report could not confirm this artifact in the following locations. Check them in the original PDF.</Text>
    <ul>{group.contexts.map(context => <li key={context}>{context}</li>)}</ul>
    <Evidence finding={{ requirement: group.notes[0].requirement, source: group.notes[0].source }} />
    <details className="wt-ai-review-originals">
      <summary>Original artifact observations ({group.notes.length})</summary>
      <Stack gap="md" mt="sm">{group.notes.map((note, index) => <FindingRow key={index} finding={note} hideRequirement />)}</Stack>
    </details>
  </article>;
}

function Passage({ label, text, quote = false }) {
  const [full, setFull] = useState(false);
  const long = text.length > 420;
  const excerpt = long && !full ? `${text.slice(0, 420).replace(/\s+\S*$/, '')}…` : text;
  return (
    <div>
      {label ? <Text fw={600} size="sm">{label}</Text> : null}
      <Text component={quote ? 'blockquote' : 'p'} size="sm" mt={4}
        className={`wt-ai-review-passage${quote ? ' wt-ai-review-quote' : ''}`} aria-label="Evidence excerpt">{excerpt}</Text>
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
      <Evidence finding={{ evidence: check.documentEvidence, source: check.source, requirement: check.requirement, location: check.location }} />
    </article>
  );
}

function isLegacyVerification(finding) { return LEGACY_VERIFICATION.test(finding.issue || ''); }
function isIdentityMismatch(finding) {
  const text = `${finding.issue || ''} ${finding.explanation || ''} ${finding.title || ''}`;
  return /\b(?:instead of the required|rather than the required|not the (?:required|requested) document|(?:document|file|submission) type (?:does not match|mismatch))\b/i.test(text)
    || /\b(?:instead of|rather than)\s+(?:an?|the)\s+(?:[\p{L}-]+\s+){0,7}(?:specification|document|report|plan|proposal|instrument|questionnaire|deliverable)\b/iu.test(text);
}
function legacyVerification(finding) {
  const quoted = (finding.issue || '').match(/'([^']+)'/);
  const templateEvidence = /^(?:Mapped official-template|Mapped-template)/i.test(finding.evidence || '');
  return {
    ...finding, title: quoted ? `Verify ${quoted[1]}` : 'Verify template comparison',
    sectionCheck: /^Mapped-template body heading/i.test(finding.issue || '') ? quoted?.[1] : null,
    issue: 'This older text-based comparison requires confirmation in the original PDF.',
    nextAction: 'Confirm section applicability, equivalent headings, and graphical content in the original PDF.',
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
