package com.capvault.backend.tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import java.time.LocalDateTime;
import java.util.UUID;

import com.capvault.backend.sheets.GoogleSheetsGateway;
import com.capvault.backend.workspace.WorkspaceSource;
import com.capvault.backend.workspace.WorkspaceSourceRepository;
import com.capvault.backend.workspace.WorkspaceSourceStatus;
import com.capvault.backend.workspace.WorkspaceSourceType;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class TrackerWritebackServiceTest {

    @Autowired private TrackerWritebackService service;
    @Autowired private TrackerRowRepository rows;
    @Autowired private TrackerColumnRepository columns;
    @Autowired private WorkspaceSourceRepository sources;
    @Autowired private AcademicWorkspaceRepository workspaces;
    @Autowired private TrackerWritebackRepository writebacks;
    @Autowired private com.capvault.backend.workspace.WorkspaceSourceService sourceService;

    @MockBean private GoogleSheetsGateway gateway;

    private UUID workspaceId;

    @BeforeEach
    void seed() {
        workspaceId = workspaces.save(new AcademicWorkspace("Tracker test", "IT", "TRK-" + UUID.randomUUID(), "S1", "2026-27", true)).getId();
        rows.save(new TrackerRow(workspaceId, "SN-" + workspaceId, "Student", "TEAM", "1", "A", "Adviser", 7));
        columns.save(new TrackerColumn(workspaceId, "SRS", "SRS", "SRS", 3, 1, true, false));
        sources.save(new WorkspaceSource(workspaceId, WorkspaceSourceType.TRACKER, "https://sheet", "sheet-" + workspaceId,
            "Tracker", WorkspaceSourceStatus.CONNECTED, LocalDateTime.now()));
        when(gateway.isConfigured()).thenReturn(true);
    }

    @Test
    void uncertainRemoteWriteCanBeRetriedUsingTheDurableCurrentReceipt() {
        doThrow(new IllegalStateException("transport lost")).doNothing()
            .when(gateway).updateSingleCell(anyString(), anyString(), anyString());

        UUID writebackId = service.writeBack(workspaceId, request(3)).id();
        assertThat(writebacks.findById(writebackId).orElseThrow().getStatus())
            .isEqualTo(TrackerWritebackStatus.UNCERTAIN);

        var retried = service.retry(workspaceId, writebackId);

        assertThat(retried.status()).isEqualTo(TrackerWritebackStatus.WRITTEN_TO_SHEET);
        verify(gateway, times(2)).updateSingleCell(anyString(), anyString(), eq("3"));
    }

    @Test void remoteSuccessFollowedByCommitFailureLeavesARecoverablePendingReceipt() {
        doAnswer(call -> {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override public void beforeCommit(boolean readOnly) { throw new IllegalStateException("Synthetic commit failure after remote success"); }
                });
            return null;
        }).when(gateway).updateSingleCell(anyString(), anyString(), anyString());
        assertThatThrownBy(() -> service.writeBack(workspaceId, request(2)))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("Synthetic commit failure");
        var pending = writebacks.findTop50ByWorkspaceIdOrderByRequestedAtDesc(workspaceId);
        assertThat(pending).hasSize(1);
        assertThat(pending.getFirst().getStatus()).isEqualTo(TrackerWritebackStatus.PENDING_SHEET_WRITE);
        doNothing().when(gateway).updateSingleCell(anyString(), anyString(), anyString());
        assertThat(service.retry(workspaceId, pending.getFirst().getId()).status()).isEqualTo(TrackerWritebackStatus.WRITTEN_TO_SHEET);
        // Replacing one cell with the same current value is safe when the first outcome is unknown.
        verify(gateway, times(2)).updateSingleCell(anyString(), anyString(), eq("2"));
    }

    @Test void newerLocalOnlyEditSupersedesAnUncertainRemoteReceiptEvenForTheSameValue() {
        doThrow(new IllegalStateException("Synthetic lost acknowledgement"))
            .when(gateway).updateSingleCell(anyString(), anyString(), anyString());
        var old = service.writeBack(workspaceId, request(3));
        service.writeBack(workspaceId, new TrackerWritebackRequest("SN-" + workspaceId, "TEAM", "1", null, "SRS", 3, false));
        assertThat(service.retry(workspaceId, old.id()).status()).isEqualTo(TrackerWritebackStatus.SUPERSEDED);
        verify(gateway).updateSingleCell(anyString(), anyString(), eq("3"));
    }

    @Test void retryOfWrittenReceiptDoesNotWriteAgainAndCannotCrossWorkspaces() {
        var written = service.writeBack(workspaceId, request(1));
        assertThat(service.retry(workspaceId, written.id()).status()).isEqualTo(TrackerWritebackStatus.WRITTEN_TO_SHEET);
        UUID other = workspaces.save(new AcademicWorkspace("Other", "IT", "TRK-" + UUID.randomUUID(), "S1", "2026-27", true)).getId();
        assertThatThrownBy(() -> service.retry(other, written.id())).isInstanceOf(IllegalArgumentException.class);
        verify(gateway).updateSingleCell(anyString(), anyString(), eq("1"));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"column", "row", "inactive", "sheet"})
    void changedSourceMappingSupersedesAnUncertainReceipt(String changed) {
        doThrow(new IllegalStateException("Synthetic lost acknowledgement"))
            .when(gateway).updateSingleCell(anyString(), anyString(), anyString());
        var old = service.writeBack(workspaceId, request(3));
        if (changed.equals("sheet")) {
            sourceService.upsertSource(workspaceId, WorkspaceSourceType.TRACKER,
                new com.capvault.backend.workspace.WorkspaceSourceRequest("https://docs.google.com/spreadsheets/d/new-sheet/edit", "Tracker", null));
        } else if (changed.equals("row")) {
            var row = rows.findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "SN-" + workspaceId).orElseThrow();
            row.updateFrom(row.getStudentNumber(), row.getStudentName(), row.getTeamCode(), row.getMemberNumber(),
                row.getSectionName(), row.getAdviserName(), row.getSourceRowNumber() + 1);
            rows.save(row);
        } else {
            var column = columns.findByWorkspaceIdAndColumnKeyIgnoreCase(workspaceId, "SRS").orElseThrow();
            column.updateFrom(column.getColumnKey(), column.getLabel(), column.getSourceColumn(),
                changed.equals("column") ? 4 : column.getSourceColumnIndex(), column.getDisplayOrder(), !changed.equals("inactive"), column.getPdfRequired());
            columns.save(column);
        }
        assertThat(service.retry(workspaceId, old.id()).status()).isEqualTo(TrackerWritebackStatus.SUPERSEDED);
        verify(gateway).updateSingleCell(anyString(), anyString(), eq("3"));
    }

    @Test void sourceUpdateWaitsUntilAnInFlightRemoteWriteReleasesTheWorkspace() throws Exception {
        var entered = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        doAnswer(call -> {
            entered.countDown();
            assertThat(release.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            return null;
        }).when(gateway).updateSingleCell(anyString(), anyString(), anyString());
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var write = pool.submit(() -> service.writeBack(workspaceId, request(2)));
            assertThat(entered.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            var attempted = new java.util.concurrent.CountDownLatch(1);
            var change = pool.submit(() -> {
                attempted.countDown();
                return sourceService.upsertSource(workspaceId, WorkspaceSourceType.TRACKER,
                    new com.capvault.backend.workspace.WorkspaceSourceRequest("https://docs.google.com/spreadsheets/d/next-sheet/edit", "Tracker", null));
            });
            assertThat(attempted.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> change.get(200, java.util.concurrent.TimeUnit.MILLISECONDS))
                .isInstanceOf(java.util.concurrent.TimeoutException.class);
            release.countDown();
            assertThat(write.get(15, java.util.concurrent.TimeUnit.SECONDS).status()).isEqualTo(TrackerWritebackStatus.WRITTEN_TO_SHEET);
            change.get(15, java.util.concurrent.TimeUnit.SECONDS);
        } finally { release.countDown(); }
        assertThat(sources.findByWorkspaceIdAndSourceType(workspaceId, WorkspaceSourceType.TRACKER).orElseThrow().getSheetId())
            .isEqualTo("next-sheet");
    }

    @Test void concurrentRetriesSerializeAndOnlyOneRewritesTheCell() throws Exception {
        doThrow(new IllegalStateException("Synthetic transport loss"))
            .when(gateway).updateSingleCell(anyString(), anyString(), anyString());
        var old = service.writeBack(workspaceId, request(4));
        var entered = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        doAnswer(call -> {
            entered.countDown();
            assertThat(release.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            return null;
        }).when(gateway).updateSingleCell(anyString(), anyString(), anyString());
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> service.retry(workspaceId, old.id()));
            assertThat(entered.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            var secondStarted = new java.util.concurrent.CountDownLatch(1);
            var second = pool.submit(() -> { secondStarted.countDown(); return service.retry(workspaceId, old.id()); });
            assertThat(secondStarted.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            release.countDown();
            assertThat(first.get(15, java.util.concurrent.TimeUnit.SECONDS).status()).isEqualTo(TrackerWritebackStatus.WRITTEN_TO_SHEET);
            assertThat(second.get(15, java.util.concurrent.TimeUnit.SECONDS).status()).isEqualTo(TrackerWritebackStatus.WRITTEN_TO_SHEET);
        } finally { release.countDown(); }
        verify(gateway, times(2)).updateSingleCell(anyString(), anyString(), eq("4"));
    }

    private TrackerWritebackRequest request(int daysLate) {
        return new TrackerWritebackRequest("SN-" + workspaceId, "TEAM", "1", null, "SRS", daysLate, true);
    }
}
