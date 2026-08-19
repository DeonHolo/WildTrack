# WildTrack UI Rebrand Specification

Date: 2026-08-19

Status: Approved design synthesized from the completed brainstorming discussion.

Implementation branch: `wildtrack-rebrand`

## Problem Statement

The current CapVault V2 interface demonstrates the required workflows, but its visual language is inconsistent and often resembles an assembled prototype rather than a deliberate academic product. Buttons, cards, tables, forms, status indicators, spacing, and role navigation do not yet behave as one system. Several high-volume staff views are too card-heavy or cramped for classes containing hundreds of students, while the student-facing pages do not yet communicate a memorable product identity.

The product is also being renamed to WildTrack. A superficial color replacement would preserve the existing structural problems, while a complete rewrite would risk breaking working Sheet import, submission, tracker, review, adviser, and archive behavior. The rebrand therefore needs to reorganize layouts and navigation while preserving the approved workflows and domain rules.

## Solution

Rebuild the interface incrementally on Mantine, using a WildTrack theme inspired by CIT University's maroon-and-gold identity without presenting WildTrack as an official university portal. The interface will be light-mode only, operational and restrained for staff, and warmer and more expressive for students.

The redesign will use role-specific shells, compact data-oriented staff views, a familiar single-page submission form, and reusable Mantine components instead of continuing to expand the existing hand-built component and CSS layer. Working behavior will be migrated route by route so every completed slice remains usable and verifiable.

The first vertical slice will establish the theme and rebuild the public submission experience. Public forms will support a workspace default header image and an optional per-form override. A temporary maroon-and-gold banner will occupy this space until commissioned artwork is available. Temporary character graphics will otherwise be limited to the post-submission success treatment.

## User Stories

1. As a student, I want a published form to open directly, so that I can submit without navigating through a marketing page or separate WildTrack registration screen.
2. As a student, I want WildTrack to use the Google account already active in my browser when possible, so that identity attribution feels almost invisible.
3. As a student, I want a compact `Continue with Google` fallback when automatic Google identification is unavailable, so that I can continue without creating another password.
4. As a first-time student, I want to select my Student Number from the form's workspace roster, so that WildTrack can derive my class-record details.
5. As a first-time student, I want to see my selected name, team, member number, adviser, and active Google email before submitting, so that I can catch a mistaken association.
6. As a returning student, I want my remembered workspace identity to appear automatically, so that repeat submissions require fewer actions.
7. As a returning student, I want explicit actions for switching Google accounts or using a different student record, so that reassignment cannot happen accidentally.
8. As a student, I want the submission form to remain one continuous page, so that identity attribution does not become a separate wizard or login barrier.
9. As a student, I want the due date, deliverable instructions, and required PDF Drive link to be visually clear, so that I know what Sir expects before submitting.
10. As a student, I want the form to remain open after its due date, so that a late response can still be recorded correctly.
11. As a student, I want an existing response to be edited without exposing another Google identity's submitted link, so that response ownership remains private.
12. As a student, I want a clear submission-success screen, so that I know whether WildTrack received, updated, or left my response unchanged.
13. As a student, I want the form and success screen to carry recognizable WildTrack artwork, so that the experience feels intentional and connected to campus identity.
14. As a student, I want the Student Dashboard to use a simple top navigation rather than the staff shell, so that it stays focused on my submissions, feedback, and progress.
15. As a student, I want long feedback and document results to remain readable without breaking the row layout, so that I can scan first and open details when needed.
16. As Sir Ralph, I want a compact staff navigation shell, so that the workspace and primary operations remain reachable with minimal clicks.
17. As Sir Ralph, I want institution-wide tools and `My advised teams` available in the same account view, so that I do not need to switch between artificial Admin and Adviser modes.
18. As an adviser, I want a reduced navigation containing only assigned-team review and permitted tracker context, so that unrelated administrative controls do not distract me.
19. As Sir Ralph, I want the Command Center to prioritize actual work requiring attention, so that it provides more value than a collection of shortcuts.
20. As Sir Ralph, I want review organized by deliverable with compact submission rows, so that hundreds of responses do not become hundreds of oversized cards.
21. As Sir Ralph, I want filters, counts, batch actions, and selected-response details to stay visible and predictable, so that reviewing a deliverable requires fewer clicks.
22. As Sir Ralph, I want accepted submissions to leave the active attention queue, so that completed work does not continue appearing as unchecked.
23. As an adviser, I want assigned teams summarized by team output rather than duplicated member submissions, so that I can focus on the group's actual deliverable.
24. As an adviser, I want feedback controls to be comfortably spaced and attached to the selected submission, so that remarks are easy to enter and save.
25. As a student, I want adviser feedback shown clearly in my dashboard without displaying staff-only AI analysis, so that I receive useful guidance without internal review noise.
26. As Sir Ralph, I want the Tracker to support hundreds of rows with sticky identity context, search, paging, and optional load-all behavior, so that selecting a student never requires scrolling back to the top.
27. As Sir Ralph, I want tracker values to remain compact and raw, so that numbers, dates, blanks, and `#N/A` do not become stacked or misleading status rows.
28. As Sir Ralph, I want Forms displayed in a scalable table with visible actions and readable links, so that publishing and maintaining many deliverables remains manageable.
29. As Sir Ralph, I want a workspace default form banner with optional per-form replacement, so that forms share a coherent identity while special deliverables can use commissioned artwork.
30. As Sir Ralph, I want the form publisher to preview, replace, reposition, and remove form artwork, so that header images remain usable across desktop and mobile crops.
31. As Sir Ralph, I want Workspace imports and mapping results presented as structured summaries, so that missing fields and detected data are easier to understand than generic success messages.
32. As Sir Ralph, I want the Archive to use a compact searchable index rather than a growing card gallery, so that final records remain usable at class scale.
33. As a keyboard user, I want all navigation, forms, menus, dialogs, tables, and actions to expose visible focus and correct accessible names, so that WildTrack is operable without a mouse.
34. As a mobile student, I want the public form and dashboard to fit without horizontal overflow or overlapping controls, so that submission works from a phone.
35. As a developer, I want role and workflow behavior separated from presentation components, so that replacing the UI does not rewrite academic rules.
36. As a developer, I want each migrated route to remain demonstrable and testable before the next route is changed, so that the rebrand does not become an unstable big-bang rewrite.

