import { describe, expect, it } from 'vitest';
import { getGoogleSignInReturnTo, getSafeDriveHistoryReturnTo, requiresDriveHistoryConsent } from './driveHistoryLogin.js';

describe('safe Google login return routes', () => {
  it('preserves form/workspace query values while removing the OAuth result', () => {
    expect(getSafeDriveHistoryReturnTo('/w/section-a/submit/srs?team=4&driveHistory=error&field=pdf'))
      .toBe('/w/section-a/submit/srs?team=4&field=pdf');
    expect(getSafeDriveHistoryReturnTo({ pathname: '/workspace', search: '?section=it' })).toBe('/workspace?section=it');
  });
  it.each([
    'https://example.test/', '//example.test/', '/%2f%2fexample.test/', '/\\example.test/',
    '/%5cexample.test/', '/path\nnext', '/%00next', '/%7fnext', '/%252f%252fevil',
    '/bad%escape', '/' + 'a'.repeat(501)
  ])('rejects unsafe return destination %s', value => {
    expect(getSafeDriveHistoryReturnTo(value)).toBe('/student');
  });
  it('returns login callbacks and unsafe destinations to the correct role home', () => {
    expect(getGoogleSignInReturnTo('/login?driveHistory=connected', { roles: ['ADMIN'] })).toBe('/');
    expect(getGoogleSignInReturnTo('/register', { roles: ['ADVISER'] })).toBe('/adviser');
    expect(getGoogleSignInReturnTo('//example.test', { roles: [] })).toBe('/student');
  });
  it('keeps older optional sessions compatible while treating a missing required grant as pending', () => {
    expect(requiresDriveHistoryConsent({ authenticated: true })).toBe(false);
    expect(requiresDriveHistoryConsent({ authenticated: false, driveHistoryRequired: true })).toBe(false);
    expect(requiresDriveHistoryConsent({ authenticated: true, driveHistoryRequired: true })).toBe(true);
    expect(requiresDriveHistoryConsent({ authenticated: true, driveHistoryRequired: true, driveHistoryConnected: true })).toBe(false);
  });
});
