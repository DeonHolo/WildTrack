# Progress Tooltip and Source Actions

## Scope

Make two small interface refinements without changing WildTrack's visual direction or workflow behavior:

- Explain the Student Dashboard tracker numbers with one shared tooltip.
- Reduce the width of Workspace Source Sheets import actions so the table fits more comfortably.

## Student Progress

Place a small, keyboard-focusable information action beside `Your tracker values`. Its tooltip reads:

> Numbers show days late. 0 means submitted on time.

The explanation applies only to numeric tracker values; date and text values remain unchanged. The tooltip uses Mantine behavior, a Phosphor information icon, a visible accessible name, and the existing WildTrack focus treatment. It must not add explanatory text to every cell.

## Workspace Source Sheets

Render each row action as a small secondary button labeled `Import`, retaining the link icon. Preserve the full source-specific accessible name and tooltip, such as `Import Team Formation`, so the compact visible label does not remove context for keyboard or assistive-technology users.

Keep the existing import handler, loading state, row status, and source data unchanged. Do not use icon-only actions and do not introduce a new button style.

## Responsive Behavior

The Source Sheets action column should fit the compact buttons without clipping. Deliberate table scrolling may remain at genuinely narrow staff viewports, but button width alone should not force overflow at the desktop width shown in the reference.

## Verification

- Route tests verify the tooltip trigger, concise copy, accessible names, and unchanged import behavior.
- Browser checks verify the Source Sheets table at desktop width and the Student Progress tooltip at desktop and mobile widths.
- Run focused tests, the complete frontend suite, and the production build.

## Out of Scope

- Changes to lateness calculation or tracker data.
- Changes to source imports or backend APIs.
- A new visual direction, tooltip system, or button component.
