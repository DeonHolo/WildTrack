package com.capvault.backend.template;

import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import org.apache.pdfbox.Loader;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;

@Service
public class TemplatePdfPreparation {
    private static final int MAX_PDF_BYTES = 26_214_400;
    private final TemplatePdfStore store;
    private final boolean enabled;
    private final AtomicBoolean running = new AtomicBoolean();
    private final ExecutorService executor = Executors.newSingleThreadExecutor(task -> {
        Thread thread = new Thread(task, "template-pdf-preparation");
        thread.setDaemon(true);
        return thread;
    });

    public TemplatePdfPreparation(TemplatePdfStore store,
        @Value("${capvault.templates.pdf-preparation-enabled:true}") boolean enabled) {
        this.store = store;
        this.enabled = enabled;
    }

    @Scheduled(fixedDelayString = "${capvault.templates.pdf-poll-ms:3000}")
    public void tick() {
        if (!enabled || !running.compareAndSet(false, true)) return;
        try {
            executor.execute(() -> {
                try { prepareNext(); } finally { running.set(false); }
            });
        } catch (RuntimeException exception) {
            running.set(false);
            throw exception;
        }
    }

    public void prepareNext() {
        store.claimNext().ifPresent(source -> {
            try {
                if (!"application/pdf".equalsIgnoreCase(source.contentType())) {
                    store.fail(source, "Upload this template as a PDF to prepare its preview and AI Review instructions. The original file is retained.");
                    return;
                }
                byte[] pdf = source.bytes();
                if (pdf.length == 0 || pdf.length > MAX_PDF_BYTES) {
                    throw new IllegalArgumentException("Template PDF size is unsupported.");
                }
                int pages;
                try (var document = Loader.loadPDF(pdf)) {
                    pages = document.getNumberOfPages();
                    if (pages < 1 || pages > 1000 || document.isEncrypted()) {
                        throw new IllegalArgumentException("Template PDF cannot be prepared.");
                    }
                }
                String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(pdf));
                store.complete(source, pdf, hash, pages);
            } catch (Exception exception) {
                store.fail(source, "The template PDF could not be prepared. Retry preparation or upload a valid, unencrypted PDF.");
            }
        });
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }
}
