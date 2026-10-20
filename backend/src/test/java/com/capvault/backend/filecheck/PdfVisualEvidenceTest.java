package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.font.*;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.junit.jupiter.api.Test;

class PdfVisualEvidenceTest {
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
            }
            if (scenario == 4 || scenario == 5 || scenario == 8 || scenario == 9) {
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
