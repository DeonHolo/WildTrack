package com.capvault.backend.aireview;

import java.util.List;

/**
 * Provider boundary used by Gemini and test doubles. cacheVersion MUST identify the exact
 * model, generation settings and adapter/prompt behavior; change it when any of those change.
 * Make one bounded provider request per call (no automatic retries after ambiguous failures).
 * The idempotency key may also be forwarded if the provider supports it.
 */
public interface AiReviewProvider extends com.capvault.backend.template.TemplateInstructionGateway {
    boolean isConfigured();
    /** Remaining provider cooldown; querying this never starts or retries a request. */
    default long retryDelayMillis() { return 0; }
    String cacheVersion();
    Result review(Input input);
    default Result assessInstructions(InstructionInput input) {
        throw new UnsupportedOperationException("Instruction assessment is unavailable.");
    }
    record InstructionInput(Input review, com.capvault.backend.template.TemplateInstructionPreparation.Prepared template,
        List<com.capvault.backend.template.TemplateInstructionPreparation.Instruction> instructions, boolean includeOverview) { }

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
    record DocumentExcerpt(String text, EvidenceLocation location) { }
    enum CoverageStatus { EVIDENCE_RECORDED, ISSUE_RECORDED, NEEDS_VERIFICATION, NOT_CHECKED }
    /** A compact, advisory assessment for one server-owned criterion. */
    enum CriterionAssessmentLabel { APPEARS_ADDRESSED, NEEDS_ATTENTION, CHECK_MANUALLY, NOT_APPLICABLE, UNVERIFIED }
    record CriterionAssessment(String id, String requirement, FindingSource source, CoverageStatus status,
                               List<Integer> verifiedCheckIndexes, List<Integer> findingIndexes,
                               List<Integer> missingSectionIndexes, List<Integer> verificationNoteIndexes,
                               CriterionAssessmentLabel assessment, String explanation, String documentEvidence,
                               EvidenceLocation location, String title, List<DocumentExcerpt> documentExcerpts) {
        public CriterionAssessment(String id, String requirement, FindingSource source, CoverageStatus status,
                               List<Integer> verifiedCheckIndexes, List<Integer> findingIndexes,
                               List<Integer> missingSectionIndexes, List<Integer> verificationNoteIndexes,
                               CriterionAssessmentLabel assessment, String explanation, String documentEvidence,
                               EvidenceLocation location, String title) {
            this(id, requirement, source, status, verifiedCheckIndexes, findingIndexes, missingSectionIndexes,
                verificationNoteIndexes, assessment, explanation, documentEvidence, location, title, List.of());
        }
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
            documentExcerpts = documentExcerpts == null ? List.of() : List.copyOf(documentExcerpts);
            verifiedCheckIndexes = verifiedCheckIndexes == null ? List.of() : List.copyOf(verifiedCheckIndexes);
            findingIndexes = findingIndexes == null ? List.of() : List.copyOf(findingIndexes);
            missingSectionIndexes = missingSectionIndexes == null ? List.of() : List.copyOf(missingSectionIndexes);
            verificationNoteIndexes = verificationNoteIndexes == null ? List.of() : List.copyOf(verificationNoteIndexes);
            if (explanation != null && explanation.length() > 1000) throw new IllegalArgumentException("Assessment explanation exceeds its limit.");
            if (documentEvidence != null && documentEvidence.length() > 1600) throw new IllegalArgumentException("Assessment evidence exceeds its limit.");
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
