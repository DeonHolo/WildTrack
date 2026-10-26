package com.capvault.backend.aireview;

import java.util.List;

/**
 * Provider boundary used by Gemini and test doubles. cacheVersion MUST identify the exact
 * model, generation settings and adapter/prompt behavior; change it when any of those change.
 * Make one bounded provider request per call (no automatic retries after ambiguous failures).
 * The idempotency key may also be forwarded if the provider supports it.
 */
public interface AiReviewProvider {
    boolean isConfigured();
    String cacheVersion();
    Result review(Input input);

    record FailureDiagnostic(String provider, String stage, Integer httpStatus, String providerStatus,
                             String reasonCode, List<String> parameterFields, String explanation,
                             String requestId, String model, Long elapsedMs) {
        public FailureDiagnostic {
            parameterFields = parameterFields == null ? List.of() : List.copyOf(parameterFields);
        }
    }
    record Input(String idempotencyKey, byte[] pdf, String extractedText, String systemInstruction,
                 String deliverableTitle, String instructions, String templateText,
                 List<String> priorEvidence, List<String> focusCriterionIds) {
        public Input {
            priorEvidence = priorEvidence == null ? List.of() : List.copyOf(priorEvidence);
            focusCriterionIds = focusCriterionIds == null ? List.of() : List.copyOf(focusCriterionIds);
        }
        public Input(String idempotencyKey, byte[] pdf, String extractedText, String systemInstruction,
                     String deliverableTitle, String instructions, String templateText) {
            this(idempotencyKey, pdf, extractedText, systemInstruction, deliverableTitle, instructions,
                templateText, List.of(), List.of());
        }
    }
    enum FindingSource { DOCUMENT, DELIVERABLE_REQUIREMENTS, OFFICIAL_TEMPLATE }
    enum ReviewOutcome { ISSUES_IDENTIFIED, NO_ISSUES_IN_CHECKED_AREAS, INCONCLUSIVE }
    record EvidenceLocation(Integer page, String section) { }
    record Finding(String issue, FindingSource source, String evidence, String requirement,
                   String title, String nextAction, EvidenceLocation location) {
        public Finding(String issue, FindingSource source, String evidence, String requirement) {
            this(issue, source, evidence, requirement, null, null, null);
        }
    }
    record MissingRequiredSection(String section, FindingSource source, String requirement) { }
    record VerifiedCheck(String aspect, FindingSource source, String documentEvidence, String requirement,
                         EvidenceLocation location) {
        public VerifiedCheck(String aspect, FindingSource source, String documentEvidence, String requirement) {
            this(aspect, source, documentEvidence, requirement, null);
        }
    }
    enum CoverageStatus { EVIDENCE_RECORDED, ISSUE_RECORDED, NEEDS_VERIFICATION, NOT_CHECKED }
    /** A compact, advisory assessment for one server-owned criterion. */
    enum CriterionAssessmentLabel { APPEARS_ADDRESSED, NEEDS_ATTENTION, CHECK_MANUALLY }
    record CriterionAssessment(String id, String requirement, FindingSource source, CoverageStatus status,
                               List<Integer> verifiedCheckIndexes, List<Integer> findingIndexes,
                               List<Integer> missingSectionIndexes, List<Integer> verificationNoteIndexes,
                               CriterionAssessmentLabel assessment, String explanation, String documentEvidence,
                               EvidenceLocation location, String title) {
        public CriterionAssessment(String id, String requirement, FindingSource source, CoverageStatus status,
                               List<Integer> verifiedCheckIndexes, List<Integer> findingIndexes,
                               List<Integer> missingSectionIndexes, List<Integer> verificationNoteIndexes) {
            this(id, requirement, source, status, verifiedCheckIndexes, findingIndexes, missingSectionIndexes,
                verificationNoteIndexes, null, null, null, null, null);
        }
        public CriterionAssessment(String id, String requirement, FindingSource source, CoverageStatus status,
                               List<Integer> verifiedCheckIndexes, List<Integer> findingIndexes,
                               List<Integer> missingSectionIndexes, List<Integer> verificationNoteIndexes,
                               CriterionAssessmentLabel assessment, String explanation, String documentEvidence,
                               EvidenceLocation location) {
            this(id, requirement, source, status, verifiedCheckIndexes, findingIndexes, missingSectionIndexes,
                verificationNoteIndexes, assessment, explanation, documentEvidence, location, null);
        }
        public CriterionAssessment {
            verifiedCheckIndexes = verifiedCheckIndexes == null ? List.of() : List.copyOf(verifiedCheckIndexes);
            findingIndexes = findingIndexes == null ? List.of() : List.copyOf(findingIndexes);
            missingSectionIndexes = missingSectionIndexes == null ? List.of() : List.copyOf(missingSectionIndexes);
            verificationNoteIndexes = verificationNoteIndexes == null ? List.of() : List.copyOf(verificationNoteIndexes);
            if (explanation != null && explanation.length() > 240) explanation = explanation.substring(0, 240);
            if (documentEvidence != null && documentEvidence.length() > 780) documentEvidence = documentEvidence.substring(0, 780);
        }
    }
    record ReviewCoverage(List<CriterionAssessment> criteria, int omittedCriteria, int completedPasses,
                          String followupNotice, String scopeNote) {
        public ReviewCoverage { criteria = criteria == null ? List.of() : List.copyOf(criteria); }
    }
    record DocumentOverview(String text, String actualDocumentType, boolean wrongDocument, String evidence) { }
    record Result(String summary, List<Finding> findings, List<MissingRequiredSection> missingRequiredSections,
                  List<String> limitations, String suggestedAction, List<VerifiedCheck> verifiedChecks,
                  List<Finding> verificationNotes, ReviewOutcome outcome, ReviewCoverage coverage,
                  DocumentOverview documentOverview) {
        public Result {
            // Saved reports and provider doubles from earlier versions omit these fields.
            verifiedChecks = verifiedChecks == null ? List.of() : List.copyOf(verifiedChecks);
            verificationNotes = verificationNotes == null ? List.of() : List.copyOf(verificationNotes);
        }
        public Result(String summary, List<Finding> findings, List<MissingRequiredSection> missingRequiredSections,
                      List<String> limitations, String suggestedAction, List<VerifiedCheck> verifiedChecks,
                      List<Finding> verificationNotes, ReviewOutcome outcome, ReviewCoverage coverage) {
            this(summary, findings, missingRequiredSections, limitations, suggestedAction, verifiedChecks,
                verificationNotes, outcome, coverage, null);
        }
        public Result(String summary, List<Finding> findings, List<MissingRequiredSection> missingRequiredSections,
                      List<String> limitations, String suggestedAction, List<VerifiedCheck> verifiedChecks,
                      List<Finding> verificationNotes, ReviewOutcome outcome) {
            this(summary, findings, missingRequiredSections, limitations, suggestedAction, verifiedChecks,
                verificationNotes, outcome, null);
        }
        public Result(String summary, List<Finding> findings, List<MissingRequiredSection> missingRequiredSections,
                      List<String> limitations, String suggestedAction, List<VerifiedCheck> verifiedChecks) {
            this(summary, findings, missingRequiredSections, limitations, suggestedAction,
                verifiedChecks, List.of(), null);
        }

        public Result(String summary, List<Finding> findings, List<MissingRequiredSection> missingRequiredSections,
                      List<String> limitations, String suggestedAction) {
            this(summary, findings, missingRequiredSections, limitations, suggestedAction, List.of());
        }
    }
}
