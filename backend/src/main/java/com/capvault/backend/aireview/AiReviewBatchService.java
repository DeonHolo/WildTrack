package com.capvault.backend.aireview;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import com.capvault.backend.filecheck.FileCheckReportRepository;
import com.capvault.backend.filecheck.FileCheckResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Durable orchestration; provider claims, grounding, history and retry safety remain in AiReviewService. */
@Service
public class AiReviewBatchService {
    public record Target(UUID responseId, String fieldId) { }
    public record Entry(Target target, AiReviewService.Preview preview, String phase, boolean selected,
                        boolean rerun, UUID retryToken, String checkedAt, boolean newerHistory,
                        String resultStatus, boolean reused, String error, boolean noAiStarted,
                        AiReviewService.DisplayIdentity identity, String templateChecklistUrl) {
        public Entry(Target target, AiReviewService.Preview preview, String phase, boolean selected,
                     boolean rerun, UUID retryToken, String checkedAt, boolean newerHistory,
                     String resultStatus, boolean reused, String error, boolean noAiStarted,
                     AiReviewService.DisplayIdentity identity) {
            this(target, preview, phase, selected, rerun, retryToken, checkedAt, newerHistory,
                resultStatus, reused, error, noAiStarted, identity, null);
        }
        public Entry(Target target, AiReviewService.Preview preview, String phase, boolean selected,
                     boolean rerun, UUID retryToken, String checkedAt, boolean newerHistory,
                     String resultStatus, boolean reused, String error, boolean noAiStarted) {
            this(target, preview, phase, selected, rerun, retryToken, checkedAt, newerHistory,
                resultStatus, reused, error, noAiStarted, null);
        }
        static Entry pending(Target target) {
            return new Entry(target, null, "PREPARING", false, false, null, null, false, null, false, "", true);
        }
        Entry selected(boolean value, boolean rerunValue, UUID retry) {
            return new Entry(target, preview, value ? "PENDING" : phase, value, rerunValue, retry,
                checkedAt, newerHistory, resultStatus, reused, error, noAiStarted, identity, templateChecklistUrl);
        }
        Entry phase(String next) {
            return new Entry(target, preview, next, selected, rerun, retryToken, checkedAt, newerHistory,
                resultStatus, reused, error, noAiStarted, identity, templateChecklistUrl);
        }
        Entry result(AiReviewService.View review, String message) {
            // A status read is always reused; keep the original claim's billing/reuse fact.
            boolean claimReused = Set.of("WAITING", "STARTING").contains(phase) ? reused : review.reused();
            String status = "COMPLETED".equals(review.status()) && review.report() == null ? "FAILED" : review.status();
            return new Entry(target, preview, "RUNNING".equals(status) ? "WAITING" : "DONE", selected,
                rerun, review.retryToken(), checkedAt, newerHistory, status, claimReused, message,
                "UNAVAILABLE".equals(status) || "QUEUE_FULL".equals(review.failureCode()), identity, templateChecklistUrl);
        }
        Entry failed(String message, boolean notStarted) {
            return new Entry(target, preview, "DONE", selected, rerun, retryToken, checkedAt, newerHistory,
                "FAILED", false, message, notStarted, identity, templateChecklistUrl);
        }
        Entry identity(AiReviewService.DisplayIdentity value) {
            return new Entry(target, preview, phase, selected, rerun, retryToken, checkedAt, newerHistory,
                resultStatus, reused, error, noAiStarted, value, templateChecklistUrl);
        }
    }
    public record Data(List<Entry> entries, String mode, boolean includeOutdated, boolean retryAcknowledged, String message,
                       boolean stopRequested) {
        public Data(List<Entry> entries, String mode, boolean includeOutdated, boolean retryAcknowledged, String message) {
            this(entries, mode, includeOutdated, retryAcknowledged, message, false);
        }
        Data entries(List<Entry> next, String message) { return new Data(List.copyOf(next), mode, includeOutdated, retryAcknowledged, message, stopRequested); }
        Data stopRequested(boolean value, String message) { return new Data(entries, mode, includeOutdated, retryAcknowledged, message, value); }
    }
    public record View(UUID id, String state, long version, String updatedAt, List<Entry> entries,
                       int totalPdfs, int preparedPdfs, int uniqueDocuments, int selectedDocuments,
                       int completedDocuments, int pendingDocuments, int reusedDocuments, String message, boolean stopRequested) { }
    private final AiReviewBatchStore store;
    private final AiReviewService reviews;
    private final FileCheckReportRepository checks;
    private final ObjectMapper json;
    private final Clock clock;
    private static final Set<String> PAUSE_CODES = Set.of("RATE_LIMITED", "API_KEY_REJECTED", "NOT_CONFIGURED",
        "QUEUE_FULL", "PROVIDER_TIMEOUT", "PROVIDER_CONNECTION_FAILED", "MODEL_UNAVAILABLE",
        "TEMPLATE_PREPARATION_FAILED", "TEMPLATE_PREPARATION_BUSY", "TEMPLATE_FILE_BUSY", "TEMPLATE_PDF_NOT_READY",
        "PREPARATION_TIME_BUDGET", "PREPARATION_FAILED", "INVALID_TEMPLATE_INSTRUCTIONS", "REVIEW_WORK_BUDGET",
        "TEMPLATE_INSTRUCTION_PAGE_TOO_LARGE", "TEMPLATE_CHECKLIST_CHANGED");

