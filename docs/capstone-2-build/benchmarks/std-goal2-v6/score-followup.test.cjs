'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validatePlan, HERE } = require('./freeze-followup.cjs');
const { score, verifyAudit, validateNarrative, narrativeAtoms, ratio,
  validateTransport, validateProviderResponseId, checkAvailabilityBudget, AUDIT_METHOD } = require('./score-followup.cjs');

const prepared = validatePlan();
const fixture = prepared.fixtures.find(f => f.fixture_id === 'G2-01');
const HASH = '4'.repeat(64);
const report = () => ({
  summary: 'Review the submitted PDF.',
  findings: [{
    issue: 'The document identifies the fictional project as QueueBoard.',
    source: 'DOCUMENT',
    evidence: 'Project: QueueBoard | Synthetic case: QueueBoard',
    requirement: ''
  }],
  missingRequiredSections: [],
  limitations: ['This review cannot authenticate fictional software execution.'],
  suggestedAction: 'Check the cited document fact.'
});

function annotated(text, classification = 'BOILERPLATE') {
  return narrativeAtoms(text).map(atom => ({
    ...atom, classification,
    notes: 'This is a generic review instruction, not a novel claim about PDF content.'
  }));
}

function auditFor(value = report()) {
  return {
    fixture_id: 'G2-01', final_report_sha256: HASH,
    decisions: [{
      decision_id: 'false-incompleteness', observed: 'absent',
      report_reference: 'full_report', full_report_examined: true,
      notes: 'Read the entire final report, not just model raw output: no empty-approach allegation.',
      audit_method: AUDIT_METHOD
    }],
    claims: [{
      claim_id: 'G2-01-F0', report_reference: 'findings[0]',
      text: value.findings[0].issue, substantive: true, source_status: 'SOURCE_SUPPORTED',
      source_kind: 'pdf', source_excerpt: 'Project: QueueBoard', source_reference: 'source-text/G2-01.txt, cover',
      source_assessment: 'The separate fictional PDF cover expressly names QueueBoard; this narrow claim does not assert a real student system.',
      notes: 'Audited against the entire PDF; project name is a document fact, not an official-template identity requirement.',
      audit_method: AUDIT_METHOD
    }],
    claim_inventory: {
      complete: true, final_report_sha256: HASH, method: AUDIT_METHOD,
      narrative_segments: {
        summary: annotated(value.summary),
        suggestedAction: annotated(value.suggestedAction)
      },
      notes: 'The summary is generic review text, and suggestedAction merely asks readers to examine cited evidence, not a new requirement.'
    }
  };
}

test('before any actual frozen v6 request, fixed ten-case denominator exists but NO fabricated score', () => {
  const result = score();
  assert.equal(result.status, 'NOT_FROZEN_NO_PROVIDER_RESULTS');
  assert.deepEqual(result.fresh_run_coverage, { numerator: 0, denominator: 10, value: 0 });
  assert.deepEqual(result.attempted_case_coverage, { numerator: 0, denominator: 10, value: 0 });
  assert.equal(result.gate.frozen_decision_denominator, 10);
  assert.equal(result.checklist_agreement.value, null);
  assert.equal(result.claim_traceability.value, null);
  assert.equal(result.attempt_outcomes.not_attempted, 10);
  assert.equal(result.unsupported_claims, null);
  assert.equal(result.gate.no_independent_human_reference_claimed, true);
  assert.equal(result.case_results.every(c => !c.audited), true);
});

test('narrative splitting uses exact character offsets and never ignores substantive text', () => {
  const atoms = narrativeAtoms('First claim.  Second claim;\nThird claim.');
  assert.deepEqual(atoms.map(a => [a.start, a.end]), [[0, 14], [14, 28], [28, 40]]);
  assert.equal(atoms.map(a => a.text).join(''), 'First claim.  Second claim;\nThird claim.');
  assert.deepEqual(narrativeAtoms(' \n '), []);
});

