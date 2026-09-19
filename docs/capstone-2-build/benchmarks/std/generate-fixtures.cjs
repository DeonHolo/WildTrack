const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('@playwright/test');

const repo = path.resolve(__dirname, '..', '..', '..', '..');
const outDir = path.join(__dirname, 'fixtures');
fs.mkdirSync(outDir, { recursive: true });

const headings = {
  intro: '1. Introduction',
  overview: '1.1. System Overview',
  approach: '1.2. Test Approach',
  defs: '1.3. Definitions and Acronyms',
  plan: '2. Test Plan',
  tested: '2.1 Features to be Tested',
  notTested: '2.2 Features not to be Tested',
  tools: '3.3 Testing Tools and Environment',
  cases: '3. Test Cases',
  purpose: '3.1.1 Purpose',
  inputs: '3.1.2 Inputs',
  expected: '3.1.3 Expected Outputs & Pass/Fail Criteria',
  procedure: '3.1.4 Test Procedure',
  appendix: 'Appendix (Test Logs)',
  log: 'A.1 Log for Test 1',
  results: 'A.2 Test Results',
  incident: 'A.3 Incident Report'
};

const placeholder = 'PLACEHOLDER: Complete this section using the project testing evidence and supplied instructions.';
const filler = 'This section contains sample filler content repeated for layout only and does not provide a concrete test fact, trace, result, or evidence.';

function section(title, body) {
  return `<section><h2>${title}</h2>${body.split('\n').map(p => `<p>${p}</p>`).join('')}</section>`;
}

function toc(includeApproach = true) {
  return `<section class="toc"><h2>Table of Contents</h2>
    <p>1. Introduction ........................................ 2</p>
    <p>1.1. System Overview .................................. 2</p>
    ${includeApproach ? '<p>1.2. Test Approach .................................... 2</p>' : ''}
    <p>1.3. Definitions and Acronyms ......................... 2</p>
    <p>2. Test Plan ........................................... 3</p>
    <p>2.1 Features to be Tested .............................. 3</p>
    <p>2.2 Features not to be Tested .......................... 3</p>
    <p>3.3 Testing Tools and Environment ...................... 3</p>
    <p>3. Test Cases .......................................... 4</p>
    <p>Appendix (Test Logs) ................................... 5</p>
  </section>`;
}

