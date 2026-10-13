# Loading, file history and notification follow-up — 14 October 2026

This records the user's same-link PDF replacement experiment and the resulting UI fixes. Times in the screenshots are Singapore time (UTC+08:00). It supplements the local documentation backfill in `docs/SESSION_CHANGE_INDEX_2026-10-13.md` and the [external setup record](EXTERNAL_SERVICES_SETUP_2026-10-12.md).

## What the automatic check proved

- The STD Drive link retained its file ID when a Refactored SDD was uploaded as a new version around **14 October, 12:07 AM**. WildTrack recorded `CONTENT_CHANGED` and inspected the new contents around **12:20 AM**, without a manual check from this agent.
- A subsequent restoration of the STD contents was visible in the live saved records: Drive modified time **2:04 AM**, automatic detection **2:20 AM**, with a new content-change notification. The earlier notification stayed dismissed. These are observations of this experiment, not a complete Drive revision history.
- Live read-only settings confirmed monitoring enabled for the workspace and STD. `DeadlineFileMonitor#interval` uses an hourly interval outside the window from 48 hours before to 24 hours after a deadline; inside that window it uses five minutes. Its scheduler ticks every minute, groups duplicate file IDs, and has a per-cycle budget and provider-error backoff. The interval is measured from the monitor's previous check, not a guaranteed clock-hour alarm.
- Automatic monitoring refreshes deterministic Document Check and observed file history after a verified checksum change. It does not start Gemini. Existing AI reports remain saved and require a freshness warning when their inspected content predates a recorded change.

Evidence: `backend/src/main/java/com/capvault/backend/filemonitor/DeadlineFileMonitor.java#interval`, `#event`; `backend/src/main/java/com/capvault/backend/filecheck/ObservedFileHistoryService.java#history`. The production monitoring GET returned zone-less check timestamps and offset-bearing Drive edit timestamps for the experiment.

## Date and freshness fixes

**Cause, confirmed:** production check/history timestamps were UTC `LocalDateTime` strings without an offset. Browsers interpreted them as local time. Drive timestamps already included `Z`, so they displayed correctly. The screenshot's **13 October, 4:20 PM** check was actually **14 October, 12:20 AM**, after the **12:07 AM** edit.

- Interpret check/history timestamps as UTC and display them in the browser's local timezone. Preserve explicit offsets. Leave academic deadlines as local wall-clock values.
- Make new backend Document Check timestamps explicitly UTC and use UTC for default monitor-event resolution.
- Replace ambiguous “Checked” history labels with **Detected**, **Drive edit**, and **Last checked**. Repeated checks of unchanged contents do not become new content changes. Show a content-change notice in the check-result tab.
- Show **AI Review may be outdated** above the stored report and in artifact cards; show **Outdated** in the submission table. Keep the saved report accessible. Ignore metadata-only changes and changes to another artifact.
- Add a durable `sourceVerifiedAt` receipt to AI response/field links. Explicit review preparation verifies PDF bytes before linking to a result. Reusing an identical restored PDF updates verification time while retaining the original generation time. This avoids a warning that could otherwise never clear after a legitimate cache reuse. A change during AI generation still invalidates freshness because verification time precedes report completion.

Evidence: `frontend/src/lib/recordedTime.js`; `frontend/src/lib/workflow.js#artifactAiReviewChange`; `frontend/src/components/review/AiReviewReportDialog.jsx`; `backend/src/main/java/com/capvault/backend/aireview/AiReviewStore.java#linkField`; migrations V36 and V37. Older links have no verification receipt and conservatively fall back to their saved generation date.

## Loading and template presentation

