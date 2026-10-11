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
import com.capvault.backend.drive.GoogleDriveUnavailableException.Kind;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.http.HttpStatus;
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

    @ParameterizedTest @EnumSource(value = Kind.class, names = {"FILE_ACCESS", "UNKNOWN", "PROVIDER_UNAVAILABLE"})
    void definitePreclaimDriveFailureDoesNotStopAnUnrelatedPdf(Kind kind) {
        when(reviews.preview(eq(workspace), any(), eq("pdf"), eq("admin")))
            .thenAnswer(inv -> preview(inv.getArgument(1), inv.getArgument(1).toString(), "MISSING", null));
        var plan = prepared(); start(plan, "ATTENTION", false);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenThrow(new AiReviewService.DrivePreparationFailure(kind, "Drive read failed. No AI review was started."));
        service.tick();
        var progress = service.get(workspace, plan.id(), "admin");
        assertThat(progress.state()).isEqualTo("RUNNING");
        assertThat(progress.entries().get(0).noAiStarted()).isTrue();
        assertThat(progress.completedDocuments()).isEqualTo(1);
        assertThat(progress.pendingDocuments()).isEqualTo(1);
        service.tick(); service.tick();
        assertThat(service.get(workspace, plan.id(), "admin").state()).isEqualTo("COMPLETED");
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(second), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @ParameterizedTest @EnumSource(value = Kind.class, names = {"CONFIGURATION", "RATE_LIMIT"})
    void driveConfigurationAndQuotaFailuresStillPauseTheBatch(Kind kind) {
        var plan = prepared(); start(plan, "ATTENTION", false);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenThrow(new AiReviewService.DrivePreparationFailure(kind, "Drive setup or quota failure. No AI review was started."));
        service.tick(); service.tick();
        var progress = service.get(workspace, plan.id(), "admin");
        assertThat(progress.state()).isEqualTo("PAUSED");
        assertThat(progress.entries().get(0).noAiStarted()).isTrue();
        verify(reviews, never()).reviewPlanned(eq(workspace), eq(second), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @ParameterizedTest @ValueSource(ints = {409, 503})
    void unclassifiedHttpFailuresCannotClaimNoAiStarted(int status) {
        when(reviews.preview(eq(workspace), any(), eq("pdf"), eq("admin")))
            .thenAnswer(inv -> preview(inv.getArgument(1), "same-key", "CLEAN", null));
        var plan = prepared(); start(plan, "ALL", false);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenThrow(new ResponseStatusException(HttpStatus.valueOf(status), "Saved status could not be confirmed."));
        service.tick();
        var progress = service.get(workspace, plan.id(), "admin");
        assertThat(progress.state()).isEqualTo("PAUSED");
        assertThat(progress.entries().get(0).noAiStarted()).isFalse();
        assertThat(progress.entries().get(1).rerun()).isFalse();
        assertThat(progress.entries().get(1).retryToken()).isNull();
        verify(reviews, never()).reviewPlanned(eq(workspace), eq(second), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @ParameterizedTest @ValueSource(strings = {"NOT_CONFIGURED", "API_KEY_REJECTED", "RATE_LIMITED", "MODEL_UNAVAILABLE", "PROVIDER_CONNECTION_FAILED"})
    void providerFailuresRemainPausedWithoutReplaying(String failureCode) {
        var plan = prepared(); start(plan, "ATTENTION", false);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenReturn(result("UNCERTAIN", failureCode, false));
        service.tick(); service.tick();
        var progress = service.get(workspace, plan.id(), "admin");
        assertThat(progress.state()).isEqualTo("PAUSED");
        assertThat(progress.entries().get(0).noAiStarted()).isFalse();
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
        verify(reviews, never()).reviewPlanned(eq(workspace), eq(second), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @Test void lateValidationFailureCannotClaimTheProviderWasNotStarted() {
        var plan = prepared(); start(plan, "ATTENTION", false);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenThrow(new IllegalArgumentException("Selected artifact was retired."));
        service.tick();
        var progress = service.get(workspace, plan.id(), "admin");
        assertThat(progress.state()).isEqualTo("PAUSED");
        assertThat(progress.entries().get(0).noAiStarted()).isFalse();
    }

    @ParameterizedTest @ValueSource(strings = {"CLEAN", "FAILED"})
    void unclaimedIntentMovesToAnAccessibleDuplicateWithoutAnotherRerunLeader(String category) {
        UUID retry = category.equals("FAILED") ? UUID.randomUUID() : null;
        when(reviews.preview(eq(workspace), any(), eq("pdf"), eq("admin")))
            .thenAnswer(inv -> preview(inv.getArgument(1), "same-key", category, retry));
        var plan = prepared(); start(plan, "ALL", retry != null);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenThrow(new AiReviewService.DrivePreparationFailure(Kind.UNKNOWN, "Preclaim Drive failure. No AI review was started."));
        service.tick(); service.tick(); service.tick();
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(second), eq("pdf"), eq("admin"),
            eq(retry != null), eq(retry), eq(category.equals("CLEAN")), eq("same-key"), any());
        assertThat(service.get(workspace, plan.id(), "admin").completedDocuments()).isEqualTo(1);
    }

    @Test void unverifiedIdentitySurvivesDatabaseRestoreWithoutEnteringVerifiedCounts() {
        var identity = new AiReviewService.DisplayIdentity("Refactored STD", "Test PDF", "First Student", "https://drive.google.com/file/d/first/view", null);
        when(reviews.displayIdentity(workspace, first, "pdf", "admin")).thenReturn(identity);
        when(reviews.preview(workspace, first, "pdf", "admin"))
            .thenThrow(new AiReviewService.DrivePreparationFailure(Kind.FILE_ACCESS, "PDF could not be opened."));
        var plan = prepared();
        var restored = new AiReviewBatchService(new AiReviewBatchStore(jdbc, json, clock, manager), reviews, checks, json, clock);
        var result = restored.get(workspace, plan.id(), "admin");
        assertThat(result.entries().get(0).identity()).isEqualTo(identity);
        assertThat(result.entries().get(0).preview()).isNull();
        assertThat(result.uniqueDocuments()).isEqualTo(1);
        assertThat(result.entries().get(0).phase()).isEqualTo("UNVERIFIED");
    }

    @Test void typedPreclaimFailureKeepsTheFailingSourceEvenIfTheLocalLookupWasStale() {
        var stale = new AiReviewService.DisplayIdentity("Old SRS", "Old PDF", "First Student", "https://drive.google.com/file/d/old/view", null);
        var actual = new AiReviewService.DisplayIdentity("Current SRS", "Current PDF", "First Student", "https://drive.google.com/file/d/actual/view", null);
        when(reviews.displayIdentity(workspace, first, "pdf", "admin")).thenReturn(stale);
        when(reviews.preview(workspace, first, "pdf", "admin")).thenThrow(
            new AiReviewService.DrivePreparationFailure(Kind.FILE_ACCESS, "Actual PDF could not be opened.").identified(actual));
        assertThat(prepared().entries().get(0).identity()).isEqualTo(actual);
    }

    @Test void legacyUnverifiedIdentityUsesAuthorizedLabelsWithoutInventingAnOriginalUrl() {
        var legacy = new AiReviewBatchService.Entry(new AiReviewBatchService.Target(first, "pdf"), null, "UNVERIFIED",
            false, false, null, null, false, null, false, "Old PDF access failure", true);
        var row = store.create(workspace, "admin", new AiReviewBatchService.Data(List.of(legacy), "ATTENTION", true, false, "Prepared"));
        // Exercise an actual old payload that omits the additive field, rather than a serialized null.
        var oldJson = json.valueToTree(row.data());
        ((com.fasterxml.jackson.databind.node.ObjectNode) oldJson.path("entries").get(0)).remove("identity");
        jdbc.update("UPDATE ai_review_batches SET state = 'READY', payload_json = ? WHERE id = ?", oldJson.toString(), row.id());
        when(reviews.displayIdentity(workspace, first, "pdf", "admin")).thenReturn(new AiReviewService.DisplayIdentity(
            "Refactored SDD", "Design PDF", "Current Student", "https://drive.google.com/file/d/current-file/view", null));
        var result = service.get(workspace, row.id(), "admin");
        assertThat(result.entries().get(0).identity().deliverableTitle()).isEqualTo("Refactored SDD");
        assertThat(result.entries().get(0).identity().sourceUrl()).isNull();
        assertThat(result.entries().get(0).preview()).isNull();
        assertThat(result.uniqueDocuments()).isZero();
        verify(reviews, never()).preview(any(), any(), any(), any());
    }

    @Test void restoringPreparedIdentityKeepsTheOriginalSourceWhenTheCurrentLinkChanged() {
        var original = preview(first, "original-key", "MISSING", null);
        var legacy = new AiReviewBatchService.Entry(new AiReviewBatchService.Target(first, "pdf"), original, "DONE",
            true, false, null, null, false, "FAILED", false, "Old PDF access failure", true);
        var row = store.create(workspace, "admin", new AiReviewBatchService.Data(List.of(legacy), "ATTENTION", true, false, "Paused"));
        when(reviews.displayIdentity(workspace, first, "pdf", "admin")).thenReturn(new AiReviewService.DisplayIdentity(
            "Changed deliverable", "Changed artifact", "Current Student", "https://drive.google.com/file/d/replaced/view", null));
        var result = service.get(workspace, row.id(), "admin");
        assertThat(result.entries().get(0).identity().sourceUrl()).isEqualTo(original.sourceUrl());
        assertThat(result.entries().get(0).identity().deliverableTitle()).isEqualTo(original.deliverableTitle());
        verify(reviews, never()).displayIdentity(any(), any(), any(), any());
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
