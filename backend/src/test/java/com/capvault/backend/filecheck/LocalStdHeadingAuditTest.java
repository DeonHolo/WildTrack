package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;

import com.capvault.backend.template.DocumentTextExtractor;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

/** Reads private local artifacts only; CI uses the independent comparator regressions. */
class LocalStdHeadingAuditTest {
    @Test
    void actualOfficialDocxAndWildTrackPdfExposeTheirBodySections() throws Exception {
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        Path repo = Files.exists(cwd.resolve("backend/pom.xml")) ? cwd : cwd.getParent();
        Path documents = repo.resolve("docs/old documents, templates");
        Path templatePath = documents.resolve("STD TEMPLATE.docx");
        Path output = documents.resolve("outputs/04-Software-Test-Document");
        Path docxPath = output.resolve("WildTrack_STD.docx");
        Path pdfPath = output.resolve("WildTrack_STD.pdf");
        Assumptions.assumeTrue(Files.exists(templatePath) && Files.exists(docxPath) && Files.exists(pdfPath),
            "Private local coursework files are not required in CI.");

        DocumentTextExtractor extractor = new DocumentTextExtractor();
        String template = extractor.extract(Files.readAllBytes(templatePath), "STD TEMPLATE.docx", null);
        String docx = extractor.extract(Files.readAllBytes(docxPath), "WildTrack_STD.docx", null);
        PdfInspection pdf = new PdfInspector().inspect(Files.readAllBytes(pdfPath));
        TemplateComparator comparator = new TemplateComparator(new FileCheckProperties(300, .75, .25));
        TemplateComparison comparison = comparator.compare(template, pdf.extractedText());
        TemplateComparison docxComparison = comparator.compare(template, docx);

        Path evidence = repo.resolve(".scratch/std-heading-20261011");
        Files.createDirectories(evidence);
        Files.writeString(evidence.resolve("template-extracted.txt"), template);
        Files.writeString(evidence.resolve("submission-docx-extracted.txt"), docx);
        Files.writeString(evidence.resolve("submission-pdf-extracted.txt"), pdf.extractedText());
        var summary = new LinkedHashMap<String, Object>();
        summary.put("templateSha256", sha256(templatePath));
        summary.put("docxSha256", sha256(docxPath));
        summary.put("pdfSha256", sha256(pdfPath));
        summary.put("pdfPages", pdf.pageCount());
        summary.put("pdfCharacters", pdf.extractedCharacterCount());
        var bodyPages = new LinkedHashMap<String, Integer>();
        for (String heading : new String[] {"1. Introduction", "2. Test Plan", "3. Test Cases"}) {
            pdf.pages().stream().filter(page -> page.text().lines().map(String::trim).anyMatch(heading::equals))
                .findFirst().ifPresent(page -> bodyPages.put(heading, page.pageNumber()));
        }
        summary.put("mainSectionPhysicalPages", bodyPages);
        summary.put("pdfComparison", comparison);
        summary.put("docxComparison", docxComparison);
        new ObjectMapper().writerWithDefaultPrettyPrinter().writeValue(evidence.resolve("audit.json").toFile(), summary);

        assertThat(pdf.readable()).isTrue();
        assertThat(comparison.expectedTemplateHeadings()).contains("Introduction", "Test Plan", "Test Cases")
            .doesNotContain("Introduction 4", "Test Plan 5", "Test Cases 6");
        assertThat(comparison.detectedTemplateHeadings()).contains("Introduction", "Test Plan", "Test Cases");
    }

    private static String sha256(Path path) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)));
    }
}