- Universal copy: **Loading…**, with the WildTrack logo still inside maroon and gold rings rotating in opposite directions. Remove the redundant brand line and “Getting things ready” heading. Use CSS transforms with the existing continuous 1.2-second linear cadence. Reduced-motion mode stops both rings. Desktop and mobile keep the loader centered.
- Adapt the SVG rotation pattern from [Loading UI Ring](https://www.loading-ui.com/docs/components/ring); retain the [MIT notice](../frontend/src/components/auth/loading-ui.LICENSE). No new runtime dependency or extra Google permission flow was introduced.
- Add **Open official template** beside the Official template structure heading in Document Check, only when the workspace contains an uploaded template for that artifact or its deliverable fallback. The link opens its existing template-preview page.
- List detected template headings once. Keep only undetected expectations in a separate list when they differ. This avoids rendering the same expected/detected list twice.

Evidence: `frontend/src/components/auth/SessionLoadingScreen.jsx`; `frontend/src/lib/templatePreview.js`; `frontend/src/pages/TemplatePreviewPage.jsx`.

## Today's work and completed notices

- Default to **Newest activity**; order the selector as Newest activity, Oldest activity, Priority.
- Give primary actions a shared grid column so Dismiss/Restore lines up across rows.
- Add personal **Delete** and **Delete all** actions in Dismissed, both with confirmation. Delete all covers all of the user's dismissed keys in the workspace, including earlier alerts hidden by grouping, regardless of current search/filter.
- Notification deletion preserves a lightweight dismissal tombstone. Removing the dismissal row would reopen the unresolved work on refresh. Deleted notifications cannot be restored from this list. Submissions, reviews, monitor events, file history and other users' notifications are retained. A later PDF change has a new event ID and remains eligible for Open.
- Finished AI-batch notices get a dismiss button. The preference is scoped to browser, account/roles, workspace, batch ID and completion version; navigation/reload retains it. A new completion becomes visible. Running, preparing or paused batches cannot be hidden with this button. No batch cancellation or generation request accompanies dismissal.
- The new deleted-notification read tolerates a 404 during independent Vercel/Heroku rollout. Authorization failures still propagate.

Evidence: `backend/src/main/java/com/capvault/backend/filemonitor/WorkTaskDismissalController.java#delete`; `frontend/src/pages/CommandCenterPage.jsx#confirmDeleteDismissed`; `frontend/src/app/useAiReviewBatch.js`; `frontend/tests/browser/review-history-followup.spec.js`.

## Heroku memory checkpoint

The user's 14 October screenshot of the preceding 24-hour window showed **360.9 MB latest**, **383.5 MB maximum**, **355.3 MB average**, against **512 MB quota**. The displayed period was below quota. This does not prove permanent absence of memory pressure under future load. See the earlier incident in [operations runbook](deployment/operations-runbook.md).

## Verification and delivery

Local verification: 699 frontend tests, 50 browser checks and 131 focused backend tests passed; frontend production build passed. The API rollout fallback has a further focused regression check. Browser checks use synthetic authenticated API fixtures and include Singapore-time conversion, a saved outdated AI report, template presence/absence, individual/bulk deletion and reload, later change events, aligned actions, mobile loading and reduced motion. Backend tests cover migrated storage, subject/workspace isolation, idempotent deletion, cache reuse verification, and monitoring.

Production verification receipts follow below. No live Gemini request, manual Document Check, monitor-setting mutation, or deletion of the user's actual notifications was used for this task.

Confidence: confirmed for the recorded experiment and passing local checks. Freshness depends on the most recent saved Document Check; it cannot detect an edit before monitoring or an explicit check observes it. Revalidate this record if scheduling, timestamp storage, template matching, notification identity or AI cache/link semantics change.

## PR #111 production receipt

[PR #111](https://github.com/DeonHolo/WildTrack/pull/111) merged to main at **14 October 2026, 3:31 AM Singapore time**, commit `2c2bb0f0569dbb816c1abd87ceec4be7b09fa3d1`. GitHub passed **700 frontend tests and 50 browser checks**. Vercel deployment `dpl_GYnogYhivihNHsKjU1Db2Fvk5v65` was READY for that commit; Heroku deployment `7048107736` reported success.

Signed-in Chrome verification confirmed Newest activity by default and Priority last, personal deletion endpoint HTTP 200, both delete confirmations, the saved AI report's outdated warning, corrected local detection/edit dates, the completed-batch dismiss control, and a single template-heading list. Deletion confirmations were cancelled. The earlier change warning stayed dismissed while the later change stayed Open. Console checks reported no errors. The loader's new copy and reduced-motion styles were present in delivered assets.

The Vercel MCP deployment read returned scope-level 403. The mapped Vercel CLI API fallback with the already-authorized CLI login and explicit project/team succeeded; no new authorization was needed.

## Follow-up corrections requested after PR #111

- **Action clipping:** the aligned 72px Dismiss / 64px Restore columns still cut off text because Mantine's horizontal padding reduced the label area. Production measured Dismiss at 42px available versus 45px required. The previous browser check inspected only the primary label. Secondary columns now use intrinsic content width; the regression checks every action label after fonts load at 1920, 1440, 1280, 1181, 1024 and 375 pixels. The primary label can wrap at narrower table widths.
- **Loader wording:** show just the logo/rings and **Loading…**, following the restrained [Atlassian spinner example](https://atlassian.design/components/spinner/examples). Remove the repeated WildTrack text and vague preparatory heading. Keep the sign-in refresh bypass and update the existing cross-tab status-text assertions; no minimum loading delay is added.
- **Acknowledgement:** staff can choose **Acknowledge change** in Document Check, then confirm. The notice hides only after a successful server save. It is personal to the staff account and workspace and keyed by response, artifact, file/content identity and first detection time. An unchanged recheck retains the acknowledgement; a later change, including restored identical contents, creates a distinct notice. File History, submission acceptance and AI freshness stay unchanged. Today's Work notifications remain separate.
- **Storage decision:** reuse the existing personal dismissal store with a `document-change:` namespace. The listing retains tombstones, so deletion cannot accidentally revive an acknowledged notice. Exclude these acknowledgement keys from Today's Work bulk notification deletion. This avoids a new schema migration for UI notice state.
- **Template action:** rename to **Open official template**, align it in the section heading row with wrapping for narrow screens, and retain the no-upload/no-button rule.
- **History disclosure:** rename Earlier checks to **Older file records**, and explain that the three newest records are shown above. All remaining records are retained in the expandable section; repeated unchanged checks remain grouped.

Evidence: `frontend/src/components/review/DocumentChangeNotice.jsx`; `frontend/src/lib/documentChangeAcknowledgement.js`; `frontend/src/pages/CommandCenterPage.jsx#deletableKeys`; `frontend/src/components/review/ObservedFileHistory.jsx`; `frontend/src/styles/wildtrack.css`; `frontend/tests/browser/review-history-followup.spec.js`.

Focused correction verification: **93 frontend tests, 11 browser checks and the frontend production build passed**. Browser fixtures cover acknowledgement cancellation, failed save, successful save and reload, a subsequent same-checksum change, retained AI freshness warning and all action labels. Actual live acknowledgement writes remain untested to preserve the user's records.

