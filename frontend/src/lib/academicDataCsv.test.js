import { describe, expect, it } from 'vitest';
import { buildAcademicCsv } from './academicDataCsv.js';

describe('Academic Data CSV export', () => {
  it('exports all selected rows with quoted commas, escaped quotes, Unicode and safe spreadsheet cells', () => {
    const csv = buildAcademicCsv([
      { key: 'studentNumber', label: 'Student Number' },
      { key: 'studentName', label: 'Student name' },
      { key: 'teamCode', label: 'Team code' }
    ], [
      { studentNumber: '26-0001', studentName: 'DOE, "JANE"', teamCode: '=HYPERLINK("x")' },
      { studentNumber: '26-0002', studentName: 'Niño', teamCode: 'TEAM-02' }
    ]);

    expect(csv).toBe('\uFEFF"Student Number","Student name","Team code"\r\n'
      + '"26-0001","DOE, ""JANE""","\'=HYPERLINK(""x"")"\r\n'
      + '"26-0002","Niño","TEAM-02"\r\n');
  });

  it('keeps nested field metadata as escaped JSON and protects whitespace-prefixed formulas', () => {
    const csv = buildAcademicCsv([{ key: 'fields', label: 'Fields' }, { key: 'title', label: 'Title' }], [{
      fields: [{ key: 'pdf', label: 'Framework' }], title: '\t=1+2'
    }]);
    expect(csv).toContain('"[{""key"":""pdf"",""label"":""Framework""}]"');
    expect(csv).toContain('"\'\t=1+2"');
  });
});
