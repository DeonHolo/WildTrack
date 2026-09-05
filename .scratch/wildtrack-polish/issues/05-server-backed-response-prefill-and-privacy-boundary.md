# 05: Server-Backed Response Prefill and Privacy Boundary

**What to build:**
1. When an authenticated student revisits a form for a deliverable they already submitted, query their own server-side submission (/workspace/responses/mine) and prefill all fields including their Google Drive PDF link so they can edit or revise.
2. Keep the privacy shield active only when a user enters a Student Number whose existing submission belongs to a different Google account.

**Blocked by:** 04 (ensures identity and name resolution are stable).

**Status:** done

- [x] Logged-in students reviewing their own deliverable have their existing submitted Drive link and values prefilled for editing.
- [x] An informative banner confirms that their previous submission is loaded for revision.
- [x] Entering a student number owned by another Google account keeps submitted links hidden and shows the privacy notice.
- [x] Tests verify authenticated prefill of submitted Drive links and privacy masking for third-party IDs.

