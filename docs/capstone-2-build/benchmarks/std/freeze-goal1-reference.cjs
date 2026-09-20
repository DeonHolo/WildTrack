'use strict';

// Project-defined, source-grounded Goal 1 reference. No independent human
// reviewer is required or claimed. This create-only freeze must precede a NEW
// measurement; it can never turn the previous development probe into a new run.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { fixtureAuthority, readCsv, getUnique, failUnless, sha256 } = require('./score-lib.cjs');

const benchmark = __dirname;
const root = path.resolve(benchmark, '../../../..');
const variants = ['STD-15-corrupt', 'STD-15-non-pdf', 'STD-17-password',
  'STD-17-oversized', 'STD-19-with-requirement', 'STD-19-without-requirement',
  'STD-25-unexplained', 'STD-25-resolved'];
const files = [
  ['manifest_sha256', 'manifest.csv'],
  ['atomic_assertions_sha256', 'atomic-assertions.csv'],
  ['fixture_hashes_sha256', 'fixture-hashes.sha256'],
  ['condition_authority_sha256', 'goal1-condition-authority.json'],
  ['deterministic_scorer_sha256', 'score-deterministic.cjs'],
  ['reference_protocol_sha256', 'GOAL1_PROJECT_REFERENCE_PROTOCOL.md']
];

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function freeze(output) {
  failUnless(output, 'Usage: node freeze-goal1-reference.cjs --output <NEW frozen-key.json>');
  const out = path.resolve(output);
  failUnless(out.startsWith(root + path.sep) && !fs.existsSync(out),
    'Freeze destination must be a new path inside this repository');
  const { templateHash, fixtures } = fixtureAuthority();
  const assertions = readCsv(path.join(benchmark, 'atomic-assertions.csv'));
  const manifest = readCsv(path.join(benchmark, 'manifest.csv'));
  getUnique(assertions, 'assertion_id', 'Goal 1 assertion');
  const ids = new Set(assertions.map(a => a.fixture_id));
  failUnless(fixtures.size === manifest.length && fixtures.size >= 25,
    'Missing or duplicated benchmark conditions');
  failUnless(Array.from({ length: 25 }, (_, i) => `STD-${String(i + 1).padStart(2, '0')}`)
    .every(family => [...fixtures.keys()].some(id => id === family || id.startsWith(family + '-'))),
  'All 25 planned benchmark families must have fixtures');
  for (const id of [...fixtures.keys(), ...variants])
    failUnless(ids.has(id), `Unscheduled expected assertion for planned condition: ${id}`);
  for (const item of assertions)
    failUnless(fixtures.has(item.fixture_id) && item.authority &&
      ['true', 'false'].includes(item.expected), `Unspecified expected observation: ${item.assertion_id}`);
  // Older human-signoff fields are retained only for historic CSV compatibility.
  // Do NOT mark them VERIFIED or invent reviewer names or times.
  failUnless(manifest.every(m => m.human_label_review === 'PENDING' && !m.human_label_reviewer)
    && assertions.every(a => a.review_status === 'PENDING' && !a.reviewer),
  'The project-defined reference must not impersonate an independent reviewer');
  const commit = git('rev-parse', 'HEAD');
  failUnless(/^[0-9a-f]{40}$/i.test(commit), 'Cannot identify a fixed app revision');
  const tracked = ['backend/src/main/java/com/capvault/backend/filecheck', 'backend/pom.xml',
    'backend/src/test/java/com/capvault/backend/filecheck/StdBenchmarkObservationExportTest.java',
    ...files.map(([, f]) => `docs/capstone-2-build/benchmarks/std/${f}`)];
  failUnless(!git('status', '--porcelain', '--untracked-files=no', '--', ...tracked),
    'App, runner, protocol, source references and scorer must be committed before the freeze');
  for (const [, filename] of files)
    failUnless(fs.existsSync(path.join(benchmark, filename)), `Missing source: ${filename}`);
  const key = {
    type: 'GOAL1_PRE_RUN_PROJECT_REFERENCE_FREEZE',
    status: 'FROZEN_GOAL_1_PROJECT_DEFINED',
    methodology: 'RESEARCHER_DEFINED_PDF_AND_AUTHORITY_CHECKLIST_AI_ASSISTED',
    independent_human_review: false,
    reference_note: 'Researcher/project-defined expectations assembled with AI assistance; not independently validated; development observations existed before this freeze.',
    frozen_at: new Date().toISOString(),
    app_commit: commit,
    ...Object.fromEntries(files.map(([name, filename]) => [name, sha256(path.join(benchmark, filename))])),
    template_sha256: templateHash,
    fixture_sha256: Object.fromEntries([...fixtures].map(([id, f]) => [id, f.sha256])),
    planned_case_families: 25,
    planned_fixture_conditions: fixtures.size,
    planned_atomic_assertions: assertions.length,
    scope: 'Controlled synthetic STD component checks and disclosed in-memory Drive gateway simulations; not end-to-end provider validation'
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(key, null, 2) + '\n', { flag: 'wx' });
  return key;
}

if (require.main === module) {
  try {
    const index = process.argv.indexOf('--output');
    console.log(JSON.stringify(freeze(index < 0 ? null : process.argv[index + 1]), null, 2));
  } catch (error) {
    console.error(`Goal 1 NOT frozen: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { freeze };
