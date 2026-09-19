package com.capvault.backend.response;

import java.time.Instant;
import java.util.List;

public record ResponseTimingView(
    Instant initialSubmittedAt,
    Instant lastMaterialArtifactSavedAt,
    Instant verifiedContentModifiedAt,
    Instant effectiveSubmittedAt,
    String effectiveReason,
    boolean late,
    int daysLate,
    List<Contributor> contributors,
    List<ArtifactEvidence> artifactEvidence
) {
    public record Contributor(
        String type,
        Instant timestamp,
        String fieldId,
        String fieldLabel,
        String detail
    ) { }

    public record ArtifactEvidence(
        String fieldId,
        String fieldKey,
        String fieldLabel,
        String sourceUrl,
        String contentEvidenceStatus,
        Instant verifiedModifiedAt,
        String message
    ) { }
}
