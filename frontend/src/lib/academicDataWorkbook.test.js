import { describe, expect, it } from 'vitest';
import { buildAcademicWorkbook } from './academicDataWorkbook.js';

// Inspect every ZIP local entry, rather than assuming the filename proves this
// is a valid XLSX workbook.
async function entries(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  const result = new Map();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034B50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    result.set(name, decoder.decode(bytes.slice(start, start + size)));
    offset = start + size;
  }
  expect(view.getUint32(offset, true)).toBe(0x02014B50);
  return result;
}

describe('Academic Data multi-sheet XLSX export', () => {
  it('packages four real worksheets with string-safe identifiers, formula text and escaped XML', async () => {
    const columns = [{ key: 'id', label: 'Student Number' }, { key: 'name', label: 'Name' }];
    const blob = buildAcademicWorkbook({
      students: { columns, rows: [{ id: '00012', name: '=HYPERLINK("evil") & <x>' }] },
      projects: { columns: [{ key: 'title', label: 'Title' }], rows: [{ title: 'Niño' }] },
      deliverables: { columns: [{ key: 'fields', label: 'Fields' }], rows: [{ fields: [{ key: 'pdf' }] }] },
      trackerColumns: { columns: [{ key: 'columnKey', label: 'Source' }], rows: [{ columnKey: 'A&B' }] }
    });
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const files = await entries(blob);
    expect(files.size).toBe(8);
    expect(files.get('xl/workbook.xml')).toContain('name="Teams and Projects"');
    expect(files.get('xl/workbook.xml')).toContain('name="Tracker Columns"');
    expect(files.get('xl/worksheets/sheet1.xml')).toContain('r="A2" t="inlineStr"><is><t xml:space="preserve">00012</t>');
    expect(files.get('xl/worksheets/sheet1.xml')).toContain('=HYPERLINK(&quot;evil&quot;) &amp; &lt;x&gt;');
    expect(files.get('xl/worksheets/sheet1.xml')).not.toContain('<f>');
    expect(files.get('xl/worksheets/sheet3.xml')).toContain('[{&quot;key&quot;:&quot;pdf&quot;}]');
    expect(files.get('xl/worksheets/sheet4.xml')).toContain('A&amp;B');
  });

  it('rejects an empty workbook and strips illegal XML controls', async () => {
    expect(() => buildAcademicWorkbook({})).toThrow('No academic datasets');
    const files = await entries(buildAcademicWorkbook({ students: {
      columns: [{ key: 'value', label: 'Value' }], rows: [{ value: '\u0001tab\nOK' }]
    } }));
    expect(files.get('xl/worksheets/sheet1.xml')).toContain('tab\nOK');
    expect(files.get('xl/worksheets/sheet1.xml')).not.toContain('\u0001');
  });
});
