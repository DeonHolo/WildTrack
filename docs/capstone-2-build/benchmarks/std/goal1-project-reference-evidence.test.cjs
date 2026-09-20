'use strict';

// Replay-only audit of the separately frozen Goal 1 project-reference component
// run. These tests never send provider requests or create/rewrite observations.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readCsv, sha256 } = require('./score-lib.cjs');
const { score } = require('./score-deterministic.cjs');

const base = path.join(__dirname, 'results/goal1-project-reference-r2-20260921');
const freezePath = path.join(base, 'frozen-key.json');
const raw = path.join(base, 'observations.csv');
const scorePath = path.join(base, 'project-reference-score.json');
const historic = path.join(__dirname, 'results/goal1-development-20260921',
  'probe-4fedefca5c6bbc97ca135fcf3475084d9e6e0b36.csv');

test('project-defined reference and observations are source-frozen and chronological without a human signoff', () => {
  const key = JSON.parse(fs.readFileSync(freezePath, 'utf8'));
  const rows = readCsv(raw);
  assert.equal(key.status, 'FROZEN_GOAL_1_PROJECT_DEFINED');
  assert.equal(key.independent_human_review, false);
  assert.equal(Object.hasOwn(key, 'independent_review_attestation_sha256'), false);
  assert.equal(key.planned_fixture_conditions, 30);
  assert.equal(key.planned_atomic_assertions, 52);
  assert.equal(rows.length, 30);
  for (const row of rows) {
    assert.equal(row.benchmark_run_mode, 'OFFICIAL');
    assert.equal(row.reference_freeze_sha256, sha256(freezePath));
    assert.equal(row.app_commit, key.app_commit);
    assert.ok(Date.parse(row.measured_at) > Date.parse(key.frozen_at));
  }
});

test('project reference score replays exactly, discloses simulated gateway and does not claim end-to-end success', () => {
  const result = score(readCsv(raw), { freezePath });
  assert.equal(JSON.stringify(result, null, 2) + '\n', fs.readFileSync(scorePath, 'utf8'));
  assert.equal(result.status, 'PROJECT_DEFINED_COMPONENT_RESULT_NOT_END_TO_END_GOAL_1');
  assert.equal(result.assertion_accuracy.numerator, 52);
  assert.equal(result.assertion_accuracy.denominator, 52);
  assert.equal(result.execution_coverage.denominator, 52);
  assert.equal(result.gate.verified_pre_run_reference_freeze, true);
  assert.equal(result.gate.independent_human_labels_verified_before_run, false);
  assert.equal(result.gate.complete_provider_drive_document_check, false);
  assert.equal(result.gate.measurement_scopes.FILECHECK_GATEWAY_MOCK, 2);
});

test('prior development observations cannot be relabeled as the new prospectively frozen evaluation', () => {
  assert.throws(() => score(readCsv(historic), { freezePath }),
    /development output or wrong frozen-reference SHA/);
  const rows = readCsv(raw);
  assert.throws(() => score([{ ...rows[0], reference_freeze_sha256: '0'.repeat(64) }, ...rows.slice(1)],
    { freezePath }), /development output or wrong frozen-reference SHA/);
  assert.throws(() => score([{ ...rows[0], measured_at: '2026-01-01T00:00:00Z' }, ...rows.slice(1)],
    { freezePath }), /recorded before reference freeze/);
});
