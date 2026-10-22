package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.List;
import com.capvault.backend.filecheck.PdfInspector;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.font.*;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class AiReviewDiagramCaptionTest {
    private static final String TEMPLATE = """
        1. Functional Requirements
        Describe the functional requirements.
        2. Quality Requirements
        Describe the quality requirements.
        Module 1
        1.1 Transaction Name
        Use Case Diagram
        Activity Diagram
        """;

    @ParameterizedTest
    @ValueSource(strings = { "Use Case Diagram:", "use case diagram", "Usecase Diagram", "Use-Case Diagram",
        "USE_CASE_DIAGRAM", "Use   Case   Diagram." })
    void captionVariantsWithAnActualFigureDoNotProducePresenceWarnings(String caption) throws Exception {
        assertThat(warnings(caption, true)).noneMatch(finding -> finding.issue().contains("Use Case Diagram"));
        assertThat(warnings(caption, false)).anyMatch(finding -> finding.issue().contains("Use Case Diagram"));
    }

    private static List<AiReviewProvider.Finding> warnings(String caption, boolean withImage) throws Exception {
        try (var doc = new PDDocument(); var bytes = new ByteArrayOutputStream()) {
            var page = new PDPage(); doc.addPage(page);
            try (var stream = new PDPageContentStream(doc, page)) {
                String[] lines = { "1. Functional Requirements", "Project-specific transactions follow.",
                    "2. Quality Requirements", "Project-specific quality targets follow.",
                    "Module 1: Account Access", "1.1 Create Account", caption };
                int y = 760;
                for (String line : lines) {
                    stream.beginText(); stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    stream.newLineAtOffset(50, y); stream.showText(line); stream.endText(); y -= 25;
                }
                if (withImage) stream.drawImage(LosslessFactory.createFromImage(doc,
                    new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB)), 100, 330, 220, 220);
                stream.beginText(); stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                stream.newLineAtOffset(50, 300); stream.showText("Activity Diagram"); stream.endText();
            }
            doc.save(bytes);
            var inspection = new PdfInspector().inspect(bytes.toByteArray());
            return AiReviewGroundingPolicy.templateBodyCrosscheck(TEMPLATE, inspection.extractedText(), "",
                List.of(), List.of(), inspection.pages());
        }
    }
}