    public AiReviewBatchService(AiReviewBatchStore store, AiReviewService reviews, FileCheckReportRepository checks,
                               ObjectMapper json, Clock clock) {
        this.store = store; this.reviews = reviews; this.checks = checks; this.json = json; this.clock = clock;
    }

    public View prepare(UUID workspace, String subject, List<Target> targets) {
        reviews.requireAdministrator(subject);
        if (targets == null || targets.isEmpty() || targets.size() > 1000 || targets.stream().anyMatch(t -> t == null || t.responseId() == null))
            throw new IllegalArgumentException("Choose between 1 and 1000 PDF artifacts.");
        var distinct = targets.stream().distinct().toList();
        return view(store.create(workspace, subject, new Data(distinct.stream().map(Entry::pending).toList(),
            "ATTENTION", true, false, "Checking current PDFs and saved reviews. No Gemini request has been started.")), subject);
    }

    public View get(UUID workspace, UUID id, String subject) { return view(authorized(workspace, id, subject), subject); }
    public View latest(UUID workspace, String subject) {
        reviews.requireAdministrator(subject);
        return store.running(workspace).or(() -> store.latest(workspace)).map(row -> view(row, subject)).orElse(null);
    }

    public View start(UUID workspace, UUID id, String subject, long version, String mode,
                      boolean includeOutdated, boolean retryAcknowledged) {
        var row = authorized(workspace, id, subject);
        if (!row.state().equals("READY") || row.version() != version) throw conflict("Reload the prepared batch before starting.");
        if (row.updatedAt().isBefore(clock.instant().minus(Duration.ofMinutes(15)))) throw conflict("The preparation expired. Check the PDFs again before starting.");
        if (mode == null || !Set.of("ATTENTION", "ALL").contains(mode)) throw new IllegalArgumentException("Choose a review scope.");
        List<Entry> entries = new ArrayList<>();
        Set<String> leaders = new HashSet<>();
        for (var entry : row.data().entries()) {
            var preview = entry.preview();
            boolean selected = preview != null && (includeOutdated || !preview.outdated())
                && (!preview.category().equals("CLEAN") || mode.equals("ALL"));
            boolean leader = selected && leaders.add(preview.key());
            UUID retry = leader ? preview.retryToken() : null;
            if (retry != null && !retryAcknowledged) throw new IllegalArgumentException("Confirm the additional-token risk before retrying uncertain reviews.");
            entries.add(entry.selected(selected, leader && Set.of("CLEAN", "ISSUES", "INCONCLUSIVE").contains(preview.category()), retry));
        }
        if (leaders.isEmpty()) throw new IllegalArgumentException("No verified documents match this review scope.");
        var data = new Data(List.copyOf(entries), mode, includeOutdated, retryAcknowledged,
            "Reviewing on the server. You can leave this page and return to the saved progress.");
        if (!store.action(row, "RUNNING", data)) throw conflict("Another batch started or the batch changed. Reload its progress.");
        return get(workspace, id, subject);
    }

