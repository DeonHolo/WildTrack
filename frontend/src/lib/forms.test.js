import { describe, expect, it } from 'vitest';
import { academicFieldSuggestions, duplicateField } from './forms.js';

describe('form editor suggestions and identity', () => {
  it('suggests Section only when current roster data contains a section', () => {
    expect(academicFieldSuggestions([{ studentNumber: '1', section: '' }]).map((field) => field.type))
      .toEqual(['academicStudentNumber', 'academicStudentName', 'academicTeamCode']);
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
});
