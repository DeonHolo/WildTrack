'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readCsv, failUnless, fixtureAuthority, labelsReviewed, metric, getUnique } = require('./score-lib.cjs');

const ASSERTIONS = path.join(__dirname, 'atomic-assertions.csv');
const REQUIRED_FAMILIES = 25;
const REQUIRED_VARIANTS = ['STD-15-corrupt', 'STD-15-non-pdf', 'STD-17-password',
  'STD-17-oversized', 'STD-19-with-requirement', 'STD-19-without-requirement',
  'STD-25-unexplained', 'STD-25-resolved'];

function classify(signal, row) {
  if (row.observation_status !== 'SUCCESS' || row.check_error) {
    return { status: 'ERROR', detail: row.check_error || row.observation_status || 'No completed observation' };
  }
  let value;
  if (signal === 'readable') value = row.readable;
  else if (signal === 'template_only') {
    if (row.readable !== 'true') return { status: 'UNASSESSABLE', detail: 'PDF not readable' };
    value = row.template_only;
  } else if (signal.startsWith('missing_heading:')) {
    if (row.readable !== 'true') return { status: 'UNASSESSABLE', detail: 'PDF not readable' };
    if (!row.template_available || row.template_available !== 'true') {
      return { status: 'UNASSESSABLE', detail: 'No template comparison performed' };
    }
    value = String(row.missing_template_headings || '').split(';').map(s => s.trim())
      .includes(signal.slice('missing_heading:'.length)) ? 'true' : 'false';
  } else throw new Error(`Unsupported frozen signal: ${signal}`);
  if (value !== 'true' && value !== 'false') return { status: 'UNASSESSABLE', detail: `Missing boolean observation: ${signal}` };
  return { status: 'COMPLETED', value: value === 'true' };
}