    public View resume(UUID workspace, UUID id, String subject) {
        var row = authorized(workspace, id, subject);
        if (!row.state().equals("PAUSED")) return view(row, subject);
        if (row.data().entries().stream().noneMatch(e -> e.selected() && e.phase().equals("PENDING")))
            throw conflict("No unstarted documents remain. Prepare a new batch to explicitly retry failed reviews.");
        if (!store.action(row, "RUNNING", row.data().stopRequested(false,
            "Continuing unstarted documents. Failed or uncertain attempts are not automatically retried.")))
            throw conflict("The batch changed. Reload its progress.");
        return get(workspace, id, subject);
    }

    public View stop(UUID workspace, UUID id, String subject) {
        var row = authorized(workspace, id, subject);
        if (Set.of("PAUSED", "COMPLETED").contains(row.state())) return view(row, subject);
        if (!row.state().equals("RUNNING")) throw conflict("Only a running AI Review batch can be stopped.");
        return view(store.requestStop(row), subject);
    }

    public View cancelPreparation(UUID workspace, UUID id, String subject) {
        var row = authorized(workspace, id, subject);
        if (!Set.of("PLANNING", "READY").contains(row.state())) throw conflict("A started batch continues on the server.");
        // An in-flight read may finish, but its CAS cannot revive a cancelled plan.
        if (!store.cancelPreparation(row)) throw conflict("The batch changed. Check its latest status before cancelling.");
        return get(workspace, id, subject);
    }

    /** Feedback for an individual start during a batch; never claim a second provider job. */
    public AiReviewService.View individualDuringBatch(UUID workspace, UUID response, String field, String subject) {
        reviews.requireAdministrator(subject);
        var batch = store.running(workspace).orElse(null);
        if (batch == null) return null;
        var entry = batch.data().entries().stream().filter(e -> e.selected() && e.target().responseId().equals(response)
            && (field == null || field.equals(e.target().fieldId()))).findFirst().orElse(null);
        if (entry != null && entry.phase().equals("WAITING")) return reviews.saved(workspace, response, field, subject);
        throw conflict(entry == null
            ? "An AI Review batch is already running in this workspace. Wait for it to finish before starting another review. No additional AI request was sent."
            : "This PDF is already included in the running AI Review batch. Open the batch progress in Submission review. No additional AI request was sent.");
    }

    @Scheduled(fixedDelayString = "${wildtrack.ai-batch.tick-ms:2000}", initialDelayString = "${wildtrack.ai-batch.initial-delay-ms:2000}")
    public synchronized void tick() {
        var row = store.leaseNext().orElse(null);
        if (row == null) return;
        try {
            reviews.requireAdministrator(row.subject());
            if (row.state().equals("PLANNING")) planOne(row); else reviewOne(row);
        } catch (org.springframework.security.access.AccessDeniedException removed) {
            pauseOwned(row, "Administrator access changed. No further reviews will start.");
        } catch (RuntimeException failure) {
            // Do not expose URLs, credentials, upstream bodies or document text in unclassified failures.
            pauseOwned(row, "The batch could not advance. Check saved reviews before continuing.");
        } finally {
            // A concurrent stop invalidates this worker's version, but must not strand its lease.
            store.releaseLease(row);
        }
    }

    private void pauseOwned(AiReviewBatchStore.Row row, String message) {
        store.find(row.id(), row.workspaceId()).filter(current -> java.util.Objects.equals(row.leaseToken(), current.leaseToken()))
            .ifPresent(current -> store.saveLeased(current, "PAUSED", current.data().entries(current.data().entries(), message)));
    }

