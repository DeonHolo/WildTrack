package com.capvault.backend.response;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.filecheck.FileCheckRequest;
import com.capvault.backend.filecheck.FileCheckService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Focused, provider-free regression coverage for the durable Document Check queue. */
class DocumentCheckWorkTest {
    private static final Instant NOW = Instant.parse("2026-01-02T03:04:05Z");
    private final UUID workspaceId = UUID.randomUUID();
    private final UUID responseId = UUID.randomUUID();
    private JdbcTemplate db;
    private FormResponseRepository responses;
    private FileCheckService checks;
    private DocumentCheckWork work;
    private FileCheckRequest request;

    @BeforeEach
    void setUp() {
        JdbcDataSource source = new JdbcDataSource();
        source.setURL("jdbc:h2:mem:document-check-" + UUID.randomUUID()
            + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        DataSource dataSource = source;
        db = new JdbcTemplate(dataSource);
        db.execute("CREATE TABLE academic_workspaces(id UUID PRIMARY KEY)");
        db.execute("CREATE TABLE form_responses(id UUID PRIMARY KEY,workspace_id UUID NOT NULL,revision BIGINT NOT NULL)");
        db.update("INSERT INTO academic_workspaces VALUES(?)", workspaceId);
        db.update("INSERT INTO form_responses VALUES(?,?,1)", responseId, workspaceId);
        new org.springframework.jdbc.datasource.init.ResourceDatabasePopulator(
            new org.springframework.core.io.ClassPathResource("db/migration/V53__durable_document_check_work.sql")).execute(dataSource);
        responses = mock(FormResponseRepository.class);
        checks = mock(FileCheckService.class);
        request = new FileCheckRequest(responseId.toString(), "SRS",
            "https://drive.google.com/file/d/fake/view", NOW.toString());
        FormResponse response = new FormResponse(responseId, workspaceId, UUID.randomUUID(),
            "student", "student@example.invalid", UUID.randomUUID(), "99-9999",
            "Student", "team", "{\"documentPdf\":\"https://drive.google.com/file/d/fake/view\"}",
            NOW, NOW);
        when(responses.findById(responseId)).thenReturn(Optional.of(response));
        work = new DocumentCheckWork(db, new DataSourceTransactionManager(dataSource),
            Clock.fixed(NOW, ZoneOffset.UTC), checks, responses,
            mock(DeliverableFieldRepository.class), new ObjectMapper(), false);
    }

    @Test
    void enqueueInsideRolledBackSubmissionLeavesNoDurableWork() {
        TransactionTemplate tx = new TransactionTemplate(new DataSourceTransactionManager(db.getDataSource()));
        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
            work.enqueue(workspaceId, request);
            throw new IllegalStateException("submission failed");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(count()).isZero();
    }

    @Test
    void committedWorkIsVisibleToFreshWorkerAndProviderRunsExactlyOnce() {
        work.enqueue(workspaceId, request);
        DocumentCheckWork freshWorker = new DocumentCheckWork(db,
            new DataSourceTransactionManager(db.getDataSource()), Clock.fixed(NOW, ZoneOffset.UTC),
            checks, responses, mock(DeliverableFieldRepository.class), new ObjectMapper(), false);
        assertThat(freshWorker.runOne()).isTrue();
        assertThat(status()).isEqualTo("SUCCEEDED");
        verify(checks).check(workspaceId, request);
        assertThat(freshWorker.runOne()).isFalse();
    }

    @Test
    void expiredRunningLeaseIsReclaimedAndCompleted() {
        work.enqueue(workspaceId, request);
        db.update("UPDATE document_check_work SET status='RUNNING', lease_until=?, lease_token=?",
            java.sql.Timestamp.from(NOW.minusSeconds(1)), UUID.randomUUID());
        assertThat(work.runOne()).isTrue();
        assertThat(status()).isEqualTo("SUCCEEDED");
        verify(checks).check(workspaceId, request);
    }

    @Test
    void staleResponseRevisionIsSupersededWithoutCallingProvider() {
        work.enqueue(workspaceId, request);
        FormResponse current = new FormResponse(responseId, workspaceId, UUID.randomUUID(),
            "student", "student@example.invalid", UUID.randomUUID(), "99-9999",
            "Student", "team", "{\"documentPdf\":\"https://drive.google.com/file/d/new/view\"}",
            NOW, NOW.plusSeconds(1));
        when(responses.findById(responseId)).thenReturn(Optional.of(current));
        assertThat(work.runOne()).isTrue();
        assertThat(status()).isEqualTo("SUPERSEDED");
        verifyNoInteractions(checks);
    }

    @Test
    void staleLeaseOwnerCannotCompleteAReclaimedJob() {
        work.enqueue(workspaceId, request);
        UUID newOwner = UUID.randomUUID();
        when(checks.check(workspaceId, request)).thenAnswer(call -> {
            db.update("UPDATE document_check_work SET lease_token=?", newOwner);
            return null;
        });
        // The current owner changes while the old provider call is in flight.
        assertThat(work.runOne()).isTrue();
        assertThat(status()).isEqualTo("RUNNING");
        assertThat(db.queryForObject("SELECT lease_token FROM document_check_work", UUID.class)).isEqualTo(newOwner);
    }

    @Test
    void repeatedEnqueueForOneResponseVersionCreatesOneJob() {
        work.enqueue(workspaceId, request);
        work.enqueue(workspaceId, request);
        assertThat(count()).isEqualTo(1);
    }

    @Test void transientFailuresRetryAtMostThreeTimes() {
        work.enqueue(workspaceId, request);
        when(checks.check(workspaceId, request)).thenThrow(new IllegalStateException("Synthetic provider interruption"));
        for (int attempt=1; attempt<=3; attempt++) {
            assertThat(work.runOne()).isTrue();
            assertThat(status()).isEqualTo(attempt==3 ? "FAILED" : "PENDING");
            db.update("UPDATE document_check_work SET next_attempt_at=?", java.sql.Timestamp.from(NOW.minusSeconds(1)));
        }
        assertThat(work.runOne()).isFalse();
        verify(checks,times(3)).check(workspaceId,request);
    }

    @Test void unrelatedTextEditKeepsPendingPdfWorkAndUsesTheCurrentTimestamp() {
        work.enqueue(workspaceId, request);
        FormResponse response = responses.findById(responseId).orElseThrow();
        response.setUpdatedAt(NOW.plusSeconds(5));
        response.setValuesJson("{\"documentPdf\":\"https://drive.google.com/file/d/fake/view\",\"notes\":\"new text\"}");
        org.springframework.test.util.ReflectionTestUtils.setField(response, "revision", 2L);
        assertThat(work.runOne()).isTrue();
        assertThat(status()).isEqualTo("SUCCEEDED");
        verify(checks).check(workspaceId, new FileCheckRequest(responseId.toString(), "SRS", request.sourceUrl(), NOW.plusSeconds(5).toString()));
    }

    @Test void returnedProviderFailureRetriesWithBackoff() {
        work.enqueue(workspaceId, request);
        var report = mock(com.capvault.backend.filecheck.FileCheckResponse.class);
        when(report.failureDetails()).thenReturn(new com.capvault.backend.filecheck.DriveFailureDetails(
            "metadata", "HTTP", "RATE_LIMIT", 429, "Synthetic rate limit", null, null, null, null));
        when(checks.check(workspaceId, request)).thenReturn(report).thenReturn(null);
        assertThat(work.runOne()).isTrue();
        assertThat(status()).isEqualTo("PENDING");
        assertThat(work.runOne()).isFalse(); // respects the retry backoff
        db.update("UPDATE document_check_work SET next_attempt_at=?", java.sql.Timestamp.from(NOW.minusSeconds(1)));
        assertThat(work.runOne()).isTrue();
        assertThat(status()).isEqualTo("SUCCEEDED");
        verify(checks, times(2)).check(workspaceId, request);
    }

    @Test void fileAccessFailureNeedsUserActionAndDoesNotRetry() {
        work.enqueue(workspaceId, request);
        var report = mock(com.capvault.backend.filecheck.FileCheckResponse.class);
        when(report.failureDetails()).thenReturn(new com.capvault.backend.filecheck.DriveFailureDetails(
            "metadata", "HTTP", "ACCESS_DENIED", 403, "Synthetic sharing restriction", null, null, null, null));
        when(checks.check(workspaceId, request)).thenReturn(report);
        assertThat(work.runOne()).isTrue();
        assertThat(status()).isEqualTo("SUCCEEDED");
        assertThat(work.runOne()).isFalse();
        verify(checks).check(workspaceId, request);
    }

    private int count() {
        return db.queryForObject("SELECT COUNT(*) FROM document_check_work", Integer.class);
    }

    private String status() {
        return db.queryForObject("SELECT status FROM document_check_work", String.class);
    }
}
