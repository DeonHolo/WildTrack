'use strict';

// One-time, pre-provider freeze of project-defined reference checklist and the exact runner inputs.
// No Gemini request, token access or human-review assertion is made by this script.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { readCsv, failUnless, fixtureAuthority, sha256, getUnique } = require('./score-lib.cjs');
const { PILOT, KEY_METHOD } = require('./score-ai-reference.cjs');
const folder = __dirname;
const root = path.resolve(folder, '../../../..');
const output = path.join(root, '.scratch/capstone-2-session/goal2/frozen-key.json');
const sha = name => sha256(path.join(folder, name));

function freeze() {
  failUnless(!fs.existsSync(output), 'A frozen reference already exists; no refreeze or retrospective relabeling');
  const { templateHash, fixtures } = fixtureAuthority();
  const checklist = readCsv(path.join(folder, 'ai-checklist.csv'));
  getUnique(checklist, 'decision_id', 'Goal 2 reference decision');
  failUnless(checklist.length === 11, 'Expected exactly eleven predeclared Goal 2 reference decisions');
  const seen = new Set();
  for (const item of checklist) {
    failUnless(PILOT.includes(item.fixture_id) && fixtures.has(item.fixture_id) &&
      ['present', 'absent'].includes(item.expected), 'Unexpected reference fixture or decision label');
    failUnless(item.reference_status === 'FROZEN_PROJECT_DEFINED' &&
      item.reference_method === 'PROJECT_AI_ASSISTED_PDF_AND_AUTHORITY_REVIEW',
      `Reference not truthfully project-defined and ready: ${item.decision_id}`);
    failUnless(item.reference_excerpt && item.reference_rationale && item.reference_source && item.authority,
      `Missing source and rationale for ${item.decision_id}`);
    const sourceFile = item.reference_source.startsWith('docs/')
      ? path.resolve(root, item.reference_source) : path.resolve(folder, item.reference_source);
    failUnless(sourceFile.startsWith(root + path.sep) && fs.existsSync(sourceFile),
      `Missing reference source file for ${item.decision_id}`);
    const extractedPath = path.join(root, '.scratch/capstone-2-session/goal2-reference-extracted-text',
      item.fixture_id + '.txt');
    failUnless(fs.existsSync(extractedPath), `Missing PDF source-text audit for ${item.decision_id}`);
    const normalize = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
    failUnless(normalize(fs.readFileSync(extractedPath, 'utf8')).includes(normalize(item.reference_excerpt)),
      `Reference excerpt cannot be located in frozen PDF source text: ${item.decision_id}`);
    seen.add(item.fixture_id);
  }
  failUnless(PILOT.every(id => seen.has(id)), 'All ten scheduled fixtures need a predeclared reference');
  const status = cp.execFileSync('git', ['status', '--porcelain', '--untracked-files=no', '--',
    'backend/src/main/java/com/capvault/backend/aireview',
    'backend/src/test/java/com/capvault/backend/aireview/StdAiPilotRunTest.java',
    'docs/capstone-2-build/benchmarks/std'], { cwd: root, encoding: 'utf8' });
  failUnless(!status.trim(), 'Commit current Goal 2 runner/reference source before freeze so app_commit identifies the executed version');
  const appCommit = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  failUnless(/^[a-f\d]{40}$/i.test(appCommit), 'Source code commit missing');
  const key = {
    status: 'FROZEN',
    methodology: KEY_METHOD,
    app_commit: appCommit,
    model: 'gemini-3.1-flash-lite',
    prompt_version: 'wildtrack-academic-review-v3',
    frozen_at: new Date().toISOString(),
    checklist_sha256: sha('ai-checklist.csv'),
    manifest_sha256: sha('manifest.csv'),
    template_sha256: templateHash,
    fixture_hashes_sha256: sha('fixture-hashes.sha256'),
    instructions_sha256: sha('STD_AI_INSTRUCTIONS.txt'),
    protocol_sha256: sha('GOAL2_REFERENCE_CHECKLIST.md'),
    planned_fixtures: PILOT,
    reference_method_note: 'Project-defined source checklist prepared with ChatGPT assistance. No independent human verification is asserted.'
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const fd = fs.openSync(output, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(key, null, 2) + '\n'); } finally { fs.closeSync(fd); }
  process.stdout.write('Goal 2 reference key frozen, without provider requests, at .scratch/capstone-2-session/goal2/frozen-key.json\n');
}
if (require.main === module) {
  try { freeze(); } catch (error) { console.error(`GOAL 2 NOT FROZEN: ${error.message}`); process.exitCode = 1; }
}
module.exports = { freeze };
