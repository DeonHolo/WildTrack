'use strict';

// Pre-call fingerprint of sanitized SRS fixtures derived from local owner-provided SRS references.
// This script neither opens/publishes original private PDFs nor invokes Gemini.
const fs = require('node:fs');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const output = path.join(root, '.scratch/capstone-2-session/srs-followup/frozen-key.json');
const files = new Map([
  ['SRS-01', 'SRS-01_template-only.pdf'],
  ['SRS-02', 'SRS-02_completed.pdf'],
  ['SRS-03', 'SRS-03_partially-complete.pdf'],
  ['SRS-04', 'SRS-04_toc-only-heading.pdf'],
  ['SRS-05', 'SRS-05_section-missing.pdf'],
  ['SRS-06', 'SRS-06_bogus-requirement.pdf']
]);
const sha = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

function freeze() {
  if (fs.existsSync(output)) throw new Error('A SRS follow-up reference is already frozen; refuse retrospective changes');
  const required = new Map([
    ['reference_sha256', path.join(__dirname, 'SOURCE_PROOF.md')],
    ['manifest_sha256', path.join(__dirname, 'manifest.json')],
    ['instructions_sha256', path.join(__dirname, 'SRS_AI_INSTRUCTIONS.txt')],
    ['template_sha256', path.join(__dirname, 'fixtures/SRS-01_template-only.pdf')]
  ]);
  for (const [name, filename] of required) {
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) throw new Error('Missing source: ' + name);
  }
  const revision = cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root, encoding:'utf8'}).trim();
  if (!/^[a-f\d]{40}$/.test(revision)) throw new Error('Invalid source revision');
  const changed = cp.execFileSync('git', ['status', '--porcelain', '--untracked-files=no', '--',
    'backend/src/main/java/com/capvault/backend/aireview',
    'backend/src/test/java/com/capvault/backend/aireview/SrsAiReviewLivePilotTest.java',
    'docs/capstone-2-build/benchmarks/srs'], {cwd:root, encoding:'utf8'}).trim();
  if (changed) throw new Error('Commit the post-processing code and sanitized SRS reference before freezing');
  const rows = JSON.parse(fs.readFileSync(required.get('manifest_sha256'), 'utf8'));
  const reference = fs.readFileSync(required.get('reference_sha256'), 'utf8');
  if (rows.fixtures?.length !== files.size || rows.synthetic_only !== true) {
    throw new Error('Manifest must contain the six controlled synthetic reference inputs');
  }
  const fixtureSha = {};
  for (const [id, filename] of files) {
    const fixture = path.join(__dirname, 'fixtures', filename);
    if (!fs.existsSync(fixture)) throw new Error('Missing sanitized fixture: ' + id);
    const declared = rows.fixtures.find(row => row.fixture_id === id && row.filename === filename &&
      row.expected_observation && row.source_structure_anchor);
    if (!declared || !reference.includes(id)) throw new Error('No declared source-grounded reference for ' + id);
    fixtureSha[id] = sha(fixture);
    if (declared.sha256 !== fixtureSha[id]) throw new Error('Manifest/PDF fingerprint mismatch for ' + id);
  }
  const source = {
    type: 'SANITIZED_SRS_SEPARATE_FOLLOWUP_REFERENCE',
    scope: 'Six controlled fixtures derived from owner-provided PDFs; originals are neither transmitted nor published',
    methodology: 'PROJECT_DEFINED_REFERENCE_AI_ASSISTED',
    frozen_at: new Date().toISOString(),
    app_commit: revision,
    prompt_version: 'see app source at app_commit',
    model: 'gemini-3.1-flash-lite',
    reference_sha256: sha(required.get('reference_sha256')),
    manifest_sha256: sha(required.get('manifest_sha256')),
    instructions_sha256: sha(required.get('instructions_sha256')),
    template_sha256: sha(required.get('template_sha256')),
    fixture_sha256: fixtureSha
  };
  fs.mkdirSync(path.dirname(output), {recursive:true});
  const fd = fs.openSync(output, 'wx', 0o600);
  try {fs.writeFileSync(fd, JSON.stringify(source, null, 2) + '\n');}
  finally {fs.closeSync(fd);}
  process.stdout.write('Frozen six sanitized SRS cases and project-defined references before any follow-up provider attempt.\n');
}
if (require.main === module) {
  try {freeze();}
  catch (error) { console.error('SRS REFERENCE NOT FROZEN: ' + error.message); process.exitCode = 1; }
}
module.exports = {freeze};
