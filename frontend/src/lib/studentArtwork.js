function artwork(src, alt, position, size = 'contain') {
  return Object.freeze({ src, alt, position, size });
}

export const STUDENT_ARTWORK = Object.freeze({
  dashboardWelcome: artwork(
    '/assets/Waving.webp',
    'WildTrack mascot waving',
    'right bottom'
  ),
  dashboardComplete: artwork(
    '/assets/Earn%20Your%20Badges.webp',
    'WildTrack mascot holding a trophy',
    'right bottom'
  ),
  submissionForm: artwork(
    '/assets/Showing%20PDF.webp',
    'WildTrack mascot presenting a PDF',
    'center bottom',
    'auto 118%'
  ),
  submissionSuccess: artwork(
    '/assets/Good%20Job.webp',
    'WildTrack mascot celebrating a recorded submission',
    'center bottom',
    'auto 118%'
  )
});
