import { Group, Text, VisuallyHidden } from '@mantine/core';
import { AiReviewVerificationHelp } from './AiReviewHelp.jsx';
import { formatTemplateInstruction } from '../../lib/templateInstructionText.js';
import { aiReviewAssessment, hasSeparateAiReference } from '../../lib/workflow.js';

const SOURCES = { DOCUMENT: 'Submitted document', DELIVERABLE_REQUIREMENTS: 'Deliverable requirements', OFFICIAL_TEMPLATE: 'Official template' };
const ASSESSMENTS = new Set(['APPEARS_ADDRESSED', 'NEEDS_ATTENTION', 'CHECK_MANUALLY', 'NOT_APPLICABLE', 'UNVERIFIED']);
const STATUS_LABELS = { APPEARS_ADDRESSED: 'Appears addressed', NEEDS_ATTENTION: 'Needs attention', CHECK_MANUALLY: 'Check in PDF', NOT_APPLICABLE: 'Not applicable', UNVERIFIED: 'Unverified observation' };
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const validPage = location => Number.isInteger(location?.page) && location.page > 0;

export function validAssessmentCriteria(report) {
  const criteria = report?.coverage?.criteria;
  if (!Array.isArray(criteria)) return [];
  const counts = new Map();
  for (const item of criteria) counts.set(item?.id, (counts.get(item?.id) || 0) + 1);
  return criteria.map(aiReviewAssessment).map((item, index) => {
    const assessment = item?.assessment;
    const valid = /^[CT][1-9]\d*$/.test(item?.id || '') && counts.get(item.id) === 1
      && hasText(item.requirement) && Object.hasOwn(SOURCES, item.source) && item.source !== 'DOCUMENT'
      && ASSESSMENTS.has(assessment) && hasText(item.explanation) && item.explanation.length <= 1000
      && (assessment !== 'APPEARS_ADDRESSED' || hasSeparateAiReference(item) || (hasText(item.documentEvidence) && validPage(item.location)));
    return valid ? { ...item, key: `${item.id}-${index}` } : null;
  }).filter(Boolean);
}

export function assessedEvidenceIndexes(report) {
  const linked = { findingIndexes: new Set(), verificationNoteIndexes: new Set(), missingSectionIndexes: new Set() };
  for (const criterion of validAssessmentCriteria(report)) {
    for (const key of Object.keys(linked)) {
      const indexes = criterion[key];
      const items = key === 'findingIndexes' ? report.findings
        : key === 'missingSectionIndexes' ? report.missingRequiredSections : report.verificationNotes;
      if (!Array.isArray(indexes) || !Array.isArray(items) || new Set(indexes).size !== indexes.length) continue;
      indexes.filter(index => Number.isInteger(index) && index >= 0 && index < items.length
        && items[index]?.source === criterion.source
        && String(items[index]?.requirement || '').trim() === String(criterion.requirement).trim())
        .forEach(index => linked[key].add(index));
    }
  }
  return linked;
}

function compactRequirement(requirement) {
  const words = requirement.trim().split(/\s+/);
  return words.length > 10 ? `${words.slice(0, 10).join(' ')}…` : requirement;
}

function AssessmentRow({ row, report }) {
  const clean = value => value.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').trim();
  const label = clean(hasText(row.title) ? row.title : compactRequirement(row.requirement));
  const linkedFindings = Array.isArray(row.findingIndexes) && Array.isArray(report?.findings)
    ? row.findingIndexes.filter(index => Number.isInteger(index) && index >= 0 && index < report.findings.length)
      .map(index => report.findings[index]).filter(finding => finding?.source === row.source
        && String(finding.requirement || '').trim() === String(row.requirement).trim()) : [];
  const linkedNotes = (Array.isArray(row.verificationNoteIndexes) ? row.verificationNoteIndexes : []).map(index => report?.verificationNotes?.[index])
    .filter(note => note?.source === row.source && String(note.requirement || '').trim() === String(row.requirement).trim());
  const linkedMissing = (Array.isArray(row.missingSectionIndexes) ? row.missingSectionIndexes : []).map(index => report?.missingRequiredSections?.[index])
    .filter(item => item?.source === row.source && String(item.requirement || '').trim() === String(row.requirement).trim());
  const excerpts = (Array.isArray(row.documentExcerpts) ? row.documentExcerpts : []).filter(item => hasText(item?.text) && validPage(item.location));
  const excerptPages = [...new Set(excerpts.map(item => item.location.page))];
  const location = validPage(row.location) ? row.location : null;
  const page = location ? `p. ${location.page}` : excerptPages.length ? `p. ${excerptPages.join(', ')}` : '';
  const instruction = formatTemplateInstruction(row.requirement);
  return <details className="wt-ai-review-assessment-row">
    <summary className="wt-ai-review-assessment-summary">
      <VisuallyHidden>{STATUS_LABELS[row.assessment]}. </VisuallyHidden>
      {page ? <span className="wt-ai-review-assessment-page">{page}</span> : null}
      <span className="wt-ai-review-assessment-title">{label} <span className="wt-ai-review-assessment-explanation">— <AssessmentExplanation row={row} /></span></span>
    </summary>
    <div className="wt-ai-review-assessment-details">
      <Text component="p" style={{ whiteSpace: 'pre-line' }}><strong>Instruction:</strong> {instruction}</Text>
      {linkedFindings.map((finding, index) => {
        const concern = finding.issue || finding.explanation || 'Review the linked finding.';
        return concern.trim() === row.explanation.trim() ? null : <Text key={index} component="p"><strong>Linked concern:</strong> {concern}</Text>;
      })}
      {linkedFindings.map((finding, index) => hasText(finding.evidence) && finding.evidence !== row.documentEvidence ? <LinkedExcerpt key={`evidence-${index}`} text={finding.evidence} location={finding.location} /> : null)}
      {linkedNotes.map((note, index) => <div key={`note-${index}`}>{note.issue?.trim() !== row.explanation.trim() ? <Text>{note.issue}</Text> : null}{hasText(note.evidence) && note.evidence !== row.documentEvidence ? <LinkedExcerpt text={note.evidence} location={note.location} /> : null}</div>)}
      {linkedMissing.map((item, index) => <Text key={`missing-${index}`}>Confirm the required section: {item.section}</Text>)}
      {hasText(row.documentEvidence) ? <Text component="blockquote" className="wt-ai-review-passage wt-ai-review-quote" aria-label="Evidence excerpt">{row.documentEvidence}</Text> : null}
      {excerpts.map((item, index) => <LinkedExcerpt key={`source-part-${index}`} text={item.text} location={item.location} />)}
      {!excerpts.length ? <Text component="p" className="wt-ai-review-reference"><strong>Source:</strong> {location
        ? <>Submitted PDF · page {location.page}{hasText(location.section) ? ` · ${location.section}` : ''}</>
        : row.evidenceVerification?.status === 'NOT_PROVIDED' ? 'No supporting quotation supplied by Gemini.'
          : row.evidenceVerification?.status === 'LOCATED' ? 'Submitted PDF · page not established'
            : 'Matching PDF text was not located.'}</Text> : null}
    </div>
  </details>;
}