## Implementation Decisions

### Product and brand

- The product name displayed in the redesigned interface is `WildTrack`.
- WildTrack is an independent product inspired by CIT University. It must not imply official university ownership or use language that misrepresents its status.
- The visual direction is academic operations: warm, focused, reliable, and efficient rather than playful throughout or styled like a marketing site.
- CIT University's public materials establish maroon and gold as its identifying colors. WildTrack will use its own accessible digital interpretation rather than claim undocumented hexadecimal values as official.
- The light theme is the only supported theme in this redesign. Dark mode controls, tokens, and alternate layouts are not required.
- The base product palette is anchored by deep maroon `#65152E`, dark structural maroon `#481020`, restrained gold `#C89518`, dark gold text `#755400`, warm background `#F7F3EE`, white surface `#FFFFFF`, primary text `#241A1E`, muted text `#6D6065`, and border `#DED5D8`.
- Gold is an accent, divider, focus, and identity color. It is not used as body text on white or as a large saturated background where contrast would suffer.
- Semantic success, warning, danger, and informational colors remain available for operational meaning and are not replaced by maroon or gold.
- `Manrope` is the primary interface typeface. Tabular values and technical identifiers use `IBM Plex Mono` where it improves scanning.
- Staff screens use restrained heading sizes, tabular numerals, compact rows, and clear dividers. Public forms and student empty/success states may use more generous spacing.

### UI library and component strategy

- Mantine is the styled UI component library for the rebrand.
- The initial Mantine packages are Core, Hooks, Form, Dates, Notifications, and Modals. Additional packages are added only when a ticket has a concrete need.
- Phosphor Icons remains the sole general interface icon library.
- WildTrack customizes Mantine through one shared theme, component default props, and scoped style overrides. It does not recreate standard buttons, inputs, dialogs, menus, tabs, or notifications by hand.
- The existing global CSS system is retired incrementally as routes migrate. Old and new components may coexist temporarily, but a migrated route must not depend on duplicate competing component styles.
- Controls use approximately 6px radii and larger structural surfaces use approximately 8px radii. Pill shapes are reserved for compact statuses or segmented controls, not general buttons and containers.
- Public primary actions have at least a 44px target height. Dense staff controls may use 40px when surrounding spacing and accessibility remain adequate.
- Status treatments are compact and stable. They do not cause table rows or dashboard items to rearrange as statuses are added.

