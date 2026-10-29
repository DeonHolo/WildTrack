package com.capvault.backend.aireview;

import static com.capvault.backend.aireview.AiReviewProvider.*;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.capvault.backend.filecheck.PdfInspection;
import com.capvault.backend.template.TemplateInstructionPreparation;
import com.capvault.backend.template.TemplateChecklistService;
import com.capvault.backend.template.TemplatePdfStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;

/** Complete-document boundary: stopping a batch never interrupts a document's instruction groups. */
@Service
public class AiReviewInstructionsWorkflow {
    static final int GROUP_SIZE = 16;
    static final int MAX_REQUESTS_PER_ATTEMPT = 32;
    private final AiReviewProvider provider;
    private final TemplateChecklistService checklists;
    private final TemplatePdfStore pdfs;
    private final AiReviewStore jobs;
    private final AiReviewPassStore passes;
    private final ObjectMapper json;
    private final java.util.concurrent.ScheduledExecutorService heartbeats = Executors.newSingleThreadScheduledExecutor(r -> {
        var thread = new Thread(r, "ai-review-lease"); thread.setDaemon(true); return thread;
    });

    public AiReviewInstructionsWorkflow(AiReviewProvider provider, TemplateChecklistService checklists,
            TemplatePdfStore pdfs, AiReviewStore jobs,
            AiReviewPassStore passes, ObjectMapper json) {
        this.provider = provider; this.checklists = checklists;
        this.pdfs = pdfs; this.jobs = jobs; this.passes = passes; this.json = json;
    }

