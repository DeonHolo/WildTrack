package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import com.capvault.backend.filecheck.FileCheckReportRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.server.ResponseStatusException;

class AiReviewBatchLifecycleTest {
    private final UUID workspace = UUID.randomUUID(), first = UUID.randomUUID(), second = UUID.randomUUID();
    private final AiReviewService reviews = mock(AiReviewService.class);
    private final FileCheckReportRepository checks = mock(FileCheckReportRepository.class);
    private final MutableClock clock = new MutableClock();
    private AiReviewBatchStore store;
    private AiReviewBatchService service;
    private JdbcTemplate jdbc;
    private DataSourceTransactionManager manager;
    private final ObjectMapper json = new ObjectMapper();

    @Test void cancellingLeasedPreparationCannotBeRevivedByItsLateWorker() {
        var plan = service.prepare(workspace, "admin", List.of(new AiReviewBatchService.Target(first, "pdf")));
        var leased = store.leaseNext().orElseThrow();
        assertThat(service.cancelPreparation(workspace, plan.id(), "admin").state()).isEqualTo("CANCELLED");
        assertThat(store.saveLeased(leased, "READY", leased.data())).isFalse();
        assertThat(service.get(workspace, plan.id(), "admin").state()).isEqualTo("CANCELLED");
        verify(reviews, never()).preview(any(), any(), any(), any());
    }


    @BeforeEach void setup() {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:batch_" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(ds); manager = new DataSourceTransactionManager(ds);
        jdbc.execute("CREATE TABLE academic_workspaces(id UUID PRIMARY KEY)");
        jdbc.update("INSERT INTO academic_workspaces VALUES (?)", workspace);
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V34__durable_ai_review_batches.sql")).execute(ds);
        store = new AiReviewBatchStore(jdbc, json, clock, manager);
        service = new AiReviewBatchService(store, reviews, checks, json, clock);
        when(checks.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(any(), anyString(), any())).thenReturn(Optional.empty());
        when(reviews.preview(eq(workspace), any(), eq("pdf"), eq("admin"))).thenAnswer(inv -> preview(inv.getArgument(1), "same-key", "MISSING", null));
        when(reviews.reviewPlanned(eq(workspace), any(), eq("pdf"), eq("admin"), anyBoolean(), any(), anyBoolean(), anyString(), any()))
            .thenReturn(result("COMPLETED", null, false));
    }

    private AiReviewService.Preview preview(UUID response, String key, String category, UUID retry) {
        return new AiReviewService.Preview(response, "pdf", key, category, false, "Refactored SRS", "PDF Drive Link",
            "Test Student", "https://drive.google.com/file/d/" + response + "/view", clock.instant().toString(),
            null, clock.instant().toString(), UUID.randomUUID(), retry);
    }
    private AiReviewService.View result(String state, String failure, boolean reused) {
        return new AiReviewService.View(state, reused, "Saved status", null, null, clock.instant().toString(),
            false, failure == null ? null : UUID.randomUUID(), failure, "pdf", "source", null, null);
    }
    private AiReviewBatchService.View prepared() {
        var batch = service.prepare(workspace, "admin", List.of(new AiReviewBatchService.Target(first, "pdf"), new AiReviewBatchService.Target(second, "pdf")));
        service.tick(); service.tick();
        return service.get(workspace, batch.id(), "admin");
    }
    private void start(AiReviewBatchService.View plan, String mode, boolean acknowledged) {
        service.start(workspace, plan.id(), "admin", plan.version(), mode, true, acknowledged);
    }

    @Test void preparationCountsUniqueContentsAndDoesNotClaimAnyAiRequest() {
        var plan = prepared();
        assertThat(plan.state()).isEqualTo("READY");
        assertThat(plan.totalPdfs()).isEqualTo(2);
        assertThat(plan.uniqueDocuments()).isEqualTo(1);
        verify(reviews, never()).reviewPlanned(any(), any(), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @Test void successfulReviewsAreExcludedByDefaultAndAllModeRerunsOnlyOneLeader() {
        when(reviews.preview(eq(workspace), any(), eq("pdf"), eq("admin"))).thenAnswer(inv -> preview(inv.getArgument(1), "same-key", "CLEAN", null));
        var plan = prepared();
        assertThatThrownBy(() -> start(plan, "ATTENTION", false)).isInstanceOf(IllegalArgumentException.class);
        start(plan, "ALL", false);
        service.tick(); service.tick(); service.tick();
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(first), eq("pdf"), eq("admin"), eq(false), isNull(), eq(true), eq("same-key"), any());
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(second), eq("pdf"), eq("admin"), eq(false), isNull(), eq(false), eq("same-key"), any());
        assertThat(service.get(workspace, plan.id(), "admin").completedDocuments()).isEqualTo(1);
    }

