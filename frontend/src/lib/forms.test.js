import { describe, expect, it } from 'vitest';
import { academicFieldSuggestions, applyAcademicSuggestionReview, duplicateField, mergeAcademicSuggestions } from './forms.js';

describe('form editor suggestions and identity', () => {
  it('always offers Section as an academic suggestion', () => {
    expect(academicFieldSuggestions([{ studentNumber: '1', section: '' }]).map((field) => field.type))
      .toEqual(['academicStudentNumber', 'academicStudentName', 'academicTeamCode', 'academicSection']);
    expect(academicFieldSuggestions([{ studentNumber: '1', section: 'G7' }]).map((field) => field.type))
      .toEqual(['academicStudentNumber', 'academicStudentName', 'academicTeamCode', 'academicSection']);
  });

  it('duplicates a persisted choice question without reusing server field or option identities', () => {
    const copy = duplicateField({
      id: 'scope',
      definitionId: 'field-scope',
      label: 'Scope',
      type: 'dropdown',
      active: true,
      options: [{ id: 'option-1', label: 'Campus' }, { id: 'option-2', label: 'Community' }]
    });

    expect(copy.id).not.toBe('scope');
    expect(copy.definitionId).toBeNull();
    expect(copy.options).toHaveLength(2);
    expect(copy.options.every((option) => option.id === null)).toBe(true);
    expect(new Set(copy.options.map((option) => option._localKey)).size).toBe(2);
  });

  it('places academic identity suggestions first in canonical order instead of appending them', () => {
    const fields = [
      { id: 'pdf', label: 'SRS PDF', type: 'drive', active: true },
      { id: 'team', label: 'Team Code', type: 'academicTeamCode', active: true },
      { id: 'old', label: 'Old field', type: 'shortText', active: false }
    ];
    const merged = mergeAcademicSuggestions(fields, [{ studentNumber: '1', section: 'G7' }]);
    expect(merged.map((field) => field.type)).toEqual([
      'academicStudentNumber',
      'academicStudentName',
      'academicTeamCode',
      'academicSection',
      'drive',
      'shortText'
    ]);
    expect(merged[merged.length - 1].active).toBe(false);
  });

  it('applies reviewed academic selection/order while soft-retiring persisted deselections', () => {
    const fields = [
      { id: 'student', definitionId: 'def-student', label: 'Student Number', type: 'academicStudentNumber', active: true },
      { id: 'team', definitionId: 'def-team', label: 'Team Code', type: 'academicTeamCode', active: true },
      { id: 'pdf', definitionId: 'def-pdf', label: 'SRS PDF', type: 'drive', active: true },
      { id: 'old', definitionId: 'def-old', label: 'Old field', type: 'shortText', active: false }
    ];
    const reviewed = applyAcademicSuggestionReview(
      fields,
      ['academicStudentNumber', 'academicSection', 'academicStudentName', 'academicTeamCode'],
      ['academicStudentNumber', 'academicSection', 'academicStudentName']
    );

    expect(reviewed.filter((field) => field.active !== false).map((field) => field.type)).toEqual([
      'academicStudentNumber',
      'academicSection',
      'academicStudentName',
      'drive'
    ]);
    expect(reviewed.find((field) => field.id === 'team')).toMatchObject({ definitionId: 'def-team', active: false });
    expect(reviewed[reviewed.length - 1]).toMatchObject({ id: 'old', active: false });
  });
});