test('actual final structured finding and both narrative fields need source-audited complete inventory', () => {
  const r = report();
  const audited = auditFor(r);
  const valid = verifyAudit(audited, r, fixture, prepared, HASH);
  assert.equal(valid.decisions.correct, 1);
  assert.equal(valid.decisions.adjudicable, 1);
  assert.equal(valid.claims.supported, 1);
  assert.equal(valid.claims.total, 1);
  assert.equal(valid.claims.unassessable, 0);
  const missingAction = structuredClone(audited);
  missingAction.claim_inventory.narrative_segments.suggestedAction = [];
  assert.throws(() => verifyAudit(missingAction, r, fixture, prepared, HASH),
    /suggestedAction.*each textual assertion/);
  const missingFinding = structuredClone(audited);
  missingFinding.claims = [];
  assert.throws(() => verifyAudit(missingFinding, r, fixture, prepared, HASH),
    /unexamined or duplicated FINAL findings\[0\]/);
  const wrongFinalHash = structuredClone(audited);
  wrongFinalHash.final_report_sha256 = '0'.repeat(64);
  assert.throws(() => verifyAudit(wrongFinalHash, r, fixture, prepared, HASH),
    /complete post-run source audit/);
  assert.equal(verifyAudit(audited, r, fixture, prepared, HASH).claims.total, 1);
});

test('a plausible-looking provider quotation alone NEVER auto-approves a substantive source claim', () => {
  const r = report();
  const invalid = auditFor(r);
  invalid.claims[0].source_assessment = '';
  assert.throws(() => verifyAudit(invalid, r, fixture, prepared, HASH),
    /separately reasoned semantic assessment/);
  const fake = auditFor(r);
  fake.claims[0].source_excerpt = 'This statement was invented by a provider and is not in the real PDF.';
  assert.throws(() => verifyAudit(fake, r, fixture, prepared, HASH),
    /source quote not in SHA-bound input/);
  const type = auditFor(r);
  type.claims[0].source_kind = 'official_template';
  type.claims[0].source_excerpt = 'Project: SampleHarbor';
  assert.throws(() => verifyAudit(type, r, fixture, prepared, HASH),
    /audit source type contradicts/);
});

test('genuine unsupported and uncertain claims remain in the conservative total-claims denominator', () => {
  const r = report();
  r.findings.push({ issue: 'The fictional project must be named SampleHarbor.',
    source: 'DOCUMENT', evidence: 'Page 1', requirement: '' });
  r.missingRequiredSections.push({
    section: 'Unverifiable universal certification', source: 'DOCUMENT',
    evidence: 'no evidence', requirement: ''
  });
  const audited = auditFor(r);
  audited.claims.push({
    claim_id: 'G2-01-F1', report_reference: 'findings[1]',
    text: r.findings[1].issue, substantive: true, source_status: 'UNSUPPORTED',
    source_kind: 'none', notes: 'Template example project is not a mandatory identity for the submitted file.',
    audit_method: AUDIT_METHOD
  }, {
    claim_id: 'G2-01-M0', report_reference: 'missingRequiredSections[0]',
    text: r.missingRequiredSections[0].section, substantive: true, source_status: 'UNASSESSABLE',
    source_kind: 'none', notes: 'No supplied authority proves universal requirement or omission; cannot assess.',
    audit_method: AUDIT_METHOD
  });
  const result = verifyAudit(audited, r, fixture, prepared, HASH);
  assert.deepEqual({ total: result.claims.total, supported: result.claims.supported,
    unsupported: result.claims.unsupported, uncertain: result.claims.unassessable },
  { total: 3, supported: 1, unsupported: 1, uncertain: 1 });
  assert.deepEqual(ratio(result.claims.supported, result.claims.total),
    { numerator: 1, denominator: 3, value: 1 / 3 });
});

test('a no-template case can NEVER cite the synthetic mapped template as a supported requirement', () => {
  const noTemplate = prepared.fixtures.find(f => f.fixture_id === 'G2-09');
  const item = report();
  const audit = auditFor(item);
  audit.fixture_id = noTemplate.fixture_id;
  audit.decisions[0].decision_id = 'no-template-no-invented-mandate';
  audit.claims[0].source_kind = 'official_template';
  audit.claims[0].source_excerpt = 'Project: SampleHarbor';
  assert.throws(() => verifyAudit(audit, item, noTemplate, prepared, HASH),
    /cannot cite an official template absent/);
});

