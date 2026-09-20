'use strict';

// Copy the genuine, credential-free, synthetic PDF pilot evidence into a portable result folder.
// Never ships the local .env credential, machine-specific paths, or private .scratch metadata.
const fs = require('node:fs');
const path = require('node:path');
const { PILOT } = require('./score-ai-reference.cjs');
const root = path.resolve(__dirname, '../../../..');
const local = path.join(root, '.scratch/capstone-2-session/goal2');
const source = path.join(local, 'ai-run-record-audited.json');
const target = path.join(__dirname, 'results/goal2-20260921');

function packageEvidence() {
  if (!fs.existsSync(source)) throw new Error('No actual source-audited pilot record yet');
  if (fs.existsSync(target)) throw new Error('Refusing to overwrite an existing evidence package');
  const record = JSON.parse(fs.readFileSync(source, 'utf8'));
  const all = new Set(record.runs.map(run => run.fixture_id));
  if (all.size !== 10 || !PILOT.every(id => all.has(id))) throw new Error('Missing one of ten planned attempts');
  const keyFile = path.join(root, '.env.smart-goal-2');
  const credential = fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').split(/\r?\n/)
    .filter(line => line.startsWith('GEMINI_API_KEY=')).map(line =>
      line.substring('GEMINI_API_KEY='.length).trim().replace(/^[\"']|[\"']$/g, ''))[0] : '';
  if (!credential || credential.length < 10) throw new Error('Credential presence is needed to scan evidence for accidental key echoes');

  const copied = [];
  for (const run of record.runs) {
    if (run.outcome !== 'fresh_success') continue;
    if (!run.claim_inventory?.complete || !Array.isArray(run.claims) || !Array.isArray(run.decisions)) {
      throw new Error(run.fixture_id + ': fresh report lacks the completed source audit');
    }
    const raw = path.resolve(path.dirname(source), run.raw_response_path);
    const report = path.resolve(path.dirname(source), run.report_path);
    if (!raw.startsWith(local + path.sep) || !report.startsWith(local + path.sep)) {
      throw new Error('Provider file lies outside the generated Goal 2 evidence folder');
    }
    const rawBytes = fs.readFileSync(raw); const reportBytes = fs.readFileSync(report);
    if (rawBytes.toString('utf8').includes(credential) || reportBytes.toString('utf8').includes(credential)) {
      throw new Error('Credential echoed in saved evidence; cannot publish this result');
    }
    copied.push({ run, rawBytes, reportBytes });
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.mkdirSync(target);
  fs.mkdirSync(path.join(target, 'provider-responses'));
  fs.mkdirSync(path.join(target, 'reports'));
  fs.mkdirSync(path.join(target, 'source-text'));
  fs.writeFileSync(path.join(target, 'frozen-key.json'), JSON.stringify(record.frozen_key, null, 2) + '\n');
  for (const id of PILOT) {
    const filename = path.join(root, '.scratch/capstone-2-session/goal2-reference-extracted-text', id + '.txt');
    if (!fs.existsSync(filename)) throw new Error('Missing source text for ' + id);
    fs.copyFileSync(filename, path.join(target, 'source-text', id + '.txt'));
  }
  for (const { run, rawBytes, reportBytes } of copied) {
    fs.writeFileSync(path.join(target, 'provider-responses', run.fixture_id + '.json'), rawBytes);
    fs.writeFileSync(path.join(target, 'reports', run.fixture_id + '.json'), reportBytes);
    run.raw_response_path = 'provider-responses/' + run.fixture_id + '.json';
    run.report_path = 'reports/' + run.fixture_id + '.json';
    run.audit_origin = 'ChatGPT-assisted project source audit; not independently human verified';
  }
  fs.writeFileSync(path.join(target, 'ai-run-record.json'), JSON.stringify(record, null, 2) + '\n');
  process.stdout.write('Portable, credential-scanned Goal 2 evidence package created in benchmarks/std/results/goal2-20260921.\n');
}
if (require.main === module) {
  try { packageEvidence(); }
  catch (error) { console.error('GOAL 2 EVIDENCE NOT PACKAGED: ' + error.message); process.exitCode = 1; }
}
module.exports = { packageEvidence };