function score(observations, assertions = readCsv(ASSERTIONS)) {
  const { templateHash, fixtures } = fixtureAuthority();
  const observationMap = getUnique(observations, 'fixture_id', 'observation fixture');
  const assertionMap = getUnique(assertions, 'assertion_id', 'assertion');
  const families = new Set(assertions.map(a => a.fixture_id.slice(0, 6)));
  for (const [id, item] of observationMap) {
    failUnless(fixtures.has(id), `Unregistered observation fixture: ${id}`);
    failUnless(item.fixture_sha256 === fixtures.get(id).sha256, `Observation ${id}: fixture hash does not match frozen input`);
    failUnless(item.template_sha256 === templateHash, `Observation ${id}: official template hash mismatch`);
    failUnless(/^[0-9a-f]{40}$/i.test(item.app_commit || '') && item.code_state === 'TRACKED_FILECHECK_CLEAN'
      && item.measured_at && !Number.isNaN(Date.parse(item.measured_at)),
      `Observation ${id}: missing verified clean Document Check commit or measurement timestamp`);
  }
  const bySignal = {};
  const rows = [];
  let correct = 0;
  let completed = 0;
  for (const assertion of assertionMap.values()) {
    failUnless(fixtures.has(assertion.fixture_id), `Assertion fixture absent from manifest: ${assertion.fixture_id}`);
    failUnless(assertion.expected === 'true' || assertion.expected === 'false', `Invalid expected boolean: ${assertion.assertion_id}`);
    failUnless(assertion.authority, `Missing authority: ${assertion.assertion_id}`);
    const observedRow = observationMap.get(assertion.fixture_id);
    const classification = observedRow
      ? classify(assertion.signal, observedRow)
      : { status: 'NOT_RUN', detail: 'Fixture has no recorded observation' };
    const expected = assertion.expected === 'true';
    const match = classification.status === 'COMPLETED' ? expected === classification.value : false;
    if (classification.status === 'COMPLETED') completed++;
    if (match) correct++;
    const signalGroup = bySignal[assertion.signal] ??= { TP: 0, TN: 0, FP: 0, FN: 0, unassessable: 0 };
    const confusion = classification.status !== 'COMPLETED' ? null
      : expected ? (classification.value ? 'TP' : 'FN') : (classification.value ? 'FP' : 'TN');
    if (confusion) signalGroup[confusion]++;
    else signalGroup.unassessable++;
    rows.push({
      assertion_id: assertion.assertion_id, fixture_id: assertion.fixture_id,
      signal: assertion.signal, expected, observed: classification.status === 'COMPLETED' ? classification.value : null,
      status: classification.status, matches_expected: match, confusion, detail: classification.detail || '',
      fixture_sha256: fixtures.get(assertion.fixture_id).sha256,
      observation_timestamp: observedRow?.measured_at || null,
      app_commit: observedRow?.app_commit || null,
      human_label_review: assertion.review_status
    });
  }
  for (const group of Object.values(bySignal)) {
    group.precision = metric(group.TP, group.TP + group.FP);
    group.recall = metric(group.TP, group.TP + group.FN);
    group.false_positive_rate = metric(group.FP, group.FP + group.TN);
    group.false_negative_rate = metric(group.FN, group.FN + group.TP);
  }
  const allLabelsReviewed = labelsReviewed(assertions, 'deterministic');
  const allFixtureLabelsReviewed = [...fixtures.values()].every(item => item.human_label_review === 'VERIFIED'
    && item.human_label_reviewer && !Number.isNaN(Date.parse(item.human_label_reviewed_at)));
  const preRunKey = allLabelsReviewed && allFixtureLabelsReviewed && assertions.every(item => {
    const observation = observationMap.get(item.fixture_id);
    const fixture = fixtures.get(item.fixture_id);
    return !observation || (Date.parse(item.reviewed_at) <= Date.parse(observation.measured_at)
      && Date.parse(fixture.human_label_reviewed_at) <= Date.parse(observation.measured_at));
  });
  const absentVariants = REQUIRED_VARIANTS.filter(id => !fixtures.has(id) || !assertions.some(a => a.fixture_id === id));
  const allPlannedCases = families.size === REQUIRED_FAMILIES && fixtures.size >= REQUIRED_FAMILIES && absentVariants.length === 0;
  return {
    type: 'STD_SYNTHETIC_DETERMINISTIC_ENGINEERING_SCORE',
    status: allPlannedCases && preRunKey ? 'ELIGIBLE_FOR_RESEARCH_REVIEW' : 'PROVISIONAL_NOT_OBJECTIVE_1_RESULT',
    gate: {
      planned_case_families: REQUIRED_FAMILIES, prepared_case_families: families.size,
      manifest_case_families: fixtures.size,
      full_case_family_coverage: allPlannedCases,
      independent_human_labels_verified_before_run: preRunKey,
      required_split_or_paired_variants: REQUIRED_VARIANTS,
      missing_required_variants: absentVariants,
      missing_planned_case_families: Array.from({ length: REQUIRED_FAMILIES }, (_, i) => `STD-${String(i + 1).padStart(2, '0')}`).filter(id => !families.has(id))
    },
    denominators: {
      frozen_applicable_assertions: assertions.length,
      completed_assertions: completed,
      failed_or_unassessable_assertions: assertions.length - completed
    },
    assertion_accuracy: metric(correct, assertions.length),
    execution_coverage: metric(completed, assertions.length),
    confusion_by_signal: bySignal,
    assertions: rows
  };
}

if (require.main === module) {
  try {
    const inputIndex = process.argv.indexOf('--observations');
    const outputIndex = process.argv.indexOf('--output');
    failUnless(inputIndex > 0 && process.argv[inputIndex + 1], 'Usage: node score-deterministic.cjs --observations <fresh-observation.csv> [--output <report.json>]');
    const report = score(readCsv(process.argv[inputIndex + 1]));
    const json = JSON.stringify(report, null, 2) + '\n';
    if (outputIndex > 0) {
      failUnless(process.argv[outputIndex + 1], '--output requires a JSON path');
      failUnless(!fs.existsSync(process.argv[outputIndex + 1]), 'Refusing to overwrite an earlier scoring report');
      fs.writeFileSync(process.argv[outputIndex + 1], json);
    } else process.stdout.write(json);
  } catch (error) {
    console.error(`BENCHMARK NOT SCORED: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { score, classify };
