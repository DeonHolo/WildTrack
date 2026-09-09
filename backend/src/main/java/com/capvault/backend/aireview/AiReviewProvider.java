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
    record Result(String summary, List<String> flags, List<String> missingSections, String suggestedAction) { }
}
