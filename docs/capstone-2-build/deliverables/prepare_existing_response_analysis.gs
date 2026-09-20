/**
 * WildTrack MVP - ANALYSIS FOR THE EXISTING, ALREADY-DISTRIBUTED FORM.
 *
 * Paste this into Extensions > Apps Script FROM THE EXISTING response spreadsheet,
 * run previewWildTrackResponseAnalysis() FIRST, then prepareWildTrackResponseAnalysis().
 *
 * This script NEVER creates/changes a Google Form, never changes the original
 * Form_Responses tab, never sends data to a URL, and never alters the existing
 * Objective 3 Task Log or protocol. It writes ONLY the two explicitly named
 * derived sheets below. Do not paste this into the original Form-creation script.
 *
 * Run prepareWildTrackResponseAnalysis() again to refresh while new responses
 * arrive. Researcher annotations in columns N:P are retained by source row.
 */
const WILDTRACK_ANALYSIS = Object.freeze({
  RAW_TAB: 'Form_Responses',
  ANALYSIS_TAB: 'Questionnaire Analysis',
  SUMMARY_TAB: 'Validation Summary',
  MAX_ROWS: 10000,
  HEADERS: [
    'survey_row_id', 'source_row', 'response_timestamp', 'consent_code',
    'role_code', 'student_basis', 'student_status_clarity',
    'student_save_clarity', 'adviser_clarity', 'admin_clarity',
    'route_complete', 'analysis_status', 'comment_present',
    'survey_duplicate_status', 'improvement_themes', 'researcher_note',
  ],
  /* Header matching uses the stable START of the actual Google Form question.
   * Do not reorder/match by positional column: role routes can add columns.
   * A missing or ambiguous required header causes preview/build to STOP.
   */
  QUESTIONS: Object.freeze({
    consent: ['do you voluntarily agree to participate in this wildtrack mvp evaluation'],
    role: ['which role best describes the wildtrack workflow'],
    studentBasis: ['which best describes your wildtrack experience'],
    studentStatus: ['based on the wildtrack student workflow', 'based on the current wildtrack student workflow'],
    studentSave: ['after submitting or editing a response'],
    studentComment: ['is there anything about the wildtrack student workflow'],
    adviserBasis: ['have you used or reviewed the current wildtrack adviser workflow'],
    adviserClarity: ['overall how clear were the current review state'],
    adviserComment: ['is there anything about the adviser workflow'],
    adminBasis: ['have you used or reviewed the current wildtrack admin'],
    adminClarity: ['overall how clear were the current state of the work'],
    adminComment: ['is there anything about the admin'],
  }),
});

