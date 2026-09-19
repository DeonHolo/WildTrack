# STD AI Review pilot plan

**Status:** prepared, not executed on 2026-09-19 because no `GEMINI_API_KEY` is configured in the current environment. No paid fallback or provider call was attempted.

## Fresh-run set

The first low-quota pilot remains limited to ten content fixtures from the supplied benchmark plan:

`STD-01`, `STD-02`, `STD-03`, `STD-05`, `STD-08`, `STD-09`, `STD-10`, `STD-12`, `STD-18`, `STD-21`.

All ten planned pilot PDFs are prepared locally: STD-01 uses the owner-supplied official template, while STD-02, 03, 05, 08, 09, 10, 12, 18 and 21 are synthetic controlled PDFs. Freeze their hashes before inspecting the first provider result.

## Run rules

1. Confirm the free-tier Gemini credential is configured without printing the key.
2. Freeze app commit, provider model, prompt/grounding version, official template hash, fixture hashes and expected labels before the first fresh call.
3. Use one fresh call per selected fixture. Do not retry automatically for a better answer.
4. Record cache status. A cached report is not a fresh pilot run.
5. Record provider/quota/transport failures separately and keep them in the end-to-end accounting.
6. Score expected issue detection, correct-document false alarms, claim traceability and unsupported findings separately.
7. Preserve the existing grounding contract: explicit requirement violations must trace to configured deliverable instructions or the mapped official template. Document-grounded observations may describe document facts but may not invent mandatory requirements.
8. Stop rather than switching to a paid model/service if free quota is unavailable.

## Required run record

For each fresh attempt record:

- fixture id and SHA-256;
- timestamp;
- app commit;
- official template SHA-256;
- provider and model;
- prompt/grounding version;
- fresh versus cache status;
- expected finding(s);
- observed finding(s);
- substantive claim source/provenance;
- unsupported claim count;
- adjudicated pass/fail/unassessable decision;
- provider/quota/transport error if any.

Human answer-key review remains pending until a teammate reviews the frozen expected labels without first using the WildTrack output as the answer key.
