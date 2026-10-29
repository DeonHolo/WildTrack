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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
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
        var report = "COMPLETED".equals(state)
            ? new AiReviewProvider.Result("Saved review", List.of(), List.of(), List.of(), "Instructor review required.") : null;
        return new AiReviewService.View(state, reused, "Saved status", report,
            report == null ? null : clock.instant().toString(), clock.instant().toString(),
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

    @Test void driveHttpStatusSurvivesSavedPrecheckAndFreshWorkerReads() {
        var diagnostic = new AiReviewProvider.FailureDiagnostic("drive", "download", 403, null,
            "UPSTREAM_ERROR", List.of(), "Drive refused the request.", null, null, 120L);
        when(reviews.preview(workspace, first, "pdf", "admin")).thenThrow(
            new AiReviewService.DrivePreparationFailure(Kind.UNKNOWN, "Drive read failed. No AI review was started.", diagnostic));
        var plan = service.prepare(workspace, "admin", List.of(new AiReviewBatchService.Target(first, "pdf")));
        service.tick();
        var restored = new AiReviewBatchService(new AiReviewBatchStore(jdbc, json, clock, manager), reviews, checks, json, clock);
        var entry = restored.get(workspace, plan.id(), "admin").entries().get(0);
        assertThat(entry.failureDiagnostics()).isEqualTo(diagnostic);
        assertThat(entry.phase()).isEqualTo("UNVERIFIED");
        assertThat(entry.noAiStarted()).isTrue();
    }

    @Test void geminiHttpStatusSurvivesPauseWithoutLosingEarlierProgress() throws Exception {
        var diagnostic = new AiReviewProvider.FailureDiagnostic("gemini", "generation", 429, "RESOURCE_EXHAUSTED",
            "RATE_LIMITED", List.of(), "Gemini quota reached.", null, GeminiAiReviewProvider.MODEL, 200L);
        var node = json.<com.fasterxml.jackson.databind.node.ObjectNode>valueToTree(result("UNCERTAIN", "RATE_LIMITED", false));
        node.set("failureDiagnostics", json.valueToTree(diagnostic));
        var review = json.treeToValue(node, AiReviewService.View.class);
        var plan = prepared(); start(plan, "ATTENTION", false);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenReturn(review);
        service.tick();
        var saved = service.get(workspace, plan.id(), "admin");
        assertThat(saved.state()).isEqualTo("PAUSED");
        assertThat(saved.entries().get(0).failureDiagnostics()).isEqualTo(diagnostic);
        verify(reviews, never()).reviewPlanned(eq(workspace), eq(second), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @Test void missingChecklistApprovalIsSetupWorkRatherThanAnInaccessiblePdf() {
        UUID template = UUID.randomUUID();
        when(reviews.preview(workspace, first, "pdf", "admin"))
            .thenThrow(new AiReviewService.TemplateChecklistApprovalRequired(workspace, template));
        var plan = prepared();
        var entry = plan.entries().getFirst();
        assertThat(entry.phase()).isEqualTo("SETUP_REQUIRED");
        assertThat(entry.resultStatus()).isEqualTo("TEMPLATE_APPROVAL_REQUIRED");
        assertThat(entry.noAiStarted()).isTrue();
        assertThat(entry.templateChecklistUrl()).isEqualTo("/templates/" + template + "/preview?workspaceId=" + workspace);
        assertThat(plan.uniqueDocuments()).isEqualTo(1);
        start(plan, "ATTENTION", false);
        service.tick(); service.tick(); service.tick();
        var finished = service.get(workspace, plan.id(), "admin");
        assertThat(finished.entries().getFirst().templateChecklistUrl()).isEqualTo(entry.templateChecklistUrl());
        assertThat(finished.message()).contains("Saved results are available");
        verify(reviews, never()).reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
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

    @ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({
        "FAILED, FAILED, true", "FAILED, UNCERTAIN, true", "FAILED, INCONCLUSIVE, false",
        "MANUAL, INCONCLUSIVE, true", "MANUAL, FAILED, false", "MANUAL, MISSING, false",
        "ATTENTION, FAILED, true", "ATTENTION, MISSING, true", "ATTENTION, ISSUES, true",
        "ATTENTION, INCONCLUSIVE, false", "ATTENTION, CLEAN, false"
    })
    void scopeSelectsMatchingCategories(String mode, String category, boolean selected) {
        when(reviews.preview(eq(workspace), any(), eq("pdf"), eq("admin")))
            .thenAnswer(inv -> preview(inv.getArgument(1), "same-key", category, null));
        var plan = prepared();
        if (selected) {
            start(plan, mode, true);
            assertThat(service.get(workspace, plan.id(), "admin").entries()).allSatisfy(entry -> assertThat(entry.selected()).isTrue());
        } else {
            assertThatThrownBy(() -> start(plan, mode, true)).isInstanceOf(IllegalArgumentException.class);
        }
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

    @Test void pollingAnInvalidAttemptDoesNotClaimThatASavedReviewWasReused() {
        var plan = prepared(); start(plan, "ATTENTION", false);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenReturn(result("RUNNING", null, false));
        when(reviews.saved(workspace, first, "pdf", "admin")).thenReturn(result("UNCERTAIN", "INVALID_RESPONSE", true));
        service.tick();
        assertThat(service.get(workspace, plan.id(), "admin").entries().get(0).error()).isEmpty();
        service.tick(); service.tick(); service.tick();
        var progress = service.get(workspace, plan.id(), "admin");
        assertThat(progress.state()).isEqualTo("COMPLETED");
        assertThat(progress.completedDocuments()).isEqualTo(1);
        assertThat(progress.reusedDocuments()).isZero();
        assertThat(progress.entries().get(0).reused()).isFalse();
        assertThat(progress.message()).contains("items needing attention").doesNotContain("Saved results are available");
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @Test void pollingANewCompletedReviewPreservesItsOriginalClaim() {
        var plan = prepared(); start(plan, "ATTENTION", false);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenReturn(result("RUNNING", null, false));
        when(reviews.saved(workspace, first, "pdf", "admin")).thenReturn(result("COMPLETED", null, true));
        service.tick();
        assertThat(service.get(workspace, plan.id(), "admin").entries().get(0).error()).isEmpty();
        service.tick(); service.tick(); service.tick();
        var progress = service.get(workspace, plan.id(), "admin");
        assertThat(progress.entries().get(0).reused()).isFalse();
        assertThat(progress.reusedDocuments()).isZero();
        assertThat(progress.message()).contains("Saved results are available");
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @Test void aVerifiedSavedReviewIsCountedOnceForIdenticalDocuments() {
        when(reviews.reviewPlanned(eq(workspace), any(), eq("pdf"), eq("admin"), anyBoolean(), any(), anyBoolean(), anyString(), any()))
            .thenReturn(result("COMPLETED", null, true));
        var plan = prepared(); start(plan, "ATTENTION", false);
        service.tick(); service.tick(); service.tick();
        var progress = service.get(workspace, plan.id(), "admin");
        assertThat(progress.reusedDocuments()).isEqualTo(1);
        assertThat(progress.message()).contains("Saved results are available");
    }

    @Test void aCompletedStatusWithoutAReportIsNotPresentedAsASavedResult() {
        var plan = prepared(); start(plan, "ATTENTION", false);
        var missing = new AiReviewService.View("COMPLETED", true, "Saved status", null, null,
            clock.instant().toString(), false, null, null, "pdf", "source", null, null);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any())).thenReturn(missing);
        service.tick(); service.tick(); service.tick();
        var progress = service.get(workspace, plan.id(), "admin");
        assertThat(progress.entries().get(0).resultStatus()).isEqualTo("FAILED");
        assertThat(progress.entries().get(0).error()).contains("No saved AI Review");
        assertThat(progress.reusedDocuments()).isZero();
        assertThat(progress.message()).contains("items needing attention").doesNotContain("Saved results are available");
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void completedAssessmentNoticesDoNotTurnBatchCompletionIntoTechnicalFailure(boolean manualVerification) {
        var report = new AiReviewProvider.Result("Limited assessment", List.of(), List.of(), List.of(),
            "Inspect the PDF.", List.of(), manualVerification
                ? List.of(new AiReviewProvider.Finding("Inspect this figure", AiReviewProvider.FindingSource.DOCUMENT,
                    "Figure 1", "")) : List.of(), AiReviewProvider.ReviewOutcome.INCONCLUSIVE);
        var review = new AiReviewService.View("COMPLETED", true, "Saved status", report,
            clock.instant().toString(), clock.instant().toString(), false, null, null, "pdf", "source", null, null);
        when(reviews.reviewPlanned(eq(workspace), any(), eq("pdf"), eq("admin"), anyBoolean(), any(), anyBoolean(), anyString(), any()))
            .thenReturn(review);
        var plan = prepared(); start(plan, "ATTENTION", false);
        service.tick(); service.tick(); service.tick();
        var progress = service.get(workspace, plan.id(), "admin");
        assertThat(progress.state()).isEqualTo("COMPLETED");
        assertThat(progress.message()).isEqualTo("AI Review batch finished. Saved results are available.");
        assertThat(progress.completedDocuments()).isEqualTo(1);
        assertThat(progress.reusedDocuments()).isEqualTo(1);
        assertThat(progress.entries().get(0).resultStatus()).isEqualTo("COMPLETED");
        assertThat(progress.entries().get(0).error())
            .contains(manualVerification ? "manual verification" : "limited coverage");
        assertThat(progress.entries().get(0).error()).doesNotContain("clean result");
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(first), eq("pdf"), eq("admin"), anyBoolean(), any(), anyBoolean(), anyString(), any());
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(second), eq("pdf"), eq("admin"), anyBoolean(), any(), anyBoolean(), anyString(), any());
    }


    @Test void aTechnicalFailureRemainsVisibleAlongsideCompletedAssessmentNotices() {
        when(reviews.preview(eq(workspace), any(), eq("pdf"), eq("admin")))
            .thenAnswer(inv -> preview(inv.getArgument(1), inv.getArgument(1).toString(), "MISSING", null));
        var report = new AiReviewProvider.Result("Limited assessment", List.of(), List.of(), List.of(),
            "Inspect the PDF.", List.of(), List.of(), AiReviewProvider.ReviewOutcome.INCONCLUSIVE);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenReturn(new AiReviewService.View("COMPLETED", false, "Saved status", report,
                clock.instant().toString(), clock.instant().toString(), false, null, null, "pdf", "source", null, null));
        when(reviews.reviewPlanned(eq(workspace), eq(second), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenReturn(result("UNCERTAIN", "INVALID_RESPONSE", false));
        var plan = prepared(); start(plan, "ATTENTION", false);
        for (int i = 0; i < 6; i++) service.tick();
        var progress = service.get(workspace, plan.id(), "admin");
        assertThat(progress.state()).isEqualTo("COMPLETED");
        assertThat(progress.message()).contains("items needing attention");
        assertThat(progress.entries()).extracting(AiReviewBatchService.Entry::resultStatus)
            .containsExactly("COMPLETED", "UNCERTAIN");
        assertThat(progress.entries().get(0).error()).contains("limited coverage");
        assertThat(progress.reusedDocuments()).isZero();
    }

    @Test void accessRestrictionsRemainNoticesWithoutClaimingAnAiReviewWasProduced() {
        when(reviews.reviewPlanned(eq(workspace), any(), eq("pdf"), eq("admin"), anyBoolean(), any(), anyBoolean(), anyString(), any()))
            .thenThrow(new AiReviewService.DrivePreparationFailure(Kind.FILE_ACCESS,
                "The submitted Drive PDF could not be opened. Google Drive reported a file-access or download restriction. No AI review was started."));
        var plan = prepared(); start(plan, "ATTENTION", false);
        for (int i = 0; i < 6; i++) service.tick();
        var progress = service.get(workspace, plan.id(), "admin");
        assertThat(progress.state()).isEqualTo("COMPLETED");
        assertThat(progress.message()).contains("No reviews were produced", "file-access notices")
            .doesNotContain("items needing attention", "Saved results are available");
        assertThat(progress.entries()).allMatch(AiReviewBatchService.Entry::noAiStarted);
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

    @Test void stoppingBeforeTheNextDocumentKeepsEveryUnstartedEntryAndIsIdempotent() {
        var plan = prepared(); start(plan, "ATTENTION", false);
        var stopped = service.stop(workspace, plan.id(), "admin");
        assertThat(stopped.state()).isEqualTo("RUNNING");
        assertThat(stopped.stopRequested()).isTrue();
        assertThat(service.stop(workspace, plan.id(), "admin").version()).isEqualTo(stopped.version());
        service.tick();
        var paused = service.get(workspace, plan.id(), "admin");
        assertThat(paused.state()).isEqualTo("PAUSED");
        assertThat(paused.entries()).allMatch(e -> e.phase().equals("PENDING"));
        assertThat(service.stop(workspace, plan.id(), "admin").version()).isEqualTo(paused.version());
        verify(reviews, never()).reviewPlanned(any(), any(), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @Test void acceptedStopBeforeStartingCheckpointPreventsClaimAndReleasesLeaseImmediately() {
        store = spy(store);
        service = new AiReviewBatchService(store, reviews, checks, json, clock);
        var plan = prepared(); start(plan, "ATTENTION", false);
        doAnswer(inv -> {
            service.stop(workspace, plan.id(), "admin");
            return inv.callRealMethod();
        }).when(store).checkpoint(any(), any());
        service.tick();
        assertThat(jdbc.queryForObject("SELECT lease_token FROM ai_review_batches WHERE id = ?", UUID.class, plan.id())).isNull();
        service.tick();
        assertThat(service.get(workspace, plan.id(), "admin").state()).isEqualTo("PAUSED");
        verify(reviews, never()).reviewPlanned(any(), any(), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @Test void stopDuringProviderExecutionSavesCurrentResultAndOnlyResumesUnstartedDocuments() throws Exception {
        when(reviews.preview(eq(workspace), any(), eq("pdf"), eq("admin")))
            .thenAnswer(inv -> preview(inv.getArgument(1), inv.getArgument(1).toString(), "MISSING", null));
        var plan = prepared(); start(plan, "ATTENTION", false);
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenAnswer(inv -> {
                entered.countDown();
                assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                return result("COMPLETED", null, false);
            });
        try (var executor = Executors.newSingleThreadExecutor()) {
            var worker = executor.submit(service::tick);
            try {
                assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
                assertThat(service.stop(workspace, plan.id(), "admin").stopRequested()).isTrue();
                assertThat(service.get(workspace, plan.id(), "admin").state()).isEqualTo("RUNNING");
            } finally { release.countDown(); }
            worker.get(5, TimeUnit.SECONDS);
        }
        var progress = service.get(workspace, plan.id(), "admin");
        assertThat(progress.entries().get(0).resultStatus()).isEqualTo("COMPLETED");
        assertThat(progress.stopRequested()).isTrue();
        assertThat(jdbc.queryForObject("SELECT lease_token FROM ai_review_batches WHERE id = ?", UUID.class, plan.id())).isNull();
        service.tick();
        assertThat(service.get(workspace, plan.id(), "admin").state()).isEqualTo("PAUSED");
        verify(reviews, never()).reviewPlanned(eq(workspace), eq(second), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
        var resumed = service.resume(workspace, plan.id(), "admin");
        assertThat(resumed.stopRequested()).isFalse();
        service.tick(); service.tick();
        assertThat(service.get(workspace, plan.id(), "admin").state()).isEqualTo("COMPLETED");
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(second), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @Test void stoppingAnAsynchronousReviewKeepsPollingItsResultBeforePausing() {
        var plan = prepared(); start(plan, "ATTENTION", false);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenReturn(result("RUNNING", null, false));
        service.tick(); service.stop(workspace, plan.id(), "admin");
        when(reviews.saved(workspace, first, "pdf", "admin"))
            .thenReturn(result("RUNNING", null, true), result("COMPLETED", null, true));
        service.tick();
        assertThat(service.get(workspace, plan.id(), "admin").state()).isEqualTo("RUNNING");
        service.tick();
        var paused = service.get(workspace, plan.id(), "admin");
        assertThat(paused.state()).isEqualTo("PAUSED");
        assertThat(paused.entries().get(0).phase()).isEqualTo("DONE");
        assertThat(paused.entries().get(0).reused()).isFalse();
        assertThat(paused.entries().get(1).phase()).isEqualTo("PENDING");
        verify(reviews, times(1)).reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
        verify(reviews, never()).reviewPlanned(eq(workspace), eq(second), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @Test void stoppingTheLastDocumentAllowsNormalCompletion() {
        var plan = service.prepare(workspace, "admin", List.of(new AiReviewBatchService.Target(first, "pdf")));
        service.tick(); plan = service.get(workspace, plan.id(), "admin"); start(plan, "ATTENTION", false);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenReturn(result("RUNNING", null, false));
        service.tick(); service.stop(workspace, plan.id(), "admin");
        when(reviews.saved(workspace, first, "pdf", "admin")).thenReturn(result("COMPLETED", null, true));
        service.tick();
        var completed = service.get(workspace, plan.id(), "admin");
        assertThat(completed.state()).isEqualTo("COMPLETED");
        assertThat(completed.completedDocuments()).isEqualTo(1);
        assertThat(service.stop(workspace, plan.id(), "admin").version()).isEqualTo(completed.version());
    }

    @Test void stopAfterFinalSaveReadsLatestProgressInsteadOfOverwritingIt() {
        var plan = prepared(); start(plan, "ATTENTION", false);
        var stale = store.find(plan.id(), workspace).orElseThrow();
        service.tick();
        var stopped = store.requestStop(stale);
        assertThat(stopped.data().entries().get(0).resultStatus()).isEqualTo("COMPLETED");
        assertThat(stopped.data().entries().get(1).phase()).isEqualTo("PENDING");
        service.tick();
        assertThat(service.get(workspace, plan.id(), "admin").state()).isEqualTo("PAUSED");
        verify(reviews, never()).reviewPlanned(eq(workspace), eq(second), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any());
    }

    @Test void concurrentStopPreservesTypedPreclaimFailureAndApprovedIntent() {
        when(reviews.preview(eq(workspace), any(), eq("pdf"), eq("admin")))
            .thenAnswer(inv -> preview(inv.getArgument(1), "same-key", "CLEAN", null));
        var plan = prepared(); start(plan, "ALL", false);
        when(reviews.reviewPlanned(eq(workspace), eq(first), any(), any(), anyBoolean(), any(), anyBoolean(), any(), any()))
            .thenAnswer(inv -> {
                service.stop(workspace, plan.id(), "admin");
                throw new AiReviewService.DrivePreparationFailure(Kind.FILE_ACCESS, "Typed restriction. No AI review was started.");
            });
        service.tick(); service.tick();
        var paused = service.get(workspace, plan.id(), "admin");
        assertThat(paused.state()).isEqualTo("PAUSED");
        assertThat(paused.entries().get(0).noAiStarted()).isTrue();
        assertThat(paused.entries().get(0).error()).contains("Typed restriction");
        assertThat(paused.entries().get(1).rerun()).isTrue();
        assertThat(paused.entries().get(1).phase()).isEqualTo("PENDING");
        service.resume(workspace, plan.id(), "admin"); service.tick();
        verify(reviews).reviewPlanned(eq(workspace), eq(second), eq("pdf"), eq("admin"), eq(false), isNull(), eq(true), eq("same-key"), any());
    }

    @Test void lateWorkerCannotMergeAStopOverAReplacementLease() {
        var plan = prepared(); start(plan, "ATTENTION", false);
        var owner = store.leaseNext().orElseThrow();
        service.stop(workspace, plan.id(), "admin");
        store.releaseLease(owner);
        var nextOwner = store.leaseNext().orElseThrow();
        assertThat(store.saveLeased(owner, "COMPLETED", owner.data())).isFalse();
        store.releaseLease(owner);
        assertThat(store.find(plan.id(), workspace).orElseThrow().leaseToken()).isEqualTo(nextOwner.leaseToken());
    }

    @Test void stoppedPayloadsRemainBackwardCompatibleAndStopIsAdministratorWorkspaceScoped() {
        var plan = prepared();
        var legacy = (com.fasterxml.jackson.databind.node.ObjectNode) json.valueToTree(store.find(plan.id(), workspace).orElseThrow().data());
        legacy.remove("stopRequested");
        jdbc.update("UPDATE ai_review_batches SET payload_json = ? WHERE id = ?", legacy.toString(), plan.id());
        assertThat(service.get(workspace, plan.id(), "admin").stopRequested()).isFalse();
        assertThatThrownBy(() -> service.stop(workspace, plan.id(), "admin")).isInstanceOf(ResponseStatusException.class);
        start(service.get(workspace, plan.id(), "admin"), "ATTENTION", false);
        assertThatThrownBy(() -> service.stop(UUID.randomUUID(), plan.id(), "admin"))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        doThrow(new AccessDeniedException("Admin required")).when(reviews).requireAdministrator("student");
        assertThatThrownBy(() -> service.stop(workspace, plan.id(), "student")).isInstanceOf(AccessDeniedException.class);
        assertThat(service.get(workspace, plan.id(), "admin").stopRequested()).isFalse();
        assertThatThrownBy(() -> service.cancelPreparation(workspace, plan.id(), "admin"))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("continues on the server");
    }

    private static class MutableClock extends Clock {
        Instant now = Instant.parse("2026-10-10T00:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
}
