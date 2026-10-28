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
import java.util.Objects;
import java.time.Instant;

import com.capvault.backend.archive.storage.ArchiveStorageRegistry;
import com.capvault.backend.archive.storage.ArchiveStorageException;
import com.capvault.backend.response.AcceptedPdfSnapshotService;
import com.capvault.backend.response.DomainEventRecorder;

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
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

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
    private final ArchiveFileStore files;
    private final ArchiveStorageRegistry storage;
    private final AcceptedPdfSnapshotService snapshots;
    private final DomainEventRecorder events;
    private final TransactionTemplate transactions;

    public ArchiveService(
        ArchiveRecordRepository archiveRepository,
        FormResponseRepository responseRepository,
        ResponseAcceptanceRepository acceptanceRepository,
        DeliverableRepository deliverableRepository,
        DeliverableFieldRepository deliverableFieldRepository,
        ProjectMetadataRepository projectRepository,
        AcademicWorkspaceRepository workspaceRepository,
        ObjectMapper objectMapper,
        Clock clock,
        ArchiveFileStore files,
        ArchiveStorageRegistry storage,
        AcceptedPdfSnapshotService snapshots,
        DomainEventRecorder events,
        PlatformTransactionManager transactionManager
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
        this.files = files;
        this.storage = storage;
        this.snapshots = snapshots;
        this.events = events;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    @Transactional(readOnly = true)
    public List<ArchiveRecordResponse> list(UUID workspaceId) {
        return archiveRepository.findAllByWorkspaceIdOrderByArchivedAtDesc(workspaceId).stream()
            .map(this::view)
            .toList();
    }

    public List<ArchiveRecordResponse> archive(UUID workspaceId, List<UUID> responseIds) {
        return archive(workspaceId, responseIds, "system");
    }

    public List<ArchiveRecordResponse> archive(UUID workspaceId, List<UUID> responseIds, String actor) {
        if (responseIds == null || responseIds.isEmpty() || responseIds.size() > 100 || responseIds.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException("Select between 1 and 100 accepted responses.");
        }
        // Lock in one stable order and commit all queue records together. A bad selection
        // must not leave silently queued work behind an error response.
        var ids=responseIds.stream().distinct().toList();
        return transactions.execute(status -> {
            var result=new java.util.LinkedHashMap<UUID,ArchiveRecordResponse>();
            ids.stream().sorted().forEach(id -> result.put(id,archiveOne(workspaceId,id,actor)));
            return ids.stream().map(result::get).toList();
        });
    }

    private ArchiveRecordResponse archiveOne(UUID workspaceId, UUID responseId, String actor) {
        var response = responseRepository.findByIdForUpdate(responseId)
            .orElseThrow(() -> new IllegalArgumentException("Response not found."));
        if (!workspaceId.equals(response.getWorkspaceId())) {
            throw new IllegalArgumentException("Response does not belong to this workspace.");
        }
        var acceptance = acceptanceRepository.findByResponseIdAndRevokedAtIsNull(responseId)
            .orElseThrow(() -> new IllegalArgumentException("Only accepted responses can be archived."));
        if (!acceptance.getSourceResponseUpdatedAt().equals(response.getUpdatedAt())) {
            throw new IllegalArgumentException("This response changed after acceptance and must be reviewed again.");
        }
        var manifest=snapshots.read(acceptance.getSourceArtifactsJson());
        if (!manifest.complete()) throw new IllegalArgumentException(manifest.error());
        var existing = archiveRepository.findAllByResponseIdAndSourceResponseUpdatedAtOrderByArchivedAtDesc(responseId,response.getUpdatedAt());
        for (var candidate : existing) {
            var record=archiveRepository.findByIdForUpdate(candidate.getId()).orElseThrow();
            if ("COMPLETE".equals(record.getCaptureState()) && matches(record,manifest)) {
                if (!record.isActive() || !Objects.equals(record.getActiveAcceptanceAt(),acceptance.getAcceptedAt())) {
                    record.activate(acceptance.getAcceptedAt());
                    events.record(workspaceId,record.getId(),actor,"ARCHIVE_REACTIVATED",java.util.Map.of("responseId",responseId));
                    archiveRepository.saveAndFlush(record);
                }
                return view(record);
            }
            if (Objects.equals(record.getCaptureAcceptanceAt(),acceptance.getAcceptedAt())) {
                if ("FAILED".equals(record.getCaptureState())) throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This archive copy failed. Open Final archive to review the error and retry copying.");
                if (!record.isActive()) {
                    record.activate(acceptance.getAcceptedAt());
                    events.record(workspaceId,record.getId(),actor,"ARCHIVE_REACTIVATED",java.util.Map.of("responseId",responseId));
                    archiveRepository.saveAndFlush(record);
                }
                return view(record);
            }
        }

        var workspace = workspaceRepository.findById(workspaceId)
            .orElseThrow(() -> new IllegalArgumentException("Workspace not found."));
        if (!workspace.isActive()) throw new IllegalArgumentException("Restore the workspace before archiving.");
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
        String provider;
        try { provider=storage.defaultProvider().id(); }
        catch (ArchiveStorageException missing) { throw unavailable("Archive storage is not connected. Existing records and copies remain available."); }
        record.queue(acceptance.getAcceptedAt());
        archiveRepository.saveAndFlush(record);
        manifest.artifacts().forEach(pdf -> files.add(record.getId(),pdf,provider));
        events.record(workspaceId,record.getId(),actor,"ARCHIVE_QUEUED",java.util.Map.of("responseId",responseId,"files",manifest.artifacts().size()));
        return view(record);
    }

    private boolean matches(ArchiveRecord record, AcceptedPdfSnapshotService.Manifest manifest) {
        var captured=files.files(record.getId());
        return captured.size()==manifest.artifacts().size() && manifest.artifacts().stream().allMatch(pdf ->
            captured.stream().anyMatch(file -> file.stored() && file.fieldKey().equals(pdf.fieldKey())
                && file.sourceFileId().equals(pdf.fileId()) && file.md5().equalsIgnoreCase(pdf.md5()) && file.size()==pdf.size()));
    }

    public ArchiveRecordResponse unarchive(UUID workspaceId, UUID id, long version, String actor) {
        return transactions.execute(status -> {
            var record=locked(workspaceId,id);
            if (!record.isActive()) return view(record);
            requireVersion(record,version);
            record.deactivate();
            events.record(workspaceId,id,actor,"ARCHIVE_UNARCHIVED",java.util.Map.of("responseId",record.getResponseId()));
            archiveRepository.saveAndFlush(record);
            return view(record);
        });
    }

    public ArchiveRecordResponse retry(UUID workspaceId, UUID id, long version, String actor) {
        return transactions.execute(status -> {
            var record=locked(workspaceId,id);
            if ("QUEUED".equals(record.getCaptureState()) || "COPYING".equals(record.getCaptureState()) || "COMPLETE".equals(record.getCaptureState())) return view(record);
            requireVersion(record,version);
            if ("LEGACY".equals(record.getCaptureState())) throw new IllegalArgumentException("This legacy record has no preserved files. Review and accept the current PDFs before creating a new archive.");
            files.retry(id);
            record.setCaptureState("QUEUED",null);
            events.record(workspaceId,id,actor,"ARCHIVE_RETRY_REQUESTED",java.util.Map.of());
            archiveRepository.saveAndFlush(record);
            return view(record);
        });
    }

    @Transactional(readOnly=true)
    public ArchiveRecordResponse get(UUID workspaceId, UUID id) {
        return view(checked(workspaceId,id));
    }

    public byte[] download(UUID workspaceId, UUID id, UUID fileId) {
        checked(workspaceId,id);
        var file=files.get(fileId);
        if (!id.equals(file.archiveId()) || !file.stored()) throw new IllegalArgumentException("Preserved PDF not found in this archive.");
        try {
            byte[] bytes=storage.provider(file.providerId()).read(file.objectId());
            ArchiveCaptureWorker.requireHash(bytes,file.sha256(),file.size());
            return bytes;
        } catch (RuntimeException failure) { throw unavailable("The preserved PDF could not be read and verified. The archive record has been kept; try again later."); }
    }

    public ArchiveRecordResponse verify(UUID workspaceId, UUID id, String actor) {
        var record=checked(workspaceId,id);
        var captured=files.files(id);
        if (captured.isEmpty() || captured.stream().anyMatch(file -> !file.stored())) throw new IllegalArgumentException("This archive does not yet have a complete set of preserved PDFs.");
        for (var file : captured) download(workspaceId,id,file.id());
        return transactions.execute(status -> {
            events.record(workspaceId,id,actor,"ARCHIVE_VERIFIED",java.util.Map.of("files",captured.size()));
            return view(checked(workspaceId,id));
        });
    }

    public record StorageStatus(boolean configured, boolean ready, String provider, String message) { }
    private volatile StorageStatus lastStorageStatus;
    private volatile Instant lastStorageCheck=Instant.EPOCH;
    public StorageStatus storageStatus() {
        var cached=lastStorageStatus;
        if (cached!=null && clock.instant().isBefore(lastStorageCheck.plusSeconds(60))) return cached;
        StorageStatus current;
        try {
            var provider=storage.defaultProvider();
            var readiness=provider.probe();
            current=new StorageStatus(true,readiness.ready(),provider.id(),readiness.reason());
        } catch (ArchiveStorageException missing) {
            current=new StorageStatus(false,false,null,"Archive storage is not connected. Existing records and preserved copies remain available.");
        }
        lastStorageCheck=clock.instant();lastStorageStatus=current;return current;
    }
    private ArchiveRecord checked(UUID workspaceId, UUID id) {
        return archiveRepository.findById(id).filter(record -> workspaceId.equals(record.getWorkspaceId()))
            .orElseThrow(() -> new IllegalArgumentException("Archive record not found in this workspace."));
    }
    private ArchiveRecord locked(UUID workspaceId, UUID id) {
        var record=archiveRepository.findByIdForUpdate(id).orElseThrow(() -> new IllegalArgumentException("Archive record not found."));
        if (!workspaceId.equals(record.getWorkspaceId())) throw new IllegalArgumentException("Archive record does not belong to this workspace.");
        return record;
    }
    private static void requireVersion(ArchiveRecord record,long version) {
        if (version!=record.getStateVersion()) throw new ResponseStatusException(HttpStatus.CONFLICT,"The archive changed. Refresh it before trying again.");
    }
    private ArchiveRecordResponse view(ArchiveRecord record) {
        return ArchiveRecordResponse.from(record,objectMapper,files.files(record.getId()),files.history(record.getId()));
    }
    private static ResponseStatusException unavailable(String message) { return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,message); }

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
