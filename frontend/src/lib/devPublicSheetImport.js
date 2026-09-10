// Optional development-only public CSV import. Production uses workspaceAdminClient.
import { extractSheetId, normalizeStudentNumber, slugify, isUsableAdviserName, getProjectMetadata } from './workflow.js';

function normalizeLoose(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildPublishedSheetCsvUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  try {
    const url = new URL(text);
    const gidMatch = text.match(/[?&#]gid=([0-9]+)/);
    const gid = gidMatch?.[1] || url.searchParams.get('gid') || '0';

    if (url.pathname.includes('/pubhtml')) {
      url.pathname = url.pathname.replace('/pubhtml', '/pub');
      url.searchParams.set('gid', gid);
      url.searchParams.set('single', 'true');
      url.searchParams.set('output', 'csv');
      return url.toString();
    }

    if (url.pathname.includes('/pub')) {
      url.searchParams.set('output', 'csv');
      return url.toString();
    }

    const normalId = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/i)?.[1];
    if (normalId) {
      return `https://docs.google.com/spreadsheets/d/${normalId}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(gid)}`;
    }
  } catch {
    return '';
  }

  return '';
}

export async function importPublicClassRecord(sheetUrl, existingStudents = []) {
  return importPublicSheetSource('tracker', { sheetUrl }, { students: existingStudents });
}

export async function importPublicSheetSource(sourceType, payload, current) {
  if (!import.meta.env.DEV) throw new Error('Public CSV preview is development-only.');
  const sheetUrl = payload.sheetUrl;
  const csvUrl = buildPublishedSheetCsvUrl(sheetUrl);
  if (!csvUrl) {
    return {
      ok: false,
      sourceType,
      error: 'Use a valid Google Sheet link or published Sheet URL.'
    };
  }

  let response;
  try {
    response = await fetch(csvUrl, { cache: 'no-store' });
  } catch {
    return {
      ok: false,
      sourceType,
      csvUrl,
      error: 'Could not fetch the published Sheet. If the Sheet is private, use a published/public link for this public Sheet import.'
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      sourceType,
      csvUrl,
      error: `Google Sheets returned ${response.status}. Check that the Sheet is published or public.`
    };
  }

  const csvText = await response.text();
  const parsed = parseCsv(csvText);
  const usableRows = parsed.filter((row) => row.some((cell) => String(cell || '').trim()));
  if (usableRows.length < 2) {
    return {
      ok: false,
      sourceType,
      csvUrl,
      error: 'The Sheet did not contain a header row and student rows.'
    };
  }

  if (sourceType === 'teamFormation') return normalizeTeamFormationRows(usableRows, current, csvUrl, payload.mappingOverrides);
  if (sourceType === 'projectMonitor') return normalizeProjectMonitorRows(usableRows, current, csvUrl, payload.mappingOverrides);
  return normalizeTrackerRows(usableRows, current, csvUrl, payload.mappingOverrides);
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows.map((items) => items.map((item) => String(item || '').trim()));
}

function normalizeTeamFormationRows(rows, current, csvUrl, mappingOverrides = null) {
  const headerInfo = findBestHeaderRow(rows, inferIdentityColumns, scoreTeamFormationHeader);
  const headers = headerInfo.headers;
  const identity = applyColumnOverrides(headers, inferIdentityColumns(headers), mappingOverrides);
  const warnings = [];
  const existingByNumber = new Map((current.students || []).map((student) => [normalizeStudentNumber(student.studentNumber), student]));
  const existingByTeamMember = new Map((current.students || []).map((student) => [makeTeamMemberKey(student.teamCode, student.memberNumber), student]));

  const detectedFields = [
    identity.studentNumber >= 0 ? 'Student Number' : '',
    identity.studentName >= 0 || identity.lastName >= 0 || identity.firstName >= 0 ? 'Student Name' : '',
    identity.teamCode >= 0 ? 'Team Code' : '',
    identity.memberNumber >= 0 ? 'Member Number' : '',
    identity.email >= 0 ? 'Institutional Email' : ''
  ].filter(Boolean);
  const missingFields = [
    identity.studentNumber < 0 ? 'Student Number' : '',
    identity.studentName < 0 && identity.lastName < 0 && identity.firstName < 0 ? 'Student Name' : '',
    identity.teamCode < 0 ? 'Team Code' : ''
  ].filter(Boolean);
  const mappings = mappingSuggestions(headers, identity, [
    { key: 'studentNumber', label: 'Student number', required: true },
    { key: 'studentName', label: 'Student name' },
    { key: 'lastName', label: 'Last name' },
    { key: 'firstName', label: 'First name' },
    { key: 'teamCode', label: 'Team code', required: true },
    { key: 'memberNumber', label: 'Member number' },
    { key: 'email', label: 'Institutional email' }
  ]);
  const optionalFields = [
    identity.memberNumber < 0 ? 'Member Number' : '',
    identity.email < 0 ? 'Institutional Email' : ''
  ].filter(Boolean);
  const unrecognizedFields = unrecognizedHeaders(headers, identity);
  if (missingFields.length) {
    return {
      ok: false,
      sourceType: 'teamFormation',
      csvUrl,
      error: `This Sheet does not match Team Formation. Missing: ${missingFields.join(', ')}.`,
      importSummary: {
        sourceType: 'Team Formation',
        resultStatus: 'Import blocked',
        headerRow: headerInfo.index + 1,
        headers,
        mappings,
        detectedFields,
        missingFields,
        optionalFields,
        unrecognizedFields,
        skippedRows: [],
        metrics: {},
        warnings: []
      }
    };
  }

  let skippedRows = 0;
  const skippedRowDetails = [];
  const students = rows.slice(headerInfo.index + 1).map((row, rowIndex) => {
    const studentNumber = getCell(row, identity.studentNumber);
    const name = getStudentNameFromIdentity(row, identity);
    const teamCode = getCell(row, identity.teamCode);
    const memberNumber = getCell(row, identity.memberNumber);
    if (!studentNumber || !name || !teamCode) {
      skippedRows += 1;
      skippedRowDetails.push({ rowNumber: headerInfo.index + rowIndex + 2, reason: 'Missing Student Number, name, or team code' });
      return null;
    }
    const existing = existingByNumber.get(normalizeStudentNumber(studentNumber)) || existingByTeamMember.get(makeTeamMemberKey(teamCode, memberNumber)) || {};
    return {
      ...existing,
      rowKey: existing.rowKey || `team-formation-${headerInfo.index + rowIndex + 2}`,
      studentNumber,
      name,
      teamCode,
      memberNumber: Number(memberNumber) || memberNumber || existing.memberNumber || '',
      section: getCell(row, identity.section) || existing.section || 'IT332',
      adviser: resolveAdviser(current, teamCode, getCell(row, identity.adviser), existing.adviser),
      email: getCell(row, identity.email) || existing.email || '',
      milestones: existing.milestones || {}
    };
  }).filter(Boolean);

  if (skippedRows) {
    warnings.push(`Skipped ${skippedRows} Team Formation row${skippedRows === 1 ? '' : 's'} without Student Number, name, or team code.`);
  }
  if (identity.memberNumber < 0) warnings.push('Member Number was not found; team membership order will be blank.');
  if (identity.email < 0) warnings.push('Institutional Email was not found; account matching will use Student Number.');

  const metrics = {
    students: students.length,
    officialIds: students.filter((student) => student.studentNumber).length,
    teams: new Set(students.map((student) => student.teamCode).filter(Boolean)).size,
    memberNumbers: students.filter((student) => String(student.memberNumber || '').trim()).length,
    institutionalEmails: students.filter((student) => student.email).length,
    skippedRows
  };

  return {
    ok: true,
    sourceType: 'teamFormation',
    csvUrl,
    headers,
    identity,
    students,
    warnings,
    importSummary: {
      sourceType: 'Team Formation',
      resultStatus: warnings.length ? 'Imported with warnings' : 'Imported',
      studentsFound: students.length,
      officialIdsFound: students.filter((student) => student.studentNumber).length,
      columnsFound: headers.length,
      headerRow: headerInfo.index + 1,
      headers,
      mappings,
      detectedFields,
      missingFields: [],
      optionalFields,
      unrecognizedFields,
      skippedRows: skippedRowDetails,
      metrics,
      warnings
    }
  };
}

function normalizeTrackerRows(rows, current, csvUrl, mappingOverrides = null) {
  const headerInfo = findBestHeaderRow(rows, inferIdentityColumns, scoreTrackerHeader);
  const headers = headerInfo.headers;
  const identity = applyColumnOverrides(headers, inferIdentityColumns(headers), mappingOverrides);
  const identityIndexes = new Set(Object.values(identity).filter((index) => index >= 0));
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  const softwareTitleIndex = findHeader(normalizedHeaders, ['softwaretitle', 'softwarename']);
  const rowNumberIndex = findExactHeader(normalizedHeaders, ['no', 'number', 'rowno', 'rownumber']);
  if (softwareTitleIndex >= 0) identityIndexes.add(softwareTitleIndex);
  if (rowNumberIndex >= 0) identityIndexes.add(rowNumberIndex);
  const existingTrackerColumns = current.trackerColumns || [];
  const existingTrackerByKey = new Map(existingTrackerColumns.map((column) => [normalizeHeader(column.key), column]));
  const trackerColumnIndexes = new Set(headers
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => header && !identityIndexes.has(index))
    .filter(({ header, index }) => existingTrackerByKey.has(normalizeHeader(header))
      || hasDeadlineEvidence(rows, headerInfo.index, identity, index))
    .map(({ index }) => index));
  const activeTrackerColumns = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => header && trackerColumnIndexes.has(index))
    .map(({ header, index }, displayOrder) => ({
      ...(existingTrackerByKey.get(normalizeHeader(header)) || {}),
      id: existingTrackerByKey.get(normalizeHeader(header))?.id || `col-import-${slugify(header) || index}`,
      key: header,
      label: header,
      sourceColumn: header,
      sourceColumnIndex: index,
      displayOrder,
      active: true,
      pdfRequired: isLikelyPdfDeliverable(header)
    }));
  const importedTrackerKeys = new Set(activeTrackerColumns.map((column) => normalizeHeader(column.key)));
  const trackerColumns = [
    ...activeTrackerColumns,
    ...existingTrackerColumns
      .filter((column) => !importedTrackerKeys.has(normalizeHeader(column.key)))
      .map((column) => ({ ...column, active: false }))
  ];
  const unrecognizedFields = headers.filter((header, index) => (
    header && !identityIndexes.has(index) && !trackerColumnIndexes.has(index)
  ));
  const detectedFields = [
    identity.studentName >= 0 || identity.lastName >= 0 || identity.firstName >= 0 ? 'Student Name' : '',
    identity.teamCode >= 0 ? 'Team Code' : '',
    identity.memberNumber >= 0 ? 'Member Number' : '',
    activeTrackerColumns.length ? `${activeTrackerColumns.length} deliverable column${activeTrackerColumns.length === 1 ? '' : 's'}` : ''
  ].filter(Boolean);
  const missingFields = [
    identity.studentName < 0 && identity.lastName < 0 && identity.firstName < 0 ? 'Student Name' : '',
    identity.teamCode < 0 ? 'Team Code' : '',
    activeTrackerColumns.length === 0 ? 'Deliverable columns' : ''
  ].filter(Boolean);
  const mappings = mappingSuggestions(headers, identity, [
    { key: 'studentName', label: 'Student name', required: true },
    { key: 'lastName', label: 'Last name' },
    { key: 'firstName', label: 'First name' },
    { key: 'teamCode', label: 'Team code', required: true },
    { key: 'memberNumber', label: 'Member number' },
    { key: 'studentNumber', label: 'Student number' }
  ]);
  const optionalFields = [
    identity.studentNumber < 0 ? 'Student Number' : '',
    identity.memberNumber < 0 ? 'Member Number' : ''
  ].filter(Boolean);
  const warnings = [];
  if (unrecognizedFields.length) {
    warnings.push(`Ignored Tracker header${unrecognizedFields.length === 1 ? '' : 's'} without deadline evidence or prior tracker-column history: ${unrecognizedFields.join(', ')}.`);
  }
  if (missingFields.length) {
    return {
      ok: false,
      sourceType: 'tracker',
      csvUrl,
      error: `This Sheet does not match Tracker. Missing: ${missingFields.join(', ')}.`,
      importSummary: {
        sourceType: 'Tracker',
        resultStatus: 'Import blocked',
        headerRow: headerInfo.index + 1,
        headers,
        mappings,
        detectedFields,
        missingFields,
        optionalFields,
        unrecognizedFields,
        skippedRows: [],
        metrics: {},
        deadlineRows: [],
        suggestedForms: [],
        warnings: []
      }
    };
  }

  const existingStudents = current.students || [];
  const existingByStudentNumber = new Map(existingStudents
    .filter((student) => student.studentNumber)
    .map((student) => [normalizeStudentNumber(student.studentNumber), student]));
  const existingByNameTeamMember = new Map(existingStudents.map((student) => [
    makeStudentMatchKey(student.name, student.teamCode, student.memberNumber),
    student
  ]));
  const existingByTeamMember = new Map(existingStudents.map((student) => [
    makeTeamMemberKey(student.teamCode, student.memberNumber),
    student
  ]));

  if (identity.studentNumber < 0) {
    warnings.push('Tracker has no Student Number column. Official IDs are preserved from Team Formation only.');
  }

  let skippedRows = 0;
  const skippedRowDetails = [];
  const deadlineRows = [];
  const trackerRows = rows.slice(headerInfo.index + 1).map((row, rowIndex) => {
    const name = getStudentNameFromIdentity(row, identity);
    const teamCode = getCell(row, identity.teamCode);
    const memberNumber = getCell(row, identity.memberNumber);
    if (!name || !teamCode) {
      const suggestions = detectDeadlineSuggestions(row, headers, activeTrackerColumns);
      if (suggestions.length) {
        deadlineRows.push({ rowNumber: headerInfo.index + rowIndex + 2, suggestions });
      }
      skippedRows += 1;
      skippedRowDetails.push({
        rowNumber: headerInfo.index + rowIndex + 2,
        reason: suggestions.length
          ? `Deadline row with ${suggestions.length} detected value${suggestions.length === 1 ? '' : 's'}`
          : 'Missing student name or team code'
      });
      return null;
    }
    const trackerStudentNumber = getCell(row, identity.studentNumber);
    const matchedExisting = (trackerStudentNumber ? existingByStudentNumber.get(normalizeStudentNumber(trackerStudentNumber)) : null)
      || existingByTeamMember.get(makeTeamMemberKey(teamCode, memberNumber))
      || existingByNameTeamMember.get(makeStudentMatchKey(name, teamCode, memberNumber))
      || null;
    const studentNumber = trackerStudentNumber || matchedExisting?.studentNumber || '';
    const milestones = {
      ...(matchedExisting?.milestones || {}),
      ...Object.fromEntries(activeTrackerColumns.map((column) => [
        column.key,
        getCell(row, headers.indexOf(column.sourceColumn))
      ]))
    };

    return {
      ...matchedExisting,
      rowKey: matchedExisting?.rowKey || `tracker-${teamCode}-${memberNumber || rowIndex + 1}`,
      studentNumber,
      name: name || `Student ${rowIndex + 1}`,
      teamCode: teamCode || 'Unassigned',
      teamFormationCode: matchedExisting?.teamFormationCode || matchedExisting?.teamCode || '',
      memberNumber: Number(memberNumber) || memberNumber || '',
      section: getCell(row, identity.section) || matchedExisting?.section || 'IT332',
      adviser: resolveAdviser(current, teamCode, getCell(row, identity.adviser), matchedExisting?.adviser),
      softwareTitle: getCell(row, softwareTitleIndex) || matchedExisting?.softwareTitle || '',
      email: getCell(row, identity.email) || matchedExisting?.email || '',
      milestones
    };
  }).filter(Boolean);

  // Once a current Tracker is imported, it defines the active roster for the
  // workspace. Team Formation still enriches matching rows with stable IDs and
  // email, but historical students absent from the current Tracker are not
  // carried into the active UI.
  const students = trackerRows;

  const projectMetadata = (current.projectMetadata || []).map((project) => {
    const sourceGroupCode = project.sourceGroupCode || project.groupCode;
    const linked = students.filter((student) => normalizeLoose(student.teamFormationCode) === normalizeLoose(sourceGroupCode));
    const currentTeams = [...new Set(linked.map((student) => student.teamCode).filter(Boolean))];
    if (currentTeams.length !== 1) return null;
    const representative = linked.find((student) => student.softwareTitle || isUsableAdviserName(student.adviser)) || linked[0];
    return {
      ...project,
      sourceGroupCode,
      groupCode: currentTeams[0],
      softwareName: representative?.softwareTitle || project.softwareName,
      adviserName: isUsableAdviserName(representative?.adviser) ? representative.adviser : project.adviserName
    };
  }).filter(Boolean);

  if (skippedRows) {
    warnings.push(`Skipped ${skippedRows} non-student row${skippedRows === 1 ? '' : 's'} without a name and team code.`);
  }
  if (deadlineRows.length) {
    warnings.push(`Detected ${deadlineRows.flatMap((row) => row.suggestions).length} deadline value${deadlineRows.flatMap((row) => row.suggestions).length === 1 ? '' : 's'} from skipped tracker rows.`);
  } else {
    warnings.push('No deadline row was detected. Tracker data was imported without form suggestions.');
  }

  const suggestedForms = deadlineRows.flatMap((row) => row.suggestions);
  const rosterNumbers = new Set(existingStudents.map((student) => normalizeStudentNumber(student.studentNumber)).filter(Boolean));
  const matchedRows = trackerRows.filter((student) => (
    rosterNumbers.has(normalizeStudentNumber(student.studentNumber)) ||
    existingByTeamMember.has(makeTeamMemberKey(student.teamCode, student.memberNumber))
  )).length;
  const metrics = {
    studentRows: trackerRows.length,
    trackerColumns: activeTrackerColumns.length,
    rawProgressCells: trackerRows.length * activeTrackerColumns.length,
    matchedRows,
    unmatchedRows: Math.max(0, trackerRows.length - matchedRows),
    deadlineValues: suggestedForms.length,
    skippedRows
  };
  return {
    ok: true,
    sourceType: 'tracker',
    csvUrl,
    headers,
    identity,
    trackerColumns,
    students,
    projectMetadata,
    warnings,
    deadlineRows,
    suggestedForms,
    importSummary: {
      sourceType: 'Tracker',
      resultStatus: warnings.length ? 'Imported with warnings' : 'Imported',
      studentsFound: trackerRows.length,
      officialIdsFound: students.filter((student) => student.studentNumber).length,
      columnsFound: activeTrackerColumns.length,
      headerRow: headerInfo.index + 1,
      headers,
      mappings,
      detectedFields,
      missingFields: [],
      optionalFields,
      unrecognizedFields,
      skippedRows: skippedRowDetails,
      metrics,
      deadlineRows,
      suggestedForms,
      warnings
    }
  };
}

