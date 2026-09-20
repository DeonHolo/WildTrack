'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { fixtureAuthority, csv } = require('./score-lib.cjs');
const { score: scoreDeterministic, classify } = require('./score-deterministic.cjs');
const { score: scoreAi } = require('./score-ai.cjs');

const directory = __dirname;
const { templateHash, fixtures } = fixtureAuthority();
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
  assert.equal(result.assertion_accuracy.denominator, 16);
  assert.equal(result.assertion_accuracy.numerator, 2);
  assert.equal(result.execution_coverage.numerator, 2);
  assert.equal(result.assertions.filter(r => r.status === 'NOT_RUN').length, 14);
  assert.equal(result.status, 'PROVISIONAL_NOT_OBJECTIVE_1_RESULT');
  assert.equal(result.gate.prepared_case_families, 11);
  assert.equal(result.gate.missing_planned_case_families.length, 14);
  assert.equal(result.gate.missing_required_variants.length, 8);
});

test('an execution error is counted as zero correct and zero completed for that fixture', () => {
  const result = scoreDeterministic([observation('STD-01', { observation_status: 'ERROR', check_error: 'Parser failure' })]);
  assert.deepEqual(result.assertions.filter(r => r.fixture_id === 'STD-01').map(r => r.status),
    ['ERROR', 'ERROR']);
  assert.equal(result.assertion_accuracy.numerator, 0);
  assert.equal(result.assertion_accuracy.denominator, 16);
  assert.equal(result.execution_coverage.numerator, 0);
  assert.equal(result.confusion_by_signal.readable.unassessable, 11);
});

test('contradicting classification counts as a false negative inside its own signal group', () => {
  const result = scoreDeterministic([observation('STD-01', { readable: 'false', template_only: '' })]);
  const readable = result.confusion_by_signal.readable;
  assert.equal(readable.FN, 1);
  assert.equal(readable.recall.value, 0);
  assert.equal(result.assertion_accuracy.denominator, 16);
  assert.equal(result.assertions.find(r => r.assertion_id === 'STD-01-template').status, 'UNASSESSABLE');
  assert.deepEqual(classify('missing_heading:Test Approach', observation('STD-24', { missing_template_headings: 'Test Approach' })),
    { status: 'COMPLETED', value: true });
});

test('mutated or duplicated fixture observations fail closed', () => {
  const valid = observation('STD-01');
  assert.throws(() => scoreDeterministic([{ ...valid, fixture_sha256: '0'.repeat(64) }]), /fixture hash/);
  assert.throws(() => scoreDeterministic([valid, valid]), /Duplicate observation fixture/);
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
