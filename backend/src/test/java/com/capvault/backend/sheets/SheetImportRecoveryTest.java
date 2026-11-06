package com.capvault.backend.sheets;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.workspace.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest
@ActiveProfiles("test")
class SheetImportRecoveryTest {
    static final String CSV = "Student Number,Name of Student,Team Formation,Member #,Section,CIT Email\n"
        + "audit-1,Good Student,audit-team,1,A,good@example.invalid\n"
        + "audit-2,Second Student,audit-team,2,A,second@example.invalid\n";
    @Autowired SheetImportService service;
    @Autowired SheetImportPreviewStore previews;
    @Autowired SheetImportRunRepository runs;
    @Autowired WorkspaceSourceRepository sources;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired Clock clock;
    @SpyBean StudentRecordRepository students;
    @MockBean SheetCsvClient csv;
    UUID workspace;
    SheetImportRequest request = new SheetImportRequest(
        "https://docs.google.com/spreadsheets/d/audit-synthetic/edit", "Audit source", Map.of());

    @BeforeEach void setup() {
        workspace = workspaces.saveAndFlush(new AcademicWorkspace("Import recovery " + UUID.randomUUID(),
            "AUDIT", "IMPORT-" + UUID.randomUUID(), "Semester 1", "2099-2100", true)).getId();
        when(csv.fetchCsv(anyString())).thenReturn(CSV);
    }

    @Test void failedFetchRetainsErrorHistoryAfterRollback() {
        when(csv.fetchCsv(anyString())).thenThrow(new IllegalArgumentException("Synthetic offline failure"));
        assertThatThrownBy(() -> service.importSource(workspace, WorkspaceSourceType.TEAM_FORMATION, request))
            .isInstanceOf(IllegalArgumentException.class);
        assertErrorRecorded();
        assertThat(students.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspace)).isEmpty();
    }

    @Test void partialAcademicWritesRollBackWhileFailureHistoryCommits() {
        doThrow(new IllegalArgumentException("Synthetic apply failure")).when(students).save(argThat(student ->
            student != null && workspace.equals(student.getWorkspaceId()) && "audit-2".equals(student.getStudentNumber())));
        assertThatThrownBy(() -> service.importSource(workspace, WorkspaceSourceType.TEAM_FORMATION, request))
            .isInstanceOf(IllegalArgumentException.class);
        assertErrorRecorded();
        assertThat(students.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspace)).isEmpty();
    }

    @Test void previewSurvivesAnotherStoreInstanceAndApplyReturnsSavedReceipt() {
        var preview = service.previewSource(workspace, WorkspaceSourceType.TEAM_FORMATION, request, "actor-a");
        var afterRestart = new SheetImportPreviewStore(db, json, clock);
        assertThat(afterRestart.find(preview.previewId(), false)).hasValueSatisfying(saved ->
            assertThat(saved.request()).isEqualTo(request));
        var apply = new SheetImportApplyRequest(preview.previewId(), Map.of());
        assertThatThrownBy(() -> service.applyPreview(workspace, WorkspaceSourceType.TEAM_FORMATION, apply, "actor-b"))
            .isInstanceOf(ResponseStatusException.class);
        var first = service.applyPreview(workspace, WorkspaceSourceType.TEAM_FORMATION, apply, "actor-a");
        // A changed/unavailable remote source cannot turn a lost success response into another import.
        when(csv.fetchCsv(anyString())).thenThrow(new IllegalArgumentException("Offline after commit"));
        var repeat = service.applyPreview(workspace, WorkspaceSourceType.TEAM_FORMATION, apply, "actor-a");
        assertThat(repeat).isEqualTo(first);
        assertThat(runs.findTop20ByWorkspaceIdOrderByStartedAtDesc(workspace)).hasSize(1);
        assertThat(students.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspace)).hasSize(2);
    }

    @Test void expiredPreviewCannotApplyAndIsPurgedByNextPreview() {
        var preview = service.previewSource(workspace, WorkspaceSourceType.TEAM_FORMATION, request, "actor-a");
        db.update("UPDATE sheet_import_previews SET expires_at=? WHERE id=?",
            Timestamp.from(Instant.now().minusSeconds(1)), preview.previewId());
        assertThatThrownBy(() -> service.applyPreview(workspace, WorkspaceSourceType.TEAM_FORMATION,
            new SheetImportApplyRequest(preview.previewId(), Map.of()), "actor-a"))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("expired");
        service.previewSource(workspace, WorkspaceSourceType.TEAM_FORMATION, request, "actor-a");
        assertThat(previews.find(preview.previewId(), false)).isEmpty();
    }

    @Test void concurrentApplyReusesOneCommittedReceipt() throws Exception {
        var preview = service.previewSource(workspace, WorkspaceSourceType.TEAM_FORMATION, request, "actor-a");
        var apply = new SheetImportApplyRequest(preview.previewId(), Map.of());
        var start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        try {
            java.util.concurrent.Callable<SheetImportResponse> action = () -> {
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Start timed out");
                return service.applyPreview(workspace, WorkspaceSourceType.TEAM_FORMATION, apply, "actor-a");
            };
            var a = pool.submit(action); var b = pool.submit(action); start.countDown();
            assertThat(a.get(15, TimeUnit.SECONDS)).isEqualTo(b.get(15, TimeUnit.SECONDS));
            assertThat(runs.findTop20ByWorkspaceIdOrderByStartedAtDesc(workspace)).hasSize(1);
        } finally { pool.shutdownNow(); }
    }

    private void assertErrorRecorded() {
        assertThat(runs.findTop20ByWorkspaceIdOrderByStartedAtDesc(workspace)).singleElement()
            .satisfies(run -> assertThat(run.getStatus()).isEqualTo(SheetImportStatus.ERROR));
        assertThat(sources.findByWorkspaceIdAndSourceType(workspace, WorkspaceSourceType.TEAM_FORMATION))
            .hasValueSatisfying(source -> assertThat(source.getStatus()).isEqualTo(WorkspaceSourceStatus.ERROR));
    }
}