function normalizeProjectMonitorRows(rows, current, csvUrl, mappingOverrides = null) {
  const headerInfo = findBestHeaderRow(rows, inferProjectMonitorColumns, scoreProjectMonitorHeader);
  const headers = headerInfo.headers;
  const indexes = applyColumnOverrides(headers, inferProjectMonitorColumns(headers), mappingOverrides);
  const warnings = [];
  const detectedFields = [
    indexes.groupCode >= 0 ? 'Group Code' : '',
    indexes.projectTitle >= 0 ? 'Project Title' : '',
    indexes.softwareName >= 0 ? 'Software Name' : '',
    indexes.description >= 0 ? 'Description' : '',
    indexes.proposalRemarks >= 0 ? 'Proposal Remarks' : '',
    indexes.demoComments >= 0 ? 'Demo Comments' : '',
    indexes.statusAdviser >= 0 ? 'Status / Adviser' : '',
    indexes.category >= 0 ? 'Category' : ''
  ].filter(Boolean);
  const missingFields = [
    indexes.groupCode < 0 ? 'Group Code' : '',
    indexes.projectTitle < 0 ? 'Project Title' : ''
  ].filter(Boolean);
  const mappings = mappingSuggestions(headers, indexes, [
    { key: 'groupCode', label: 'Group code', required: true },
    { key: 'projectTitle', label: 'Project title', required: true },
    { key: 'softwareName', label: 'Software name' },
    { key: 'description', label: 'Description' },
    { key: 'proposalRemarks', label: 'Proposal remarks' },
    { key: 'demoComments', label: 'Demo comments' },
    { key: 'statusAdviser', label: 'Status / adviser' },
    { key: 'category', label: 'Category' }
  ]);
  const optionalFields = [
    indexes.softwareName < 0 ? 'Software Name' : '',
    indexes.description < 0 ? 'Description' : '',
    indexes.proposalRemarks < 0 ? 'Proposal Remarks' : '',
    indexes.demoComments < 0 ? 'Demo Comments' : '',
    indexes.statusAdviser < 0 ? 'Status / Adviser' : '',
    indexes.category < 0 ? 'Category' : ''
  ].filter(Boolean);
  const unrecognizedFields = unrecognizedHeaders(headers, indexes);
  if (missingFields.length) {
    return {
      ok: false,
      sourceType: 'projectMonitor',
      csvUrl,
      error: `This Sheet does not match Software Project Monitor. Missing: ${missingFields.join(', ')}.`,
      importSummary: {
        sourceType: 'Software Project Monitor',
        resultStatus: 'Import blocked',
        headerRow: headerInfo.index + 1,
        headers,
        mappings,
        detectedFields,
        missingFields,
        optionalFields,
        unrecognizedFields,
        skippedRows: [],
        metrics: {},
        warnings: []
      }
    };
  }
  let skippedRows = 0;
  const skippedRowDetails = [];
  const projectMetadata = rows.slice(headerInfo.index + 1).map((row, rowIndex) => {
    const groupCode = getCell(row, indexes.groupCode);
    if (!groupCode) {
      skippedRows += 1;
      skippedRowDetails.push({ rowNumber: headerInfo.index + rowIndex + 2, reason: 'Missing group code' });
      return null;
    }
    const statusAdviser = getCell(row, indexes.statusAdviser);
    return {
      groupCode,
      projectTitle: getCell(row, indexes.projectTitle),
      softwareName: getCell(row, indexes.softwareName),
      description: getCell(row, indexes.description),
      proposalRemarks: getCell(row, indexes.proposalRemarks),
      demoComments: getCell(row, indexes.demoComments),
      adviserName: statusAdviser,
      status: statusAdviser,
      category: getCell(row, indexes.category)
    };
  }).filter(Boolean);

  if (skippedRows) warnings.push(`Skipped ${skippedRows} Software Project Monitor row${skippedRows === 1 ? '' : 's'} without a group code.`);
  const metrics = {
    groups: projectMetadata.length,
    projectTitles: projectMetadata.filter((project) => project.projectTitle).length,
    softwareNames: projectMetadata.filter((project) => project.softwareName).length,
    descriptions: projectMetadata.filter((project) => project.description).length,
    adviserAssignments: projectMetadata.filter((project) => project.adviserName).length,
    proposalRemarks: projectMetadata.filter((project) => project.proposalRemarks).length,
    demoComments: projectMetadata.filter((project) => project.demoComments).length,
    categories: projectMetadata.filter((project) => project.category).length,
    skippedRows
  };

  return {
    ok: true,
    sourceType: 'projectMonitor',
    csvUrl,
    headers,
    projectMetadata,
    warnings,
    importSummary: {
      sourceType: 'Software Project Monitor',
      resultStatus: warnings.length ? 'Imported with warnings' : 'Imported',
      groupsFound: projectMetadata.length,
      columnsFound: headers.length,
      headerRow: headerInfo.index + 1,
      headers,
      mappings,
      detectedFields,
      missingFields: [],
      optionalFields,
      unrecognizedFields,
      skippedRows: skippedRowDetails,
      metrics,
      warnings
    }
  };
}