    private void planOne(AiReviewBatchStore.Row row) {
        List<Entry> entries = new ArrayList<>(row.data().entries());
        int index = indexOf(entries, "PREPARING");
        if (index < 0) { store.saveLeased(row, "READY", row.data()); return; }
        var entry = entries.get(index);
        var identity = entry.identity();
        try {
            identity = reviews.displayIdentity(row.workspaceId(), entry.target().responseId(), entry.target().fieldId(), row.subject());
            var p = reviews.preview(row.workspaceId(), entry.target().responseId(), entry.target().fieldId(), row.subject());
            identity = AiReviewService.DisplayIdentity.from(p);
            var report = checks.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(
                row.workspaceId(), p.responseId().toString(), p.fieldId().endsWith(":legacy") ? null : p.fieldId()).orElse(null);
            boolean gap = false;
            String checkedAt = report == null ? null : report.getCheckedAt().toString();
            if (report != null && p.generatedAt() != null && p.outdated() && report.getSourceUrl().equals(p.sourceUrl())) {
                try {
                    var check = json.readValue(report.getReportJson(), FileCheckResponse.class);
                    gap = check.metadata() != null && check.metadata().modifiedTime() != null
                        && check.metadata().modifiedTime().toInstant().isAfter(java.time.Instant.parse(p.generatedAt()));
                } catch (Exception ignored) { /* Unavailable legacy metadata cannot prove a file update. */ }
            }
            entries.set(index, new Entry(entry.target(), p, "PREPARED", false, false, null, checkedAt, gap, null, false, "", true));
        } catch (AiReviewService.TemplateChecklistApprovalRequired required) {
            entries.set(index, new Entry(entry.target(), null, "SETUP_REQUIRED", false, false, null, null,
                false, "TEMPLATE_APPROVAL_REQUIRED", false, required.getReason(), true, identity, required.templateUrl()));
        } catch (ResponseStatusException denied) {
            if (denied instanceof AiReviewService.DrivePreparationFailure drive && drive.identity() != null) identity = drive.identity();
            entries.set(index, new Entry(entry.target(), null, "UNVERIFIED", false, false, null, null, false, null, false,
                denied.getReason() == null ? "This PDF could not be verified. No AI review was started." : denied.getReason(), true));
        } catch (IllegalArgumentException invalid) {
            entries.set(index, new Entry(entry.target(), null, "UNVERIFIED", false, false, null, null, false, null, false,
                "This artifact is unavailable or is not a readable PDF eligible for AI Review. No AI review was started.", true));
        }
        entries.set(index, entries.get(index).identity(identity));
        boolean ready = indexOf(entries, "PREPARING") < 0;
        store.saveLeased(row, ready ? "READY" : "PLANNING", row.data().entries(entries,
            ready ? "Current contents and review settings verified. Choose which documents to review." : row.data().message()));
    }

