package com.capvault.backend.template;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:template-instruction-store;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;DEFAULT_NULL_ORDERING=HIGH",
    "capvault.templates.pdf-preparation-enabled=false"
})
class TemplateInstructionStoreTest {
    private static final UUID WORKSPACE = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final String CONTEXT = "a".repeat(64);
    private static final String OTHER_CONTEXT = "b".repeat(64);
    private static final String PDF_HASH = "c".repeat(64);
    @Autowired TemplateInstructionStore instructions;
    @Autowired TemplateProviderFileStore files;
    @Autowired TemplatePdfStore pdfs;
    @Autowired TemplatePdfPreparation pdfPreparation;
    @Autowired DocumentTemplateService templates;
    @Autowired DocumentTemplateRepository repository;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;

    @BeforeEach
    void reset() {
        db.update("DELETE FROM template_provider_files");
        db.update("DELETE FROM template_instruction_sets");
        repository.deleteAll();
        db.update("DELETE FROM academic_document_template_versions");
    }

    @Test
    void simultaneousFirstClaimsCreateOnlyOnePaidPreparationOwner() throws Exception {
        UUID version = version("Describe the required project users and responsibilities.");
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        Callable<Optional<TemplateInstructionStore.State>> contender = () -> {
            ready.countDown();
            if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Claim race did not start.");
            return instructions.claim(version, "provider-v1", null);
        };
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(contender);
            var second = pool.submit(contender);
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            var claims = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
            assertThat(claims.stream().filter(Optional::isPresent).count()).isEqualTo(1);
        } finally {
            start.countDown();
        }
        assertThat(db.queryForObject("SELECT COUNT(*) FROM template_instruction_sets WHERE version_id = ?", Integer.class, version))
            .isEqualTo(1);
        assertThat(instructions.find(version).orElseThrow().requestCount()).isZero();
        assertThat(instructions.claim(version, "provider-v1", null)).isEmpty();
    }

    @Test
    void checkpointsRetainMoreThan99InstructionsAndTheirExactFixedWordingAcrossStoreReload() throws Exception {
        UUID version = version("Describe the project's users and their required activities.");
        var claim = instructions.claim(version, "provider-v1", null).orElseThrow();
        var fixed = drafts(110);
        assertThat(instructions.startRequest(claim)).isTrue();
        assertThat(instructions.checkpoint(claim, 1, fixed, false)).isTrue();

        var reloaded = new TemplateInstructionStore(db, json).find(version).orElseThrow();
        assertThat(reloaded.completedPage()).isEqualTo(1);
        assertThat(reloaded.items()).containsExactlyElementsOf(fixed);
        assertThat(reloaded.requestCount()).isEqualTo(1);
        assertThat(reloaded.items().get(109).instruction()).isEqualTo("Describe distinct activity number 110 without changing its scope.");
        // A late response cannot overwrite the checkpoint already advanced by the same worker.
        assertThat(instructions.checkpoint(claim, 1, List.of(), false)).isFalse();
        assertThat(instructions.find(version).orElseThrow().items()).containsExactlyElementsOf(fixed);
    }

    @Test
    void failedPreparationRequiresItsMatchingRetryTokenAndResumesAtTheLastCompletedPage() throws Exception {
        UUID version = version("Describe project control mechanisms and progress reporting.");
        var claim = instructions.claim(version, "provider-v1", null).orElseThrow();
        assertThat(instructions.startRequest(claim)).isTrue();
        assertThat(instructions.checkpoint(claim, 1, drafts(105), false)).isTrue();
        var partial = instructions.find(version).orElseThrow();
        instructions.fail(partial, "RATE_LIMITED");
        var failed = instructions.find(version).orElseThrow();
        assertThat(failed.state()).isEqualTo("FAILED");
        assertThat(failed.failureCode()).isEqualTo("RATE_LIMITED");
        assertThat(instructions.claim(version, "provider-v1", null)).isEmpty();
        assertThat(instructions.claim(version, "provider-v1", UUID.randomUUID())).isEmpty();

        var resumed = instructions.claim(version, "provider-v1", failed.token()).orElseThrow();
        assertThat(resumed.token()).isNotEqualTo(failed.token());
        assertThat(resumed.completedPage()).isEqualTo(1);
        assertThat(resumed.items()).containsExactlyElementsOf(partial.items());
        assertThat(resumed.failureCode()).isNull();
        assertThat(resumed.requestCount()).isEqualTo(1);
        assertThat(instructions.startRequest(partial)).isFalse();
        assertThat(instructions.checkpoint(partial, 2, List.of(), true)).isFalse();
        instructions.fail(partial, "LATE_FAILURE");
        assertThat(instructions.find(version).orElseThrow().state()).isEqualTo("PROCESSING");
        assertThat(instructions.startRequest(resumed)).isTrue();
        assertThat(instructions.checkpoint(resumed, 2, resumed.items(), true)).isTrue();
        assertThat(instructions.find(version).orElseThrow().requestCount()).isEqualTo(2);
    }

    @Test
    void expiredPaidPreparationBecomesUnknownWithoutAutomaticReplayOrLosingItsCheckpoint() throws Exception {
        UUID version = version("Describe the project's completion and acceptance activities.");
        var claim = instructions.claim(version, "provider-v1", null).orElseThrow();
        instructions.startRequest(claim);
        instructions.checkpoint(claim, 1, drafts(101), false);
        db.update("UPDATE template_instruction_sets SET lease_until = CURRENT_TIMESTAMP - INTERVAL '5' MINUTE WHERE version_id = ?", version);

        var failed = instructions.find(version).orElseThrow();
        assertThat(failed.state()).isEqualTo("FAILED");
        assertThat(failed.failureCode()).isEqualTo("OUTCOME_UNKNOWN");
        assertThat(failed.items()).hasSize(101);
        assertThat(failed.completedPage()).isEqualTo(1);
        assertThat(failed.requestCount()).isEqualTo(1);
        assertThat(instructions.claim(version, "provider-v1", null)).isEmpty();
        assertThat(instructions.find(version).orElseThrow()).isEqualTo(failed);
        assertThat(instructions.startRequest(claim)).isFalse();
        assertThat(instructions.checkpoint(claim, 2, List.of(), true)).isFalse();
        var resumed = instructions.claim(version, "provider-v1", failed.token()).orElseThrow();
        assertThat(resumed.completedPage()).isEqualTo(1);
        assertThat(resumed.items()).containsExactlyElementsOf(failed.items());
    }

    @Test
    void readyInstructionWordingCannotBeChangedByReclaimingOrLateFailure() throws Exception {
        UUID version = version("Describe all meaningful source-backed project requirements.");
        var claim = instructions.claim(version, "provider-v1", null).orElseThrow();
        assertThat(instructions.checkpoint(claim, 2, drafts(110), true)).isTrue();
        var ready = instructions.find(version).orElseThrow();
        assertThat(ready.state()).isEqualTo("READY");
        assertThat(instructions.claim(version, "provider-v2", null)).isEmpty();
        assertThat(instructions.claim(version, "provider-v2", claim.token())).isEmpty();
        assertThat(instructions.startRequest(claim)).isFalse();
        assertThat(instructions.checkpoint(claim, 2, List.of(), true)).isFalse();
        instructions.fail(claim, "LATE_FAILURE");
        assertThat(instructions.find(version).orElseThrow()).isEqualTo(ready);
    }

    @Test
    void providerCacheRequiresTheExactVersionCredentialContextAndPdfHash() throws Exception {
        UUID version = version("Describe how external service interfaces are documented.");
        UUID otherVersion = version("Describe a different version's service interface requirements.");
        UUID token = files.claim(version, CONTEXT, PDF_HASH).orElseThrow();
        assertThat(files.claim(version, CONTEXT, PDF_HASH)).isEmpty();
        assertThat(files.find(version, CONTEXT, PDF_HASH)).isEmpty();
        var uploaded = uploaded("files/template-first");
        assertThat(files.complete(version, CONTEXT, UUID.randomUUID(), uploaded)).isFalse();
        assertThat(files.complete(otherVersion, CONTEXT, token, uploaded)).isFalse();
        assertThat(files.complete(version, OTHER_CONTEXT, token, uploaded)).isFalse();
        assertThat(files.complete(version, CONTEXT, token, uploaded)).isTrue();
        assertThat(files.find(version, CONTEXT, PDF_HASH)).contains(uploaded);
        assertThat(files.find(otherVersion, CONTEXT, PDF_HASH)).isEmpty();
        assertThat(files.find(version, OTHER_CONTEXT, PDF_HASH)).isEmpty();
        assertThat(files.find(version, CONTEXT, "d".repeat(64))).isEmpty();
        assertThat(files.claim(version, CONTEXT, "d".repeat(64))).isEmpty();
        // Another credential context has its own upload claim, not access to the first handle.
        assertThat(files.claim(version, OTHER_CONTEXT, PDF_HASH)).isPresent();
    }

    @Test
    void expiredUploadLeaseCannotBeCompletedOrReleasedByTheOldWorkerAfterRecovery() throws Exception {
        UUID version = version("Explain the retained PDF source and its image-based examples.");
        UUID first = files.claim(version, CONTEXT, PDF_HASH).orElseThrow();
        db.update("UPDATE template_provider_files SET lease_until = CURRENT_TIMESTAMP - INTERVAL '5' MINUTE WHERE version_id = ? AND provider_context = ?", version, CONTEXT);
        UUID next = files.claim(version, CONTEXT, PDF_HASH).orElseThrow();
        assertThat(next).isNotEqualTo(first);
        assertThat(files.complete(version, CONTEXT, first, uploaded("files/stale"))).isFalse();
        files.release(version, CONTEXT, first);
        assertThat(files.claim(version, CONTEXT, PDF_HASH)).isEmpty();
        assertThat(files.complete(version, CONTEXT, next, uploaded("files/current"))).isTrue();
        assertThat(files.find(version, CONTEXT, PDF_HASH).orElseThrow().name()).isEqualTo("files/current");
    }

    @Test
    void expiringOrInvalidatedProviderFileCanBeReplacedWithoutTouchingOtherContext() throws Exception {
        UUID version = version("Explain the instruction source pages and their applicability.");
        UUID first = files.claim(version, CONTEXT, PDF_HASH).orElseThrow();
        var nearExpiry = new TemplateProviderFileStore.File("files/expiring", "https://generativelanguage.googleapis.com/v1beta/files/expiring",
            Instant.now().plus(3, ChronoUnit.MINUTES));
        files.complete(version, CONTEXT, first, nearExpiry);
        assertThat(files.find(version, CONTEXT, PDF_HASH)).isEmpty();
        UUID next = files.claim(version, CONTEXT, PDF_HASH).orElseThrow();
        var current = uploaded("files/replacement");
        files.complete(version, CONTEXT, next, current);
        UUID other = files.claim(version, OTHER_CONTEXT, PDF_HASH).orElseThrow();
        files.complete(version, OTHER_CONTEXT, other, uploaded("files/other-credential"));
        files.invalidate(version, CONTEXT, "files/expiring");
        assertThat(files.find(version, CONTEXT, PDF_HASH)).contains(current);
        files.invalidate(version, CONTEXT, "files/replacement");
        assertThat(files.find(version, CONTEXT, PDF_HASH)).isEmpty();
        assertThat(files.find(version, OTHER_CONTEXT, PDF_HASH)).isPresent();
        assertThat(files.claim(version, CONTEXT, PDF_HASH)).isPresent();
    }

    private UUID version(String instruction) throws Exception {
        byte[] bytes;
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            for (int i = 0; i < 2; i++) {
                var page = new PDPage();
                document.addPage(page);
                try (var stream = new PDPageContentStream(document, page)) {
                    stream.beginText();
                    stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                    stream.newLineAtOffset(30, 700);
                    stream.showText(instruction);
                    stream.endText();
                }
            }
            document.save(output);
            bytes = output.toByteArray();
        }
        var template = templates.save(WORKSPACE, "INSTRUCTION-STORE-TEST", "Instruction source",
            new MockMultipartFile("file", "source.pdf", "application/pdf", bytes));
        pdfPreparation.prepareNext();
        var status = pdfs.current(WORKSPACE, template.id());
        assertThat(status.state()).isEqualTo("READY");
        return status.versionId();
    }

    /** Storage fixtures exercise lossless persistence; quotation grounding is tested by the protocol. */
    private static List<TemplateInstructionProtocol.Draft> drafts(int count) {
        return IntStream.rangeClosed(1, count).mapToObj(i -> new TemplateInstructionProtocol.Draft(
            "Describe activity " + i, "Describe distinct activity number " + i + " without changing its scope.",
            "Describe distinct activity number " + i + " without changing its scope.", "2.1 Project activities", 1,
            TemplateInstructionProtocol.Applicability.REQUIRED, "")).toList();
    }

    private static TemplateProviderFileStore.File uploaded(String name) {
        return new TemplateProviderFileStore.File(name, "https://generativelanguage.googleapis.com/v1beta/" + name,
            Instant.now().plus(48, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MILLIS));
    }
}
