import { describe, expect, it } from 'vitest';
import {
  findOwnedResponse,
  getResponseOwnerKey,
  hasResponseConflict,
  upsertDeliverable
} from './workflow.js';

const responses = [
  {
    id: 'response-1',
    deliverableId: 'deliverable-srs',
    studentNumber: '22-1001-001',
    googleEmailSnapshot: 'owner@gmail.com'
  },
  {
    id: 'response-legacy',
    deliverableId: 'deliverable-srs',
    studentNumber: '22-1001-001'
  }
];

describe('Google-attributed response ownership', () => {
  it('matches an owned response by normalized Google email', () => {
    expect(getResponseOwnerKey(responses[0])).toBe('email:owner@gmail.com');
    expect(findOwnedResponse(responses, {
      deliverableId: 'deliverable-srs',
      studentNumber: '22-1001-001',
      googleEmail: 'OWNER@GMAIL.COM'
    })?.id).toBe('response-1');
  });

  it('does not expose another account or an unowned legacy response', () => {
    expect(findOwnedResponse(responses, {
      deliverableId: 'deliverable-srs',
      studentNumber: '22-1001-001',
      googleEmail: 'different@gmail.com'
    })).toBeNull();
    expect(findOwnedResponse(responses, {
      deliverableId: 'deliverable-srs',
      studentNumber: '22-1001-001'
    })).toBeNull();
  });

  it('recognizes when the same student and deliverable belong to another response owner', () => {
    expect(hasResponseConflict(responses, {
      deliverableId: 'deliverable-srs',
      studentNumber: '22-1001-001',
      googleEmail: 'different@gmail.com'
    })).toBe(true);
    expect(hasResponseConflict(responses, {
      deliverableId: 'deliverable-srs',
      studentNumber: '22-1001-001',
      googleEmail: 'owner@gmail.com'
    })).toBe(false);
  });
});

describe('published form identity', () => {
  it('updates the existing deliverable without changing its id or public slug', () => {
    const current = [{
      id: 'deliverable-srs',
      slug: 'week-9-srs',
      trackerColumn: 'SRS',
      title: 'SRS Submission',
      status: 'Published'
    }];

    const next = upsertDeliverable(current, {
      trackerColumn: 'SRS',
      title: 'Software Requirements Specification',
      status: 'Published'
    });

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'deliverable-srs',
      slug: 'week-9-srs',
      title: 'Software Requirements Specification'
    });
  });

  it('prevents duplicate deliverables even when a conflicting id is supplied', () => {
    const current = [
      { id: 'deliverable-srs', trackerColumn: 'SRS', slug: 'week-9-srs', title: 'SRS' },
      { id: 'deliverable-sdd', trackerColumn: 'SDD', slug: 'week-10-sdd', title: 'SDD' }
    ];

    const next = upsertDeliverable(current, {
      id: 'deliverable-sdd',
      trackerColumn: 'SRS',
      title: 'Updated SRS'
    });

    expect(next).toHaveLength(2);
    expect(next.filter((item) => item.trackerColumn === 'SRS')).toHaveLength(1);
    expect(next.find((item) => item.trackerColumn === 'SRS')).toMatchObject({
      id: 'deliverable-srs',
      slug: 'week-9-srs',
      title: 'Updated SRS'
    });
  });
});