    private void reviewOne(AiReviewBatchStore.Row row) {
        List<Entry> entries = new ArrayList<>(row.data().entries());
        int index = -1;
        for (int i = 0; i < entries.size(); i++) if (entries.get(i).selected() && Set.of("WAITING", "STARTING").contains(entries.get(i).phase())) { index = i; break; }
        if (index < 0 && row.data().stopRequested()) {
            boolean pending = entries.stream().anyMatch(e -> e.selected() && e.phase().equals("PENDING"));
            store.saveLeased(row, pending ? "PAUSED" : "COMPLETED", row.data().entries(entries,
                pending ? stoppedMessage() : finishedMessage(entries)));
            return;
        }
        if (index < 0) for (int i = 0; i < entries.size(); i++) if (entries.get(i).selected() && entries.get(i).phase().equals("PENDING")) { index = i; break; }
        if (index < 0) {
            store.saveLeased(row, "COMPLETED", row.data().entries(entries, finishedMessage(entries)));
            return;
        }
        Entry entry = entries.get(index);
        boolean starting = entry.phase().equals("PENDING");
        if (starting) {
            entries.set(index, entry.phase("STARTING"));
            row = store.checkpoint(row, row.data().entries(entries, row.data().message())).orElse(null);
            if (row == null) return;
        }
        String next = "RUNNING";
        try {
            AiReviewService.View review = starting
                ? reviews.reviewPlanned(row.workspaceId(), entry.target().responseId(), entry.target().fieldId(), row.subject(),
                    entry.retryToken() != null && row.data().retryAcknowledged(), entry.retryToken(), entry.rerun(),
                    entry.preview().key(), entry.preview().jobToken())
                : reviews.saved(row.workspaceId(), entry.target().responseId(), entry.target().fieldId(), row.subject());
            String message = review.status().equals("RUNNING") ? ""
                : review.status().equals("COMPLETED") && review.report() == null
                ? "No saved AI Review was produced for this document. Check saved reviews before retrying."
                : review.status().equals("COMPLETED") && review.report() != null
                && review.report().outcome() == AiReviewProvider.ReviewOutcome.INCONCLUSIVE
                ? review.report().verificationNotes().isEmpty()
                    ? "Review finished with limited coverage. Open the saved review to see the supported observations."
                    : "Review finished with checks needing manual verification. Open the saved review to inspect the cited areas."
                : review.status().equals("COMPLETED") ? "" : review.message();
            entries.set(index, entry.result(review, message));
            if (!starting && Set.of("NOT_REVIEWED", "OUTDATED").contains(review.status())) next = "PAUSED";
            if (review.status().equals("UNAVAILABLE") || PAUSE_CODES.contains(review.failureCode() == null ? "" : review.failureCode())) next = "PAUSED";
        } catch (AiReviewService.DrivePreparationFailure beforeClaim) {
            entries.set(index, entry.failed(beforeClaim.getReason(), true)
                .identity(beforeClaim.identity() == null ? entry.identity() : beforeClaim.identity()));
            // A different submitted copy may still be accessible. Its normal job claim deduplicates Gemini.
            transferUnclaimedIntent(entries, entry);
            if (Set.of(com.capvault.backend.drive.GoogleDriveUnavailableException.Kind.CONFIGURATION,
                    com.capvault.backend.drive.GoogleDriveUnavailableException.Kind.RATE_LIMIT).contains(beforeClaim.kind())) next = "PAUSED";
        } catch (ResponseStatusException uncertain) {
            // The final source check can throw after the executor has already started Gemini.
            entries.set(index, entry.failed(uncertain.getReason() == null
                ? "The saved review status could not be confirmed. Check saved reviews before retrying." : uncertain.getReason(), false));
            next = "PAUSED";
        } catch (IllegalArgumentException invalid) {
            entries.set(index, entry.failed("This artifact could not be processed. Check saved reviews before retrying.", false));
            next = "PAUSED";
        }
        boolean stopped = next.equals("RUNNING") && row.data().stopRequested()
            && entries.stream().noneMatch(e -> e.selected() && Set.of("STARTING", "WAITING").contains(e.phase()));
        if (stopped) next = entries.stream().anyMatch(e -> e.selected() && e.phase().equals("PENDING")) ? "PAUSED" : "COMPLETED";
        String message = stopped ? next.equals("PAUSED") ? stoppedMessage() : finishedMessage(entries)
            : next.equals("PAUSED") ? "Batch paused. Continue unstarted documents or explicitly prepare retries; uncertain requests are never automatically repeated." : row.data().message();
        store.saveLeased(row, next, row.data().entries(entries, message));
    }

