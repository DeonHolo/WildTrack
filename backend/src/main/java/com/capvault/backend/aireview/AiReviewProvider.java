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

    record Input(String idempotencyKey, byte[] pdf, String extractedText, String systemInstruction,
                 String deliverableTitle, String instructions, String templateText) { }
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
    record Result(String summary, List<Finding> findings, List<MissingRequiredSection> missingRequiredSections,
                  List<String> limitations, String suggestedAction, List<VerifiedCheck> verifiedChecks,
                  List<Finding> verificationNotes, ReviewOutcome outcome) {
        public Result {
            // Saved reports and provider doubles from earlier versions omit these fields.
            verifiedChecks = verifiedChecks == null ? List.of() : List.copyOf(verifiedChecks);
            verificationNotes = verificationNotes == null ? List.of() : List.copyOf(verificationNotes);
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
