'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { fixtureAuthority, csv, readCsv, sha256 } = require('./score-lib.cjs');
const { score: scoreDeterministic, classify } = require('./score-deterministic.cjs');
const { score: scoreAi } = require('./score-ai.cjs');

const directory = __dirname;
const { templateHash, fixtures } = fixtureAuthority();
const deterministicAssertions = readCsv(path.join(directory, 'atomic-assertions.csv'));
const fixture01Assertions = deterministicAssertions.filter(row => row.fixture_id === 'STD-01');
const readableAssertions = deterministicAssertions.filter(row => row.signal === 'readable');
const observation = (id, overrides = {}) => ({
  fixture_id: id,
  fixture_sha256: fixtures.get(id).sha256,
  template_sha256: templateHash,
  measured_at: '2026-09-21T00:30:00+08:00',
  app_commit: '8b7b07fd7bf0ac691777f870409307758a065f05',
  code_state: 'TRACKED_FILECHECK_CLEAN',
  observation_status: 'SUCCESS',
  readable: 'true',
  template_available: 'true',
  template_only: 'true',
  missing_template_headings: '',
  check_error: '',
  ...overrides
});

test('CSV parser preserves quoted commas, newlines, and trailing empty columns', () => {
  const rows = csv('first,second,third\r\na,"one,two\nthree",\r\n');
  assert.deepEqual(rows, [{ first: 'a', second: 'one,two\nthree', third: '' }]);
  assert.throws(() => csv('a,b\n1'), /expected 2 fields/);
});

test('missing fixture observations stay in the denominator without inventing a classification', () => {
  const result = scoreDeterministic([observation('STD-01')]);
  assert.equal(result.assertion_accuracy.denominator, deterministicAssertions.length);
  assert.equal(result.assertion_accuracy.numerator, 2);
  assert.equal(result.execution_coverage.numerator, 2);
  assert.equal(result.assertions.filter(r => r.status === 'NOT_RUN').length,
    deterministicAssertions.length - fixture01Assertions.length);
  assert.equal(result.status, 'PROVISIONAL_NOT_OBJECTIVE_1_RESULT');
  assert.equal(result.gate.prepared_case_families, new Set(deterministicAssertions
    .map(row => row.fixture_id.slice(0, 6))).size);
  assert.equal(result.gate.missing_planned_case_families.length, 0);
  assert.equal(result.gate.missing_required_variants.length, 0);
  assert.equal(result.gate.complete_execution, false);
  assert.equal(result.gate.verified_pre_run_reference_freeze, false);
});

test('an execution error is counted as zero correct and zero completed for that fixture', () => {
  const result = scoreDeterministic([observation('STD-01', { observation_status: 'ERROR', check_error: 'Parser failure' })]);
  assert.deepEqual(result.assertions.filter(r => r.fixture_id === 'STD-01').map(r => r.status),
    ['ERROR', 'ERROR']);
  assert.equal(result.assertion_accuracy.numerator, 0);
  assert.equal(result.assertion_accuracy.denominator, deterministicAssertions.length);
  assert.equal(result.execution_coverage.numerator, 0);
  assert.equal(result.confusion_by_signal.readable.unassessable, readableAssertions.length);
});

test('contradicting classification counts as a false negative inside its own signal group', () => {
  const result = scoreDeterministic([observation('STD-01', { readable: 'false', template_only: '' })]);
  const readable = result.confusion_by_signal.readable;
  assert.equal(readable.FN, 1);
  assert.equal(readable.recall.value, 0);
  assert.equal(result.assertion_accuracy.denominator, deterministicAssertions.length);
  assert.equal(result.assertions.find(r => r.assertion_id === 'STD-01-template').status, 'UNASSESSABLE');
  assert.deepEqual(classify('missing_heading:Test Approach', observation('STD-24', { missing_template_headings: 'Test Approach' })),
    { status: 'COMPLETED', value: true });
});

test('mutated or duplicated fixture observations fail closed', () => {
  const valid = observation('STD-01');
  assert.throws(() => scoreDeterministic([{ ...valid, fixture_sha256: '0'.repeat(64) }]), /fixture hash/);
  assert.throws(() => scoreDeterministic([valid, valid]), /Duplicate observation fixture/);
});

