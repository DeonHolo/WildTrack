# 07 - Class Tracker at scale

**What to build:** Migrate the class tracker into a dense, stable table that remains usable with 318 or more students. Search, selection, paging, raw values, and selected-student context must remain available without forcing Sir to scroll back through a very long page.

**Blocked by:** 02 - Role-specific application shells.

**Status:** ready-for-agent

- [ ] The tracker table is always presented as a table and is not hidden behind a misleading collapse control.
- [ ] Search, row count, pagination, summary access, and `Load all rows` remain inside the table toolbar.
- [ ] The toolbar, table header, and required student context behave predictably while scrolling without detaching or covering rows.
- [ ] Student name, team code, and member number columns remain identifiable and sticky where viewport width permits.
- [ ] Team codes and member numbers are centered consistently with visible column headers.
- [ ] Raw values including numbers, dates, `DONE`, blanks, and `#N/A` stay on one compact line and are not duplicated with stacked status pills.
- [ ] Row selection has a clear visual state and selected-student detail remains reachable without scrolling to the page top.
- [ ] Search focus does not disappear or trigger a page-level loading refresh while typing.
- [ ] Pagination never places Previous or Next controls outside the table boundary.
- [ ] Tests use at least 318 rows and cover search, paging, load-all, selection, sticky behavior, mixed values, and desktop/laptop overflow.

