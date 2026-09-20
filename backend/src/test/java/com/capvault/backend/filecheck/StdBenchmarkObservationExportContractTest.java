package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Offline exporter contract tests only; never create research observations or contact Drive. */
class StdBenchmarkObservationExportContractTest {
    private static final PdfInspection TEMPLATE =
        new PdfInspection(true, false, 1, 100, "1. Introduction\n1.2. Test Approach", "");
    private final StdBenchmarkObservationExportTest exporter = new StdBenchmarkObservationExportTest();

    private static String sha(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private static byte[] blankPdf() throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            document.save(buffer);
            return buffer.toByteArray();
        }
    }

    private static Path repositoryRoot() {
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        return Files.exists(cwd.resolve("backend/pom.xml")) ? cwd : cwd.getParent();
    }

    private Map<String, String> check(Path directory, String id, byte[] bytes, boolean withTemplate) throws Exception {
        Path input = directory.resolve("controlled-reference-" + id + ".pdf");
        Files.write(input, bytes);
        return exporter.observe(new StdBenchmarkObservationExportTest.Fixture(
            id, input, sha(bytes), withTemplate, "test-owned synthetic source"),
            TEMPLATE, "a".repeat(64), "b".repeat(40));
    }

    @Test
    void parsesManifestCsvWithoutSplittingQuotedCommasOrInventingMissingColumns() {
        var rows = StdBenchmarkObservationExportTest.parseCsv(
            "fixture_id,file,human_label_review\n"
                + "STD-02,\"fixtures/file,with-comma.pdf\",PENDING\n"
                + "STD-03,\"fixtures/file\nwith-newline.pdf\",PENDING\n");
        assertThat(rows).extracting(row -> row.get("fixture_id"))
            .containsExactly("STD-02", "STD-03");
        assertThat(rows.get(0).get("file")).isEqualTo("fixtures/file,with-comma.pdf");
        assertThat(rows.get(1).get("file")).contains("\n");
    }

    @Test
    void validatesEachOfTheManifestFixturesAgainstActualFrozenHashListWithoutRunningChecks() throws Exception {
        var catalog = StdBenchmarkObservationExportTest.frozenFixtures(repositoryRoot());
        assertThat(catalog).hasSizeGreaterThanOrEqualTo(25);
        var ids = catalog.stream().map(StdBenchmarkObservationExportTest.Fixture::id)
            .collect(Collectors.toSet());
        for (int i = 1; i <= 25; i++) {
            String family = String.format("STD-%02d", i);
            assertThat(ids.stream().anyMatch(id -> id.equals(family) || id.startsWith(family + "-")))
                .as("No manifest file for family " + family).isTrue();
        }
        assertThat(ids).contains("STD-15-corrupt", "STD-15-non-pdf",
            "STD-17-password", "STD-17-oversized", "STD-19-with-requirement",
            "STD-19-without-requirement", "STD-25-unexplained", "STD-25-resolved");
        assertThat(catalog.stream().filter(item -> item.id().startsWith("STD-19-")))
            .allSatisfy(item -> assertThat(item.withTemplate()).isFalse());
    }

    @Test
    void expectedInvalidBytesAreValidNegativeObservationsNotInfrastructureErrors(@TempDir Path tmp)
            throws Exception {
        var corrupt = check(tmp, "STD-15-corrupt", "%PDF-this-is-not-a-valid-xref".getBytes(StandardCharsets.UTF_8), true);
        assertThat(corrupt).containsEntry("observation_status", "SUCCESS")
            .containsEntry("readable", "false").containsEntry("corrupt_pdf", "true")
            .containsEntry("error_category", "CORRUPT_PDF").containsEntry("check_error", "");
        var nonPdf = check(tmp, "STD-15-non-pdf",
            "This is plain text, not a PDF.".getBytes(StandardCharsets.UTF_8), true);
        assertThat(nonPdf).containsEntry("observation_status", "SUCCESS")
            .containsEntry("readable", "false").containsEntry("invalid_pdf_data", "true")
            .containsEntry("not_pdf", "true").containsEntry("filecheck_status", "BLOCKED")
            .containsEntry("technical_flag", "Not PDF")
            .containsEntry("measurement_scope", "PDF_TEMPLATE_ISOLATED+FILECHECK_GATEWAY_MOCK")
            .containsEntry("check_error", "");
        assertThat(nonPdf.get("gateway_mock_evidence")).contains("SIMULATED", "metadata.mimeType=");
    }

    @Test
    void accessAndSizeAreOnlyMockedFileCheckServiceBranchesNotRealSourceAssertions(@TempDir Path tmp)
            throws Exception {
        byte[] local = blankPdf();
        var access = check(tmp, "STD-16", local, true);
        assertThat(access).containsEntry("observation_status", "SUCCESS")
            .containsEntry("measurement_scope", "FILECHECK_GATEWAY_MOCK")
            .containsEntry("technical_flag", "Inaccessible")
            .containsEntry("filecheck_status", "BLOCKED")
            .containsEntry("gateway_inaccessible", "true")
            .containsEntry("access_denied", "").containsEntry("readable", "");
        assertThat(access.get("gateway_mock_evidence")).contains("SIMULATED", "no real permission proof");
        var oversized = check(tmp, "STD-17-oversized", local, true);
        assertThat(oversized).containsEntry("observation_status", "SUCCESS")
            .containsEntry("measurement_scope", "FILECHECK_GATEWAY_MOCK")
            .containsEntry("technical_flag", "File Too Large")
            .containsEntry("file_too_large", "true").containsEntry("readable", "");
        assertThat(Long.parseLong(oversized.get("file_size_bytes")))
            .isLessThan(StdBenchmarkObservationExportTest.FILE_LIMIT);
        assertThat(Long.parseLong(oversized.get("mock_metadata_size_bytes")))
            .isGreaterThan(StdBenchmarkObservationExportTest.FILE_LIMIT);
    }

    @Test
    void misleadingDriveFilenameDoesNotOverridePdfMimeAndRealReadableBytes(@TempDir Path tmp)
            throws Exception {
        var row = check(tmp, "STD-11", blankPdf(), true);
        assertThat(row).containsEntry("measurement_scope", "PDF_TEMPLATE_ISOLATED+FILECHECK_GATEWAY_MOCK")
            .containsEntry("filecheck_status", "COMPLETED")
            .containsEntry("filename_ignored", "true")
            .containsEntry("readable", "true");
        assertThat(row.get("gateway_mock_evidence")).contains("metadata.name=HolidayRecipes.txt");
    }

    @Test
    void noTemplateStillClassifiesReadabilityWithoutInventingComparison(@TempDir Path tmp)
            throws Exception {
        for (String id : List.of("STD-18", "STD-19-with-requirement", "STD-19-without-requirement")) {
            var row = check(tmp, id, blankPdf(), false);
            assertThat(row).containsEntry("observation_status", "SUCCESS")
                .containsEntry("readable", "true").containsEntry("template_mapped", "false")
                .containsEntry("template_available", "false")
                .containsEntry("template_only", "").containsEntry("missing_template_headings", "");
        }
    }
}
