import { describe, expect, it } from 'vitest';
import { getGoogleSignInReturnTo, getSafeGoogleSignInReturnTo, getSessionHome } from './googleSignIn.js';

describe('safe Google sign-in return routes', () => {
  it('preserves form and workspace query values', () => {
    expect(getSafeGoogleSignInReturnTo('/w/section-a/submit/srs?team=4&field=pdf')).toBe('/w/section-a/submit/srs?team=4&field=pdf');
    expect(getSafeGoogleSignInReturnTo({ pathname: '/workspace', search: '?section=it' })).toBe('/workspace?section=it');
  });
  it.each([
    'https://example.test/', '//example.test/', '/%2f%2fexample.test/', '/\\example.test/',
    '/x/..//example.test', '/x/%2e%2e//example.test',
    '/%5cexample.test/', '/path\nnext', '/%00next', '/%7fnext', '/%252f%252fevil',
    '/bad%escape', '/' + 'a'.repeat(501)
  ])('rejects unsafe return destination %s', value => {
    expect(getSafeGoogleSignInReturnTo(value)).toBe('/student');
  });
  it('returns login routes and unsafe destinations to the correct role home', () => {
    expect(getGoogleSignInReturnTo('/login', { roles: ['ADMIN'] })).toBe('/');
    expect(getGoogleSignInReturnTo('/register', { roles: ['ADVISER'] })).toBe('/adviser');
    expect(getGoogleSignInReturnTo('//example.test', { roles: [] })).toBe('/student');
    expect(getSessionHome({ roles: ['adviser', 'admin'] })).toBe('/');
    expect(getSessionHome(null)).toBe('/student');
  });
});
