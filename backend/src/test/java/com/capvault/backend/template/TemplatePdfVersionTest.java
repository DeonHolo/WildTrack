package com.capvault.backend.template;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static com.capvault.backend.support.AuthenticatedRequest.adminSession;
import static com.capvault.backend.support.AuthenticatedRequest.adviserSession;
import static com.capvault.backend.support.AuthenticatedRequest.session;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:template-pdf-versions;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;DEFAULT_NULL_ORDERING=HIGH",
    "capvault.templates.pdf-preparation-enabled=false"
})
class TemplatePdfVersionTest {
    private static final UUID WORKSPACE = UUID.fromString("11111111-1111-1111-1111-111111111111");
    @Autowired DocumentTemplateService service;
    @Autowired DocumentTemplateRepository repository;
    @Autowired TemplatePdfStore store;
    @Autowired TemplatePdfPreparation preparation;
    @Autowired JdbcTemplate db;
    @Autowired MockMvc mvc;

    @BeforeEach
    void reset() {
        repository.deleteAll();
        db.update("DELETE FROM academic_document_template_versions");
    }

    @Test
    void uploadedPdfIsRetainedExactlyAndReplacementCannotExposePreviousPdfAsCurrent() throws Exception {
        byte[] first = pdf("First source instruction for the test template and its important supporting material.");
        var template = savePdf(first);
        var before = store.current(WORKSPACE, template.id());
        preparation.prepareNext();
        assertThat(store.readPdf(WORKSPACE, template.id(), before.versionId()).bytes()).isEqualTo(first);
        assertThat(service.readFile(WORKSPACE, template.id()).bytes()).isEqualTo(first);

        byte[] second = pdf("Second source instruction replaces the first version and has different content.");
        var replacement = savePdf(second);
        var current = store.current(WORKSPACE, template.id());
        assertThat(replacement.id()).isEqualTo(template.id());
        assertThat(current.versionId()).isNotEqualTo(before.versionId());
        assertThat(current.state()).isEqualTo("PENDING");
        assertThatThrownBy(() -> store.readPdf(WORKSPACE, template.id(), current.versionId()))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("409");
        preparation.prepareNext();
        assertThat(store.readPdf(WORKSPACE, template.id(), current.versionId()).bytes()).isEqualTo(second);
        assertThat(store.readPdf(WORKSPACE, template.id(), before.versionId()).bytes()).isEqualTo(first);
        assertThat(new TemplatePdfStore(db).current(WORKSPACE, template.id())).isEqualTo(store.current(WORKSPACE, template.id()));
    }

    @Test
    void repeatedIdenticalUploadReusesThePreparedSourceVersion() throws Exception {
        byte[] bytes = pdf("Repeated source instructions are unchanged and remain associated with one stable version.");
        var template = savePdf(bytes);
        preparation.prepareNext();
        var before = store.current(WORKSPACE, template.id());
        savePdf(bytes);
        assertThat(store.current(WORKSPACE, template.id())).isEqualTo(before);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM academic_document_template_versions", Integer.class)).isEqualTo(1);
    }

    @Test
    void reuploadingTheSameFileRestoresUnavailableLegacyBytes() throws Exception {
        byte[] original = pdf("An older durable template can be restored by re-uploading the exact same original source file.");
        var template = savePdf(original);
        var version = store.current(WORKSPACE, template.id());
        db.update("UPDATE academic_document_templates SET content_bytes = NULL, bytes_available = FALSE WHERE id = ?", template.id());
        db.update("UPDATE academic_document_template_versions SET source_bytes = NULL, pdf_state = 'FAILED', conversion_error = 'Legacy original unavailable' WHERE id = ?", version.versionId());
        savePdf(original);
        assertThat(store.current(WORKSPACE, template.id()).versionId()).isEqualTo(version.versionId());
        assertThat(store.current(WORKSPACE, template.id()).state()).isEqualTo("PENDING");
        preparation.prepareNext();
        assertThat(store.readPdf(WORKSPACE, template.id(), version.versionId()).bytes()).isEqualTo(original);
        assertThat(service.readFile(WORKSPACE, template.id()).bytes()).isEqualTo(original);
    }