test('claiming an absent required section requires a separate whole-document absence audit', () => {
  const r = report();
  r.findings[0].issue = 'The required Test Approach section is missing.';
  const audited = auditFor(r);
  audited.claims[0].text = r.findings[0].issue;
  assert.throws(() => verifyAudit(audited, r, fixture, prepared, HASH),
    /positive quote cannot independently prove an absence/);
});

test('fake old Goal 2 v3 frozen file cannot be accepted as the new v6 follow-up', () => {
  const archived = path.resolve(HERE, '../std/results/goal2-20260921/frozen-key.json');
  assert.throws(() => score({ freezePath: archived }), /Wrong v6 project reference freeze/);
});

test('one-shot actual transport: cache, zero requests, retry and absent raw/final hashes cannot count as fresh', () => {
  const success = {
    outcome: 'fresh_success', generation_requests_sent: 1,
    request_payload_sha256: '1'.repeat(64), response_http_status: 200,
    cache_status: 'MISS', provider: 'Google Gemini',
    scope: 'Genuine provider + actual production postprocessing, synthetic PDF; no Drive/UI/cache',
    raw_provider_sha256: '2'.repeat(64), raw_report_sha256: '3'.repeat(64),
    production_filtered_report_sha256: '4'.repeat(64)
  };
  assert.deepEqual(validateTransport(success, 'G2-01'),
    { fresh: true, requestsSent: 1, httpStatus: 200 });
  for (const partial of [
    { generation_requests_sent: 0 }, { generation_requests_sent: 2 },
    { response_http_status: 503 }, { cache_status: 'HIT' },
    { raw_provider_sha256: null }, { raw_report_sha256: null },
    { production_filtered_report_sha256: null },
    { scope: 'raw Gemini provider only; no production postprocessing' }
  ]) {
    assert.throws(() => validateTransport({ ...success, ...partial }, 'G2-01'),
      /one-shot|fresh success|SHA/);
  }
  assert.deepEqual(validateTransport({
    outcome: 'outcome_unknown', generation_requests_sent: 1,
    response_http_status: 503, request_payload_sha256: '1'.repeat(64),
    cache_status: 'NOT_ESTABLISHED'
  }, 'G2-03'), { fresh: false, requestsSent: 1, httpStatus: 503 });
  assert.throws(() => validateTransport({ ...success, outcome: 'quota_failure' },
    'G2-02'), /unsuccessful\/nonfresh attempt/);
});

test('Google provider responseId is distinct from HTTP request ID and must match actual raw response body', () => {
  assert.equal(validateProviderResponseId({ responseId: 'actual-Gemini-responseId' },
    { provider_response_id: 'actual-Gemini-responseId',
      provider_request_id_header: null }), 'actual-Gemini-responseId');
  assert.throws(() => validateProviderResponseId({}, { provider_response_id: 'invented' }),
    /no responseId/);
  assert.throws(() => validateProviderResponseId({ responseId: 'actual' },
    { provider_response_id: 'invented' }), /responseId differs/);
});

test('two HTTP 429/503 availability failures stop remaining scheduled cases, never hide failed denominator', () => {
  assert.equal(checkAvailabilityBudget([
    { id: 'G2-01', time: 10, httpStatus: 200 },
    { id: 'G2-02', time: 20, httpStatus: 503 },
    { id: 'G2-03', time: 30, httpStatus: 429 }
  ]), 2);
  assert.throws(() => checkAvailabilityBudget([
    { id: 'G2-04', time: 40, httpStatus: 200 },
    { id: 'G2-03', time: 30, httpStatus: 429 },
    { id: 'G2-01', time: 10, httpStatus: 200 },
    { id: 'G2-02', time: 20, httpStatus: 503 }
  ]), /cases attempted after 2 observed HTTP 429\/503 failures.*G2-04/);
});