test('empty observations and missing required variant conditions never become completed or a research score', () => {
  const empty = scoreDeterministic([]);
  assert.equal(empty.denominators.frozen_applicable_assertions, deterministicAssertions.length);
  assert.equal(empty.denominators.completed_assertions, 0);
  assert.equal(empty.assertion_accuracy.numerator, 0);
  assert.equal(empty.assertion_accuracy.denominator, deterministicAssertions.length);
  assert.equal(empty.execution_coverage.value, 0);
  assert.equal(empty.status, 'PROVISIONAL_NOT_OBJECTIVE_1_RESULT');
  assert.equal(empty.gate.complete_execution, false);
  assert.equal(empty.gate.verified_pre_run_reference_freeze, false);
  assert.equal(empty.confusion_by_signal.readable.precision.value, null);
  const incomplete = scoreDeterministic([], deterministicAssertions.filter(row =>
    row.fixture_id !== 'STD-17-oversized'));
  assert.ok(incomplete.gate.missing_required_variants.includes('STD-17-oversized'));
  assert.ok(incomplete.gate.unasserted_manifest_fixtures.includes('STD-17-oversized'));
  assert.equal(incomplete.gate.full_case_family_coverage, false);
});

test('negative local PDF classifications are real completed observations, not execution failures', () => {
  const corrupt = observation('STD-15-corrupt', {
    readable: 'false', corrupt_pdf: 'true', valid_pdf: 'false',
    template_only: '', template_available: '', observation_status: 'SUCCESS',
    inspection_message: 'The PDF is corrupt or unreadable.', check_error: ''
  });
  assert.deepEqual(classify('readable', corrupt), { status: 'COMPLETED', value: false });
  assert.deepEqual(classify('corrupt_pdf', corrupt), { status: 'COMPLETED', value: true });
  assert.equal(classify('template_only', corrupt).status, 'UNASSESSABLE');
  const result = scoreDeterministic([corrupt]);
  const negative = result.assertions.find(row => row.fixture_id === 'STD-15-corrupt' && row.signal === 'readable');
  assert.equal(negative.status, 'COMPLETED');
  assert.equal(negative.matches_expected, true);
  assert.equal(negative.confusion, 'TN');
  assert.equal(result.status, 'PROVISIONAL_NOT_OBJECTIVE_1_RESULT');
});

test('all planned attempts may finish with errors; coverage is not forced to 100% for an honest score', () => {
  // In-memory TEST-ONLY placeholders check the denominator/gate, not real measured fixture results.
  const fake = [...fixtures.keys()].map(id => observation(id));
  fake.find(row => row.fixture_id === 'STD-01').observation_status = 'ERROR';
  fake.find(row => row.fixture_id === 'STD-01').check_error = 'Simulated infrastructure failure';
  const result = scoreDeterministic(fake);
  assert.equal(result.gate.full_case_family_coverage, true);
  assert.equal(result.gate.complete_execution, true);
  assert.equal(result.gate.all_fixtures_attempted_even_if_checks_failed, true);
  assert.equal(result.gate.all_assertions_classified, false);
  assert.ok(result.execution_coverage.numerator < result.execution_coverage.denominator);
  assert.equal(result.assertion_accuracy.denominator, deterministicAssertions.length);
  assert.equal(result.status, 'PROVISIONAL_NOT_OBJECTIVE_1_RESULT');
});