function shell(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 16mm 15mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 10.5pt; line-height: 1.45; margin: 0; }
    h1 { font-size: 20pt; margin: 0 0 4pt; } h2 { font-size: 13pt; margin: 15pt 0 5pt; break-after: avoid; }
    p { margin: 0 0 7pt; } .meta { color: #4b5563; margin-bottom: 16pt; }
    .toc p { margin: 1pt 0; font-size: 9.5pt; } section { break-inside: avoid-page; }
    .notice { border: 1px solid #9ca3af; padding: 7pt; margin: 10pt 0; background: #f9fafb; }
  </style></head><body><h1>Software Test Document</h1><div class="meta">WildTrack | Synthetic benchmark fixture | ${title}</div>
  <div class="notice"><strong>Synthetic benchmark fixture.</strong> Content below is controlled test material, not evidence that real software testing occurred.</div>
  ${body}</body></html>`;
}

function templateLikeShell(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 16mm 15mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 10.5pt; line-height: 1.45; margin: 0; }
    h1 { font-size: 20pt; margin: 0 0 4pt; } h2 { font-size: 13pt; margin: 15pt 0 5pt; break-after: avoid; }
    p { margin: 0 0 7pt; } .toc p { margin: 1pt 0; font-size: 9.5pt; } section { break-inside: avoid-page; }
  </style></head><body>${body}</body></html>`;
}

function templateLikeBody(overviewBody = '') {
  return [
    '<p>CEBU INSTITUTE OF TECHNOLOGY</p><p>UNIVERSITY</p><p>COLLEGE OF COMPUTER STUDIES</p>',
    '<h1>Software Test Document</h1><p>for</p><p>WildTrack</p><p>Change History</p>',
    toc(true),
    '<p>Software Test Document</p><p>WildTrack</p><p>Document Version:1.0</p>',
    section(headings.intro, ''),
    section(headings.overview, overviewBody),
    section(headings.approach, ''),
    section(headings.defs, ''),
    '<p>Software Test Document</p><p>WildTrack</p><p>Document Version:1.0</p>',
    section(headings.plan, ''),
    section(headings.tested, ''),
    section(headings.notTested, ''),
    section(headings.tools, ''),
    '<p>Software Test Document</p><p>WildTrack</p><p>Document Version:1.0</p>',
    section(headings.cases, ''),
    section('3.n Case-n', ''),
    section('3.n.1 Purpose', ''),
    section('3.n.2 Inputs', ''),
    section('3.n.3 Expected Outputs & Pass/Fail Criteria', ''),
    section('3.n.4 Test Procedure', ''),
    '<p>Software Test Document</p><p>WildTrack</p><p>Document Version:1.0</p>',
    section(headings.appendix, ''),
    section('A.1 Log for Test n', ''),
    section('A.2 Test Results', ''),
    section('A.3 Incident Report', '')
  ].join('\n');
}

const meaningful = {
  overview: 'WildTrack is a capstone submission workflow that lets configured students submit link-based deliverables, lets advisers review responses and Document Check findings, and lets Admin users manage academic workflow configuration.',
  approach: 'The synthetic test approach covers valid and invalid submissions, missing required values, access failures, stale edits, authorization boundaries, and representative UI flows. Expected outcomes are defined before the synthetic run and actual observations belong in the test log.',
  defs: 'Admin: academic workflow administrator. Adviser: staff reviewer for assigned teams. Document Check: deterministic file-access, readability, and template-comparison checks. AI Review: grounded advisory content screening.',
  tested: 'Student Refactored SRS form submission and edit flow; required field validation; response ownership; Document Check visibility; adviser review access; Admin form configuration; stale-revision rejection.',
  notTested: 'Production grading decisions, payment features, unrelated external systems, and complete Google Drive revision authorship are outside this synthetic STD fixture.',
  tools: 'Local Spring Boot backend, H2 test database, Vitest, Playwright, JUnit, controlled PDF fixtures, and browser screenshots are used in the synthetic benchmark environment.',
  purpose: 'Verify that a configured student cannot save a Refactored SRS response while the required PDF link is blank, and that a valid link plus required validation step persists to the intended response.',
  inputs: 'Configured student identity, published Refactored SRS form, blank or valid Google Drive PDF link, and Validation step choice.',
  expected: 'Blank required PDF link is rejected without creating an incorrect response. A valid link with Initial submission is saved to the intended student/workspace/deliverable response. Pass only when all listed assertions hold.',
  procedure: 'Open the form as the configured synthetic student. Attempt the blank required-link submission. Enter the controlled link and Initial submission value. Save once. Re-open the same response and compare persisted values with the frozen expected values.',
  log: 'Synthetic run reference WT-BENCH-001. This fixture contains illustrative controlled observations only and is never treated as a real participant or real course execution.',
  results: 'Synthetic observation: the blank attempt was rejected and the controlled valid values were read back from the same synthetic response. This sentence is fixture content, not an actual WildTrack benchmark result.',
  incident: 'No synthetic mismatch is introduced in this complete fixture. A real incident report is required only when an observed result differs from its expected result.'
};

function standardBody(parts = {}) {
  return [
    toc(true),
    section(headings.intro, parts.intro || meaningful.overview),
    section(headings.overview, parts.overview || meaningful.overview),
    section(headings.approach, parts.approach || meaningful.approach),
    section(headings.defs, parts.defs || meaningful.defs),
    section(headings.plan, parts.plan || 'The following feature scope and environment are frozen for this synthetic benchmark fixture.'),
    section(headings.tested, parts.tested || meaningful.tested),
    section(headings.notTested, parts.notTested || meaningful.notTested),
    section(headings.tools, parts.tools || meaningful.tools),
    section(headings.cases, parts.cases || 'Controlled Test Case 1'),
    section(headings.purpose, parts.purpose || meaningful.purpose),
    section(headings.inputs, parts.inputs || meaningful.inputs),
    section(headings.expected, parts.expected || meaningful.expected),
    section(headings.procedure, parts.procedure || meaningful.procedure),
    section(headings.appendix, parts.appendix || 'The synthetic test log below separates expected outcomes from controlled fixture observations.'),
    section(headings.log, parts.log || meaningful.log),
    section(headings.results, parts.results || meaningful.results),
    section(headings.incident, parts.incident || meaningful.incident)
  ].join('\n');
}

const fixtures = [
  {
    id: 'STD-02_personalized-template-like',
    body: templateLikeBody(),
    templateLike: true
  },
  {
    id: 'STD-03_one-section-complete',
    body: templateLikeBody(meaningful.overview),
    templateLike: true
  },
  { id: 'STD-05_meaningful-complete', body: standardBody() },
  {
    id: 'STD-08_repeated-filler',
    body: [toc(true), ...Object.values(headings).map(h => section(h, `${filler}\n${filler}\n${filler}`))].join('\n')
  },
  {
    id: 'STD-09_varied-irrelevant',
    body: standardBody(Object.fromEntries(Object.keys(meaningful).map((k, i) => [k, [
      'The campus garden program coordinates seed exchanges, composting schedules, shaded seating, volunteer watering rotations, and seasonal planting workshops for neighborhood participants.',
      'A fictional travel club compares ferry timetables, museum opening hours, food-market routes, luggage limits, and weekend itineraries for visitors planning an island trip.',
      'An imaginary bakery tracks flour deliveries, oven temperatures, packaging designs, loyalty cards, storefront promotions, and daily pastry inventory for its retail operations.',
      'A reading group organizes monthly novels, discussion prompts, room reservations, lending copies, guest speakers, and attendance reminders for community members.'
    ][i % 4]])))
  },
  {
    id: 'STD-10_wrong-document',
    body: standardBody(Object.fromEntries(Object.keys(meaningful).map(k => [k,
      'This section describes a fictional social-media marketing campaign: audience segmentation, ad impressions, influencer outreach, brand slogans, posting schedules, and campaign engagement targets. It does not describe software testing, test execution, or WildTrack system behavior.'
    ])))
  },
  {
    id: 'STD-12_missing-test-approach',
    body: [
      toc(true),
      section(headings.intro, meaningful.overview), section(headings.overview, meaningful.overview),
      section(headings.defs, meaningful.defs), section(headings.plan, 'The feature scope and controlled environment below are frozen for this synthetic fixture.'),
      section(headings.tested, meaningful.tested), section(headings.notTested, meaningful.notTested), section(headings.tools, meaningful.tools),
      section(headings.cases, 'Controlled Test Case 1'), section(headings.purpose, meaningful.purpose), section(headings.inputs, meaningful.inputs),
      section(headings.expected, meaningful.expected), section(headings.procedure, meaningful.procedure),
      section(headings.appendix, 'Synthetic log structure.'), section(headings.log, meaningful.log), section(headings.results, meaningful.results), section(headings.incident, meaningful.incident)
    ].join('\n')
  },
  {
    id: 'STD-18_incomplete-no-template',
    body: [
      '<h1>Software Test Document</h1><p>WildTrack synthetic no-template pilot fixture</p>',
      section('Overview', meaningful.overview),
      section('Planned checks', meaningful.approach),
      section('Unfinished material', 'The remaining validation evidence and actual execution results are not supplied in this document. No official template is assumed by this fixture.')
    ].join('\n')
  },
  {
    id: 'STD-21_missing-execution-evidence',
    body: standardBody({
      results: 'NOT SUPPLIED IN THIS FIXTURE. No actual observed result, screenshot, log, recording, or system-output evidence is present.',
      log: 'NOT SUPPLIED IN THIS FIXTURE. Planned test identifiers exist, but no execution log is present.',
      incident: 'NOT SUPPLIED IN THIS FIXTURE. Because execution evidence is absent, this fixture cannot demonstrate whether an expected-versus-actual mismatch occurred.'
    })
  },
  {
    id: 'STD-24_toc-only-test-approach',
    body: [
      toc(true),
      section(headings.intro, meaningful.overview),
      section(headings.overview, meaningful.overview),
      '<!-- Test Approach intentionally omitted from the body. Its name remains only in the TOC. -->',
      section(headings.defs, meaningful.defs),
      section(headings.plan, 'This fixture intentionally omits the Test Approach body section while retaining its TOC entry.'),
      section(headings.tested, meaningful.tested), section(headings.notTested, meaningful.notTested), section(headings.tools, meaningful.tools),
      section(headings.cases, 'Controlled Test Case 1'), section(headings.purpose, meaningful.purpose), section(headings.inputs, meaningful.inputs),
      section(headings.expected, meaningful.expected), section(headings.procedure, meaningful.procedure),
      section(headings.appendix, 'Synthetic log structure.'), section(headings.log, meaningful.log), section(headings.results, meaningful.results), section(headings.incident, meaningful.incident)
    ].join('\n')
  }
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const hashLines = [];
  try {
    for (const fixture of fixtures) {
      const page = await browser.newPage();
      await page.setContent(fixture.templateLike ? templateLikeShell(fixture.body) : shell(fixture.id, fixture.body), { waitUntil: 'load' });
      const out = path.join(outDir, `${fixture.id}.pdf`);
      await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
      await page.close();
      const hash = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
      hashLines.push(`${hash}  ${path.relative(repo, out).replace(/\\/g, '/')}`);
      console.log(`${path.relative(repo, out)} sha256=${hash}`);
    }
    const template = path.join(repo, 'docs', 'STD TEMPLATE.pdf');
    if (fs.existsSync(template)) {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(template)).digest('hex');
      hashLines.unshift(`${hash}  docs/STD TEMPLATE.pdf`);
      console.log(`docs/STD TEMPLATE.pdf sha256=${hash}`);
    } else {
      console.log('docs/STD TEMPLATE.pdf MISSING');
      process.exitCode = 2;
    }
    fs.writeFileSync(path.join(__dirname, 'fixture-hashes.sha256'), hashLines.join('\n') + '\n');
  } finally {
    await browser.close();
  }
})();
