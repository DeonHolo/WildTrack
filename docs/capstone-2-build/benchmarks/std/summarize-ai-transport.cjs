'use strict';

// Portable evidence of observed HTTP outcomes and provider response IDs, without local file paths or credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PILOT } = require('./score-ai-reference.cjs');
const here = __dirname;
const root = path.resolve(here, '../../../..');
const local = path.join(root, '.scratch/capstone-2-session/goal2');
const publicFolder = path.join(here, 'results/goal2-20260921');
const output = path.join(publicFolder, 'transport-evidence.json');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function transport() {
  if (fs.existsSync(output)) throw new Error('Do not overwrite immutable observed HTTP evidence');
  const record = JSON.parse(fs.readFileSync(path.join(publicFolder, 'ai-run-record.json'), 'utf8'));
  const rows = [];
  for (const id of PILOT) {
    const run = record.runs.find(r => r.fixture_id === id);
    const attemptPath = path.join(local, 'attempts', id + '.json');
    if (!run || !fs.existsSync(attemptPath)) throw new Error(id + ': actual attempt summary missing');
    const raw = fs.readFileSync(attemptPath);
    if (digest(raw) !== run.attempt_summary_sha256) throw new Error(id + ': attempt summary hash mismatch');
    const attempt = JSON.parse(raw.toString('utf8'));
    let responseId = null;
    if (run.outcome === 'fresh_success') {
      const responsePath = path.join(publicFolder, 'provider-responses', id + '.json');
      const response = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
      responseId = response.responseId || null;
    }
    rows.push({ fixture_id: id, outcome: attempt.outcome, attempted_at: attempt.attempted_at,
      finished_at: attempt.finished_at, http_status: attempt.response_http_status,
      generation_requests_sent: attempt.generation_requests_sent,
      provider_response_id: responseId, provider_request_id_header: attempt.provider_request_id,
      request_payload_sha256: attempt.request_payload_sha256,
      attempt_summary_sha256: digest(raw) });
  }
  const result = { type: 'GOAL2_ACTUAL_PROVIDER_TRANSPORT_EVIDENCE',
    note: 'Actual HTTP statuses and Google responseId values. A responseId is NOT falsely described as an HTTP request-header ID. No retries; private error bodies are not published.',
    rows };
  const fd = fs.openSync(output, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(result, null, 2) + '\n'); } finally { fs.closeSync(fd); }
  process.stdout.write('Wrote the ten actual safe transport outcomes to results/goal2-20260921/transport-evidence.json.\n');
}
if (require.main === module) {
  try { transport(); } catch (error) { console.error('TRANSPORT NOT PACKAGED: ' + error.message); process.exitCode = 1; }
}
module.exports = { transport };