test('unavailable provider, mock access and no-template cannot manufacture a Drive permission or template result', () => {
  const mockAccess = observation('STD-16', {
    measurement_scope: 'FILECHECK_GATEWAY_MOCK',
    filecheck_status: 'BLOCKED', technical_flag: 'Inaccessible',
    gateway_inaccessible: 'true', access_denied: '', readable: '',
    gateway_mock_evidence: 'SIMULATED generic GoogleDriveUnavailableException'
  });
  assert.deepEqual(classify('gateway_inaccessible', mockAccess),
    { status: 'COMPLETED', value: true });
  assert.equal(classify('access_denied', mockAccess).status, 'NOT_MEASURED');
  assert.equal(classify('readable', { ...mockAccess, readable: 'false' }).status, 'NOT_MEASURED');
  assert.equal(classify('gateway_inaccessible', { ...mockAccess, observation_status: 'UNAVAILABLE' }).status,
    'UNASSESSABLE');
  const unmapped = observation('STD-19-without-requirement', {
    template_mapped: 'false', template_available: 'false',
    template_only: '', missing_template_headings: ''
  });
  assert.deepEqual(classify('template_available', unmapped), { status: 'COMPLETED', value: false });
  assert.deepEqual(classify('no_template', unmapped), { status: 'COMPLETED', value: true });
  assert.equal(classify('template_only', { ...unmapped, template_only: 'false' }).status, 'NOT_MEASURED');
  assert.equal(classify('missing_heading:Test Approach', unmapped).status, 'NOT_MEASURED');
});

test('simulated size, MIME and filename signals require actual FileCheckService branch evidence', () => {
  const mime = observation('STD-15-non-pdf', {
    measurement_scope: 'PDF_TEMPLATE_ISOLATED+FILECHECK_GATEWAY_MOCK',
    filecheck_status: 'BLOCKED', technical_flag: 'Not PDF', not_pdf: 'true'
  });
  assert.deepEqual(classify('not_pdf', mime), { status: 'COMPLETED', value: true });
  assert.equal(classify('not_pdf', { ...mime, technical_flag: 'Inaccessible' }).status, 'UNASSESSABLE');
  const oversized = observation('STD-17-oversized', {
    measurement_scope: 'FILECHECK_GATEWAY_MOCK',
    filecheck_status: 'BLOCKED', technical_flag: 'File Too Large',
    file_too_large: 'true', readable: ''
  });
  assert.deepEqual(classify('file_too_large', oversized), { status: 'COMPLETED', value: true });
  assert.equal(classify('readable', oversized).status, 'NOT_MEASURED');
  const filename = observation('STD-11', {
    measurement_scope: 'PDF_TEMPLATE_ISOLATED+FILECHECK_GATEWAY_MOCK',
    filecheck_status: 'COMPLETED', technical_flag: 'PDF Verified',
    gateway_mock_evidence: 'SIMULATED metadata.name=HolidayRecipes.txt; metadata.mimeType=application/pdf',
    filename_ignored: 'true'
  });
  assert.deepEqual(classify('filename_ignored', filename), { status: 'COMPLETED', value: true });
  assert.equal(classify('filename_ignored', { ...filename, filecheck_status: 'BLOCKED' }).status, 'NOT_MEASURED');
});

test('claimed freeze cannot convert pending unreviewed Goal 1 labels into a research result', () => {
  const pending = scoreDeterministic([observation('STD-01')]);
  assert.equal(pending.gate.independent_human_labels_verified_before_run, false);
  assert.equal(pending.gate.verified_pre_run_reference_freeze, false);
  assert.throws(() => scoreDeterministic([], deterministicAssertions, {
    freezePath: path.join(directory, 'results', 'goal2-20260921', 'frozen-key.json')
  }), /Invalid Goal 1 reference freeze status\/type/);
  assert.equal(pending.status, 'PROVISIONAL_NOT_OBJECTIVE_1_RESULT');
});

test('the AI planning template reports no provider attempts and no estimable agreement', () => {
  const plan = JSON.parse(fs.readFileSync(path.join(directory, 'ai-run-record.template.json'), 'utf8'));
  const result = scoreAi(plan);
  assert.equal(result.attempt_outcomes.not_attempted, 10);
  assert.deepEqual(result.fresh_run_coverage, { numerator: 0, denominator: 10, value: 0 });
  assert.equal(result.checklist_agreement.value, null);
  assert.equal(result.claim_traceability.value, null);
  assert.equal(result.status, 'NOT_FROZEN_NO_PROVIDER_RESULTS');
  assert.equal(result.gate.fixed_reference_decisions, 11);
  assert.match(result.limitations.join(' '), /no independent human verification/i);
});