    @Test
    void aFilenameChangeKeepsTheContentVersionButUsesTheCurrentFilename() throws Exception {
        byte[] bytes = pdf("An identical source may be renamed without changing the prepared content or its instruction identity.");
        var template = savePdf(bytes);
        preparation.prepareNext();
        var version = store.current(WORKSPACE, template.id());
        service.save(WORKSPACE, "PDF-VERSION-TEST", "Template", new MockMultipartFile(
            "file", "renamed.pdf", "application/pdf", bytes));
        assertThat(store.current(WORKSPACE, template.id()).versionId()).isEqualTo(version.versionId());
        assertThat(store.current(WORKSPACE, template.id()).originalFilename()).isEqualTo("renamed.pdf");
        assertThat(store.readPdf(WORKSPACE, template.id(), version.versionId()).filename()).isEqualTo("renamed.pdf");
    }

    @Test
    void replacingSourceDuringConversionPublishesOnlyToItsOriginalVersion() throws Exception {
        var first = savePdf(pdf("The first source is being rendered while another source is uploaded by the administrator."));
        var old = store.claimNext().orElseThrow();
        savePdf(pdf("The newer source is a different template version and must never receive the previous PDF."));
        var current = store.current(WORKSPACE, first.id());
        assertThat(store.complete(old, old.bytes(), hash(old.bytes()), 1)).isTrue();
        assertThat(store.current(WORKSPACE, first.id()).state()).isEqualTo("PENDING");
        assertThat(current.versionId()).isNotEqualTo(old.versionId());
        assertThatThrownBy(() -> store.readPdf(WORKSPACE, first.id(), current.versionId()))
            .hasMessageContaining("409");
    }

    @Test
    void expiredClaimCanBeRecoveredButOldWorkerCannotPublishOrFailTheNewClaim() throws Exception {
        var template = savePdf(pdf("A durable conversion lease protects complete publication after a worker restart or timeout."));
        var old = store.claimNext().orElseThrow();
        assertThat(store.claimNext()).isEmpty();
        db.update("UPDATE academic_document_template_versions SET conversion_lease_until = CURRENT_TIMESTAMP - INTERVAL '4' MINUTE WHERE id = ?", old.versionId());
        var recovered = new TemplatePdfStore(db).claimNext().orElseThrow();
        assertThat(recovered.claim()).isNotEqualTo(old.claim());
        assertThat(store.complete(old, old.bytes(), hash(old.bytes()), 1)).isFalse();
        assertThat(store.fail(old, "stale worker")).isFalse();
        assertThat(store.complete(recovered, recovered.bytes(), hash(recovered.bytes()), 1)).isTrue();
        assertThat(store.current(WORKSPACE, template.id()).state()).isEqualTo("READY");
    }

    @Test
    void legacyDocxRequiresPdfReplacementAndPreservesItsOriginalVersion() throws Exception {
        byte[] original;
        try (var document = new XWPFDocument(); var bytes = new ByteArrayOutputStream()) {
            document.createParagraph().createRun().setText("Describe the intended users and the tasks they perform in the proposed service.");
            document.write(bytes);
            original = bytes.toByteArray();
        }
        var template = repository.saveAndFlush(new DocumentTemplate(WORKSPACE, "PDF-VERSION-TEST", "Template",
            "source.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", original, null,
            hash(original), "Describe the intended users and the tasks they perform in the proposed service."));
        store.capture(template);
        preparation.prepareNext();
        var failed = store.current(WORKSPACE, template.getId());
        assertThat(failed.state()).isEqualTo("FAILED");
        assertThat(failed.error()).contains("Upload this template as a PDF");
        assertThat(failed.originalAvailable()).isTrue();
        assertThat(failed.retryable()).isFalse();
        assertThat(service.readFile(WORKSPACE, template.getId()).bytes()).isEqualTo(original);
        assertThat(store.retry(WORKSPACE, template.getId(), failed.versionId())).isFalse();
        mvc.perform(post("/api/templates/" + template.getId() + "/pdf/retry").with(adminSession())
                .param("workspaceId", WORKSPACE.toString()).param("versionId", failed.versionId().toString()))
            .andExpect(status().isConflict());
        byte[] replacement = pdf("The converted official instructions are supplied as a PDF and retain the existing mapping.");
        var updated = savePdf(replacement);
        assertThat(updated.id()).isEqualTo(template.getId());
        preparation.prepareNext();
        assertThat(store.current(WORKSPACE, template.getId()).state()).isEqualTo("READY");
        assertThat(db.queryForObject("SELECT source_bytes FROM academic_document_template_versions WHERE id = ?",
            byte[].class, failed.versionId())).isEqualTo(original);
    }