function inferIdentityColumns(headers) {
  const normalized = headers.map((header) => normalizeHeader(header));
  return {
    studentNumber: findHeader(normalized, ['studentno', 'studentnumber', 'studentid', 'schoolid', 'idnumber', 'studno']),
    studentName: findExactHeader(normalized, ['nameofstudent', 'studentname', 'name']),
    lastName: findHeader(normalized, ['lastname', 'surname', 'familyname']),
    firstName: findHeader(normalized, ['firstname', 'givenname']),
    teamCode: findHeader(normalized, ['teamformation', 'teamcode', 'team']),
    memberNumber: findMemberNumberHeader(normalized),
    section: findHeader(normalized, ['section', 'classsection']),
    adviser: findExactHeader(normalized, ['adviser', 'advisor', 'advisername', 'advisorname', 'facultyadviser', 'capstoneadviser', 'teacher', 'instructor']),
    email: findHeader(normalized, ['email', 'gmail', 'googleaccount', 'citeduaccount', 'institutionalemail', 'citaccount'])
  };
}

function findMemberNumberHeader(normalizedHeaders) {
  const exact = findExactHeader(normalizedHeaders, ['member', 'memberno', 'membernumber', 'memberid', 'mid', 'teamdetailsmember']);
  if (exact >= 0) return exact;
  return normalizedHeaders.findIndex((header) => (
    header.includes('member') && !header.includes('teamcode') && !header.includes('teamlead')
  ));
}

