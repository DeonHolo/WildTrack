'use strict';

// Attach project/AI-assisted source judgments to preserved provider observations.
// This never calls Gemini or changes the pre-run reference key.
const fs = require('node:fs');
const path = require('node:path');
const { PILOT, KEY_METHOD } = require('./score-ai-reference.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const FOLDER = path.join(ROOT, '.scratch/capstone-2-session/goal2');
const sourcePath = path.join(FOLDER, 'ai-run-record.json');
const outputPath = path.join(FOLDER, 'ai-run-record-audited.json');

function merge() {
  if (!fs.existsSync(sourcePath)) throw new Error('Run record with genuine provider observations is missing');
  if (fs.existsSync(outputPath)) throw new Error('Refusing to overwrite an earlier audit');
  const original = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (original.methodology !== KEY_METHOD || !original.frozen_key?.frozen_at) {
    throw new Error('Missing actual frozen reference');
  }
  let count = 0;
  for (const run of original.runs) {
    if (!PILOT.includes(run.fixture_id)) throw new Error('Unplanned fixture in run record');
    if (run.outcome !== 'fresh_success') continue;
    const name = path.join(FOLDER, 'audits', run.fixture_id + '.json');
    if (!fs.existsSync(name)) throw new Error(run.fixture_id + ': source audit missing');
    const audited = JSON.parse(fs.readFileSync(name, 'utf8'));
    if (audited.fixture_id !== run.fixture_id ||
      audited.claim_inventory?.report_sha256 !== run.report_sha256 ||
      audited.claim_inventory?.complete !== true ||
      !Array.isArray(audited.decisions) || !Array.isArray(audited.claims)) {
      throw new Error(run.fixture_id + ': audit does not attest the exact actual report');
    }
    run.decisions = audited.decisions;
    run.claims = audited.claims;
    run.claim_inventory = audited.claim_inventory;
    run.audit_origin = 'ChatGPT-assisted project source review; no independent human validation';
    count++;
  }
  if (count !== original.runs.filter(run => run.outcome === 'fresh_success').length) {
    throw new Error('Cannot call audit complete with unaudited successful cases');
  }
  const fd = fs.openSync(outputPath, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(original, null, 2) + '\n'); } finally { fs.closeSync(fd); }
  process.stdout.write(`Merged ${count} actual successful provider reports with project/AI-assisted source audits.\n`);
}
if (require.main === module) {
  try { merge(); } catch (error) { console.error('GOAL 2 AUDITS NOT MERGED: ' + error.message); process.exitCode = 1; }
}
module.exports = { merge };
