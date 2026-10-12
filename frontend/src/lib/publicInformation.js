export function isPublicInformationPath(pathname = '') {
  return /^\/(?:about|privacy|terms)\/?$/i.test(pathname);
}
