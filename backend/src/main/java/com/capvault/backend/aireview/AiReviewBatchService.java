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
                        String resultStatus, boolean reused, String error, boolean noAiStarted) {
        static Entry pending(Target target) {
            return new Entry(target, null, "PREPARING", false, false, null, null, false, null, false, "", true);
        }
        Entry selected(boolean value, boolean rerunValue, UUID retry) {
            return new Entry(target, preview, value ? "PENDING" : phase, value, rerunValue, retry,
                checkedAt, newerHistory, resultStatus, reused, error, noAiStarted);
        }
        Entry phase(String next) {
            return new Entry(target, preview, next, selected, rerun, retryToken, checkedAt, newerHistory,
                resultStatus, reused, error, noAiStarted);
        }
        Entry result(AiReviewService.View review, String message) {
            return new Entry(target, preview, "RUNNING".equals(review.status()) ? "WAITING" : "DONE", selected,
                rerun, review.retryToken(), checkedAt, newerHistory, review.status(), review.reused(), message,
                "UNAVAILABLE".equals(review.status()) || "QUEUE_FULL".equals(review.failureCode()));
        }
        Entry failed(String message, boolean notStarted) {
            return new Entry(target, preview, "DONE", selected, rerun, retryToken, checkedAt, newerHistory,
                "FAILED", false, message, notStarted);
        }
    }
    public record Data(List<Entry> entries, String mode, boolean includeOutdated, boolean retryAcknowledged, String message) {
        Data entries(List<Entry> next, String message) { return new Data(List.copyOf(next), mode, includeOutdated, retryAcknowledged, message); }
    }
    public record View(UUID id, String state, long version, String updatedAt, List<Entry> entries,
                       int totalPdfs, int preparedPdfs, int uniqueDocuments, int selectedDocuments,
                       int completedDocuments, int pendingDocuments, int reusedDocuments, String message) { }
    private final AiReviewBatchStore store;
    private final AiReviewService reviews;
    private final FileCheckReportRepository checks;
    private final ObjectMapper json;
    private final Clock clock;
    private static final Set<String> PAUSE_CODES = Set.of("RATE_LIMITED", "API_KEY_REJECTED", "NOT_CONFIGURED",
        "QUEUE_FULL", "PROVIDER_TIMEOUT", "PROVIDER_CONNECTION_FAILED", "MODEL_UNAVAILABLE");

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
            "ATTENTION", true, false, "Checking current PDFs and saved reviews. No Gemini request has been started.")));
    }

    public View get(UUID workspace, UUID id, String subject) { return view(authorized(workspace, id, subject)); }
    public View latest(UUID workspace, String subject) {
        reviews.requireAdministrator(subject);
        return store.running(workspace).or(() -> store.latest(workspace)).map(this::view).orElse(null);
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
        if (!row.state().equals("PAUSED")) return view(row);
        if (row.data().entries().stream().noneMatch(e -> e.selected() && e.phase().equals("PENDING")))
            throw conflict("No unstarted documents remain. Prepare a new batch to explicitly retry failed reviews.");
        if (!store.action(row, "RUNNING", row.data().entries(row.data().entries(),
            "Continuing unstarted documents. Failed or uncertain attempts are not automatically retried.")))
            throw conflict("The batch changed. Reload its progress.");
        return get(workspace, id, subject);
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
        try {
            var p = reviews.preview(row.workspaceId(), entry.target().responseId(), entry.target().fieldId(), row.subject());
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
        } catch (ResponseStatusException denied) {
            entries.set(index, new Entry(entry.target(), null, "UNVERIFIED", false, false, null, null, false, null, false,
                denied.getReason() == null ? "This PDF could not be verified. No AI review was started." : denied.getReason(), true));
        } catch (IllegalArgumentException invalid) {
            entries.set(index, new Entry(entry.target(), null, "UNVERIFIED", false, false, null, null, false, null, false,
                "This artifact is unavailable or is not a readable PDF eligible for AI Review. No AI review was started.", true));
        }
        boolean ready = indexOf(entries, "PREPARING") < 0;
        store.saveLeased(row, ready ? "READY" : "PLANNING", row.data().entries(entries,
            ready ? "Current contents and review settings verified. Choose which documents to review." : row.data().message()));
    }

    private void reviewOne(AiReviewBatchStore.Row row) {
        List<Entry> entries = new ArrayList<>(row.data().entries());
        int index = -1;
        for (int i = 0; i < entries.size(); i++) if (entries.get(i).selected() && Set.of("WAITING", "STARTING", "PENDING").contains(entries.get(i).phase())) { index = i; break; }
        if (index < 0) { store.saveLeased(row, "COMPLETED", row.data().entries(entries, "AI Review batch finished. Saved results are available.")); return; }
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
            String message = review.status().equals("COMPLETED") && review.report() != null
                && review.report().outcome() == AiReviewProvider.ReviewOutcome.INCONCLUSIVE ? "This review is inconclusive; it does not establish a clean result."
                : review.status().equals("COMPLETED") ? "" : review.message();
            entries.set(index, entry.result(review, message));
            if (!starting && Set.of("NOT_REVIEWED", "OUTDATED").contains(review.status())) next = "PAUSED";
            if (review.status().equals("UNAVAILABLE") || PAUSE_CODES.contains(review.failureCode() == null ? "" : review.failureCode())) next = "PAUSED";
        } catch (ResponseStatusException beforeClaim) {
            entries.set(index, entry.failed(beforeClaim.getReason() == null ? "The PDF could not be verified. No AI review was started." : beforeClaim.getReason(), true));
            if (beforeClaim.getStatusCode().value() == 503) next = "PAUSED";
        } catch (IllegalArgumentException invalid) {
            entries.set(index, entry.failed("This PDF could not be prepared for AI Review. No AI review was started.", true));
        }
        String message = next.equals("PAUSED") ? "Batch paused. Continue unstarted documents or explicitly prepare retries; uncertain requests are never automatically repeated." : row.data().message();
        store.saveLeased(row, next, row.data().entries(entries, message));
    }

    private AiReviewBatchStore.Row authorized(UUID workspace, UUID id, String subject) {
        reviews.requireAdministrator(subject);
        return store.find(id, workspace).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Batch not found in this workspace."));
    }
    private static int indexOf(List<Entry> entries, String phase) {
        for (int i = 0; i < entries.size(); i++) if (entries.get(i).phase().equals(phase)) return i;
        return -1;
    }
    private View view(AiReviewBatchStore.Row row) {
        var entries = row.data().entries();
        Map<String, List<Entry>> groups = new LinkedHashMap<>();
        entries.stream().filter(e -> e.preview() != null).forEach(e -> groups.computeIfAbsent(e.preview().key(), k -> new ArrayList<>()).add(e));
        var selected = groups.values().stream().filter(g -> g.stream().anyMatch(Entry::selected)).toList();
        int complete = (int) selected.stream().filter(g -> g.stream().filter(Entry::selected).allMatch(e -> e.phase().equals("DONE"))).count();
        int pending = (int) selected.stream().filter(g -> g.stream().anyMatch(e -> e.selected() && e.phase().equals("PENDING"))).count();
        int reused = (int) selected.stream().filter(g -> g.stream().filter(Entry::selected).allMatch(e -> e.phase().equals("DONE") && e.reused())).count();
        return new View(row.id(), row.state(), row.version(), row.updatedAt().toString(), entries, entries.size(),
            (int) entries.stream().filter(e -> !e.phase().equals("PREPARING")).count(), groups.size(), selected.size(), complete, pending, reused, row.data().message());
    }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
