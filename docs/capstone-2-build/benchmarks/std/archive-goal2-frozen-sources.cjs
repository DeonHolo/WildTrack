'use strict';

// Goal 1 adds new fixture rows to the living STD benchmark manifest. Preserve the
// older Goal 2 pilot's *original* source bytes in a separate, hash-checked archive
// so its frozen key and raw reports remain reproducible without rewriting them.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const benchmark = __dirname;
const root = path.resolve(benchmark, '../../../..');
const key = JSON.parse(fs.readFileSync(path.join(benchmark,
  'results/goal2-20260921/frozen-key.json'), 'utf8'));
const target = path.join(benchmark, 'archives/goal2-20260921');
const required = [
  ['ai-checklist.csv', 'checklist_sha256'],
  ['manifest.csv', 'manifest_sha256'],
  ['fixture-hashes.sha256', 'fixture_hashes_sha256'],
  ['STD_AI_INSTRUCTIONS.txt', 'instructions_sha256'],
  ['GOAL2_REFERENCE_CHECKLIST.md', 'protocol_sha256']
];

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function archive() {
  if (!/^[a-f0-9]{40}$/i.test(key.app_commit)) throw new Error('No original frozen pilot source commit');
  const verified = required.map(([filename, field]) => {
    const relative = `docs/capstone-2-build/benchmarks/std/${filename}`;
    const bytes = execFileSync('git', ['show', `${key.app_commit}:${relative}`],
      { cwd: root, maxBuffer: 16 * 1024 * 1024 });
    if (sha(bytes) !== key[field])
      throw new Error(`${filename}: archived Git bytes do not match the actual pre-run frozen key`);
    return { filename, bytes };
  });
  fs.mkdirSync(target, { recursive: true });
  for (const { filename, bytes } of verified) {
    const output = path.join(target, filename);
    if (fs.existsSync(output)) {
      if (sha(fs.readFileSync(output)) !== sha(bytes))
        throw new Error(`Refusing to replace a different existing archived reference: ${filename}`);
      continue;
    }
    fs.writeFileSync(output, bytes, { flag: 'wx' });
  }
  return { source_commit: key.app_commit, destination: target,
    files: verified.map(({ filename, bytes }) => ({ file: filename, sha256: sha(bytes) })) };
}

if (require.main === module) {
  try { console.log(JSON.stringify(archive(), null, 2)); }
  catch (error) { console.error(`Goal 2 archive NOT prepared: ${error.message}`); process.exitCode = 1; }
}
module.exports = { archive };