### Information architecture and role shells

- Sir/Admin uses a compact left navigation with a persistent academic workspace context.
- Sir's navigation includes institution-wide operations and direct access to his assigned teams. His overlapping adviser responsibility does not require a separate production mode switch.
- Regular advisers use a reduced staff shell containing assigned-team review and permitted tracker context.
- Students use a simpler top navigation focused on Dashboard, account controls, and opening relevant forms.
- Public submission forms do not use the staff sidebar or a landing page.
- Development role-preview controls remain a development-only overlay and are hidden in production. They must not alter the production information architecture.
- The staff shell groups navigation by workflow rather than exposing every existing route as an equal item. Exact labels may be shortened during implementation when the meaning remains clear.

### Public form and Google-attributed identity

- The approved identity workflow in the WildTrack identity design remains authoritative.
- Opening a published form displays the form immediately. There is no separate WildTrack login, registration, password, OTP, or `cit.edu` authentication page.
- Google Identity Services or the existing session identifies the active Google account. A compact `Continue with Google` action is the fallback.
- On first use in a workspace, the form displays an inline searchable Student Number selector populated only from that workspace's Team Formation data.
- Selecting a Student Number derives the roster name, team code, member number, adviser, course, and section when present.
- Before the first submission, the page shows the active Google email and derived class-record identity clearly enough to catch a mistake.
- Returning students see a compact identity summary instead of the full selector. `Switch Google account` and `Use a different student record` are explicit secondary actions.
- The identity portion is not a separate stepper page. The public form remains a single continuous form.
- Self-declared associations are not labeled verified.
- Existing response data and Drive links remain private to their owning Google identity and are never populated merely because another account selected the same Student Number.

### Form artwork

- **Current implementation decision (Ticket 04):** use the bundled WildTrack banner only. Staff-side artwork configuration is deferred until WildTrack has durable media storage; browser-local base64 uploads are not an acceptable persistence design. The Forms page must not reserve a large management section for this deferred control.
- Each academic workspace may define one default public-form header image.
- Each published deliverable may optionally override the workspace image.
- When neither image exists, WildTrack displays the bundled temporary banner.
- The banner uses a wide approximately 4:1 presentation, responsive cropping, meaningful alternative text, and a stored focal position so important artwork remains visible on narrow screens.
- Form management supports previewing, replacing, repositioning, and removing an override. Removing an override falls back to the workspace image rather than leaving a broken image.
- Artwork configuration is independent from the deliverable slug and response history. Replacing artwork never creates a duplicate form or loses responses.
- Temporary graphics are limited to the public form banner and submission-success banner.
- The future mascot remains student-facing. It is not inserted into staff navigation, tracker rows, review tables, status indicators, AI results, serious warnings, or identity-conflict states.

### Staff workflow layouts

- Command Center becomes a compact `Today's work` queue containing unresolved operational items, not decorative metric cards or navigation shortcuts.
- Review remains deliverable-first. A deliverable summary leads to a compact submissions table, and selecting a response opens a stable detail area or drawer for Document Check, AI Review, acceptance, archive, and file actions.
- AI Review controls remain Sir/Admin-only. Advisers may view an existing permitted result but do not run or rerun it.
- Team Review groups equivalent member submissions by team for adviser work while preserving individual records for grading and audit.
- Tracker uses sticky headers and sticky identity columns, compact raw values, in-table search and paging controls, selected-row indication, and a student detail treatment that remains reachable while scrolling.
- Forms, Workspace sources, templates, and Archive records use tables or lists designed for growth. Repeated item cards are avoided when the expected count is large.
- Destructive and bulk actions use Mantine confirmation dialogs with explicit scope, counts, and typed confirmation only when the operation warrants it.

### Responsiveness and accessibility

- Public form and student pages are mobile-first and must not horizontally scroll under normal content.
- Staff data tables may use deliberate horizontal scrolling when all columns cannot fit, but actions, search, and pagination remain inside the table boundary.
- Responsive behavior must preserve information hierarchy rather than simply stack every desktop panel into a long page.
- Long names, team codes, links, feedback, flags, and status text are tested explicitly.
- Dialogs manage focus, Escape dismissal, accessible titles, and return focus through Mantine behavior.
- Every icon-only action has an accessible name and tooltip when its meaning is not universal.
- Color never carries status meaning alone.
- Motion is limited to short CSS or Mantine transitions for state changes. There are no decorative perpetual animations in operational views.