function wildtrackNormalizedHeader_(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function wildtrackHeaderMap_(headers) {
  if (wildtrackNormalizedHeader_(headers[0]) !== 'timestamp') {
    throw new Error('Expected Timestamp in the first raw column; no sheets changed.');
  }
  const actual = headers.map(wildtrackNormalizedHeader_);
  const map = {timestamp: 0};
  Object.keys(WILDTRACK_ANALYSIS.QUESTIONS).forEach(key => {
    const prefixes = WILDTRACK_ANALYSIS.QUESTIONS[key].map(wildtrackNormalizedHeader_);
    const hits = actual.reduce((out, header, index) => {
      if (prefixes.some(prefix => header.startsWith(prefix))) out.push(index);
      return out;
    }, []);
    if (hits.length !== 1) {
      throw new Error('Expected exactly one Google Form header for ' + key +
        ', found ' + hits.length + '. Verify the real header before editing the mapping. No sheets changed.');
    }
    map[key] = hits[0];
  });
  return map;
}

function wildtrackAnswer_(row, index) {
  return String(row[index] === undefined || row[index] === null ? '' : row[index]).trim();
}

function wildtrackScale_(value) {
  const match = /^([1-5])(?:\s|$|[-–])/u.exec(String(value || '').trim());
  return match ? Number(match[1]) : '';
}

function wildtrackClassifyRow_(row, map, sourceRow) {
  const a = key => wildtrackAnswer_(row, map[key]);
  const consentRaw = a('consent').toLowerCase();
  const consent = consentRaw === 'yes, i agree' ? 'CONS_Y' :
    consentRaw === 'no, i do not agree' ? 'CONS_N' : 'CONS_UNKNOWN';
  const rawRole = a('role').toLowerCase();
  const role = rawRole === 'student' ? 'ROLE_STU' :
    rawRole === 'adviser' ? 'ROLE_ADV' :
    rawRole === 'admin or beneficiary' ? 'ROLE_ADM' :
    rawRole.startsWith('i have not used or reviewed wildtrack enough') ? 'ROLE_NONE' : 'ROLE_UNKNOWN';
  const studentBasisText = a('studentBasis').toLowerCase();
  const studentBasis = studentBasisText.startsWith('i completed or attempted the controlled') ? 'BASIS_TASK' :
    studentBasisText.startsWith('i have used the current wildtrack student workflow outside') ? 'BASIS_USE' :
    studentBasisText.startsWith('i have not used the current student workflow enough') ? 'BASIS_NONE' : '';
  const adviserBasis = a('adviserBasis').toLowerCase();
  const adminBasis = a('adminBasis').toLowerCase();
  const studentStatus = wildtrackScale_(a('studentStatus'));
  const studentSave = wildtrackScale_(a('studentSave'));
  const adviserClarity = wildtrackScale_(a('adviserClarity'));
  const adminClarity = wildtrackScale_(a('adminClarity'));
  let routeComplete = false;
  let comment = '';
  if (consent === 'CONS_N') {
    routeComplete = true;
  } else if (consent === 'CONS_Y' && role === 'ROLE_NONE') {
    routeComplete = true;
  } else if (consent === 'CONS_Y' && role === 'ROLE_STU') {
    routeComplete = studentBasis === 'BASIS_NONE' ||
      ((studentBasis === 'BASIS_TASK' || studentBasis === 'BASIS_USE') &&
        studentStatus !== '' && studentSave !== '');
    comment = a('studentComment');
  } else if (consent === 'CONS_Y' && role === 'ROLE_ADV') {
    routeComplete = adviserBasis === 'no' || (adviserBasis === 'yes' && adviserClarity !== '');
    comment = a('adviserComment');
  } else if (consent === 'CONS_Y' && role === 'ROLE_ADM') {
    routeComplete = adminBasis === 'no' || (adminBasis === 'yes' && adminClarity !== '');
    comment = a('adminComment');
  }
  const analysisStatus = consent === 'CONS_N' ? 'DECLINED' :
    consent === 'CONS_UNKNOWN' || role === 'ROLE_UNKNOWN' ? 'NEEDS_REVIEW' :
    !routeComplete ? 'NEEDS_REVIEW' :
    role === 'ROLE_NONE' || studentBasis === 'BASIS_NONE' ||
    (role === 'ROLE_ADV' && adviserBasis === 'no') ||
    (role === 'ROLE_ADM' && adminBasis === 'no') ? 'NO_USE' : 'ELIGIBLE';
  /* Raw comments and identity fields NEVER enter the derived sheet. The source
   * row is a restricted pointer for the researcher to review/redact manually. */
  return [
    'Q-' + String(sourceRow).padStart(4, '0'), sourceRow, row[map.timestamp] || '',
    consent, role, studentBasis, studentStatus, studentSave,
    adviserClarity, adminClarity, routeComplete ? 'YES' : 'NO',
    analysisStatus, comment ? 'YES' : 'NO',
  ];
}

function wildtrackSource_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Open the EXISTING response spreadsheet first.');
  const raw = spreadsheet.getSheetByName(WILDTRACK_ANALYSIS.RAW_TAB);
  if (!raw) throw new Error('Missing Form_Responses: no Google Form or response tab will be created.');
  const lastRow = raw.getLastRow();
  const lastCol = raw.getLastColumn();
  if (lastRow < 1 || lastCol < 2 || lastRow > WILDTRACK_ANALYSIS.MAX_ROWS) {
    throw new Error('Unexpected source dimensions; no sheets changed.');
  }
  const headers = raw.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = wildtrackHeaderMap_(headers);
  const data = lastRow > 1 ? raw.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  const rows = data.map((row, index) => ({row, sourceRow: index + 2}))
    .filter(item => item.row.some(value => value !== '' && value !== null));
  return {spreadsheet, raw, map, rows, lastRow, lastCol};
}

