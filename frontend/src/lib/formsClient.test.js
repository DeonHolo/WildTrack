import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFormsState } from './formsClient.js';

const api = vi.hoisted(() => ({ getStaffMonitoring: vi.fn() }));

vi.mock('./api.js', () => ({ getStaffMonitoring: api.getStaffMonitoring }));

describe('forms client editor data', () => {
  beforeEach(() => api.getStaffMonitoring.mockReset());

  it('retains current roster data including Section for academic field suggestions', async () => {
    api.getStaffMonitoring.mockResolvedValue({
      deliverables: [],
      trackerColumns: [],
      trackerRows: [],
      responses: [],
      students: [{
        id: 'student-1',
        studentNumber: '26-0001',
        studentName: 'DOE, JANE',
        teamCode: '2627-sem1-it411-01',
        sectionName: 'G7',
        currentActive: true
      }]
    });

    const state = await loadFormsState('workspace-it');

    expect(state.students).toEqual([expect.objectContaining({
      studentNumber: '26-0001',
      name: 'DOE, JANE',
      teamCode: '2627-sem1-it411-01',
      section: 'G7'
    })]);
  });
});
