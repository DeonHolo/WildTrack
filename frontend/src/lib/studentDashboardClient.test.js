import { beforeEach, expect, it, vi } from 'vitest';
import { getStudentDashboard } from './api.js';
import { loadStudentDashboard } from './studentDashboardClient.js';

vi.mock('./api.js', () => ({ getStudentDashboard: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it('maps one server-composed snapshot, with private review data only for owned responses', async () => {
  const updatedAt = '2026-09-06T00:00:00Z';
  getStudentDashboard.mockResolvedValue({
    association: { studentNumber: '001' },
    responses: [
      { id: 'mine', owned: true, updatedAt, valuesJson: '{"link":"private"}' },
      { id: 'team', owned: false, valuesJson: '' }
    ],
    reviewStates: {
      mine: { feedback: [{ note: 'Visible feedback' }], acceptance: { sourceResponseUpdatedAt: updatedAt } },
      team: { feedback: [{ note: 'Not owned' }] }
    },
    fileChecks: { mine: { id: 'report', status: 'COMPLETED', flags: [] } }
  });
  const result = await loadStudentDashboard('workspace');
  expect(getStudentDashboard).toHaveBeenCalledExactlyOnceWith('workspace');
  expect(result.attempts[0]).toMatchObject({ values: { link: 'private' }, primaryStatus: 'Accepted', documentCheck: { reportId: 'report' } });
  expect(result.attempts[1]).toMatchObject({ values: {}, feedback: [], acceptance: null });
});

it('propagates a denied dashboard request instead of displaying stale private records', async () => {
  getStudentDashboard.mockRejectedValue(new Error('Forbidden'));
  await expect(loadStudentDashboard('denied')).rejects.toThrow('Forbidden');
});