    @Test void uncertainRetryRequiresConsentAndUsesThePreparedToken() {
        UUID retry = UUID.randomUUID();
        when(reviews.preview(eq(workspace), any(), eq("pdf"), eq("admin"))).thenAnswer(inv -> preview(inv.getArgument(1), "same-key", "FAILED", retry));
        var plan = prepared();
        assertThatThrownBy(() -> start(plan, "ATTENTION", false)).isInstanceOf(IllegalArgumentException.class);
        start(plan, "ATTENTION", true); service.tick();
        verify(reviews).reviewPlanned(eq(workspace), eq(first), eq("pdf"), eq("admin"), eq(true), eq(retry), eq(false), eq("same-key"), any());
    }

    @Test void freshWorkerRestoresRunningBatchFromDatabaseAndOnlyReadsAnInflightReview() {
        var plan = prepared(); start(plan, "ATTENTION", false);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any())).thenReturn(result("RUNNING", null, false));
        service.tick();
        var restored = new AiReviewBatchService(new AiReviewBatchStore(jdbc, json, clock, manager), reviews, checks, json, clock);
        when(reviews.saved(workspace, first, "pdf", "admin")).thenReturn(result("COMPLETED", null, true));
        restored.tick();
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
        verify(reviews).saved(workspace, first, "pdf", "admin");
        assertThat(restored.get(workspace, plan.id(), "admin").entries().get(0).phase()).isEqualTo("DONE");
    }

    @Test void pauseAndContinueNeverReplayTheFailedRequest() {
        when(reviews.preview(eq(workspace), any(), eq("pdf"), eq("admin"))).thenAnswer(inv -> preview(inv.getArgument(1), inv.getArgument(1).toString(), "MISSING", null));
        var plan = prepared(); start(plan, "ATTENTION", false);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenReturn(result("UNCERTAIN", "PROVIDER_TIMEOUT", false));
        service.tick();
        assertThat(service.get(workspace, plan.id(), "admin").state()).isEqualTo("PAUSED");
        service.resume(workspace, plan.id(), "admin"); service.tick(); service.tick();
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(second), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @Test void expiredLeaseRecoveryDoesNotReplayAnInterruptedStartAndRejectsLateWrites() {
        var plan = prepared(); start(plan, "ATTENTION", false);
        var owner = store.leaseNext().orElseThrow();
        var entries = new java.util.ArrayList<>(owner.data().entries());
        entries.set(0, entries.get(0).phase("STARTING"));
        var checkpoint = store.checkpoint(owner, owner.data().entries(entries, "Interrupted start")).orElseThrow();
        assertThat(store.leaseNext()).isEmpty();
        clock.now = clock.now.plusSeconds(301);
        when(reviews.saved(workspace, first, "pdf", "admin")).thenReturn(result("NOT_REVIEWED", null, false));
        service.tick();
        verify(reviews, never()).reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
        assertThat(service.get(workspace, plan.id(), "admin").state()).isEqualTo("PAUSED");
        assertThat(store.saveLeased(checkpoint, "COMPLETED", checkpoint.data())).isFalse();
    }

    @Test void staleConfirmationWrongWorkspaceAndStudentRoleCannotStartABatch() {
        var plan = prepared();
        assertThatThrownBy(() -> service.start(workspace, plan.id(), "admin", plan.version() - 1, "ALL", true, true)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.get(UUID.randomUUID(), plan.id(), "admin")).isInstanceOf(ResponseStatusException.class);
        doThrow(new AccessDeniedException("Admin required")).when(reviews).requireAdministrator("student");
        assertThatThrownBy(() -> service.start(workspace, plan.id(), "student", plan.version(), "ALL", true, true)).isInstanceOf(AccessDeniedException.class);
    }

    @Test void individualStartDuringBatchExplainsTheOverlapWithoutAnotherRequest() {
        var plan = prepared(); start(plan, "ATTENTION", false);
        assertThatThrownBy(() -> service.individualDuringBatch(workspace, first, "pdf", "admin"))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("already included");
        verify(reviews, never()).reviewPlanned(any(), any(), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    private static class MutableClock extends Clock {
        Instant now = Instant.parse("2026-10-10T00:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
}
