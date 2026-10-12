# STD AI Review and Heroku memory — 12 October 2026

## Request and observed state

The owner reported an STD attempt with `RUNNING`, `reused: true`, `report: null`, and no completion date, alongside a finished batch that claimed a saved review was reused. An ordinary read of the live Review page subsequently showed **Retry required** and an incomplete/invalid review message. The supplied running response was transient; an indefinitely running worker was not established.

`GET` of a saved review reads the stored attempt, sets `reused: true`, and does not download the PDF or send another Gemini request. `sourceVerified: false` means this read did not freshly verify Drive contents. It is not itself a PDF access failure. A running attempt has no saved report yet. The existing abandoned-job rule exposes an uncertain outcome after ten minutes and requires an explicit retry rather than automatically repeating a potentially billed request.

## Confirmed reporting defect and repair

Batch polling overwrote the original job claim's reuse flag with the read-only response's flag. The batch also counted failed `DONE` entries as reused saved reviews and always said saved results were available. Consequently an `INVALID_RESPONSE` attempt with no report could produce the owner's contradictory message.

- Preserve the original claim's reuse flag through status polls and worker restoration.
- Count reused reviews only for completed results without an attention/error message.
- Treat a completed status without a report as a failed result.
- Finish failed batches with **items needing attention**, including previously persisted batches returned by the read API. The processed count still describes attempts that ended, not successful reviews.
- Retain normal claim deduplication, grounding checks, and explicit confirmation for potentially billable retries.

All **81** batch lifecycle/deduplication tests passed, including four new regressions for failed polling, newly generated reports, genuinely reused reports, and missing completed reports. No provider request was sent by these tests.

## Memory evidence and bounded runtime profile

The supplied Heroku screenshots show a 512 MB Basic web dyno, latest consumption **695.5 MB (135.8%)**, maximum **776.6 MB (151.7%)**, repeated `R14` warnings, and substantial swap. This establishes memory pressure. It does not establish a leak or prove why Gemini's report was invalid. The supplied log screenshot contains request activity and memory warnings, not the fixed-label Gemini failure diagnostic.

Heroku already supplies `JAVA_TOOL_OPTIONS` automatically; the launch command does not need to interpolate that variable. Basic Cedar's documented default is `-Xmx300m -Xss512k -XX:CICompilerCount=2`. Missing `JAVA_OPTS` in the old launch command is therefore not a demonstrated cause.

The reviewable production profile uses:

| Setting | Default | Override |
| --- | --- | --- |
| Java memory | `-Xms64m -Xmx256m -Xss512k -XX:ReservedCodeCacheSize=64m` | `WILDTRACK_JAVA_MEMORY_OPTS` |
| Linux allocator arenas | `2` | Existing `MALLOC_ARENA_MAX` preserved |
| HTTP maximum threads / minimum spare | `32` / `4` | `WILDTRACK_HTTP_MAX_THREADS` / `WILDTRACK_HTTP_MIN_SPARE_THREADS` |
| Database maximum pool / minimum idle | `6` / `1` | `WILDTRACK_DB_MAX_POOL_SIZE` / `WILDTRACK_DB_MIN_IDLE` |

Heroku's other Java defaults remain in effect. Metaspace is not hard-capped. Monitor timing, accepted PDF size, document evidence and review requirements remain unchanged. Use an explicit memory override if dyno capacity changes; the 512 MB profile is a starting point, not an assurance that total process memory will stay below quota.

The actual local STD passed extraction/heading comparison with the proposed Java memory flags: **58 pages**, **158,725 characters**, and **11/12** legitimate template headings detected. The local PDF SHA-256 is `eabafc7835868f95fb967bf67fb7c6ab68a5d6380edf65f43c4a43dbf3f2c4e1`. This proves that local document processing succeeds at the heap cap; it does not prove hosted RSS, live file revision identity, or successful Gemini output. Launch expansion was also checked for both defaults and explicit overrides.

Template text/metadata projection and fixed-label service-stage diagnostics passed their focused verification. Three real JPA regressions prove list reads exclude both the BLOB and full text, text/hash reads exclude the BLOB, and workspace-scoped Open returns the exact original bytes. Five logging/privacy regressions cover source validation, provider, grounding, and persistence stages. The related run passed 75 tests with one unrelated optional held-out case skipped. PDFBox's byte-array source stays in memory; merely choosing a disk scratch cache would not resolve retained source/page-text allocations.

## Remaining live evidence

The exact invalid-output reason still requires the relevant Gemini/service `stage`, `code`, and fixed `detail`/exception-class log labels. Search for `Gemini AI review failure` and, after this change is deployed, `AI review failure`. Do not relax evidence validation or label a missing report successful to hide the failure. No new Gemini request, Heroku configuration change, paid dyno change, or deployment has occurred during this investigation.

After deployment, check warmed memory and swap, thread/heap/native usage, and code-cache warnings. A fresh explicit STD retry is needed to prove live review completion; local tests are not that proof.

The STD DOCX, PDF, and ZIP remain frozen. The separate [combined Google login change](REQUIRED_DRIVE_LOGIN_2026-10-12.md) does not bypass Google's Testing audience restriction and is not the established cause of this AI failure.

## Sources

- [Heroku Java memory diagnostics and R14 paging](https://devcenter.heroku.com/articles/java-memory-issues)
- [Heroku Java buildpack defaults and automatic JAVA_TOOL_OPTIONS](https://devcenter.heroku.com/articles/heroku-java-behavior)
- [PDFBox 3 loading and stream-cache behavior](https://pdfbox.apache.org/3.0/migration.html)
