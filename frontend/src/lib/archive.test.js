import { expect, it } from 'vitest';
import { getArchiveStatus, orderArchiveStatuses } from './archive.js';

it('lists archive failures and unfinished work before verified copies', () => {
  const records = [
    { storageStatus: 'Stored', integrityStatus: 'Verified' },
    { captureState: 'COPYING' },
    { storageStatus: 'Failed' },
    { integrityStatus: 'Verification failed' },
    { captureState: 'LEGACY' },
    { storageStatus: 'Retrying' },
    { storageStatus: 'Failed' }
  ];
  expect(orderArchiveStatuses(records.map(getArchiveStatus))).toEqual([
    'Storage failed', 'Verification failed', 'Metadata only', 'Retrying', 'Copying', 'Verified'
  ]);
});