test('a claimed official provider attempt cannot precede the frozen project-defined reference', () => {
  const plan = JSON.parse(fs.readFileSync(path.join(directory, 'ai-run-record.template.json'), 'utf8'));
  const run = plan.runs[0];
  Object.assign(run, {
    outcome: 'fresh_success', attempted_at: '2026-09-21T00:30:00+08:00',
    fixture_sha256: fixtures.get('STD-01').sha256,
    template_sha256: templateHash, app_commit: '8b7b07fd7bf0ac691777f870409307758a065f05'
  });
  assert.throws(() => scoreAi(plan), /frozen reference key/);
  run.outcome = 'cache_hit';
  run.reason = 'Server served an existing cached report';
  assert.throws(() => scoreAi(plan), /frozen reference key/);
});

test('empty or duplicated AI run IDs fail without creating a plausible ten-attempt score', () => {
  const plan = JSON.parse(fs.readFileSync(path.join(directory, 'ai-run-record.template.json'), 'utf8'));
  plan.runs.push({ fixture_id: 'STD-01', outcome: 'not_attempted' });
  assert.throws(() => scoreAi(plan), /Duplicate Goal 2 run fixture/);
  plan.runs.pop();
  plan.runs.push({ fixture_id: 'STD-24', outcome: 'not_attempted' });
  assert.throws(() => scoreAi(plan), /Unplanned Goal 2 fixture/);
});

test('the immutable real Goal 2 pilot preserves fixed attempts and conservative claim denominators', () => {
  const inputPath = path.join(directory, 'results', 'goal2-20260921', 'ai-run-record.json');
  const record = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  // Goal 1 fixture expansion changes the *current* manifest/hash-list, which is no longer
  // byte-identical to the 2026-09-21 Goal 2 freeze. Never silently reinterpret that old pilot
  // using revised source files. Preserve the original archived score, require the current
  // scorer to fail closed on historical reference drift, and only re-score when all hashes match.
  const originalInputs = [
    ['ai-checklist.csv', 'checklist_sha256'],
    ['manifest.csv', 'manifest_sha256'],
    ['fixture-hashes.sha256', 'fixture_hashes_sha256']
  ];
  const archived = JSON.parse(fs.readFileSync(path.join(directory, 'results',
    'goal2-20260921', 'ai-score.json'), 'utf8'));
  assert.deepEqual(archived.fresh_run_coverage, { numerator: 9, denominator: 10, value: 0.9 });
  assert.deepEqual(archived.checklist_agreement, { numerator: 7, denominator: 10, value: 0.7 });
  assert.deepEqual(archived.claim_traceability, { numerator: 24, denominator: 43, value: 24 / 43 });
  if (originalInputs.some(([file, key]) =>
    sha256(path.join(directory, file)) !== record.frozen_key[key])) {
    assert.throws(() => scoreAi(record, { inputPath }), /Frozen Goal 2 key mismatch/);
    return;
  }
  const result = scoreAi(record, { inputPath });
  assert.equal(result.status, 'PROJECT_REFERENCE_AUDIT_COMPLETE');
  assert.deepEqual(result.fresh_run_coverage, { numerator: 9, denominator: 10, value: 0.9 });
  assert.equal(result.attempt_outcomes.outcome_unknown, 1);
  assert.deepEqual(result.checklist_agreement, { numerator: 7, denominator: 10, value: 0.7 });
  assert.equal(result.gate.fixed_reference_decisions, 11);
  assert.equal(result.claim_traceability.numerator, 24);
  assert.equal(result.claim_traceability.denominator, 43);
  assert.equal(result.unassessable_claims, 4);
  assert.equal(result.unsupported_claims, 15);
  assert.match(result.limitations.join(' '), /no independent human verification/);
  const tampered = structuredClone(record);
  tampered.runs.find(r => r.fixture_id === 'STD-01').report_sha256 = '0'.repeat(64);
  assert.throws(() => scoreAi(tampered, { inputPath }), /report hash mismatch/);
  const inventedSource = structuredClone(record);
  inventedSource.runs.find(r => r.fixture_id === 'STD-01').claims
    .find(c => c.traceable === true).source_excerpt = 'This invented requirement is not in any supplied authority';
  assert.throws(() => scoreAi(inventedSource, { inputPath }), /source_excerpt not found/);
});
