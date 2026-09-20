# First project-defined Goal 1 preflight: no observations

The project-defined reference was frozen at `2026-09-20T19:56:29.905Z` using committed source revision `97c3e7d559eabdb590a274366b0a6777414aaad0` before attempting its first explicitly designated evaluation.

**The first exporter invocation failed before any observations were written.** The OFFICIAL preflight called the manifest-oriented CSV parser on `atomic-assertions.csv`, whose header contains assertion fields rather than `file` and `human_label_review`; `StdBenchmarkObservationExportTest.validateOfficialPreRunFreeze` rejected the header. This is an evaluation harness error, not a Document Check classification, and **no observation CSV or research accuracy score was produced**. The pre-run key remains unchanged and is retained as a record of the unsuccessful attempt.

The general-purpose CSV parser was subsequently corrected to accept explicitly requested, file-specific required columns, and an assertion-header regression test was added. This is a **post-freeze code change**, so the repaired test may be evaluated only under a **new commit and new pre-run freeze**; it must not be retrospectively associated with this first key. No previously recorded development or Goal 2 outputs were modified.
