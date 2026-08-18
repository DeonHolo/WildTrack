import { describe, expect, it } from 'vitest';
import { findOwnedResponse, getResponseOwnerKey, hasResponseConflict } from './workflow.js';

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
