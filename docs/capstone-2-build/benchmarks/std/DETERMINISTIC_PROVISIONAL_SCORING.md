# Deterministic benchmark provisional scoring

**Status:** local engineering sanity check only. The expected labels have not yet received the required independent human answer-key review, so these counts are not a final Objective 1 validation result.

## Frozen binary indicator assertions currently suitable for direct scoring

| Fixture | Assertion | Expected | Observed | Provisional class |
|---|---|---:|---:|---|
| STD-01 | `appearsTemplateOnly` | true | true | TP |
| STD-02 | `appearsTemplateOnly` | true | true | TP |
| STD-05 | `appearsTemplateOnly` | false | false | TN |
| STD-24 | missing body heading includes `Test Approach` | true | true | TP |

Provisional engineering counts: TP=3, TN=1, FP=0, FN=0 across four frozen binary assertions. The observed match is 4/4 for this narrow subset.

These four assertions are intentionally narrower than the complete benchmark plan. STD-03, STD-08, STD-10 and STD-21 contain content questions that the deterministic checker is not expected to solve by itself. Their current readable/template-comparison outputs are preserved in `deterministic-observations.csv` without converting them into artificial deterministic pass/fail labels.

## Why this is not the final accuracy result

- Human answer-key review is still `PENDING` in `manifest.csv`.
- The local fixture subset is synthetic STD material derived from one official template.
- Access failures, corrupt/password-protected/oversized files and other planned technical cases are not included in this four-assertion subset yet.
- AI Review has a separate denominator and no fresh provider execution has occurred in this environment.
- Do not generalize these observations to all academic document types or participant submissions.

## AI Review state

Fresh pilot attempts: **0**. `GEMINI_API_KEY` was not configured on 2026-09-19, so no provider request was made. This is an environment prerequisite, not a provider failure and not an unassessable fixture result.

The currently compiled provider identifies its cache/prompt configuration as:

`gemini-3.1-flash-lite:rest-pdf-v2:temperature-0.2:thinking-minimal:output-2048:f5a3b0783e06fdfbc82a6fd8445864250b003225a52ed7a7c6c195f20ea47f90`

The first fresh-run protocol remains defined in `AI_PILOT_PLAN.md` and must not count cached results as fresh runs.
