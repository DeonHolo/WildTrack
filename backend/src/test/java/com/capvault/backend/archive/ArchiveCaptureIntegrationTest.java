package com.capvault.backend.archive;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import com.capvault.backend.archive.storage.*;
import com.capvault.backend.auth.*;
import com.capvault.backend.deliverable.*;
import com.capvault.backend.drive.*;
import com.capvault.backend.filecheck.*;
import com.capvault.backend.response.*;
import com.capvault.backend.staff.*;
import com.capvault.backend.student.*;
import com.capvault.backend.workspace.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"wildtrack.archive.worker-enabled=false", "spring.datasource.url=jdbc:h2:mem:archive-capture-it;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;DEFAULT_NULL_ORDERING=HIGH"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ArchiveCaptureIntegrationTest {
    @Autowired ArchiveService archive;
    @Autowired ArchiveCaptureWorker worker;
    @Autowired ArchiveFileStore files;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired DeliverableRepository deliverables;
    @Autowired DeliverableFieldRepository deliverableFields;
    @Autowired StudentRecordRepository students;
    @Autowired FormResponseRepository responses;
    @Autowired ResponseAcceptanceRepository acceptances;
    @Autowired FileCheckReportRepository checks;
    @Autowired ReviewFeedbackService review;
    @Autowired StaffRoleAssignmentRepository roles;
    @Autowired WildTrackSessionService sessions;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockBean GoogleDriveGateway drive;
    @MockBean ArchiveStorageRegistry registry;

    private final Map<String, byte[]> sources = new ConcurrentHashMap<>();
    private final Map<String, MemoryProvider> providers = new ConcurrentHashMap<>();
    private MemoryProvider current;
    private static final OffsetDateTime MODIFIED = OffsetDateTime.parse("2026-10-01T00:00:00Z");

    @BeforeEach void setup() {
        sources.clear(); providers.clear(); current = new MemoryProvider("memory:first"); providers.put(current.id(), current);
        when(registry.defaultProvider()).thenAnswer(call -> current);
        when(registry.provider(anyString())).thenAnswer(call -> {
            var provider = providers.get(call.getArgument(0));
            if (provider == null) throw new ArchiveStorageException("Unavailable."); return provider;
        });
        when(drive.getMetadata(any())).thenAnswer(call -> metadata(call.getArgument(0)));
        when(drive.download(any())).thenAnswer(call -> {
            DriveFileReference ref = call.getArgument(0); byte[] bytes = sources.get(ref.fileId());
            if (bytes == null) throw new IllegalStateException("Source inaccessible"); return bytes.clone();
        });
    }

    private DriveFileMetadata metadata(DriveFileReference reference) {
        byte[] bytes = sources.get(reference.fileId());
        if (bytes == null) throw new IllegalStateException("Source inaccessible");
        return new DriveFileMetadata(reference.fileId(), "accepted.pdf", "application/pdf", (long) bytes.length,
            ArchiveCaptureWorker.hash("MD5", bytes), MODIFIED, true, "https://drive.google.com/file/d/" + reference.fileId());
    }
    private record Fixture(UUID workspaceId, UUID responseId, UUID deliverableId, List<String> fileIds, List<byte[]> bytes) {}
    private Fixture fixture(int count) throws Exception {
        String token = UUID.randomUUID().toString();
        var workspace = workspaces.saveAndFlush(new AcademicWorkspace("Archive " + token, "IT", token, "1", "2026", true));
        var deliverable = deliverables.saveAndFlush(new Deliverable(workspace.getId(), "key-" + token, "Form", "form-" + token,
            "", LocalDateTime.now().plusDays(2), true, DeliverableStatus.PUBLISHED));
        var student = students.saveAndFlush(new StudentRecord(workspace.getId(), token, "Student", "Team", "1", "S", "A", null, 1));
        Instant now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        List<AcceptedPdfSnapshotService.Pdf> manifest = new ArrayList<>();
        List<String> ids = new ArrayList<>(); List<byte[]> content = new ArrayList<>();
        Map<String, String> values = new LinkedHashMap<>();
        for (int i = 0; i < count; i++) {
            String id = "file" + UUID.randomUUID().toString().replace("-", "");
            byte[] bytes = ("%PDF-1.4\n" + id).getBytes(StandardCharsets.UTF_8);
            String url = "https://drive.google.com/file/d/" + id + "/view";
            sources.put(id, bytes); ids.add(id); content.add(bytes); values.put("pdf" + i, url);
            manifest.add(new AcceptedPdfSnapshotService.Pdf("pdf" + i, "PDF " + i, url, id, null,
                ArchiveCaptureWorker.hash("MD5", bytes), bytes.length, MODIFIED.toString(), LocalDateTime.now().toString()));
        }
        var response = responses.saveAndFlush(new FormResponse(UUID.randomUUID(), workspace.getId(), deliverable.getId(), token,
            "student@example.test", student.getId(), token, "Student", "Team", mapper.writeValueAsString(values), now, now));
        var acceptance = new ResponseAcceptance(UUID.randomUUID(), response, "admin", "admin@example.test", "ADMIN", now, now);
        acceptance.setSourceArtifactsJson(mapper.writeValueAsString(new AcceptedPdfSnapshotService.Manifest(true, null, manifest)));
        acceptances.saveAndFlush(acceptance);
        return new Fixture(workspace.getId(), response.getId(), deliverable.getId(), ids, content);
    }
    private ArchiveRecordResponse queue(Fixture fixture) { return archive.archive(fixture.workspaceId(), List.of(fixture.responseId()), "admin").getFirst(); }
    private ArchiveRecordResponse snapshot(Fixture f, UUID id) { return archive.get(f.workspaceId(), id); }
    private void drain() { for (int i = 0; i < 20 && worker.runOne(); i++) {} }

    @Test void retainedExactBytesRemainReadableAfterSourceLossAndProviderChange() throws Exception {
        Fixture f = fixture(1); var queued = queue(f); drain(); var captured = snapshot(f, queued.id());
        assertThat(captured.captureState()).isEqualTo("COMPLETE");
        var file = captured.files().getFirst();
        assertThat(file.sha256()).isEqualTo(ArchiveCaptureWorker.hash("SHA-256", f.bytes().getFirst()));
        assertThat(file.size()).isEqualTo(f.bytes().getFirst().length);
        sources.clear(); current = new MemoryProvider("memory:second"); providers.put(current.id(), current);
        assertThat(archive.download(f.workspaceId(), captured.id(), file.id())).isEqualTo(f.bytes().getFirst());
        var active = archive.unarchive(f.workspaceId(), captured.id(), captured.stateVersion(), "admin");
        assertThat(active.lifecycleState()).isEqualTo("Active");
        assertThat(archive.download(f.workspaceId(), captured.id(), file.id())).isEqualTo(f.bytes().getFirst());
        assertThat(active.history()).extracting(ArchiveRecordResponse.History::action).contains("ARCHIVE_UNARCHIVED");
        var again = queue(f); assertThat(again.id()).isEqualTo(captured.id()); assertThat(again.lifecycleState()).isEqualTo("Archived");
    }

    @Test void explicitRearchiveWhileCopyingReusesThePendingCapture() throws Exception {
        Fixture f=fixture(1); var queued=queue(f);
        var inactive=archive.unarchive(f.workspaceId(),queued.id(),queued.stateVersion(),"admin");
        assertThat(inactive.lifecycleState()).isEqualTo("Active");
        var again=queue(f);
        assertThat(again.id()).isEqualTo(queued.id());
        assertThat(again.lifecycleState()).isEqualTo("Archived");
        drain();
        assertThat(snapshot(f,queued.id()).captureState()).isEqualTo("COMPLETE");
        assertThat(snapshot(f,queued.id()).lifecycleState()).isEqualTo("Archived");
    }

    @Test void realAcceptancePinsMatchingDocumentCheckAndArchivesItsBytes() throws Exception {
        Fixture f = fixture(1); var response = responses.findById(f.responseId()).orElseThrow();
        String fieldId = "field-" + UUID.randomUUID(), url = "https://drive.google.com/file/d/" + f.fileIds().getFirst() + "/view";
        deliverableFields.saveAndFlush(new DeliverableField(fieldId, f.deliverableId(), "pdf0", "PDF 0",
            DeliverableFieldType.DRIVE_PDF, true, 0, DocumentCheckPolicy.OFF, false, true));
        var request = new FileCheckRequest(f.responseId().toString(), fieldId, "form", url, response.getUpdatedAt().toString());
        var metadata = new FileCheckResponse.DriveMetadata(f.fileIds().getFirst(), "accepted.pdf", "application/pdf",
            (long) f.bytes().getFirst().length, ArchiveCaptureWorker.hash("MD5", f.bytes().getFirst()), MODIFIED, true, url);
        var check = new FileCheckResponse(null, f.responseId().toString(), fieldId, url, response.getUpdatedAt().toString(),
            "COMPLETED", false, "", List.of(), List.of(), List.of(), "", metadata,
            new FileCheckResponse.DocumentResult(true, false, 1, 1), null, "admin", LocalDateTime.now());
        checks.saveAndFlush(new FileCheckReport(f.workspaceId(), request, check, mapper.writeValueAsString(check)));
        var accepted = review.accept(f.responseId(), "admin", "admin@example.test", "ADMIN");
        assertThat(mapper.readTree(accepted.getSourceArtifactsJson()).path("complete").asBoolean()).isTrue();
        var queued = queue(f); drain(); var result = snapshot(f, queued.id());
        assertThat(result.captureState()).isEqualTo("COMPLETE");
        assertThat(archive.download(f.workspaceId(), result.id(), result.files().getFirst().id())).isEqualTo(f.bytes().getFirst());
    }

    @Test void changedSourceBeforeOrDuringDownloadNeverCompletes() throws Exception {
        Fixture before = fixture(1); var first = queue(before);
        sources.put(before.fileIds().getFirst(), "%PDF-1.4 changed".getBytes(StandardCharsets.UTF_8)); drain();
        assertThat(snapshot(before, first.id()).captureState()).isEqualTo("FAILED");
        Fixture during = fixture(1); var second = queue(during); String target = during.fileIds().getFirst();
        var calls = new AtomicInteger();
        doAnswer(call -> {
            DriveFileReference ref = call.getArgument(0);
            if (ref.fileId().equals(target) && calls.incrementAndGet() > 1)
                return new DriveFileMetadata(target, "new.pdf", "application/pdf", (long) during.bytes().getFirst().length,
                    "00000000000000000000000000000000", MODIFIED, true, "");
            return metadata(ref);
        }).when(drive).getMetadata(any());
        drain(); assertThat(snapshot(during, second.id()).captureState()).isEqualTo("FAILED");
        assertThat(current.objects).isEmpty();
    }

    @Test void partialFailureRetriesOnlyMissingCopy() throws Exception {
        Fixture f = fixture(2); var queued = queue(f); current.failPutAt.set(2); drain();
        var failed = snapshot(f, queued.id()); assertThat(failed.captureState()).isEqualTo("FAILED");
        assertThat(current.objects).hasSize(1);
        assertThatThrownBy(() -> queue(f)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
            .hasMessageContaining("Open Final archive");
        current.failPutAt.set(0); archive.retry(f.workspaceId(), queued.id(), failed.stateVersion(), "admin"); drain();
        var done = snapshot(f, queued.id()); assertThat(done.captureState()).isEqualTo("COMPLETE");
        assertThat(current.objects).hasSize(2); assertThat(current.puts.get()).isEqualTo(3);
    }

    @Test void rearchivingInactiveFailureRetriesOnlyMissingCopyAndIsIdempotent() throws Exception {
        Fixture f = fixture(2); var queued = queue(f); current.failPutAt.set(2); drain();
        var failed = snapshot(f, queued.id());
        assertThat(failed.captureState()).isEqualTo("FAILED");
        assertThatThrownBy(() -> queue(f)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
            .hasMessageContaining("Open Final archive");
        var inactive = archive.unarchive(f.workspaceId(), failed.id(), failed.stateVersion(), "admin");
        assertThat(inactive.lifecycleState()).isEqualTo("Active");
        current.failPutAt.set(0);
        var requeued = queue(f);
        assertThat(requeued.id()).isEqualTo(failed.id());
        assertThat(requeued.lifecycleState()).isEqualTo("Archived");
        assertThat(requeued.captureState()).isEqualTo("QUEUED");
        assertThat(requeued.files()).extracting(ArchiveRecordResponse.StoredFile::status).containsExactlyInAnyOrder("STORED", "QUEUED");
        var repeated = queue(f);
        assertThat(repeated.id()).isEqualTo(failed.id());
        assertThat(archive.list(f.workspaceId())).hasSize(1);
        assertThat(repeated.history()).extracting(ArchiveRecordResponse.History::action)
            .contains("ARCHIVE_UNARCHIVED", "ARCHIVE_REACTIVATED", "ARCHIVE_RETRY_REQUESTED");
        drain();
        assertThat(snapshot(f, failed.id()).captureState()).isEqualTo("COMPLETE");
        assertThat(current.objects).hasSize(2);
        assertThat(current.puts.get()).isEqualTo(3);
    }

    @Test void expiredLeaseRecoversUploadedObjectEvenWhenSourceIsGone() throws Exception {
        Fixture f = fixture(1); var queued = queue(f); var file = files.files(queued.id()).getFirst();
        String objectId = current.reserve(file.captureKey()); byte[] bytes = f.bytes().getFirst();
        current.put(objectId, file.captureKey(), bytes);
        jdbc.update("UPDATE archive_files SET status='COPYING', object_id=?, sha256=?, filename=?, lease_token=?, lease_until=? WHERE id=?",
            objectId, ArchiveCaptureWorker.hash("SHA-256", bytes), "retained.pdf", UUID.randomUUID(), java.sql.Timestamp.from(Instant.now().minusSeconds(60)), file.id());
        sources.clear(); drain(); var done = snapshot(f, queued.id());
        assertThat(done.captureState()).isEqualTo("COMPLETE"); assertThat(current.objects).hasSize(1);
        assertThat(archive.download(f.workspaceId(), queued.id(), file.id())).isEqualTo(bytes);
    }

    @Test void duplicateAndConcurrentQueueProduceOneCapture() throws Exception {
        Fixture f = fixture(1); var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> { start.await(); return queue(f); }); var b = executor.submit(() -> { start.await(); return queue(f); });
            start.countDown(); var first = a.get(20, TimeUnit.SECONDS); var second = b.get(20, TimeUnit.SECONDS);
            assertThat(first.id()).isEqualTo(second.id()); assertThat(queue(f).id()).isEqualTo(first.id());
            drain(); assertThat(current.objects).hasSize(1);
        }
    }

    @Test void batchWithUnacceptedResponseDoesNotPartiallyQueue() throws Exception {
        Fixture f = fixture(1); FormResponse first = responses.findById(f.responseId()).orElseThrow();
        Instant now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        var unaccepted = responses.saveAndFlush(new FormResponse(UUID.randomUUID(), f.workspaceId(), f.deliverableId(),
            "different-" + UUID.randomUUID(), "other@example.test", first.getStudentRecordId(), first.getStudentNumber(),
            first.getStudentName(), first.getTeamCode(), first.getValuesJson(), now, now));
        assertThatThrownBy(() -> archive.archive(f.workspaceId(), List.of(f.responseId(), unaccepted.getId()), "admin"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThat(archive.list(f.workspaceId())).isEmpty();
    }

    @Test void staleUnarchiveAndNewerResponseNeverRewriteWork() throws Exception {
        Fixture f = fixture(1); var queued = queue(f); drain(); var captured = snapshot(f, queued.id());
        assertThatThrownBy(() -> archive.unarchive(f.workspaceId(), captured.id(), captured.stateVersion() + 1, "admin"))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        var response = responses.findById(f.responseId()).orElseThrow(); response.setValuesJson("{\"new\":\"answer\"}"); response.setUpdatedAt(Instant.now().plusSeconds(5)); responses.saveAndFlush(response);
        var acceptance = acceptances.findByResponseId(f.responseId()).orElseThrow(); acceptance.setRevokedAt(Instant.now()); acceptances.saveAndFlush(acceptance);
        archive.unarchive(f.workspaceId(), captured.id(), captured.stateVersion(), "admin");
        assertThat(responses.findById(f.responseId()).orElseThrow().getValuesJson()).isEqualTo("{\"new\":\"answer\"}");
        assertThat(acceptances.findByResponseId(f.responseId()).orElseThrow().getRevokedAt()).isNotNull();
        assertThat(archive.download(f.workspaceId(), captured.id(), captured.files().getFirst().id())).isEqualTo(f.bytes().getFirst());
    }

    @Test void httpEnforcesAdminWorkspaceAndCsrf() throws Exception {
        Fixture f = fixture(1), other = fixture(1); var queued = queue(f); drain(); var captured = snapshot(f, queued.id());
        String subject = "admin-" + UUID.randomUUID(); Instant now = Instant.now();
        roles.saveAndFlush(new StaffRoleAssignment(UUID.randomUUID(), subject, "admin@example.test", StaffRole.ADMIN, true, now, now));
        var admin = new jakarta.servlet.http.Cookie("WILDTRACK_SESSION", sessions.create(new GoogleIdentity(subject, "admin@example.test", "Admin", "")).rawToken());
        var student = new jakarta.servlet.http.Cookie("WILDTRACK_SESSION", sessions.create(new GoogleIdentity("student-" + UUID.randomUUID(), "student@example.test", "Student", "")).rawToken());
        String url = "/api/archive/" + captured.id() + "/files/" + captured.files().getFirst().id();
        mvc.perform(get(url).param("workspaceId", f.workspaceId().toString()).cookie(student)).andExpect(status().isForbidden());
        mvc.perform(get(url).param("workspaceId", f.workspaceId().toString()).cookie(admin)).andExpect(status().isOk()).andExpect(content().bytes(f.bytes().getFirst()));
        mvc.perform(get(url).param("workspaceId", other.workspaceId().toString()).cookie(admin)).andExpect(status().isBadRequest());
        String action = "/api/archive/" + captured.id() + "/unarchive";
        String payload = "{\"stateVersion\":" + captured.stateVersion() + "}";
        mvc.perform(post(action).param("workspaceId", f.workspaceId().toString()).cookie(admin).contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isForbidden());
        mvc.perform(post(action).param("workspaceId", f.workspaceId().toString()).cookie(student).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isForbidden());
        mvc.perform(post(action).param("workspaceId", f.workspaceId().toString()).cookie(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isOk());
    }

    @Test void reacceptingSameResponseDoesNotRearchiveUntilExplicitAction() throws Exception {
        Fixture f = fixture(1); var queued = queue(f); drain(); var captured = snapshot(f, queued.id());
        var acceptance = acceptances.findByResponseId(f.responseId()).orElseThrow();
        acceptance.reactivate("admin", "admin@example.test", "ADMIN", acceptance.getSourceResponseUpdatedAt(), acceptance.getAcceptedAt().plusSeconds(10));
        acceptances.saveAndFlush(acceptance);
        String subject = "admin-" + UUID.randomUUID(); Instant now = Instant.now();
        roles.saveAndFlush(new StaffRoleAssignment(UUID.randomUUID(), subject, "admin@example.test", StaffRole.ADMIN, true, now, now));
        var cookie = new jakarta.servlet.http.Cookie("WILDTRACK_SESSION", sessions.create(new GoogleIdentity(subject, "admin@example.test", "Admin", "")).rawToken());
        mvc.perform(get("/api/monitoring").param("workspaceId", f.workspaceId().toString()).cookie(cookie))
            .andExpect(status().isOk()).andExpect(jsonPath("$.archivedResponseIds").isEmpty());
        assertThat(queue(f).id()).isEqualTo(captured.id());
        mvc.perform(get("/api/monitoring").param("workspaceId", f.workspaceId().toString()).cookie(cookie))
            .andExpect(status().isOk()).andExpect(jsonPath("$.archivedResponseIds[0]").value(f.responseId().toString()));
    }

    static final class MemoryProvider implements ArchiveStorageProvider {
        final String id; final Map<String, byte[]> objects = new ConcurrentHashMap<>(); final AtomicInteger puts = new AtomicInteger(), failPutAt = new AtomicInteger();
        MemoryProvider(String id) { this.id = id; }
        public String id() { return id; }
        public Readiness probe() { return new Readiness(true, ""); }
        public String reserve(String key) { return "object-" + key; }
        public StoredObject put(String objectId, String captureKey, byte[] bytes) {
            int attempt = puts.incrementAndGet(); if (attempt == failPutAt.get()) throw new ArchiveStorageException("Simulated outage");
            byte[] previous = objects.putIfAbsent(objectId, bytes.clone());
            if (previous != null && !Arrays.equals(previous, bytes)) throw new ArchiveStorageException("Object differs");
            return new StoredObject(id, objectId, ArchiveCaptureWorker.hash("SHA-256", bytes), bytes.length);
        }
        public byte[] read(String objectId) { byte[] bytes = objects.get(objectId); if (bytes == null) throw new ArchiveStorageException("Missing"); return bytes.clone(); }
    }
}