function AssessmentExplanation({ row }) {
  const marker = 'Unverified AI observation:';
  const split = row.assessment === 'UNVERIFIED' ? row.explanation.indexOf(marker) : -1;
  return split < 0 ? row.explanation : <>{row.explanation.slice(0, split).trim()}
    <span style={{ display: 'block', marginTop: 4 }}>{row.explanation.slice(split)}</span>
  </>;
}

function LinkedExcerpt({ text, location }) {
  return <div>
    <Text component="blockquote" className="wt-ai-review-passage wt-ai-review-quote" aria-label="Linked evidence excerpt">{text}</Text>
    <Text component="cite" display="block" className="wt-ai-review-reference">{validPage(location)
      ? `Submitted PDF · page ${location.page}${hasText(location.section) ? ` · ${location.section}` : ''}`
      : 'Submitted PDF page not established'}</Text>
  </div>;
}

export function AiReviewCoverage({ report, showHeading = true }) {
  const criteria = report?.coverage?.criteria;
  if (!Array.isArray(criteria)) return null;
  const rows = validAssessmentCriteria(report);
  const newFormat = criteria.some(item => ASSESSMENTS.has(item?.assessment));
  const missing = newFormat ? criteria.filter(item => hasText(item?.requirement) && !ASSESSMENTS.has(item?.assessment)) : [];
  const actionable = rows.filter(row => ['NEEDS_ATTENTION', 'CHECK_MANUALLY'].includes(row.assessment));
  const positive = rows.filter(row => row.assessment === 'APPEARS_ADDRESSED');
  const notApplicable = rows.filter(row => row.assessment === 'NOT_APPLICABLE');
  const omitted = Number.isInteger(report.coverage.omittedCriteria) && report.coverage.omittedCriteria > 0 ? report.coverage.omittedCriteria : 0;
  if (!actionable.length && !positive.length && !notApplicable.length && !missing.length && !omitted) return null;
  return <section aria-label="Template and instruction assessment">
    {showHeading ? <Text component="h3" fw={700}>Review checklist</Text> : null}
    {actionable.map(row => <AssessmentRow key={row.key} row={row} report={report} />)}
    {missing.map((item, index) => <AssessmentRow key={`missing-${index}`} row={{ ...item, key: `missing-${index}`, assessment: 'CHECK_MANUALLY', explanation: 'No explicit assessment was saved for this instruction.' }} report={report} />)}
    {positive.length ? <details className="wt-ai-review-secondary wt-ai-review-positive-assessments"><summary>Appears addressed ({positive.length})</summary>
      {positive.map(row => <AssessmentRow key={row.key} row={row} report={report} />)}</details> : null}
    {notApplicable.length ? <details className="wt-ai-review-secondary"><summary>Not applicable ({notApplicable.length})</summary>
      {notApplicable.map(row => <AssessmentRow key={row.key} row={row} report={report} />)}</details> : null}
    {omitted ? <Text mt="sm">{omitted} additional template or instruction {omitted === 1 ? 'item was' : 'items were'} outside the saved checklist.</Text> : null}
  </section>;
}

export function AiReviewVerificationLimits({ report }) {
  const criteria = validAssessmentCriteria(report);
  const rows = criteria.filter(row => row.assessment !== 'NOT_APPLICABLE'
    && ['NOT_LOCATED', 'NOT_PROVIDED'].includes(row.evidenceVerification?.status));
  const legacy = criteria.filter(row => row.assessment === 'UNVERIFIED');
  if (!rows.length && !legacy.length) return null;
  return <section aria-label="Supporting reference notes">
    <Group gap={4} mt="sm"><Text component="h3" fw={700}>Supporting references ({rows.length + legacy.length})</Text><AiReviewVerificationHelp /></Group>
    <Text mt="sm">WildTrack could not locate supporting PDF text for these AI assessments. Their checklist categories reflect Gemini’s judgment, not quotation matching.</Text>
    {rows.length ? <ul>{rows.map(row => <li key={row.key}>{hasText(row.title) ? row.title : compactRequirement(row.requirement)}</li>)}</ul> : null}
    {legacy.length ? <Text mt="sm">{legacy.length} earlier assessment{legacy.length === 1 ? ' has' : 's have'} no recoverable original judgment. Run AI Review again to replace the earlier result.</Text> : null}
  </section>;
}