function applyColumnOverrides(headers, inferred, overrides) {
  if (!overrides) return inferred;
  return Object.fromEntries(Object.entries(inferred).map(([key, currentIndex]) => {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) return [key, currentIndex];
    const requested = String(overrides[key] || '').trim();
    return [key, requested ? headers.findIndex((header) => header === requested) : -1];
  }));
}

function mappingSuggestions(headers, indexes, definitions) {
  return definitions.map(({ key, label, required = false }) => ({
    key,
    label,
    required,
    sourceColumn: indexes[key] >= 0 ? headers[indexes[key]] : ''
  }));
}

function unrecognizedHeaders(headers, indexes) {
  const recognized = new Set(Object.values(indexes).filter((index) => index >= 0));
  return headers.filter((header, index) => header && !recognized.has(index));
}

function findBestHeaderRow(rows, inferColumns, scoreHeader) {
  let best = { index: 0, headers: rows[0].map((header) => header.trim()), score: -1 };
  rows.slice(0, 20).forEach((row, index) => {
    const headers = row.map((header) => header.trim());
    const score = scoreHeader(inferColumns(headers), headers);
    if (score > best.score) {
      best = { index, headers, score };
    }
  });
  return best;
}

function scoreTeamFormationHeader(identity) {
  let score = 0;
  if (identity.studentNumber >= 0) score += 3;
  if (identity.teamCode >= 0) score += 3;
  if (identity.memberNumber >= 0) score += 2;
  if (identity.studentName >= 0) score += 2;
  if (identity.lastName >= 0) score += 1;
  if (identity.firstName >= 0) score += 1;
  if (identity.email >= 0) score += 1;
  return score;
}

