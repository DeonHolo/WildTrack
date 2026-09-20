'use strict';

// Package SANITIZED SRS pilot evidence; no original student/template PDF or credential is included.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const repo = path.resolve(__dirname, '../../../..');
const privateBase = path.join(repo, '.scratch/capstone-2-session/srs-followup');
const target = path.join(__dirname, 'results/srs-followup-20260921');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const cases = ['SRS-01','SRS-02','SRS-03','SRS-04','SRS-05','SRS-06'];
function packageEvidence() {
  if (fs.existsSync(target)) throw new Error('Refusing to overwrite previous experiment evidence');
  const keyPath = path.join(repo, '.env.smart-goal-2');
  const credential = fs.existsSync(keyPath) ? fs.readFileSync(keyPath, 'utf8').split(/\r?\n/)
    .filter(line => line.startsWith('GEMINI_API_KEY='))
    .map(line => line.substring('GEMINI_API_KEY='.length).trim().replace(/^[\x22\x27]|[\x22\x27]$/g, ''))[0] : '';
  if (!credential || credential.length < 10) throw new Error('Local secret needed to scan generated content');
  const freeze = fs.readFileSync(path.join(privateBase, 'frozen-key.json'));
  const frozen = JSON.parse(freeze);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  if (manifest.fixtures.length !== 6) throw new Error('Wrong manifest size');
  const results = [];
  const copied = [];
  for (const id of cases) {
    const caseDir = path.join(privateBase, 'attempts', id);
    const attemptPath = path.join(caseDir, 'attempt-result.json');
    if (!fs.existsSync(attemptPath)) throw new Error(id + ': an actual one-shot attempt is still missing');
    const attempt = JSON.parse(fs.readFileSync(attemptPath, 'utf8'));
    const declared = manifest.fixtures.find(f => f.fixture_id === id);
    if (!declared || declared.sha256 !== frozen.fixture_sha256[id] ||
      attempt.fixture_sha256 !== declared.sha256 ||
      attempt.app_commit !== frozen.app_commit || attempt.reference_sha256 !== frozen.reference_sha256) {
      throw new Error(id + ': source/reference fingerprint mismatch');
    }
    const row = { ...attempt, planned_observation: declared.expected_observation };
    for (const kind of ['raw-report.json','production-filtered-report.json','raw-provider-response.json']) {
      const full = path.join(caseDir, kind);
      if (!fs.existsSync(full)) continue;
      const bytes = fs.readFileSync(full);
      if (bytes.toString('utf8').includes(credential)) throw new Error(id + ': credential present in output');
      const sha = hash(bytes);
      if (kind === 'raw-report.json' && sha !== attempt.raw_report_sha256) throw new Error(id + ': raw report mutated');
      if (kind === 'production-filtered-report.json' &&
        sha !== attempt.production_filtered_report_sha256) throw new Error(id + ': final report mutated');
      if (kind === 'raw-provider-response.json' &&
        sha !== attempt.raw_provider_sha256) throw new Error(id + ': raw HTTP response mutated');
      copied.push({id, kind, bytes});
    }
    if (row.outcome === 'fresh_success' &&
      !['raw-report.json','production-filtered-report.json','raw-provider-response.json'].every(
        kind => copied.some(entry => entry.id === id && entry.kind === kind))) {
      throw new Error(id + ': successful report has missing original/final evidence');
    }
    results.push(row);
  }
  fs.mkdirSync(target, { recursive: true });
  for (const {id,kind,bytes} of copied) {
    const folder = path.join(target,id);
    fs.mkdirSync(folder, {recursive:true});
    fs.writeFileSync(path.join(folder,kind), bytes, {flag:'wx'});
  }
  fs.writeFileSync(path.join(target,'frozen-key.json'),freeze,{flag:'wx'});
  fs.writeFileSync(path.join(target,'attempts.json'),
    JSON.stringify({type:'SANITIZED_SRS_SEPARATE_FOLLOWUP',scope:'Synthetic SRS component plus production postprocessing',
      limitations:['Not the original private SRS or a student population','Project/AI-assisted fixture reference is not independently validated',
        'No change to the original frozen STD Goal 2 first-pilot result','Full UI/Drive/cache pathway not exercised'],
      attempts:results},null,2)+'\n',{flag:'wx'});
  process.stdout.write('Packaged six original synthetic-only one-shot SRS outcomes; no private source files or credentials.\n');
}
if (require.main === module) {
  try {packageEvidence();}
  catch(error){console.error('SRS FOLLOW-UP NOT PACKAGED: '+error.message);process.exitCode=1;}
}
module.exports={packageEvidence};