function previewWildTrackResponseAnalysis() {
  const source = wildtrackSource_();
  const counts = {ELIGIBLE: 0, NO_USE: 0, DECLINED: 0, NEEDS_REVIEW: 0};
  source.rows.forEach(item => {
    const status = wildtrackClassifyRow_(item.row, source.map, item.sourceRow)[11];
    counts[status] += 1;
  });
  console.log('Existing source: ' + source.raw.getName() + '; nonempty rows=' + source.rows.length);
  console.log('Provisional route counts (anonymous rows, NOT unique people): ' + JSON.stringify(counts));
  console.log('No worksheet was changed. Source is never sorted, cleared, moved, or rewritten.');
  return counts;
}

function prepareWildTrackResponseAnalysis() {
  const source = wildtrackSource_(); // preflight BEFORE any write
  const output = source.spreadsheet.getSheetByName(WILDTRACK_ANALYSIS.ANALYSIS_TAB);
  if (output && output.getRange(1, 1, 1, WILDTRACK_ANALYSIS.HEADERS.length)
    .getValues()[0].some((value, i) => value !== WILDTRACK_ANALYSIS.HEADERS[i])) {
    throw new Error('Existing Questionnaire Analysis has different headers; refusing to overwrite it.');
  }
  const annotations = {};
  if (output && output.getLastRow() > 1) {
    output.getRange(2, 1, output.getLastRow() - 1, 16).getValues().forEach(row => {
      if (row[0]) annotations[row[0]] = {timestamp: row[2], notes: row.slice(13, 16)};
    });
  }
  const summaryExisting = source.spreadsheet.getSheetByName(WILDTRACK_ANALYSIS.SUMMARY_TAB);
  if (summaryExisting && summaryExisting.getLastRow() &&
    String(summaryExisting.getRange('A1').getValue()) !== 'WILDTRACK MVP - DERIVED ANALYSIS') {
    throw new Error('Existing Validation Summary is not ours. Refusing to overwrite either analysis tab.');
  }
  const sameTimestamp = (a, b) => a instanceof Date && b instanceof Date ?
    a.getTime() === b.getTime() : String(a || '') === String(b || '');
  const analyzed = source.rows.map(item => {
    const safe = wildtrackClassifyRow_(item.row, source.map, item.sourceRow);
    const previous = annotations[safe[0]];
    if (previous && !sameTimestamp(previous.timestamp, safe[2])) {
      throw new Error('Raw row changed or was reordered at ' + safe[0] +
        '. Manual annotation must be reconciled before a refresh; no derived sheets changed.');
    }
    return safe.concat(previous ? previous.notes : ['', '', '']);
  });
  const analysis = output || source.spreadsheet.insertSheet(WILDTRACK_ANALYSIS.ANALYSIS_TAB);
  analysis.getRange(1, 1, 1, WILDTRACK_ANALYSIS.HEADERS.length).setValues([WILDTRACK_ANALYSIS.HEADERS]);
  if (analyzed.length) analysis.getRange(2, 1, analyzed.length, 16).setValues(analyzed);
  const priorRowCount = analysis.getLastRow();
  if (priorRowCount > analyzed.length + 1) {
    analysis.getRange(analyzed.length + 2, 1, priorRowCount - analyzed.length - 1, 16).clearContent();
  }
  analysis.getRange(1, 1, 1, 16).setFontWeight('bold').setBackground('#17324D').setFontColor('#FFFFFF').setWrap(true);
  analysis.setFrozenRows(1);
  analysis.setColumnWidth(1, 122);
  analysis.setColumnWidth(3, 165);
  analysis.setColumnWidth(12, 125);
  analysis.setColumnWidth(15, 270);
  analysis.setColumnWidth(16, 280);
  analysis.getRange('A1').setNote('Only derived rows; raw Form_Responses is unchanged. Q-XXXX is the source spreadsheet row, NOT a participant identity.');
  analysis.getRange('L1').setNote('NEEDS_REVIEW and anonymous duplicate uncertainty are excluded from unique-participant claims. Do not silently convert blank consent to Yes.');
  analysis.getRange('N1').setNote('Researcher annotation retained on refresh. Mark obvious repeat rows conservatively; anonymous identity cannot be verified from matching answers.');
  const summary = summaryExisting ||
    source.spreadsheet.insertSheet(WILDTRACK_ANALYSIS.SUMMARY_TAB);
  summary.clearContents();
  const fixed = [
    ['WILDTRACK MVP - DERIVED ANALYSIS', 'Live Google Form response tab remains unchanged'],
    ['Last manually refreshed', new Date()],
    ['Response source', WILDTRACK_ANALYSIS.RAW_TAB],
    ['Scope', 'Anonymous response rows; never infer unique people or Goal 3 accuracy from this sheet'],
    ['Eligible questionnaire rows', ''],
    ['Student eligible rows', ''],
    ['Adviser eligible rows', ''],
    ['Admin eligible rows', ''],
    ['No-use rows', ''],
    ['Declined rows', ''],
    ['Needs manual review', ''],
    ['Student status clarity mean (1-5)', ''],
    ['Student save clarity mean (1-5)', ''],
    ['Adviser review clarity mean (1-5)', ''],
    ['Admin review clarity mean (1-5)', ''],
    ['Goal 1 component classification agreement', '52/52 (100%) - source-frozen synthetic project reference, post-run scope clarification'],
    ['Goal 2 new synthetic v6 agreement', '9/9 (100%) conditional on 9/10 fresh successful reports'],
    ['Goal 2 new synthetic v6 source support', '10/11 (90.9%), 1 unassessable; original v3 below target'],
    ['Goal 3 transaction correctness', 'PENDING real T1/T2 system/task evidence; never inferred from Form answers'],
    ['Participation', '30 unique consenting participants is a planned course target; rows are not verified unique people'],
    ['Framework endorsement', 'NOT VERIFIED - obtain adviser endorsement of GQM and Goal 1 post-benchmark scope'],
  ];
  summary.getRange(1, 1, fixed.length, 2).setValues(fixed);
  const tab = "'" + WILDTRACK_ANALYSIS.ANALYSIS_TAB.replace(/'/g,"''") + "'";
  const f = {
    5: `=COUNTIF(${tab}!L2:L,\"ELIGIBLE\")`,
    6: `=COUNTIFS(${tab}!L2:L,\"ELIGIBLE\",${tab}!E2:E,\"ROLE_STU\")`,
    7: `=COUNTIFS(${tab}!L2:L,\"ELIGIBLE\",${tab}!E2:E,\"ROLE_ADV\")`,
    8: `=COUNTIFS(${tab}!L2:L,\"ELIGIBLE\",${tab}!E2:E,\"ROLE_ADM\")`,
    9: `=COUNTIF(${tab}!L2:L,\"NO_USE\")`,
    10: `=COUNTIF(${tab}!L2:L,\"DECLINED\")`,
    11: `=COUNTIF(${tab}!L2:L,\"NEEDS_REVIEW\")`,
    12: `=IFERROR(AVERAGE(FILTER(${tab}!G2:G,${tab}!L2:L=\"ELIGIBLE\",${tab}!E2:E=\"ROLE_STU\")),\"N/A\")`,
    13: `=IFERROR(AVERAGE(FILTER(${tab}!H2:H,${tab}!L2:L=\"ELIGIBLE\",${tab}!E2:E=\"ROLE_STU\")),\"N/A\")`,
    14: `=IFERROR(AVERAGE(FILTER(${tab}!I2:I,${tab}!L2:L=\"ELIGIBLE\",${tab}!E2:E=\"ROLE_ADV\")),\"N/A\")`,
    15: `=IFERROR(AVERAGE(FILTER(${tab}!J2:J,${tab}!L2:L=\"ELIGIBLE\",${tab}!E2:E=\"ROLE_ADM\")),\"N/A\")`,
  };
  Object.keys(f).forEach(n => summary.getRange(Number(n), 2).setFormula(f[n]));
  summary.getRange('A1:B1').setFontWeight('bold').setBackground('#17324D').setFontColor('#FFFFFF');
  summary.setColumnWidth(1, 330);
  summary.setColumnWidth(2, 670);
  summary.getRange(1, 1, fixed.length, 2).setWrap(true);
  summary.setFrozenRows(1);
  console.log('Prepared derived analysis for ' + analyzed.length + ' nonempty response rows. Live form/raw tab/task log untouched.');
}