function scoreTrackerHeader(identity, headers) {
  const identityScore = scoreTeamFormationHeader(identity);
  const trackerWords = ['prob', 'convergence', 'rrl', 'proposal', 'srs', 'sdd', 'source', 'demo', 'peer'];
  const trackerScore = headers
    .map((header) => normalizeHeader(header))
    .filter((header) => trackerWords.some((word) => header.includes(word)))
    .length;
  return identityScore + trackerScore;
}

function scoreProjectMonitorHeader(indexes) {
  let score = 0;
  if (indexes.groupCode >= 0) score += 3;
  if (indexes.projectTitle >= 0) score += 2;
  if (indexes.softwareName >= 0) score += 2;
  if (indexes.description >= 0) score += 1;
  if (indexes.proposalRemarks >= 0) score += 1;
  if (indexes.demoComments >= 0) score += 1;
  if (indexes.statusAdviser >= 0) score += 1;
  return score;
}

function getStudentNameFromIdentity(row, identity) {
  const fullName = getCell(row, identity.studentName);
  if (fullName) return fullName;

  const lastName = getCell(row, identity.lastName);
  const firstName = getCell(row, identity.firstName);
  if (lastName && firstName) return `${lastName}, ${firstName}`;
  return lastName || firstName || '';
}

function resolveAdviser(current, teamCode, explicitAdviser, existingAdviser) {
  if (isUsableAdviserName(explicitAdviser)) return explicitAdviser;
  const project = getProjectMetadata(current, teamCode);
  if (isUsableAdviserName(project?.adviserName)) return project.adviserName;
  if (isUsableAdviserName(existingAdviser) && existingAdviser !== 'Sir Ralph Laviste') return existingAdviser;
  return 'Unassigned';
}