    @Test
    void anEarlierFailedVersionCannotBeRetriedAsTheCurrentTemplate() throws Exception {
        var template = savePdf(pdf("The first source must remain separate after it fails to complete conversion and is replaced."));
        var old = store.claimNext().orElseThrow();
        store.fail(old, "Conversion failed.");
        savePdf(pdf("A replacement source has a new version identity and must not be overwritten by retrying an older version."));
        assertThat(store.retry(WORKSPACE, template.id(), old.versionId())).isFalse();
        assertThat(store.current(WORKSPACE, template.id()).state()).isEqualTo("PENDING");
    }

    @Test
    void pdfReadsAreVersionAndWorkspaceBoundAndFramePolicyIsScopedToPdfResponse() throws Exception {
        var template = savePdf(pdf("An authorised user can open the retained template PDF for this exact workspace and version."));
        preparation.prepareNext();
        var current = store.current(WORKSPACE, template.id());
        String url = "/api/templates/" + template.id();
        mvc.perform(get(url + "/pdf-state").param("workspaceId", WORKSPACE.toString())).andExpect(status().isUnauthorized());
        mvc.perform(get(url + "/pdf").with(adminSession()).param("workspaceId", WORKSPACE.toString())
            .param("versionId", current.versionId().toString())).andExpect(status().isOk())
            .andExpect(header().string("X-Frame-Options", "SAMEORIGIN"))
            .andExpect(header().string("Content-Type", "application/pdf"));
        mvc.perform(get(url + "/pdf-state").with(adminSession()).param("workspaceId", WORKSPACE.toString()))
            .andExpect(status().isOk()).andExpect(header().string("X-Frame-Options", "DENY"));
        assertThatThrownBy(() -> store.readPdf(UUID.randomUUID(), template.id(), current.versionId())).hasMessageContaining("404");
        assertThatThrownBy(() -> store.readPdf(WORKSPACE, UUID.randomUUID(), current.versionId())).hasMessageContaining("404");
        mvc.perform(post(url + "/pdf/retry").with(adviserSession()).param("workspaceId", WORKSPACE.toString())
            .param("versionId", current.versionId().toString())).andExpect(status().isForbidden());
        mvc.perform(post(url + "/pdf/retry").with(session()).param("workspaceId", WORKSPACE.toString())
            .param("versionId", current.versionId().toString())).andExpect(status().isForbidden());
    }

    private DocumentTemplateResponse savePdf(byte[] bytes) {
        return service.save(WORKSPACE, "PDF-VERSION-TEST", "Template", new MockMultipartFile(
            "file", "source.pdf", "application/pdf", bytes));
    }

    private static byte[] pdf(String text) throws Exception {
        try (var document = new PDDocument(); var bytes = new ByteArrayOutputStream()) {
            var page = new PDPage();
            document.addPage(page);
            try (var stream = new PDPageContentStream(document, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                stream.newLineAtOffset(30, 700);
                stream.showText(text);
                stream.endText();
            }
            document.save(bytes);
            return bytes.toByteArray();
        }
    }

    private static String hash(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }
}
