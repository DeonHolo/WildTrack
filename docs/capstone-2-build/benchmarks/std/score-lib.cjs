'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');

function csv(text) {
  const records = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        value += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(value);
      value = '';
    } else if (c === '\n') {
      row.push(value.replace(/\r$/, ''));
      records.push(row);
      row = [];
      value = '';
    } else if (c !== '\r') {
      value += c;
    }
  }
  if (quoted) throw new Error('Unterminated quoted CSV field');
  if (value || row.length) {
    row.push(value);
    records.push(row);
  }
  if (records.length === 0) throw new Error('Empty CSV');
  const headers = records.shift();
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV header');
  return records.filter(row => row.some(field => field.trim())).map((fields, index) => {
    if (fields.length !== headers.length) throw new Error(`CSV row ${index + 2}: expected ${headers.length} fields, received ${fields.length}`);
    return Object.fromEntries(headers.map((header, i) => [header, fields[i]]));
  });
}

function readCsv(filename) {
  return csv(fs.readFileSync(filename, 'utf8'));
}

function failUnless(test, detail) {
  if (!test) throw new Error(detail);
}

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function fixtureAuthority() {
  const hashes = new Map();
  const hashLines = fs.readFileSync(path.join(__dirname, 'fixture-hashes.sha256'), 'utf8')
    .trim().split(/\r?\n/);
  for (const line of hashLines) {
    const match = line.match(/^([0-9a-f]{64})\s{2}(.+)$/i);
    failUnless(match, `Invalid fixture-hashes.sha256 line: ${line}`);
    failUnless(!hashes.has(match[2]), `Duplicate fixture hash: ${match[2]}`);
    const filename = path.resolve(root, match[2]);
    failUnless(filename.startsWith(root + path.sep), `Hash path outside repository: ${match[2]}`);
    failUnless(fs.existsSync(filename), `Fixture missing: ${match[2]}`);
    failUnless(sha256(filename) === match[1].toLowerCase(), `Fixture hash drift: ${match[2]}. Restore the frozen file or version the manifest BEFORE collecting results.`);
    hashes.set(match[2], match[1].toLowerCase());
  }
  const templateHash = hashes.get('docs/STD TEMPLATE.pdf');
  failUnless(templateHash, 'Missing frozen official template hash');
  const manifest = readCsv(path.join(__dirname, 'manifest.csv'));
  const fixtures = new Map();
  for (const item of manifest) {
    failUnless(/^STD-\d{2}(?:-[a-z0-9-]+)?$/.test(item.fixture_id), `Invalid fixture ID: ${item.fixture_id}`);
    failUnless(!fixtures.has(item.fixture_id), `Duplicate fixture ID: ${item.fixture_id}`);
    const filename = path.resolve(__dirname, item.file);
    failUnless(filename.startsWith(root + path.sep), `Fixture path outside repository: ${item.file}`);
    const relative = path.relative(root, filename).replace(/\\/g, '/');
    failUnless(hashes.has(relative), `Missing frozen hash: ${relative}`);
    fixtures.set(item.fixture_id, { ...item, sha256: hashes.get(relative), file: relative });
  }
  return { templateHash, fixtures };
}

function labelsReviewed(rows, label = 'answer-key') {
  if (rows.some(row => row.review_status !== 'VERIFIED')) return false;
  for (const row of rows) {
    failUnless(row.reviewer && !/^\s*$/.test(row.reviewer), `Missing ${label} reviewer for ${row.fixture_id}`);
    failUnless(!Number.isNaN(Date.parse(row.reviewed_at)), `Invalid ${label} review timestamp for ${row.fixture_id}`);
    failUnless(row.authority, `Missing ${label} authority for ${row.fixture_id}`);
  }
  return true;
}

function ratio(n, d) {
  return d ? n / d : null;
}

function metric(n, d) {
  return { numerator: n, denominator: d, value: ratio(n, d) };
}

function getUnique(rows, key, label) {
  const map = new Map();
  for (const row of rows) {
    const id = row[key];
    failUnless(id, `Missing ${label} identifier`);
    failUnless(!map.has(id), `Duplicate ${label}: ${id}`);
    map.set(id, row);
  }
  return map;
}

module.exports = { csv, readCsv, failUnless, sha256, fixtureAuthority, labelsReviewed, metric, getUnique };
