package com.capvault.backend.response;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.filecheck.FileCheckReport;
import com.capvault.backend.filecheck.FileCheckReportRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ResponseTimingService {

    private static final ZoneId DEADLINE_ZONE = ZoneId.of("Asia/Manila");

    private final DeliverableRepository deliverables;
    private final DeliverableFieldRepository fields;
    private final FormResponseVersionRepository versions;
    private final FileCheckReportRepository checks;
    private final ObjectMapper objectMapper;

    public ResponseTimingService(
        DeliverableRepository deliverables,
        DeliverableFieldRepository fields,
        FormResponseVersionRepository versions,
        FileCheckReportRepository checks,
        ObjectMapper objectMapper
    ) {
        this.deliverables = deliverables;
        this.fields = fields;
        this.versions = versions;
        this.checks = checks;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public Map<UUID, ResponseTimingView> forResponses(List<FormResponse> responses) {
        Map<UUID, ResponseTimingView> result = new LinkedHashMap<>();
        for (FormResponse response : responses) result.put(response.getId(), forResponse(response));
        return result;
    }

    @Transactional(readOnly = true)
    public ResponseTimingView forResponse(FormResponse response) {
        Deliverable deliverable = deliverables.findById(response.getDeliverableId())
            .filter(item -> response.getWorkspaceId().equals(item.getWorkspaceId()))
            .orElseThrow(() -> new IllegalArgumentException("Response deliverable was not found in this workspace."));
        List<DeliverableField> persistedFields = fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverable.getId());
        List<ArtifactField> artifactFields = persistedFields.stream()
            .filter(field -> isArtifact(field.getFieldType()))
            .map(field -> new ArtifactField(field.getId(), field.getFieldKey(), field.getLabel(), field.getFieldType()))
            .toList();
        if (artifactFields.isEmpty()) {
            artifactFields = List.of(new ArtifactField(
                null,
                deliverable.isPdfRequired() ? "documentPdf" : "primaryLink",
                deliverable.isPdfRequired() ? "PDF Drive Link" : "Submission Link",
                deliverable.isPdfRequired() ? DeliverableFieldType.DRIVE_PDF : DeliverableFieldType.GENERAL_URL
            ));
        }

        Map<String, Object> currentValues = values(response.getValuesJson());
        List<FormResponseVersion> history = versions.findAllByResponseIdOrderByRevisionAsc(response.getId());
        Instant materialSavedAt = lastMaterialArtifactSave(history, currentValues, artifactFields);

        List<ResponseTimingView.Contributor> contributors = new ArrayList<>();
        contributors.add(new ResponseTimingView.Contributor(
            "INITIAL_SUBMISSION", response.getSubmittedAt(), null, null, "Initial response saved in WildTrack."));
        if (materialSavedAt != null) {
            contributors.add(new ResponseTimingView.Contributor(
                "MATERIAL_ARTIFACT_SAVE", materialSavedAt, null, null,
                "At least one submitted artifact link/file value changed in WildTrack."));
        }

        List<ResponseTimingView.ArtifactEvidence> evidence = new ArrayList<>();
        Instant verifiedContentModifiedAt = null;
        for (ArtifactField field : artifactFields) {
            if (field.type() != DeliverableFieldType.DRIVE_PDF) continue;
            String currentUrl = stringValue(currentValues.get(field.key()));
            ArtifactContentResult content = contentEvidence(response, field, currentUrl);
            evidence.add(content.evidence());
            if (content.verifiedModifiedAt() != null) {
                verifiedContentModifiedAt = latest(verifiedContentModifiedAt, content.verifiedModifiedAt());
                contributors.add(new ResponseTimingView.Contributor(
                    "VERIFIED_PDF_CONTENT_CHANGE",
                    content.verifiedModifiedAt(),
                    field.id(),
                    field.label(),
                    "Document Check observed a checksum change for the same submitted PDF link; Drive modifiedTime contributes only because the content change was verified."
                ));
            }
        }

        Instant effective = response.getSubmittedAt();
        effective = latest(effective, materialSavedAt);
        effective = latest(effective, verifiedContentModifiedAt);
        Instant effectiveAt = effective;
        Instant due = deadlineInstant(deliverable.getDueAt());
        boolean late = due != null && effectiveAt != null && effectiveAt.isAfter(due);
        int daysLate = late ? Math.max(1, (int) Math.ceil(Duration.between(due, effectiveAt).toMillis() / 86_400_000d)) : 0;

        String reason = contributors.stream()
            .filter(item -> item.timestamp() != null && item.timestamp().equals(effectiveAt))
            .map(item -> switch (item.type()) {
                case "MATERIAL_ARTIFACT_SAVE" -> "Material artifact save";
                case "VERIFIED_PDF_CONTENT_CHANGE" -> "Verified same-link PDF content modification";
                default -> "Initial submission";
            })
            .distinct()
            .reduce((first, second) -> first + " + " + second)
            .orElse("Initial submission");

        return new ResponseTimingView(
            response.getSubmittedAt(),
            materialSavedAt,
            verifiedContentModifiedAt,
            effectiveAt,
            reason,
            late,
            daysLate,
            List.copyOf(contributors),
            List.copyOf(evidence)
        );
    }

    private Instant lastMaterialArtifactSave(
        List<FormResponseVersion> history,
        Map<String, Object> currentValues,
        List<ArtifactField> artifactFields
    ) {
        if (history.isEmpty()) return null;
        Instant latest = null;
        for (int index = 0; index < history.size(); index++) {
            FormResponseVersion before = history.get(index);
            Map<String, Object> beforeValues = values(before.getValuesJson());
            Map<String, Object> afterValues = index + 1 < history.size()
                ? values(history.get(index + 1).getValuesJson())
                : currentValues;
            if (artifactFields.stream().anyMatch(field -> !sameValue(beforeValues.get(field.key()), afterValues.get(field.key())))) {
                latest = latest(latest, before.getCreatedAt());
            }
        }
        return latest;
    }

    private ArtifactContentResult contentEvidence(FormResponse response, ArtifactField field, String currentUrl) {
        if (currentUrl.isBlank()) {
            return artifactResult(field, currentUrl, "UNAVAILABLE", null,
                "No current PDF link is saved, so same-link content change cannot be verified.");
        }
        if (field.id() == null) {
            return artifactResult(field, currentUrl, "UNAVAILABLE", null,
                "Legacy PDF checks are not field-scoped, so same-link content history cannot be proven safely.");
        }
        List<FileCheckReport> reports = checks
            .findAllByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(
                response.getWorkspaceId(), response.getId().toString(), field.id())
            .stream()
            .filter(report -> currentUrl.equals(stringValue(report.getSourceUrl())))
            .sorted(Comparator.comparing(FileCheckReport::getCheckedAt))
            .toList();
        if (reports.isEmpty()) {
            return artifactResult(field, currentUrl, "UNAVAILABLE", null,
                "No Document Check observation exists for the current PDF link; Drive/content evidence is unavailable.");
        }

        String previousHash = null;
        boolean comparableHashes = false;
        boolean metadataObserved = false;
        Instant verifiedAt = null;
        boolean verifiedButTimeUnavailable = false;
        for (FileCheckReport report : reports) {
            Observation observation = observation(report);
            if (observation.modifiedTime() != null) metadataObserved = true;
            if (observation.hash() == null || observation.hash().isBlank()) continue;
            if (previousHash != null) {
                comparableHashes = true;
                if (!previousHash.equalsIgnoreCase(observation.hash())) {
                    if (observation.modifiedTime() != null) verifiedAt = latest(verifiedAt, observation.modifiedTime());
                    else verifiedButTimeUnavailable = true;
                }
            }
            previousHash = observation.hash();
        }
        if (verifiedAt != null) {
            return artifactResult(field, currentUrl, "VERIFIED_CHANGE", verifiedAt,
                "Document Check observed a checksum change on this same PDF link; the verified Drive modifiedTime contributes to effective submission time.");
        }
        if (verifiedButTimeUnavailable) {
            return artifactResult(field, currentUrl, "VERIFIED_CHANGE_TIME_UNAVAILABLE", null,
                "Document Check verified a same-link checksum change, but no usable Drive modifiedTime was available, so no file timestamp was guessed.");
        }
        if (comparableHashes) {
            return artifactResult(field, currentUrl, "NO_VERIFIED_CHANGE", null,
                "Repeated Document Check observations have the same content checksum; metadata/check times do not count as content edits.");
        }
        return artifactResult(field, currentUrl, "UNAVAILABLE", null,
            metadataObserved
                ? "Drive metadata is available, but there are not two comparable content checksums; modifiedTime alone does not prove a content edit."
                : "Document Check did not provide comparable content checksums; content-change timing is unavailable.");
    }

    private ArtifactContentResult artifactResult(ArtifactField field, String url, String status, Instant modifiedAt, String message) {
        return new ArtifactContentResult(modifiedAt, new ResponseTimingView.ArtifactEvidence(
            field.id(), field.key(), field.label(), url, status, modifiedAt, message));
    }

    private Observation observation(FileCheckReport report) {
        try {
            JsonNode root = objectMapper.readTree(report.getReportJson());
            JsonNode metadata = root == null ? null : root.get("metadata");
            if (metadata == null || metadata.isNull()) return new Observation(null, null);
            String hash = text(metadata.get("md5Checksum"));
            Instant modifiedAt = parseInstant(text(metadata.get("modifiedTime")));
            return new Observation(hash, modifiedAt);
        } catch (Exception ignored) {
            return new Observation(null, null);
        }
    }

    private Map<String, Object> values(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() { });
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    private static boolean isArtifact(DeliverableFieldType type) {
        return type == DeliverableFieldType.GENERAL_URL
            || type == DeliverableFieldType.DRIVE_PDF
            || type == DeliverableFieldType.GOOGLE_FORM
            || type == DeliverableFieldType.GOOGLE_SHEET
            || type == DeliverableFieldType.DRIVE_FOLDER;
    }

    private static boolean sameValue(Object left, Object right) {
        return stringValue(left).equals(stringValue(right));
    }

    private static String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static String text(JsonNode node) {
        return node == null || node.isNull() ? null : node.asText(null);
    }

    private static Instant parseInstant(String value) {
        if (value == null || value.isBlank()) return null;
        try { return OffsetDateTime.parse(value).toInstant(); }
        catch (Exception ignored) {
            try { return Instant.parse(value); }
            catch (Exception ignoredAgain) { return null; }
        }
    }

    private static Instant deadlineInstant(LocalDateTime dueAt) {
        return dueAt == null ? null : dueAt.atZone(DEADLINE_ZONE).toInstant();
    }

    private static Instant latest(Instant first, Instant second) {
        if (first == null) return second;
        if (second == null) return first;
        return second.isAfter(first) ? second : first;
    }

    private record ArtifactField(String id, String key, String label, DeliverableFieldType type) { }
    private record Observation(String hash, Instant modifiedTime) { }
    private record ArtifactContentResult(Instant verifiedModifiedAt, ResponseTimingView.ArtifactEvidence evidence) { }
}
