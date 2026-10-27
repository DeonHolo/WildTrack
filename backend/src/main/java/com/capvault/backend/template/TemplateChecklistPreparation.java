package com.capvault.backend.template;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

/** A queued job is claimed in a short transaction; provider work happens outside it. */
@Service
public class TemplateChecklistPreparation {
    private final TemplateChecklistStore store;
    private final TemplateInstructionPreparation preparation;
    private final boolean enabled;
    private final AtomicBoolean running = new AtomicBoolean();
    private final ExecutorService executor = Executors.newSingleThreadExecutor(task -> {
        var thread = new Thread(task, "template-checklist-preparation");
        thread.setDaemon(true);
        return thread;
    });
    public TemplateChecklistPreparation(TemplateChecklistStore store, TemplateInstructionPreparation preparation,
            @Value("${capvault.templates.checklist-preparation-enabled:true}") boolean enabled) {
        this.store = store;
        this.preparation = preparation;
        this.enabled = enabled;
    }
    @Scheduled(fixedDelayString="${capvault.templates.checklist-preparation-delay-ms:5000}")
    public void scheduled() {
        if (!enabled || !running.compareAndSet(false, true)) return;
        try {
            executor.execute(() -> {
                try { prepareNext(); } finally { running.set(false); }
            });
        } catch (RuntimeException failure) {
            running.set(false);
            throw failure;
        }
    }
    public boolean prepareNext() {
        var job = store.claim().orElse(null);
        if (job == null) return false;
        try {
            var prepared = preparation.prepare(job.workspace(), job.template(), job.sourceHash(), job.retry(),
                () -> store.heartbeat(job));
            store.heartbeat(job);
            store.finish(job, prepared.instructions().stream().map(TemplateInstructionPreparation.Instruction::source).toList());
        } catch (RuntimeException e) {
            store.fail(job, e instanceof TemplateInstructionPreparation.Failure f ? f.code() : "PREPARATION_FAILED");
        }
        return true;
    }
    @PreDestroy void shutdown() { executor.shutdownNow(); }
}
