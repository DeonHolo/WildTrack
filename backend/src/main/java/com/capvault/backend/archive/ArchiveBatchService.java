package com.capvault.backend.archive;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import com.capvault.backend.deliverable.*;
import com.capvault.backend.filecheck.FileCheckRequest;
import com.capvault.backend.filecheck.FileCheckService;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.response.ResponseAcceptanceRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class ArchiveBatchService {
    public record Item(UUID responseId, String studentName, String deliverableTitle, Instant responseUpdatedAt,
        Instant acceptedAt, String stage, boolean ready, int pdfCount, String message, UUID archiveId) {
        Item result(String stage, boolean ready, int count, String message, UUID archiveId) {
            return new Item(responseId, studentName, deliverableTitle, responseUpdatedAt, acceptedAt, stage, ready, count, message, archiveId);
        }
    }
    public record Data(List<Item> items) { }
    public record View(UUID id, String state, long version, List<Item> items) { }
    private final ArchiveBatchStore store;
    private final ArchiveService archive;
    private final FormResponseRepository responses;
    private final ResponseAcceptanceRepository acceptances;
    private final DeliverableRepository deliverables;
    private final DeliverableFieldRepository fields;
    private final FileCheckService checks;
    private final ObjectMapper json;
    private final boolean enabled;
    public ArchiveBatchService(ArchiveBatchStore store, ArchiveService archive, FormResponseRepository responses,
        ResponseAcceptanceRepository acceptances, DeliverableRepository deliverables, DeliverableFieldRepository fields,
        FileCheckService checks, ObjectMapper json, @Value("${wildtrack.archive.worker-enabled:true}") boolean enabled) {
        this.store=store;this.archive=archive;this.responses=responses;this.acceptances=acceptances;
        this.deliverables=deliverables;this.fields=fields;this.checks=checks;this.json=json;this.enabled=enabled;
    }
    public View latest(UUID workspace) { return store.latest(workspace).map(this::view).orElse(null); }
    public View prepare(UUID workspace, List<UUID> ids, String actor) {
        var selected = ids.stream().distinct().toList();
        var byId = responses.findAllById(selected).stream().collect(java.util.stream.Collectors.toMap(
            com.capvault.backend.response.FormResponse::getId, response -> response));
        var acceptedById = acceptances.findAllByResponseIdInAndRevokedAtIsNull(selected).stream().collect(java.util.stream.Collectors.toMap(
            accepted -> accepted.getResponse().getId(), accepted -> accepted));
        var titleById = deliverables.findAllById(byId.values().stream().map(com.capvault.backend.response.FormResponse::getDeliverableId).distinct().toList())
            .stream().collect(java.util.stream.Collectors.toMap(Deliverable::getId, Deliverable::getTitle));
        var items = selected.stream().map(id -> {
            var response = byId.get(id);
            if (response == null || !workspace.equals(response.getWorkspaceId()) || !response.isCurrentResponse())
                throw new IllegalArgumentException("Select current responses in this workspace.");
            var accepted = acceptedById.get(id);
            String title = titleById.getOrDefault(response.getDeliverableId(), "Submission");
            return new Item(id, response.getStudentName(), title, response.getUpdatedAt(), accepted == null ? null : accepted.getAcceptedAt(),
                "PENDING", false, 0, "Waiting for PDF checks.", null);
        }).toList();
        return view(store.create(workspace, actor, new Data(items)));
    }
    public View start(UUID workspace, UUID id, long version) { return view(store.start(workspace, id, version)); }
    @Scheduled(fixedDelayString="${wildtrack.archive.batch-delay-ms:1000}", scheduler="archiveTaskScheduler")
    public void tick() { if (enabled) runOne(); }
    public boolean runOne() {
        var claimed = store.claim();
        if (claimed.isEmpty()) return false;
        var row = claimed.get();
        var items = new ArrayList<>(row.data().items());
        for (int i=0; i<items.size(); i++) {
            var item = items.get(i);
            if (row.state().equals("CHECKING") && item.stage().equals("PENDING")) {
                items.set(i, check(row.workspaceId(), item, row.actor()));
                break;
            }
            if (row.state().equals("ARCHIVING") && item.ready() && item.stage().equals("READY")) {
                try {
                    requireUnchanged(row.workspaceId(), item);
                    var record = archive.archive(row.workspaceId(), List.of(item.responseId()), row.actor()).getFirst();
                    items.set(i, item.result("COPYING", true, item.pdfCount(), "Copying PDFs on the server.", record.id()));
                } catch (RuntimeException error) { items.set(i, failed(item, message(error))); }
                break;
            }
        }
        if (row.state().equals("ARCHIVING")) {
            for (int i=0;i<items.size();i++) {
                var item = items.get(i);
                if (!item.stage().equals("COPYING")) continue;
                try {
                    var record = archive.get(row.workspaceId(), item.archiveId());
                    if (record.captureState().equals("COMPLETE"))
                        items.set(i, item.result("COMPLETE", true, item.pdfCount(), "PDFs preserved.", item.archiveId()));
                    else if (record.captureState().equals("FAILED")) items.set(i, failed(item, record.error()));
                } catch (RuntimeException error) { items.set(i, failed(item, "The archive record could not be read. Open Final archive for details.")); }
            }
        }
        String state = row.state();
        if (state.equals("CHECKING") && items.stream().noneMatch(item -> item.stage().equals("PENDING"))) state="READY";
        if (state.equals("ARCHIVING") && items.stream().noneMatch(item -> item.stage().equals("READY") || item.stage().equals("COPYING"))) state="COMPLETE";
        store.save(row, state, new Data(List.copyOf(items)));
        return true;
    }
    private Item check(UUID workspace, Item item, String actor) {
        try {
            var response = requireUnchanged(workspace, item);
            var deliverable = deliverables.findById(response.getDeliverableId()).orElseThrow();
            var values = json.readTree(response.getValuesJson());
            for (var field : fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverable.getId())) {
                if (!field.isActive() || field.getFieldType() != DeliverableFieldType.DRIVE_PDF) continue;
                String link = values.path(field.getFieldKey()).asText("").trim();
                if (link.isBlank() && !field.isRequired()) continue;
                if (link.isBlank()) return failed(item, "A required PDF link is missing. Open the response to check its answers.");
                String key = deliverable.getTrackerColumnKey() == null ? deliverable.getSlug() : deliverable.getTrackerColumnKey();
                var check = checks.check(workspace, new FileCheckRequest(response.getId().toString(), field.getId(), key, link, response.getUpdatedAt().toString()));
                if (!"COMPLETED".equals(check.status()) || check.failureDetails()!=null || check.document()==null || !check.document().readable())
                    return failed(item, check.summary());
            }
            requireUnchanged(workspace, item);
            var result = archive.prepare(workspace, List.of(item.responseId()), actor).getFirst();
            return item.result(result.ready()?"READY":"BLOCKED", result.ready(), result.pdfCount(), result.message(), null);
        } catch (RuntimeException error) { return failed(item, message(error)); }
        catch (java.io.IOException error) { return failed(item, "The saved answers could not be read. Open the response for details."); }
    }
    private com.capvault.backend.response.FormResponse requireUnchanged(UUID workspace, Item item) {
        var response = responses.findById(item.responseId()).filter(r -> workspace.equals(r.getWorkspaceId()) && r.isCurrentResponse()).orElseThrow(
            () -> new IllegalArgumentException("A newer response replaced this submission. Prepare the archive again."));
        var accepted = acceptances.findByResponseIdAndRevokedAtIsNull(item.responseId()).orElseThrow(
            () -> new IllegalArgumentException("Acceptance was revoked. This response was not archived."));
        if (!Objects.equals(response.getUpdatedAt(), item.responseUpdatedAt()) || !Objects.equals(accepted.getAcceptedAt(), item.acceptedAt())
                || !Objects.equals(response.getUpdatedAt(), accepted.getSourceResponseUpdatedAt()))
            throw new IllegalArgumentException("The response or acceptance changed. Review the current response and prepare the archive again.");
        return response;
    }
    private static Item failed(Item item, String message) { return item.result("BLOCKED", false, item.pdfCount(), message, item.archiveId()); }
    private static String message(RuntimeException error) {
        if (error instanceof org.springframework.web.server.ResponseStatusException status) return status.getReason();
        if (error instanceof IllegalArgumentException) return error.getMessage();
        return "The PDF checks or archive request could not finish. Open the response for details, then try again.";
    }
    private View view(ArchiveBatchStore.Row row) { return new View(row.id(), row.state(), row.version(), row.data().items()); }
}