### Migration strategy

- The rebrand is an incremental migration, not a rewrite of academic business logic.
- The first vertical slice installs and configures Mantine, establishes the WildTrack theme, and rebuilds the public form and submission-success experience.
- Shared staff and student shells migrate next so later routes inherit the correct navigation and spacing.
- High-value operational routes migrate in this order: Review, Team Review, Tracker, Forms, Workspace, Command Center, Student Dashboard, and Archive.
- Route behavior, existing workflow actions, state calls, and backend API contracts remain intact unless a separate approved ticket changes them.
- Each migrated route removes obsolete local presentation code only after the replacement is functional and verified.

## Testing Decisions

- The primary frontend test seam is the route-level user experience. Tests interact with visible fields, navigation, dialogs, filters, rows, and actions rather than asserting Mantine implementation details.
- Add a frontend test harness using Vitest and React Testing Library for deterministic component and route behavior.
- Add Playwright browser coverage for the most important cross-page flows and visual layout verification.
- Preserve existing backend controller and service tests; the rebrand must not require backend behavior changes.
- Theme smoke tests verify that the Mantine provider renders core controls and that supported routes do not depend on dark mode.
- Public-form tests cover published, unpublished, missing, loading, first-time identity, returning identity, existing response, validation error, submitting, received, updated, and unchanged states.
- When durable artwork storage is implemented, form-artwork tests cover workspace fallback, per-form override, missing asset fallback, responsive crop metadata, replace, reposition, and remove behavior.
- Role-shell tests verify Sir/Admin, adviser, student, public, and development-preview navigation boundaries.
- Staff scale tests use at least 318 tracker students and a comparable submission volume to detect card growth, layout shifts, slow filtering, and controls escaping their containers.
- Review tests cover deliverable-first navigation, stable status columns, batch selection, accepted items leaving active queues, and selected-response details.
- Tracker tests cover sticky context, centered member numbers and team codes, pagination, search focus stability, load-all behavior, selected-row visibility, and raw mixed values.
- Responsive browser checks use representative desktop, laptop, tablet, and mobile viewports, including approximately 1440x900, 1280x720, 768x1024, and 390x844.
- Accessibility checks cover keyboard-only operation, visible focus, labels, dialog focus management, status meaning, contrast, and reduced-motion preferences.
- Visual verification includes screenshots after each route migration and explicit inspection for overlap, clipped text, inconsistent button dimensions, accidental nested cards, and uncontrolled page length.

## Out of Scope

- Dark mode.
- Creation of the final mascot or commissioned banner artwork.
- Presenting WildTrack as an official CIT University service.
- Replacing Phosphor Icons.
- Migrating the project to Tailwind CSS.
- Rewriting backend domain logic, database persistence, Sheet writeback, Google authentication, AI Review, Document Check, or archive storage as part of the visual rebrand.
- Adding OTP, Microsoft authentication, `cit.edu` login, or a WildTrack password system.
- A mobile application.
- Decorative mascot placement throughout staff screens.
- A big-bang removal of every legacy CSS rule before all routes have migrated.

## Further Notes

- The selected strategy is a design-system-led incremental migration. Patching the old CSS first was rejected because much of that work would be discarded. A simultaneous full rewrite was rejected because it would place working academic workflows at unnecessary risk.
- Mantine was selected because it supplies a strong styled baseline for Vite and React, including forms, searchable inputs, dates, dialogs, notifications, navigation, and layout components. Base UI was rejected for this phase because it would leave too much visual-system construction to the project. HeroUI v3 was not selected because it would also require a Tailwind CSS v4 migration, while MUI would require substantial work to remove its recognizable Material appearance.
- Official CIT University materials identify maroon and gold as the institution's colors: https://cit.edu/the-cit-motto-and-hymn/
- Mantine's official Vite guidance is the implementation reference: https://mantine.dev/getting-started/?g=vite
- Google Forms' official header-image behavior is a familiarity reference, not a requirement to copy Google's visual styling: https://support.google.com/docs/answer/145737
- This specification supplements the current SRS, SDD, post-demo roadmap, and WildTrack identity design. When a visual assumption in an older document conflicts with this specification, this specification governs the rebrand. Domain, security, data ownership, tracker, review, and archive rules remain governed by their latest dedicated decisions.
