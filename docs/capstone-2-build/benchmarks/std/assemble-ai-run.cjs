'use strict';

// Assemble durable one-shot provider evidence. It does not invoke Gemini, invent judgments,
// reattempt failed fixtures, or populate decisions/claims without an actual source audit.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PILOT, KEY_METHOD } = require('./score-ai-reference.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const DATA = path.join(ROOT, '.scratch/capstone-2-session/goal2');
const DEFAULT_OUTPUT = path.join(DATA, 'ai-run-record.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function assemble(output = DEFAULT_OUTPUT) {
  const keyPath = path.join(DATA, 'frozen-key.json');
  if (!fs.existsSync(keyPath)) throw new Error('No actual pre-run frozen reference key available');
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  if (key.status !== 'FROZEN' || key.methodology !== KEY_METHOD) throw new Error('Unrecognized frozen methodology');
  if (fs.existsSync(output)) throw new Error('Refusing to overwrite an existing run record');
  const runs = [];
  for (const id of PILOT) {
    const attemptFile = path.join(DATA, 'attempts', id + '.json');
    if (!fs.existsSync(attemptFile)) {
      const claim = path.join(DATA, 'official-ten', id, 'attempt-started.json');
      if (!fs.existsSync(claim)) {
        runs.push({ fixture_id: id, outcome: 'not_attempted' });
        continue;
      }
      const attempted = JSON.parse(fs.readFileSync(claim, 'utf8'));
      runs.push({ fixture_id: id, outcome: 'outcome_unknown',
        attempted_at: attempted.attempted_at, fixture_sha256: attempted.fixture_sha256,
        template_sha256: attempted.template_sha256, app_commit: attempted.app_commit,
        provider: 'Google Gemini', model: key.model, prompt_version: key.prompt_version,
        reason: 'Durable attempt claim exists but no completed summary; process may have stopped after provider request. No retry authorized.' });
      continue;
    }
    const bytes = fs.readFileSync(attemptFile);
    const attempt = JSON.parse(bytes.toString('utf8'));
    if (attempt.fixture_id !== id || attempt.frozen_key_sha256 !== sha(fs.readFileSync(keyPath))) {
      throw new Error(id + ': attempted fixture does not match frozen reference key');
    }
    const run = { fixture_id: id, outcome: attempt.outcome,
      attempted_at: attempt.attempted_at, fixture_sha256: attempt.fixture_sha256,
      template_sha256: attempt.template_sha256, app_commit: attempt.app_commit,
      provider: attempt.provider, model: attempt.model, prompt_version: attempt.prompt_version,
      cache_status: attempt.cache_status, provider_request_id: attempt.provider_request_id || null,
      attempt_summary_sha256: sha(bytes),
      generation_requests_sent: attempt.generation_requests_sent,
      notes: 'Actual provider-side component run; production app cache and post-validation not exercised.' };
    if (attempt.outcome === 'fresh_success') {
      if (attempt.generation_requests_sent !== 1) throw new Error(id + ': fresh run did not execute exactly one generation');
      if (!attempt.report_path || !attempt.raw_response_path) throw new Error(id + ': raw and structured reports must be preserved');
      run.report_path = path.relative(path.dirname(output), path.resolve(attempt.report_path)).replace(/\\/g, '/');
      run.report_sha256 = attempt.report_sha256;
      run.raw_response_path = path.relative(path.dirname(output), path.resolve(attempt.raw_response_path)).replace(/\\/g, '/');
      run.raw_response_sha256 = attempt.raw_response_sha256;
      run.raw_response_exact = attempt.raw_response_exact;
    } else {
      run.reason = attempt.reason || attempt.failure_code || 'Provider attempt did not produce a fresh report';
    }
    runs.push(run);
  }
  const record = { schema_version: 2, methodology: KEY_METHOD,
    provenance: 'One attempted provider request per frozen synthetic STD case, with immutable per-case evidence',
    frozen_key: key, frozen_key_sha256: sha(fs.readFileSync(keyPath)), runs };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const fd = fs.openSync(output, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(record, null, 2) + '\n'); } finally { fs.closeSync(fd); }
  process.stdout.write('Assembled real Goal 2 pilot attempts without inventing decision or claim scores.\n');
  return record;
}
if (require.main === module) {
  try { assemble(process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUTPUT); }
  catch (error) { console.error('AI RUN NOT ASSEMBLED: ' + error.message); process.exitCode = 1; }
}
module.exports = { assemble };
