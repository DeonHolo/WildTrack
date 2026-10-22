package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.font.*;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PdfVisualEvidenceTest {
    @Test void formattingNormalizationAppliesToEverySupportedCaption() {
        for (String caption : new String[] { "Use Case Diagram", "Activity Diagram", "Wireframe", "Low Fidelity Wireframe" })
            for (String separator : new String[] { "", " ", "-", "_", "\u00a0", "\u2013" })
                for (String punctuation : new String[] { "", ":", "." }) {
                    String variant = caption.toUpperCase(java.util.Locale.ROOT).replace(" ", separator) + punctuation;
                    assertThat(PdfVisualEvidence.matchesCaption(variant, caption)).as(variant).isTrue();
                }
    }

    @ParameterizedTest
    @ValueSource(strings = { "Use Case Diagram:", "use case diagram", "Usecase Diagram", "Use-Case Diagram",
        "USE_CASE_DIAGRAM", "Use\u2013Case Diagram:", "Use   Case   Diagram.", "Figure 2: Usecase Diagram:",
        "3.2. Use-Case Diagram", "Use Case Diagram for UC-LOGIN" })
    void captionFormattingDoesNotHideARealFigure(String caption) throws Exception {
        assertThat(captionInspection(caption, true).pages().getFirst().illustratedArtifacts())
            .containsExactly(new PdfInspection.IllustratedArtifact("use case diagram", 1));
        assertThat(captionInspection(caption, false).pages().getFirst().illustratedArtifacts()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = { "The use case diagram is discussed in section 3.",
        "Use Case Diagram is missing.", "Use Case Diagram and Activity Diagram", "Use Case Diagram TODO",
        "Use Case Diagram for this transaction is missing.", "Use Case Diagram for UC-LOGIN (placeholder)" })
    void proseAndIncompleteCaptionsDoNotBorrowAnImage(String text) throws Exception {
        assertThat(captionInspection(text, true).pages().getFirst().illustratedArtifacts()).isEmpty();
    }

    private static PdfInspection captionInspection(String caption, boolean withImage) throws Exception {
        try (var doc = new PDDocument(); var bytes = new ByteArrayOutputStream()) {
            var page = new PDPage(); doc.addPage(page);
            try (var stream = new PDPageContentStream(doc, page)) {
                text(stream, "1.1 Create account", 740);
                text(stream, caption, 650);
                if (withImage) image(doc, stream, 200, 250, 220, 220);
                text(stream, "1.2 Next transaction", 100);
            }
            doc.save(bytes); return new PdfInspector().inspect(bytes.toByteArray());
        }
    }

    @Test void substantiveImageBelowItsLabelIsAssociated() throws Exception {
        assertThat(inspect(0).pages().getFirst().illustratedArtifacts())
            .containsExactly(new PdfInspection.IllustratedArtifact("use case diagram", 1));
    }
    @Test void smallLogoDoesNotVerifyAnEmptyDiagramLabel() throws Exception {
        assertThat(inspect(1).pages().getFirst().illustratedArtifacts()).isEmpty();
    }
    @Test void largeImageAboveLabelDoesNotVerifyTheLabel() throws Exception {
        assertThat(inspect(2).pages().getFirst().illustratedArtifacts()).isEmpty();
    }
    @Test void imageAfterDifferentLabelIsNotAssignedToThePreviousArtifact() throws Exception {
        var artifacts = inspect(3).pages().getFirst().illustratedArtifacts();
        assertThat(artifacts).containsExactly(new PdfInspection.IllustratedArtifact("activity diagram", 1));
    }
    @Test void continuationImageOnNextPageIsAssociatedBeforeTheNextLabel() throws Exception {
        assertThat(inspect(4).pages().getFirst().illustratedArtifacts())
            .containsExactly(new PdfInspection.IllustratedArtifact("use case diagram", 2));
    }
    @Test void nextPageImageAfterDifferentLabelDoesNotVerifyThePreviousLabel() throws Exception {
        assertThat(inspect(5).pages().getFirst().illustratedArtifacts()).isEmpty();
    }
    @Test void repeatedLabelsRemainAmbiguous() throws Exception {
        assertThat(inspect(6).pages().getFirst().illustratedArtifacts()).isEmpty();
    }
    @Test void missingOptionalGeometryDoesNotAffectFileReadability() throws Exception {
        var report = inspect(7);
        assertThat(report.readable()).isTrue();
        assertThat(report.pages().getFirst().illustratedArtifacts()).isEmpty();
    }
    @Test void nextTransactionBelowAContinuationFigureDoesNotHideThatFigure() throws Exception {
        assertThat(inspect(8).pages().getFirst().illustratedArtifacts())
            .containsExactly(new PdfInspection.IllustratedArtifact("use case diagram", 2));
    }
    @Test void nextTransactionAboveAnImagePreventsBorrowingItsFigure() throws Exception {
        assertThat(inspect(9).pages().getFirst().illustratedArtifacts()).isEmpty();
    }
    @Test void nextTransactionOnTheSamePagePreventsBorrowingItsFigure() throws Exception {
        assertThat(inspect(10).pages().getFirst().illustratedArtifacts()).isEmpty();
    }
    @Test void sectionChangeBeforeThePageBreakPreventsBorrowingANextPageImage() throws Exception {
        assertThat(inspect(11).pages().getFirst().illustratedArtifacts()).isEmpty();
    }
    private static PdfInspection inspect(int scenario) throws Exception {
        try (var doc = new PDDocument(); var bytes = new ByteArrayOutputStream()) {
            var page = new PDPage(); doc.addPage(page);
            if (scenario == 7) page.setRotation(90);
            try (var stream = new PDPageContentStream(doc, page)) {
                text(stream, "1. Functional Requirements", 740);
                text(stream, "Use Case Diagram", scenario == 4 || scenario == 5 || scenario == 8 || scenario == 9 ? 100 : 650);
                if (scenario == 0 || scenario == 7) image(doc, stream, 200, 250, 220, 220);
                if (scenario == 1) image(doc, stream, 40, 720, 35, 35);
                if (scenario == 2) image(doc, stream, 200, 670, 220, 100);
                if (scenario == 3) { text(stream, "Activity Diagram", 600); image(doc, stream, 200, 250, 220, 220); }
                if (scenario == 6) { text(stream, "Use Case Diagram", 500); image(doc, stream, 200, 150, 220, 220); }
                if (scenario == 10) { text(stream, "1.2 Another transaction", 600); image(doc, stream, 200, 250, 220, 220); }
                if (scenario == 11) text(stream, "1.2 Another transaction", 600);
            }
            if (scenario == 4 || scenario == 5 || scenario == 8 || scenario == 9 || scenario == 11) {
                var second = new PDPage(); doc.addPage(second);
                try (var stream = new PDPageContentStream(doc, second)) {
                    if (scenario == 5) text(stream, "Activity Diagram", 740);
                    image(doc, stream, 200, 400, 220, 220);
                    if (scenario == 4) text(stream, "Activity Diagram", 100);
                    if (scenario == 8 || scenario == 9) text(stream, "1.2 Another transaction", scenario == 8 ? 100 : 740);
                }
            }
            doc.save(bytes); return new PdfInspector().inspect(bytes.toByteArray());
        }
    }
    private static void text(PDPageContentStream stream, String value, int y) throws Exception {
        stream.beginText(); stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
        stream.newLineAtOffset(50, y); stream.showText(value); stream.endText();
    }
    private static void image(PDDocument doc, PDPageContentStream stream, int x, int y, int width, int height) throws Exception {
        stream.drawImage(LosslessFactory.createFromImage(doc, new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB)), x, y, width, height);
    }
}