    public Result review(AiReviewStore.Job job, UUID acknowledgedRetry, UUID workspaceId, UUID templateId,
            String templateHash, Input input, PdfInspection inspection, Runnable validateCurrent) {
        jobs.heartbeat(job);
        var lease = heartbeats.scheduleAtFixedRate(() -> {
            try { jobs.heartbeat(job); } catch (RuntimeException ignored) { /* The worker checks ownership before each pass. */ }
        }, 30, 30, TimeUnit.SECONDS);
        try {
            validateCurrent.run();
            var pdfState = pdfs.current(workspaceId, templateId);
            if (pdfState.pages() != null && inspection.pageCount() + pdfState.pages() > 1000)
                throw new GeminiAiReviewProvider.Failure("COMBINED_PDF_LIMIT");
            var approved = checklists.approved(workspaceId, templateId, templateHash);
            var template = new TemplateInstructionPreparation.Prepared(approved.versionId(), approved.pdfSha256(),
                approved.pdf(), approved.instructions());
            Runnable validateApproval = () -> {
                validateCurrent.run();
                if (!approved.fingerprint().equals(checklists.fingerprint(workspaceId, templateId)))
                    throw new TemplateInstructionPreparation.Failure("TEMPLATE_CHECKLIST_CHANGED");
            };
            var authoritativeInput = new Input(input.idempotencyKey(), input.pdf(), input.extractedText(), input.systemInstruction(),
                input.deliverableTitle(), input.instructions(), String.join("\n", TemplateInstructionPreparation.pageTexts(template.pdf())));
            validateApproval.run();
            passes.copyCompleted(job, acknowledgedRetry);
            var results = new ArrayList<Result>();
            int groups = Math.max(1, (template.instructions().size() + GROUP_SIZE - 1) / GROUP_SIZE);
            int requests = 0;
            long started = System.nanoTime();
            for (int index = 0; index < groups; index++) {
                int first = index * GROUP_SIZE;
                var group = template.instructions().subList(first, Math.min(first + GROUP_SIZE, template.instructions().size()));
                String fingerprint;
                try { fingerprint = AiReviewService.sha256(json.writeValueAsBytes(List.of(AiReviewInstructionProtocol.VERSION,
                    template.versionId(), template.pdfSha256(), group, index == 0))); }
                catch (Exception failure) { throw new IllegalStateException("AI review pass fingerprint failed."); }
                var cached = passes.completed(job, index + 1, fingerprint);
                if (cached.isPresent()) { results.add(cached.get()); continue; }
                if (requests >= MAX_REQUESTS_PER_ATTEMPT || TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started) >= 1200)
                    throw new GeminiAiReviewProvider.Failure("REVIEW_WORK_BUDGET");
                validateApproval.run();
                jobs.heartbeat(job);
                if (Thread.currentThread().isInterrupted()) throw new GeminiAiReviewProvider.Failure("PROVIDER_OUTCOME_UNKNOWN");
                passes.start(job, index + 1, fingerprint);
                requests++;
                var raw = provider.assessInstructions(new InstructionInput(authoritativeInput, template, List.copyOf(group), index == 0));
                validateApproval.run();
                jobs.heartbeat(job);
                var grounded = AiReviewService.groundInstructions(raw, authoritativeInput, inspection, group);
                if (grounded.coverage() == null || grounded.coverage().criteria().size() != group.size())
                    throw new GeminiAiReviewProvider.Failure("INVALID_RESPONSE");
                passes.complete(job, index + 1, fingerprint, grounded);
                results.add(grounded);
            }
            validateApproval.run();
            var combined = combine(results);
            var expectedIds = template.instructions().stream().map(TemplateInstructionPreparation.Instruction::id).toList();
            if (!combined.coverage().criteria().stream().map(CriterionAssessment::id).toList().equals(expectedIds))
                throw new GeminiAiReviewProvider.Failure("INVALID_RESPONSE");
            return combined;
        } finally { lease.cancel(false); }
    }

    static Result combine(List<Result> results) {
        var findings = new ArrayList<Finding>();
        var missing = new ArrayList<MissingRequiredSection>();
        var checks = new ArrayList<VerifiedCheck>();
        var notes = new ArrayList<Finding>();
        var criteria = new ArrayList<CriterionAssessment>();
        var limitations = new java.util.LinkedHashSet<String>();
        DocumentOverview overview = null;
        for (var result : results) {
            int f = findings.size(), m = missing.size(), c = checks.size(), n = notes.size();
            if (overview == null) overview = result.documentOverview();
            for (var row : result.coverage().criteria()) criteria.add(new CriterionAssessment(row.id(), row.requirement(), row.source(), row.status(),
                offset(row.verifiedCheckIndexes(), c), offset(row.findingIndexes(), f), offset(row.missingSectionIndexes(), m),
                offset(row.verificationNoteIndexes(), n), row.assessment(), row.explanation(), row.documentEvidence(), row.location(), row.title()));
            findings.addAll(result.findings()); missing.addAll(result.missingRequiredSections()); checks.addAll(result.verifiedChecks());
            notes.addAll(result.verificationNotes()); limitations.addAll(result.limitations());
        }
        boolean attention = !findings.isEmpty() || !missing.isEmpty() || criteria.stream().anyMatch(c -> c.assessment() == CriterionAssessmentLabel.NEEDS_ATTENTION);
        boolean manual = criteria.isEmpty() || !notes.isEmpty() || criteria.stream().anyMatch(c -> c.assessment() == CriterionAssessmentLabel.CHECK_MANUALLY);
        boolean limited = criteria.stream().anyMatch(c -> c.assessment() == CriterionAssessmentLabel.UNVERIFIED);
        ReviewOutcome outcome = attention ? ReviewOutcome.ISSUES_IDENTIFIED : manual || limited ? ReviewOutcome.INCONCLUSIVE : ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS;
        String summary = attention ? "The review identified items needing attention." : manual
            ? "The review includes items to check in the original PDF." : limited
                ? "Some positive AI observations could not be verified. See Review limits for details."
                : "No actionable issues were identified in the assessed instructions.";
        return new Result(summary, List.copyOf(findings), List.copyOf(missing), List.copyOf(limitations),
            "Use the cited PDF evidence to make the review decision.", List.copyOf(checks), List.copyOf(notes), outcome,
            new ReviewCoverage(List.copyOf(criteria), 0, results.size(), null,
                "Assessment uses the fixed instructions saved for this official template version. It remains advisory."), overview);
    }
    private static List<Integer> offset(List<Integer> values, int offset) {
        return values.stream().map(value -> value + offset).toList();
    }
    @PreDestroy void close() { heartbeats.shutdownNow(); }
}
