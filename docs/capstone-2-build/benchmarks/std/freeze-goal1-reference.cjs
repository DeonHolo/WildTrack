'use strict';

// Create-only Objective 1 reference lock. Preparation of the benchmark is not a
// human review. This script deliberately refuses to freeze pending/unreviewed labels.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { fixtureAuthority, readCsv, getUnique, failUnless } = require('./score-lib.cjs');

const benchmark = __dirname;
const root = path.resolve(benchmark, '../../../..');
const requiredVariants = [
  'STD-15-corrupt', 'STD-15-non-pdf', 'STD-17-password', 'STD-17-oversized',
  'STD-19-with-requirement', 'STD-19-without-requirement',
  'STD-25-unexplained', 'STD-25-resolved'
];

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function requireRealReview(rows, label, stateKey, reviewerKey, reviewedKey, frozenAt) {
  for (const row of rows) {
    failUnless(row[stateKey] === 'VERIFIED', `${label} ${row.fixture_id}: independent review still PENDING`);
    const reviewer = (row[reviewerKey] || '').trim();
    failUnless(reviewer && !/^(chatgpt|ai|automated|pending|tbd|unknown)$/i.test(reviewer),
      `${label} ${row.fixture_id}: actual independently reviewing teammate must be recorded`);
    const time = Date.parse(row[reviewedKey] || '');
    failUnless(Number.isFinite(time) && time <= Date.parse(frozenAt),
      `${label} ${row.fixture_id}: real review timestamp must precede reference freeze`);
  }
}

function freeze(output, reviewAttestation) {
  failUnless(output && reviewAttestation,
    'Usage: node freeze-goal1-reference.cjs --output <NEW frozen-key.json> --review-attestation <actual-reviewer-record>');
  const out = path.resolve(output);
  const attestation = path.resolve(reviewAttestation);
  failUnless(out.startsWith(root + path.sep) && !fs.existsSync(out),
    'Freeze destination must be new and inside the repository');
  failUnless(attestation.startsWith(root + path.sep) && fs.existsSync(attestation)
      && fs.statSync(attestation).isFile() && fs.statSync(attestation).size > 0,
    'A real completed reviewer attestation file inside the repository is required');

  const { templateHash, fixtures } = fixtureAuthority();
  const assertions = readCsv(path.join(benchmark, 'atomic-assertions.csv'));
  const manifest = readCsv(path.join(benchmark, 'manifest.csv'));
  const uniqueAssertions = getUnique(assertions, 'assertion_id', 'Goal 1 assertion');
  failUnless(uniqueAssertions.size === assertions.length && assertions.length >= fixtures.size,
    'Every planned condition requires at least one independently reviewed applicable assertion');
  const assertionIds = new Set(assertions.map(row => row.fixture_id));
  const families = new Set([...assertionIds].map(id => id.slice(0, 6)));
  failUnless(families.size === 25 && Array.from({ length: 25 }, (_, index) =>
    `STD-${String(index + 1).padStart(2, '0')}`).every(id => families.has(id)),
  'All 25 Goal 1 families must be scheduled before freeze');
  for (const id of requiredVariants) failUnless(fixtures.has(id) && assertionIds.has(id),
    `Required split/paired condition missing from fixture catalog or assertions: ${id}`);
  for (const id of fixtures.keys()) failUnless(assertionIds.has(id), `No scored assertion for ${id}`);
  for (const item of assertions) {
    failUnless(fixtures.has(item.fixture_id), `Unknown assertion fixture: ${item.fixture_id}`);
    failUnless(item.authority && (item.expected === 'true' || item.expected === 'false'),
      `Incomplete expected value or authority for ${item.assertion_id}`);
  }

  const commit = git('rev-parse', 'HEAD');
  failUnless(/^[0-9a-f]{40}$/i.test(commit), 'Cannot determine immutable app source commit');
  const dirty = git('status', '--porcelain', '--untracked-files=no', '--',
    'backend/src/main/java/com/capvault/backend/filecheck', 'backend/pom.xml',
    'docs/capstone-2-build/benchmarks/std/manifest.csv',
    'docs/capstone-2-build/benchmarks/std/atomic-assertions.csv',
    'docs/capstone-2-build/benchmarks/std/fixture-hashes.sha256',
    'docs/capstone-2-build/benchmarks/std/goal1-condition-authority.json',
    'docs/capstone-2-build/benchmarks/std/score-deterministic.cjs');
  failUnless(!dirty, 'Freeze source/labels/checker/scorer must be committed before a research run');

  const authority = path.join(benchmark, 'goal1-condition-authority.json');
  failUnless(fs.existsSync(authority), 'Missing exact configured authority/gateway-mock condition mapping');
  const frozenAt = new Date().toISOString();
  requireRealReview(manifest, 'manifest', 'human_label_review', 'human_label_reviewer',
    'human_label_reviewed_at', frozenAt);
  requireRealReview(assertions, 'assertion', 'review_status', 'reviewer', 'reviewed_at', frozenAt);
  const key = {
    type: 'GOAL1_PRE_RUN_PROJECT_REFERENCE_FREEZE',
    status: 'FROZEN_GOAL_1',
    frozen_at: frozenAt,
    app_commit: commit,
    independent_review_attestation_sha256: hashFile(attestation),
    review_attestation_path: path.relative(root, attestation).replace(/\\/g, '/'),
    manifest_sha256: hashFile(path.join(benchmark, 'manifest.csv')),
    atomic_assertions_sha256: hashFile(path.join(benchmark, 'atomic-assertions.csv')),
    fixture_hashes_sha256: hashFile(path.join(benchmark, 'fixture-hashes.sha256')),
    condition_authority_sha256: hashFile(authority),
    deterministic_scorer_sha256: hashFile(path.join(benchmark, 'score-deterministic.cjs')),
    template_sha256: templateHash,
    fixture_sha256: Object.fromEntries([...fixtures.entries()].map(([id, data]) => [id, data.sha256])),
    planned_case_families: 25,
    planned_fixture_conditions: fixtures.size,
    planned_atomic_assertions: assertions.length,
    scope: 'Controlled synthetic STD Document Check with isolated PDF extraction and declared offline gateway mocks; not live Drive or real student files',
    notes: 'This file proves byte/timestamp provenance, not reviewer independence. Verify the real attestation and review record separately.'
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(key, null, 2)}\n`, { flag: 'wx' });
  return key;
}

if (require.main === module) {
  try {
    const outIndex = process.argv.indexOf('--output');
    const reviewIndex = process.argv.indexOf('--review-attestation');
    const result = freeze(outIndex >= 0 ? process.argv[outIndex + 1] : null,
      reviewIndex >= 0 ? process.argv[reviewIndex + 1] : null);
    console.log(`Goal 1 reference frozen BEFORE official observations at ${result.frozen_at}`);
  } catch (error) {
    console.error(`Goal 1 NOT frozen: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { freeze };
