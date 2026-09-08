package com.capvault.backend.archive;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

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
    private final ProjectMetadataRepository projectRepository;
    private final AcademicWorkspaceRepository workspaceRepository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public ArchiveService(
        ArchiveRecordRepository archiveRepository,
        FormResponseRepository responseRepository,
        ResponseAcceptanceRepository acceptanceRepository,
        DeliverableRepository deliverableRepository,
        ProjectMetadataRepository projectRepository,
        AcademicWorkspaceRepository workspaceRepository,
        ObjectMapper objectMapper,
        Clock clock
    ) {
        this.archiveRepository = archiveRepository;
        this.responseRepository = responseRepository;
        this.acceptanceRepository = acceptanceRepository;
        this.deliverableRepository = deliverableRepository;
        this.projectRepository = projectRepository;
        this.workspaceRepository = workspaceRepository;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ArchiveRecordResponse> list(UUID workspaceId) {
        return archiveRepository.findAllByWorkspaceIdOrderByArchivedAtDesc(workspaceId).stream()
            .map(ArchiveRecordResponse::from)
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
        if (existing.isPresent()) return ArchiveRecordResponse.from(existing.get());

        var workspace = workspaceRepository.findById(workspaceId)
            .orElseThrow(() -> new IllegalArgumentException("Workspace not found."));
        var deliverable = deliverableRepository.findById(response.getDeliverableId())
            .filter(item -> workspaceId.equals(item.getWorkspaceId()))
            .orElseThrow(() -> new IllegalArgumentException("Deliverable not found."));
        var project = projectRepository.findByWorkspaceIdAndGroupCodeIgnoreCase(workspaceId, response.getTeamCode()).orElse(null);
        int version = Math.toIntExact(archiveRepository.countByResponseId(responseId) + 1);
        String hash = sha256(response.getId() + "|" + response.getUpdatedAt() + "|" + response.getValuesJson());
        ArchiveRecord record = new ArchiveRecord(
            UUID.randomUUID(), workspaceId, responseId, response.getUpdatedAt(), workspace.getName(), deliverable.getTitle(),
            response.getTeamCode(), response.getStudentName(), response.getStudentNumber(),
            project == null ? null : project.getProjectTitle(), project == null ? null : project.getSoftwareName(),
            project == null ? null : project.getAdviserName(), version, firstLink(response.getValuesJson()), hash, clock.instant()
        );
        return ArchiveRecordResponse.from(archiveRepository.save(record));
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
}