    private AiReviewBatchStore.Row authorized(UUID workspace, UUID id, String subject) {
        reviews.requireAdministrator(subject);
        return store.find(id, workspace).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Batch not found in this workspace."));
    }
    private static void transferUnclaimedIntent(List<Entry> entries, Entry failed) {
        if (!failed.rerun() && failed.retryToken() == null) return;
        for (int i = 0; i < entries.size(); i++) {
            var next = entries.get(i);
            if (next.selected() && next.phase().equals("PENDING") && next.preview() != null
                    && next.preview().key().equals(failed.preview().key())) {
                // The Drive failure occurred before claim, so the explicitly approved intent/token is unconsumed.
                entries.set(i, next.selected(true, failed.rerun(), failed.retryToken()));
                return;
            }
        }
    }
    private static int indexOf(List<Entry> entries, String phase) {
        for (int i = 0; i < entries.size(); i++) if (entries.get(i).phase().equals(phase)) return i;
        return -1;
    }
    private static String stoppedMessage() {
        return "AI Review stopped. Completed reviews are saved. Continue to review the unstarted documents.";
    }
    private static String finishedMessage(List<Entry> entries) {
        var selected = entries.stream().filter(Entry::selected).toList();
        if (selected.isEmpty()) return "AI Review batch finished. No documents were selected.";
        if (entries.stream().anyMatch(AiReviewBatchService::technicalFailure))
            return "AI Review batch finished with items needing attention. Open the affected PDFs below.";
        if (selected.stream().noneMatch(e -> "COMPLETED".equals(e.resultStatus())))
            return "AI Review batch finished. No reviews were produced; check the file-access notices below.";
        return "AI Review batch finished. Saved results are available.";
    }

    private static boolean technicalFailure(Entry entry) {
        if ("TEMPLATE_APPROVAL_REQUIRED".equals(entry.resultStatus())) return false;
        // Completion describes execution; an assessment notice is not a failed request.
        if ("COMPLETED".equals(entry.resultStatus())) return false;
        if ("UNCERTAIN".equals(entry.resultStatus())) return true;
        if (entry.noAiStarted() && entry.error().startsWith(
                "The submitted Drive PDF could not be opened. Google Drive reported a file-access or download restriction."))
            return false;
        return !entry.error().isBlank() || entry.selected();
    }


    private View view(AiReviewBatchStore.Row row, String subject) {
        var entries = row.data().entries().stream().map(entry -> restoredIdentity(row.workspaceId(), entry, subject)).toList();
        Map<String, List<Entry>> groups = new LinkedHashMap<>();
        entries.stream().filter(e -> e.preview() != null).forEach(e -> groups.computeIfAbsent(e.preview().key(), k -> new ArrayList<>()).add(e));
        var selected = groups.values().stream().filter(g -> g.stream().anyMatch(Entry::selected)).toList();
        int complete = (int) selected.stream().filter(g -> g.stream().filter(Entry::selected).allMatch(e -> e.phase().equals("DONE"))).count();
        int pending = (int) selected.stream().filter(g -> g.stream().anyMatch(e -> e.selected() && e.phase().equals("PENDING"))).count();
        int reused = (int) selected.stream().filter(g -> g.stream().filter(Entry::selected).allMatch(e -> e.phase().equals("DONE") && "COMPLETED".equals(e.resultStatus()) && e.reused())).count();
        return new View(row.id(), row.state(), row.version(), row.updatedAt().toString(), entries, entries.size(),
            (int) entries.stream().filter(e -> !e.phase().equals("PREPARING")).count(), groups.size(), selected.size(), complete, pending, reused, row.state().equals("COMPLETED") ? finishedMessage(entries) : row.data().message(), row.data().stopRequested());
    }
    private Entry restoredIdentity(UUID workspace, Entry entry, String subject) {
        if (entry.identity() != null) return entry;
        if (entry.preview() != null) return entry.identity(AiReviewService.DisplayIdentity.from(entry.preview()));
        if (!entry.phase().equals("UNVERIFIED")) return entry;
        try {
            var current = reviews.displayIdentity(workspace, entry.target().responseId(), entry.target().fieldId(), subject);
            // Old preflights did not save their source: current labels cannot prove the historical failed URL.
            return current == null ? entry : entry.identity(current.withoutSource());
        } catch (ResponseStatusException | IllegalArgumentException | org.springframework.security.access.AccessDeniedException unavailable) {
            return entry;
        }
    }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
