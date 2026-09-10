package com.capvault.backend.archive;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.ArrayList;
import java.util.Set;
import java.util.UUID;

import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.project.ProjectMetadataRepository;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.response.ResponseAcceptanceRepository;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ArchiveService {

    private final ArchiveRecordRepository archiveRepository;
    private final FormResponseRepository responseRepository;
    private final ResponseAcceptanceRepository acceptanceRepository;
    private final DeliverableRepository deliverableRepository;
    private final DeliverableFieldRepository deliverableFieldRepository;
    private final ProjectMetadataRepository projectRepository;
    private final AcademicWorkspaceRepository workspaceRepository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public ArchiveService(
        ArchiveRecordRepository archiveRepository,
        FormResponseRepository responseRepository,
        ResponseAcceptanceRepository acceptanceRepository,
        DeliverableRepository deliverableRepository,
        DeliverableFieldRepository deliverableFieldRepository,
        ProjectMetadataRepository projectRepository,
        AcademicWorkspaceRepository workspaceRepository,
        ObjectMapper objectMapper,
        Clock clock
    ) {
        this.archiveRepository = archiveRepository;
        this.responseRepository = responseRepository;
        this.acceptanceRepository = acceptanceRepository;
        this.deliverableRepository = deliverableRepository;
        this.deliverableFieldRepository = deliverableFieldRepository;
        this.projectRepository = projectRepository;
        this.workspaceRepository = workspaceRepository;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ArchiveRecordResponse> list(UUID workspaceId) {
        return archiveRepository.findAllByWorkspaceIdOrderByArchivedAtDesc(workspaceId).stream()
            .map(record -> ArchiveRecordResponse.from(record, objectMapper))
            .toList();
    }

    @Transactional
    public List<ArchiveRecordResponse> archive(UUID workspaceId, List<UUID> responseIds) {
        return responseIds.stream().distinct().map(responseId -> archiveOne(workspaceId, responseId)).toList();
    }

    private ArchiveRecordResponse archiveOne(UUID workspaceId, UUID responseId) {
        var response = responseRepository.findById(responseId)
            .orElseThrow(() -> new IllegalArgumentException("Response not found."));
        if (!workspaceId.equals(response.getWorkspaceId())) {
            throw new IllegalArgumentException("Response does not belong to this workspace.");
        }
        var acceptance = acceptanceRepository.findByResponseIdAndRevokedAtIsNull(responseId)
            .orElseThrow(() -> new IllegalArgumentException("Only accepted responses can be archived."));
        if (!acceptance.getSourceResponseUpdatedAt().equals(response.getUpdatedAt())) {
            throw new IllegalArgumentException("This response changed after acceptance and must be reviewed again.");
        }
        var existing = archiveRepository.findByResponseIdAndSourceResponseUpdatedAt(responseId, response.getUpdatedAt());
        if (existing.isPresent()) return ArchiveRecordResponse.from(existing.get(), objectMapper);

        var workspace = workspaceRepository.findById(workspaceId)
            .orElseThrow(() -> new IllegalArgumentException("Workspace not found."));
        var deliverable = deliverableRepository.findById(response.getDeliverableId())
            .filter(item -> workspaceId.equals(item.getWorkspaceId()))
            .orElseThrow(() -> new IllegalArgumentException("Deliverable not found."));
        var project = projectRepository.findForCurrentTeam(workspaceId, response.getTeamCode()).orElse(null);
        int version = Math.toIntExact(archiveRepository.countByResponseId(responseId) + 1);
        String hash = sha256(response.getId() + "|" + response.getUpdatedAt() + "|" + response.getValuesJson());
        String artifactSnapshot = artifactSnapshot(deliverable.getId(), response.getValuesJson());
        ArchiveRecord record = new ArchiveRecord(
            UUID.randomUUID(), workspaceId, responseId, response.getUpdatedAt(), workspace.getName(), deliverable.getTitle(),
            response.getTeamCode(), response.getStudentName(), response.getStudentNumber(),
            project == null ? null : project.getProjectTitle(), project == null ? null : project.getEffectiveSoftwareName(),
            project == null ? null : project.getEffectiveAdviserName(), version, firstLink(response.getValuesJson()), artifactSnapshot, hash, clock.instant()
        );
        return ArchiveRecordResponse.from(archiveRepository.save(record), objectMapper);
    }

    private String artifactSnapshot(UUID deliverableId, String valuesJson) {
        try {
            JsonNode values = objectMapper.readTree(valuesJson);
            if (!values.isObject()) return "[]";
            List<ArchiveRecordResponse.ArchivedArtifact> artifacts = new ArrayList<>();
            Set<String> capturedKeys = new LinkedHashSet<>();
            for (var field : deliverableFieldRepository.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverableId)) {
                JsonNode valueNode = values.get(field.getFieldKey());
                if (valueNode == null || valueNode.isNull()) continue;
                String value = valueNode.asText("").trim();
                if (value.isBlank()) continue;
                artifacts.add(new ArchiveRecordResponse.ArchivedArtifact(
                    field.getFieldKey(), field.getLabel(), field.getFieldType().name(), value
                ));
                capturedKeys.add(field.getFieldKey());
            }
            values.fields().forEachRemaining(entry -> {
                if (capturedKeys.contains(entry.getKey())) return;
                String value = entry.getValue().asText("").trim();
                if (value.isBlank()) return;
                artifacts.add(new ArchiveRecordResponse.ArchivedArtifact(
                    entry.getKey(), humanizeFieldKey(entry.getKey()), "LEGACY", value
                ));
            });
            return objectMapper.writeValueAsString(artifacts);
        } catch (Exception ignored) {
            return "[]";
        }
    }

    private String firstLink(String valuesJson) {
        try {
            JsonNode values = objectMapper.readTree(valuesJson);
            if (!values.isObject()) return "";
            for (JsonNode value : values) {
                String text = value.asText("").trim();
                if (text.startsWith("http://") || text.startsWith("https://")) return text;
            }
        } catch (Exception ignored) {
            // The response remains archivable even when a legacy value cannot be parsed as JSON.
        }
        return "";
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException("SHA-256 is unavailable.", error);
        }
    }

    private static String humanizeFieldKey(String value) {
        return value.replaceAll("([a-z0-9])([A-Z])", "$1 $2")
            .replaceAll("[_-]+", " ")
            .trim();
    }
}
