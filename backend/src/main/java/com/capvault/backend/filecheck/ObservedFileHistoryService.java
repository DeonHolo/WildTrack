package com.capvault.backend.filecheck;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ObservedFileHistoryService {

    private static final String SOURCE_LABEL = "WildTrack Document Check observation";
    private static final String COVERAGE =
        "This history contains only file states WildTrack observed when Document Check ran.";
    private static final String OLDER_HISTORY =
        "Older Google Drive revision history is unavailable with the current API-key connection.";

    private final FileCheckReportRepository reports;
    private final ObjectMapper objectMapper;

    public ObservedFileHistoryService(
        FileCheckReportRepository reports,
        ObjectMapper objectMapper
    ) {
        this.reports = reports;
        this.objectMapper = objectMapper;
    }

    public record Batch(
        Map<String, ObservedFileHistoryView> legacy,
        Map<String, Map<String, ObservedFileHistoryView>> byField
    ) {
    }

    @Transactional(readOnly = true)
    public Batch forResponses(UUID workspaceId, List<String> responseIds) {
        if (responseIds == null || responseIds.isEmpty()) return new Batch(Map.of(), Map.of());

        Map<String, List<FileCheckReport>> legacyReports = new LinkedHashMap<>();
        Map<String, Map<String, List<FileCheckReport>>> fieldReports = new LinkedHashMap<>();

        for (FileCheckReport report : reports.findAllByWorkspaceIdAndExternalResponseIdInOrderByCheckedAtAsc(workspaceId, responseIds)) {
            if (report.getFieldId() == null || report.getFieldId().isBlank()) {
                legacyReports.computeIfAbsent(report.getExternalResponseId(), ignored -> new ArrayList<>()).add(report);
            } else {
                fieldReports.computeIfAbsent(report.getExternalResponseId(), ignored -> new LinkedHashMap<>())
                    .computeIfAbsent(report.getFieldId(), ignored -> new ArrayList<>())
                    .add(report);
            }
        }

        Map<String, ObservedFileHistoryView> legacy = new LinkedHashMap<>();
        legacyReports.forEach((responseId, responseReports) ->
            legacy.put(responseId, history(responseReports)));

        Map<String, Map<String, ObservedFileHistoryView>> byField = new LinkedHashMap<>();
        fieldReports.forEach((responseId, fields) -> {
            Map<String, ObservedFileHistoryView> histories = new LinkedHashMap<>();
            fields.forEach((fieldId, fieldHistory) -> histories.put(fieldId, history(fieldHistory)));
            byField.put(responseId, histories);
        });
        return new Batch(legacy, byField);
    }

    private ObservedFileHistoryView history(List<FileCheckReport> sourceReports) {
        List<MutableObservation> distinct = new ArrayList<>();
        String previousFileKey = null;
        String previousChecksum = null;
        String previousMetadataSignature = null;

        for (FileCheckReport report : sourceReports) {
            ParsedMetadata metadata = metadata(report);
            String fileKey = firstNonBlank(metadata.fileId(), report.getSourceUrl());
            String checksum = normalize(metadata.md5Checksum());
            String metadataSignature = metadataSignature(metadata);
            String identity = "observation|" + normalize(fileKey) + "|" + normalize(checksum) + "|" + metadataSignature;

            MutableObservation existing = distinct.isEmpty() ? null : distinct.get(distinct.size() - 1);
            if (existing != null && existing.identity.equals(identity)) {
                existing.lastObservedAt = report.getCheckedAt();
                existing.merge(metadata, displayEditor(metadata.editorEmail(), metadata.editorDisplayName()));
                continue;
            }

            String changeType;
            if (distinct.isEmpty()) {
                changeType = checksum == null ? "METADATA_OBSERVED" : "FIRST_OBSERVED";
            } else if (!Objects.equals(previousFileKey, fileKey)) {
                changeType = "SOURCE_CHANGED";
            } else if (checksum != null && previousChecksum != null
                    && !previousChecksum.equalsIgnoreCase(checksum)) {
                changeType = "CONTENT_CHANGED";
            } else if (Objects.equals(normalize(previousChecksum), normalize(checksum))
                    && !Objects.equals(previousMetadataSignature, metadataSignature)) {
                changeType = "METADATA_CHANGED";
            } else if (checksum == null) {
                changeType = "METADATA_OBSERVED";
            } else {
                changeType = "OBSERVED_VERSION";
            }

            String editor = displayEditor(metadata.editorEmail(), metadata.editorDisplayName());
            distinct.add(new MutableObservation(identity, changeType, report.getCheckedAt(), metadata, editor, report.getSourceUrl()));
            previousFileKey = fileKey;
            previousChecksum = checksum;
            previousMetadataSignature = metadataSignature;
        }

        List<ObservedFileHistoryView.Observation> observations = distinct.stream()
            .map(MutableObservation::toView)
            .sorted((left, right) -> right.firstObservedAt().compareTo(left.firstObservedAt()))
            .toList();
        return new ObservedFileHistoryView(SOURCE_LABEL, COVERAGE, OLDER_HISTORY, observations);
    }

    private ParsedMetadata metadata(FileCheckReport report) {
        String editorEmail = normalize(report.getDriveLastModifyingUserEmail());
        String editorDisplayName = normalize(report.getDriveLastModifyingUserDisplayName());
        try {
            JsonNode root = objectMapper.readTree(report.getReportJson());
            JsonNode metadata = root == null ? null : root.get("metadata");
            if (metadata == null || metadata.isNull()) return ParsedMetadata.editorOnly(editorEmail, editorDisplayName);
            return new ParsedMetadata(
                text(metadata.get("fileId")),
                text(metadata.get("name")),
                text(metadata.get("md5Checksum")),
                offsetDateTime(metadata.get("modifiedTime")),
                editorEmail,
                editorDisplayName
            );
        } catch (Exception ignored) {
            return ParsedMetadata.editorOnly(editorEmail, editorDisplayName);
        }
    }

    private static String displayEditor(String email, String providerDisplayName) {
        String normalized = normalize(email);
        if (normalized != null) return normalized;
        String displayName = normalize(providerDisplayName);
        return displayName == null ? "Unavailable" : displayName;
    }

    private static String metadataSignature(ParsedMetadata metadata) {
        return String.join("|",
            String.valueOf(normalize(metadata.fileName())),
            String.valueOf(normalize(metadata.modifiedTime())),
            String.valueOf(normalize(metadata.editorEmail())),
            String.valueOf(normalize(metadata.editorDisplayName())));
    }

    private static String normalize(Object value) {
        if (value == null) return null;
        String normalized = String.valueOf(value).trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private static String firstNonBlank(String first, String second) {
        String normalized = normalize(first);
        return normalized == null ? normalize(second) : normalized;
    }

    private static String text(JsonNode node) {
        return node == null || node.isNull() ? null : node.asText(null);
    }

    private static OffsetDateTime offsetDateTime(JsonNode node) {
        String value = text(node);
        if (value == null || value.isBlank()) return null;
        try { return OffsetDateTime.parse(value); }
        catch (Exception ignored) { return null; }
    }

    private record ParsedMetadata(
        String fileId,
        String fileName,
        String md5Checksum,
        OffsetDateTime modifiedTime,
        String editorEmail,
        String editorDisplayName
    ) {
        private static ParsedMetadata editorOnly(String email, String displayName) {
            return new ParsedMetadata(null, null, null, null, email, displayName);
        }
    }

    private static final class MutableObservation {
        private final String identity;
        private final String changeType;
        private final LocalDateTime firstObservedAt;
        private LocalDateTime lastObservedAt;
        private OffsetDateTime driveModifiedTime;
        private String checksum;
        private String modifiedBy;
        private String modifiedByEmail;
        private String providerDisplayName;
        private String fileId;
        private String fileName;
        private final String sourceUrl;

        private MutableObservation(
            String identity,
            String changeType,
            LocalDateTime observedAt,
            ParsedMetadata metadata,
            String modifiedBy,
            String sourceUrl
        ) {
            this.identity = identity;
            this.changeType = changeType;
            this.firstObservedAt = observedAt;
            this.lastObservedAt = observedAt;
            this.sourceUrl = sourceUrl;
            merge(metadata, modifiedBy);
        }

        private void merge(ParsedMetadata metadata, String editor) {
            if (metadata.modifiedTime() != null) this.driveModifiedTime = metadata.modifiedTime();
            if (normalize(metadata.md5Checksum()) != null) this.checksum = metadata.md5Checksum();
            if (normalize(metadata.editorEmail()) != null) {
                this.modifiedByEmail = metadata.editorEmail();
                this.modifiedBy = editor;
            } else if (normalize(metadata.editorDisplayName()) != null) {
                this.modifiedBy = editor;
            }
            if (normalize(metadata.editorDisplayName()) != null) this.providerDisplayName = metadata.editorDisplayName();
            if (this.modifiedBy == null) this.modifiedBy = "Unavailable";
            if (normalize(metadata.fileId()) != null) this.fileId = metadata.fileId();
            if (normalize(metadata.fileName()) != null) this.fileName = metadata.fileName();
        }

        private ObservedFileHistoryView.Observation toView() {
            return new ObservedFileHistoryView.Observation(
                changeType,
                SOURCE_LABEL,
                firstObservedAt,
                lastObservedAt,
                driveModifiedTime,
                checksum == null ? null : "md5:" + checksum,
                checksum == null ? null : "MD5",
                modifiedBy == null ? "Unavailable" : modifiedBy,
                modifiedByEmail,
                providerDisplayName,
                "Google Drive File metadata",
                (modifiedByEmail != null && !modifiedByEmail.isBlank()) || (providerDisplayName != null && !providerDisplayName.isBlank()),
                fileId,
                fileName,
                sourceUrl
            );
        }
    }
}
