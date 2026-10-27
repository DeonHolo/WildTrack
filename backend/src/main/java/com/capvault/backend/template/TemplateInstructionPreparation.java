package com.capvault.backend.template;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import com.capvault.backend.aireview.AiReviewProvider;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;

/** Invoked only after AI-cost confirmation; PDF status reads and prechecks never invoke Gemini. */
@Service
public class TemplateInstructionPreparation {
    public static final int PAGES_PER_REQUEST = 16;
    private final TemplatePdfStore pdfs;
    private final TemplateInstructionStore store;
    private final AiReviewProvider provider;

    public TemplateInstructionPreparation(TemplatePdfStore pdfs, TemplateInstructionStore store, AiReviewProvider provider) {
        this.pdfs = pdfs; this.store = store; this.provider = provider;
    }

    public Prepared prepare(UUID workspaceId, UUID templateId, String expectedSourceHash, UUID retryToken) {
        return prepare(workspaceId, templateId, expectedSourceHash, retryToken, () -> { });
    }

    public Prepared prepare(UUID workspaceId, UUID templateId, String expectedSourceHash, UUID retryToken,
            Runnable validateCurrent) {
        validateCurrent.run();
        var current = pdfs.current(workspaceId, templateId);
        if (!current.sourceSha256().equals(expectedSourceHash)) throw new Failure("TEMPLATE_CHANGED");
        if (!"READY".equals(current.state())) throw new Failure("TEMPLATE_PDF_NOT_READY");
        var saved = store.find(current.versionId()).orElse(null);
        var pdf = pdfs.readPdf(workspaceId, templateId, current.versionId());
        if (saved != null && "READY".equals(saved.state())) return prepared(saved, pdf);
        if (!provider.supportsTemplateInstructions() || !provider.isConfigured()) throw new Failure("NOT_CONFIGURED");
        var state = store.claim(current.versionId(), provider.cacheVersion(), retryToken)
            .orElseThrow(() -> new Failure(saved != null && "FAILED".equals(saved.state())
                ? "TEMPLATE_PREPARATION_FAILED" : "TEMPLATE_PREPARATION_BUSY"));
        try {
            List<String> pages = pageTexts(pdf.bytes());
            if (pages.isEmpty() || pages.size() > 1000) throw new Failure("TEMPLATE_PDF_UNSUPPORTED");
            long started = System.nanoTime();
            int width = PAGES_PER_REQUEST;
            int requests = 0;
            while (state.completedPage() < pages.size()) {
                if (Thread.currentThread().isInterrupted()) throw new Failure("OUTCOME_UNKNOWN");
                if (TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started) >= 900 || requests >= 64)
                    throw new Failure("PREPARATION_TIME_BUDGET");
                var latest = pdfs.current(workspaceId, templateId);
                if (!latest.versionId().equals(current.versionId())) throw new Failure("TEMPLATE_CHANGED");
                int first = state.completedPage() + 1;
                int last = Math.min(pages.size(), first + width - 1);
                validateCurrent.run();
                if (!store.startRequest(state)) throw new Failure("TEMPLATE_PREPARATION_BUSY");
                List<TemplateInstructionProtocol.Draft> proposed;
                requests++;
                try {
                    proposed = provider.prepareInstructions(new TemplateInstructionGateway.Input(current.versionId(),
                        pdf.bytes(), pdf.sha256(), pages, first, last));
                } catch (TemplateInstructionGateway.OutputLimit limit) {
                    // A definitive output limit permits a smaller new request. A timeout
                    // or malformed/unsupported quotation never triggers an automatic paid retry.
                    int actualPages = last - first + 1;
                    if (actualPages == 1) throw new Failure("TEMPLATE_INSTRUCTION_PAGE_TOO_LARGE");
                    width = Math.max(1, actualPages / 2);
                    continue;
                }
                // Validate here too: a test double or another provider must obey the same boundary.
                var merged = new ArrayList<>(state.items());
                for (var item : proposed) {
                    if (item.page() < first || item.page() > last || merged.contains(item))
                        throw new Failure("INVALID_TEMPLATE_INSTRUCTIONS");
                    merged.add(item);
                }
                boolean done = last == pages.size();
                if (!store.checkpoint(state, last, merged, done)) throw new Failure("TEMPLATE_PREPARATION_BUSY");
                state = store.find(current.versionId()).orElseThrow();
            }
            if (!pdfs.current(workspaceId, templateId).versionId().equals(current.versionId())) throw new Failure("TEMPLATE_CHANGED");
            return prepared(state, pdf);
        } catch (RuntimeException failure) {
            store.fail(state, failure instanceof Failure known ? known.code() : "PREPARATION_FAILED");
            throw failure;
        }
    }

    private static Prepared prepared(TemplateInstructionStore.State state, TemplatePdfStore.Pdf pdf) {
        var instructions = new ArrayList<Instruction>();
        for (int i = 0; i < state.items().size(); i++) instructions.add(new Instruction("T" + (i + 1), state.items().get(i)));
        return new Prepared(state.versionId(), pdf.sha256(), pdf.bytes(), List.copyOf(instructions));
    }

    public static List<String> pageTexts(byte[] pdf) {
        try (var document = Loader.loadPDF(pdf)) {
            var pages = new ArrayList<String>();
            var stripper = new PDFTextStripper();
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                stripper.setStartPage(page); stripper.setEndPage(page);
                pages.add(stripper.getText(document));
            }
            return List.copyOf(pages);
        } catch (java.io.IOException failure) { throw new Failure("TEMPLATE_PDF_UNREADABLE"); }
    }

    public record Instruction(String id, TemplateInstructionProtocol.Draft source) { }
    public record Prepared(UUID versionId, String pdfSha256, byte[] pdf, List<Instruction> instructions) { }
    public static class Failure extends RuntimeException {
        private final String code;
        public Failure(String code) { super("Template review preparation did not finish: " + code); this.code = code; }
        public String code() { return code; }
    }
}