function inferProjectMonitorColumns(headers) {
  const normalized = headers.map((header) => normalizeHeader(header));
  return {
    groupCode: findHeader(normalized, ['groupcode', 'teamcode', 'teamformation']),
    projectTitle: findHeader(normalized, ['projecttitle', 'title']),
    softwareName: findHeader(normalized, ['softwarename', 'software']),
    description: findHeader(normalized, ['description']),
    proposalRemarks: findHeader(normalized, ['proposalremarks', 'proposal']),
    demoComments: findHeader(normalized, ['democomments', 'demo']),
    statusAdviser: findHeader(normalized, ['statusadviser', 'adviser', 'advisor', 'status']),
    category: findHeader(normalized, ['category'])
  };
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findHeader(headers, candidates) {
  return headers.findIndex((header) => candidates.some((candidate) => header === candidate || header.includes(candidate)));
}

function findExactHeader(headers, candidates) {
  return headers.findIndex((header) => candidates.includes(header));
}

function getCell(row, index) {
  if (index < 0 || index === undefined || index === null) return '';
  return String(row[index] || '').trim();
}

function hasDeadlineEvidence(rows, headerRowIndex, identity, columnIndex) {
  return rows.slice(headerRowIndex + 1).some((row) => {
    const name = getStudentNameFromIdentity(row, identity);
    const teamCode = getCell(row, identity.teamCode);
    if (name && teamCode) return false;
    return Boolean(coerceDueAt(getCell(row, columnIndex)));
  });
}

function isLikelyPdfDeliverable(header) {
  const key = normalizeHeader(header);
  return ['rrl', 'projectproposal', 'spmp', 'srs', 'sdd', 'refactoredspmp', 'refactoredsrs', 'refactoredsdd', 'adviserassessment'].includes(key);
}

function makeStudentMatchKey(name, teamCode, memberNumber) {
  return `${normalizeLoose(name)}::${normalizeLoose(teamCode)}::${String(memberNumber || '').trim()}`;
}

function makeTeamMemberKey(teamCode, memberNumber) {
  return `${normalizeLoose(teamCode)}::${String(memberNumber || '').trim()}`;
}

function detectDeadlineSuggestions(row, headers, trackerColumns) {
  return trackerColumns
    .map((column) => {
      const raw = getCell(row, headers.indexOf(column.sourceColumn));
      const dueAt = coerceDueAt(raw);
      if (!dueAt) return null;
      return {
        trackerColumn: column.key,
        shortTitle: column.label,
        title: `${column.label} Submission`,
        dueAt,
        pdfRequired: column.pdfRequired,
        sourceValue: raw
      };
    })
    .filter(Boolean);
}

function coerceDueAt(value) {
  const text = String(value || '').trim();
  if (!text || /^#N\/A$/i.test(text)) return '';
  const timestampMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const parsed = timestampMatch
    ? new Date(
        Number(timestampMatch[3].length === 2 ? `20${timestampMatch[3]}` : timestampMatch[3]),
        Number(timestampMatch[1]) - 1,
        Number(timestampMatch[2]),
        timestampMatch[4] === undefined ? 23 : Number(timestampMatch[4]),
        timestampMatch[5] === undefined ? 59 : Number(timestampMatch[5]),
        timestampMatch[6] === undefined ? 0 : Number(timestampMatch[6])
      )
    : new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function applyClassRecordImport(current, payload, imported) {
  const sourceType = imported.sourceType || payload.sourceType || 'tracker';
  const sourceName = sourceType === 'teamFormation'
    ? 'Team Formation'
    : sourceType === 'projectMonitor'
      ? 'Software Project Monitor'
      : payload.trackerSheet || 'Tracker';
  const nextSources = {
    ...(current.classRecord.sources || {}),
    [sourceType]: {
      name: sourceName,
      sheetUrl: payload.sheetUrl,
      status: imported.ok ? 'Imported' : 'Needs Attention',
      connectedAt: new Date().toISOString(),
      csvUrl: imported.csvUrl || ''
    }
  };

  return {
    ...current,
    classRecord: {
      ...current.classRecord,
      name: payload.name || current.classRecord.name,
      sheetUrl: sourceType === 'tracker' ? payload.sheetUrl : current.classRecord.sheetUrl,
      sheetId: extractSheetId(payload.sheetUrl),
      trackerSheet: payload.trackerSheet || current.classRecord.trackerSheet,
      connectedAt: new Date().toISOString(),
      status: imported.ok ? 'Imported' : 'Needs Attention',
      importedColumns: imported.headers || current.classRecord.importedColumns || [],
      importWarnings: imported.warnings || [],
      importSummary: imported.importSummary || null,
      pendingFormSuggestions: sourceType === 'tracker'
        ? imported.suggestedForms || imported.importSummary?.suggestedForms || []
        : current.classRecord.pendingFormSuggestions || [],
      importError: imported.ok ? '' : imported.error,
      csvUrl: sourceType === 'tracker' ? imported.csvUrl || '' : current.classRecord.csvUrl,
      sourceType: imported.ok ? 'Published Sheet CSV' : current.classRecord.sourceType,
      sources: nextSources
    },
    students: imported.ok && imported.students ? imported.students : current.students,
    trackerColumns: imported.ok && imported.trackerColumns ? imported.trackerColumns : current.trackerColumns,
    projectMetadata: imported.ok && imported.projectMetadata ? imported.projectMetadata : current.projectMetadata,
    activity: [{
      id: `act-${Date.now()}`,
      at: new Date().toISOString(),
      text: imported.ok
        ? `Imported ${sourceName}.`
        : `Class record import needs attention: ${imported.error}`
    }, ...current.activity]
  };
}
