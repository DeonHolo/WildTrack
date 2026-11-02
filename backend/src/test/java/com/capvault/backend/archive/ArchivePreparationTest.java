package com.capvault.backend.archive;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.*;
import com.capvault.backend.archive.storage.ArchiveStorageRegistry;
import com.capvault.backend.response.*;
import com.capvault.backend.deliverable.*;
import com.capvault.backend.project.ProjectMetadataRepository;
import com.capvault.backend.workspace.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

class ArchivePreparationTest {
    final UUID workspace = UUID.randomUUID(), responseId = UUID.randomUUID();
    final Instant now = Instant.parse("2026-11-02T04:00:00Z");
    final FormResponseRepository responses = mock(FormResponseRepository.class);
    final ResponseAcceptanceRepository acceptances = mock(ResponseAcceptanceRepository.class);
    final AcceptedPdfSnapshotService snapshots = mock(AcceptedPdfSnapshotService.class);
    final AcademicWorkspaceRepository workspaces = mock(AcademicWorkspaceRepository.class);
    final DomainEventRecorder events = mock(DomainEventRecorder.class);
    ArchiveService service;
    ResponseAcceptance acceptance;
    AcceptedPdfSnapshotService.Manifest current;

    @BeforeEach void setup() {
        var manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(call -> new SimpleTransactionStatus());
        service = new ArchiveService(mock(ArchiveRecordRepository.class), responses, acceptances,
            mock(DeliverableRepository.class), mock(DeliverableFieldRepository.class), mock(ProjectMetadataRepository.class),
            workspaces, new ObjectMapper(), Clock.fixed(now, ZoneOffset.UTC), mock(ArchiveFileStore.class),
            mock(ArchiveStorageRegistry.class), snapshots, events, manager);
        var response = new FormResponse(responseId, workspace, UUID.randomUUID(), "subject", "student@test.invalid",
            UUID.randomUUID(), "number", "Student", "team", "{}", now, now);
        acceptance = new ResponseAcceptance(UUID.randomUUID(), response, "admin", "admin@test.invalid", "ADMIN", now, now);
        when(responses.findByIdForUpdate(responseId)).thenReturn(Optional.of(response));
        when(acceptances.findByResponseIdAndRevokedAtIsNull(responseId)).thenReturn(Optional.of(acceptance));
        when(workspaces.findById(workspace)).thenReturn(Optional.of(new AcademicWorkspace("Class", "IT", "IT411", "2", "2026", true)));
        var pdf = new AcceptedPdfSnapshotService.Pdf("pdf", "PDF", "https://drive.google.com/file/d/file/view", "file", null,
            "a".repeat(32), 300, "2026-11-02T04:00:00Z", "2026-11-02T04:00:00");
        current = new AcceptedPdfSnapshotService.Manifest(true, null, List.of(pdf));
        when(snapshots.capture(response)).thenReturn("current");
        when(snapshots.read("current")).thenReturn(current);
        when(snapshots.read((String) null)).thenReturn(new AcceptedPdfSnapshotService.Manifest(false, "Missing checks", List.of()));
    }

    @Test void preparesOlderAcceptanceFromFreshChecksWithoutChangingItsDecision() {
        assertThat(service.prepare(workspace, List.of(responseId), "admin").getFirst())
            .matches(item -> item.ready() && item.evidenceAdded() && item.pdfCount() == 1);
        assertThat(acceptance.getSourceArtifactsJson()).isEqualTo("current");
        assertThat(acceptance.getAcceptedAt()).isEqualTo(now);
        assertThat(acceptance.getRevokedAt()).isNull();
        verify(acceptances).saveAndFlush(acceptance);
    }

    @Test void changedPdfDoesNotOverwriteTheAcceptedFingerprint() {
        acceptance.setSourceArtifactsJson("old");
        var pdf = current.artifacts().getFirst();
        var old = new AcceptedPdfSnapshotService.Pdf(pdf.fieldKey(), pdf.label(), pdf.sourceUrl(), pdf.fileId(), null,
            "b".repeat(32), pdf.size(), pdf.modifiedTime(), pdf.checkedAt());
        when(snapshots.read("old")).thenReturn(new AcceptedPdfSnapshotService.Manifest(true, null, List.of(old)));
        assertThat(service.prepare(workspace, List.of(responseId), "admin").getFirst())
            .matches(item -> !item.ready() && item.message().contains("changed after acceptance"));
        assertThat(acceptance.getSourceArtifactsJson()).isEqualTo("old");
        verify(acceptances, never()).saveAndFlush(any());
    }

    @Test void inaccessiblePdfIsReportedWithoutChangingAcceptanceOrStoppingOtherResponses() {
        when(snapshots.read("current")).thenReturn(new AcceptedPdfSnapshotService.Manifest(false, "Inaccessible", List.of()));
        UUID missing = UUID.randomUUID();
        when(responses.findByIdForUpdate(missing)).thenReturn(Optional.empty());
        var result = service.prepare(workspace, List.of(responseId, missing), "admin");
        assertThat(result).hasSize(2).allMatch(item -> !item.ready());
        verify(acceptances, never()).saveAndFlush(any());
    }
}
