import { academicExportValue } from './academicDataCsv.js';

// XLSX is a ZIP of small Office Open XML files. Writing it here keeps the
// academic export available offline without adding a spreadsheet dependency.
const encoder = new TextEncoder();

const SHEET_NAMES = {
  students: 'Students',
  projects: 'Teams and Projects',
  deliverables: 'Deliverables',
  trackerColumns: 'Tracker Columns'
};

function xmlText(value) {
  // XML 1.0 excludes most control characters. Preserve identifiers and dates
  // as strings so Excel cannot reinterpret them as numbers or formulas.
  return academicExportValue(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function excelColumn(index) {
  let position = index + 1;
  let result = '';
  while (position > 0) {
    position -= 1;
    result = String.fromCharCode(65 + position % 26) + result;
    position = Math.floor(position / 26);
  }
  return result;
}

function worksheetXml(columns, rows) {
  const all = [columns.map((column) => column.label), ...rows.map((row) => columns.map((column) => row[column.key]))];
  const body = all.map((values, rowIndex) => {
    const cells = values.map((value, columnIndex) => {
      const reference = `${excelColumn(columnIndex)}${rowIndex + 1}`;
      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const end = `${excelColumn(Math.max(0, columns.length - 1))}${all.length}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<dimension ref="A1:${end}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="15"/><sheetData>${body}</sheetData></worksheet>`;
}

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zipFiles(files) {
  const chunks = [];
  const directory = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const bytes = encoder.encode(content);
    const checksum = crc32(bytes);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034B50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, bytes);

    const entry = new Uint8Array(46 + nameBytes.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014B50, true);
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint32(16, checksum, true);
    entryView.setUint32(20, bytes.length, true);
    entryView.setUint32(24, bytes.length, true);
    entryView.setUint16(28, nameBytes.length, true);
    entryView.setUint32(42, offset, true);
    entry.set(nameBytes, 46);
    directory.push(entry);
    offset += local.length + bytes.length;
  }
  const directorySize = directory.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054B50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, end], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

export function buildAcademicWorkbook(sheets) {
  const entries = Object.entries(SHEET_NAMES).filter(([kind]) => sheets[kind]);
  if (!entries.length) throw new Error('No academic datasets are available for export.');
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + entries.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets>${entries.map(([kind], index) => `<sheet name="${SHEET_NAMES[kind]}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + entries.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')
      + '</Relationships>'],
    ...entries.map(([kind], index) => [`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(sheets[kind].columns, sheets[kind].rows)])
  ];
  return zipFiles(files);
}

export function downloadAcademicWorkbook(sheets) {
  const href = URL.createObjectURL(buildAcademicWorkbook(sheets));
  const link = document.createElement('a');
  link.href = href;
  link.download = `wildtrack-academic-data-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}
