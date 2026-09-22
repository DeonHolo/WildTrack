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
    record Finding(String issue, FindingSource source, String evidence, String requirement) { }
    record MissingRequiredSection(String section, FindingSource source, String requirement) { }
    record VerifiedCheck(String aspect, FindingSource source, String documentEvidence, String requirement) { }
    record Result(String summary, List<Finding> findings, List<MissingRequiredSection> missingRequiredSections,
                  List<String> limitations, String suggestedAction, List<VerifiedCheck> verifiedChecks) {
        public Result {
            // Previously saved five-field reports deserialize without verifiedChecks.
            verifiedChecks = verifiedChecks == null ? List.of() : List.copyOf(verifiedChecks);
        }

        public Result(String summary, List<Finding> findings, List<MissingRequiredSection> missingRequiredSections,
                      List<String> limitations, String suggestedAction) {
            this(summary, findings, missingRequiredSections, limitations, suggestedAction, List.of());
        }
    }
}
