package com.capvault.backend.filecheck;

import java.awt.geom.Point2D;
import java.io.IOException;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;
import org.apache.pdfbox.contentstream.PDFGraphicsStreamEngine;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.text.*;

/** Physical figure presence only; a matching image does not establish its meaning or correctness. */
public final class PdfVisualEvidence {
    private static final List<String> LABELS = List.of("use case diagram", "activity diagram", "wireframe");
    private static final Pattern UNAVAILABLE = Pattern.compile(
        "(?iU)\\b(?:(?:is|are|was|were)\\s+(?:missing|absent|not\\s+(?:included|provided|present))|todo|tbd|placeholder)\\b");
    private static final Pattern SECTION = Pattern.compile(
        "^(?:\\d+(?:\\.\\d+){0,5}|[A-Z](?:\\.\\d+){1,5})[.)]?\\s+\\p{L}.{1,150}$");
    private record Label(String name, float top) { }
    private record Image(float top, float width, float height) { }
    private record Geometry(List<Label> labels, List<Image> images, List<Float> sectionTops) { }
    private PdfVisualEvidence() { }

    /** Compare caption text, not arbitrary prose; formatting is not part of an artifact's identity. */
    public static boolean matchesCaption(String text, String expected) {
        return text != null && text.length() <= 180 && !UNAVAILABLE.matcher(text).find() && !captionKey(expected).isEmpty()
            && captionKey(text).equals(captionKey(expected));
    }

    public static boolean matchesPlainCaption(String text, String expected) {
        return text != null && text.length() <= 180 && !compact(expected).isEmpty()
            && compact(text).equals(compact(expected));
    }

    private static String captionKey(String text) {
        String value = Normalizer.normalize(Objects.requireNonNullElse(text, ""), Normalizer.Form.NFKC).strip()
            .replaceFirst("(?U)^\\d+(?:\\.\\d+)*[.)]?\\s+", "")
            .replaceFirst("(?iU)^(?:figure|fig\\.?)(?:\\s*\\d+(?:[.-]\\d+)*)?\\s*[-:–—.]?\\s*", "")
            .replaceFirst("(?iU)\\s+(?:for|of)\\b.*$", "");
        return compact(value);
    }

    private static String compact(String text) {
        String value = Normalizer.normalize(Objects.requireNonNullElse(text, ""), Normalizer.Form.NFKC)
            .toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", "");
        return value.replaceFirst("^(?:low|high)fidelity(?=wireframe$)", "");
    }

    static List<PdfInspection.PageText> associate(PDDocument document, List<PdfInspection.PageText> pages) {
        try {
            var geometries = new ArrayList<Geometry>();
            for (int index = 0; index < pages.size(); index++) {
                PDPage page = document.getPage(index);
                if (page.getRotation() != 0) { geometries.add(new Geometry(List.of(), List.of(), List.of())); continue; }
                var labels = new ArrayList<Label>();
                var sectionTops = new ArrayList<Float>();
                var stripper = new PDFTextStripper() {
                    @Override protected void writeString(String text, List<TextPosition> positions) throws IOException {
                        if (!positions.isEmpty() && SECTION.matcher(text.trim()).matches())
                            sectionTops.add(positions.stream().map(TextPosition::getYDirAdj).min(Float::compare).orElse(0f));
                        String name = LABELS.stream().filter(label -> matchesCaption(text, label)).findFirst().orElse(null);
                        if (name != null && !positions.isEmpty()) {
                            labels.add(new Label(name, positions.stream().map(TextPosition::getYDirAdj).max(Float::compare).orElse(0f)));
                        }
                        super.writeString(text, positions);
                    }
                };
                stripper.setStartPage(index + 1); stripper.setEndPage(index + 1); stripper.getText(document);
                var images = new ImageCollector(page); images.processPage(page);
                labels.sort(Comparator.comparing(Label::top));
                geometries.add(new Geometry(labels, images.images, sectionTops));
            }
            var result = new ArrayList<PdfInspection.PageText>();
            for (int i = 0; i < pages.size(); i++) {
                var current = geometries.get(i); var artifacts = new ArrayList<PdfInspection.IllustratedArtifact>();
                for (int j = 0; j < current.labels.size(); j++) {
                    Label label = current.labels.get(j);
                    if (current.labels.stream().filter(l -> l.name.equals(label.name)).count() != 1) continue;
                    float nextTop = j + 1 < current.labels.size() ? current.labels.get(j + 1).top : Float.MAX_VALUE;
                    float boundary = current.sectionTops.stream().filter(top -> top > label.top + 3)
                        .min(Float::compare).orElse(Float.MAX_VALUE);
                    boolean same = current.images.stream().anyMatch(image -> image.top >= label.top - 3
                        && image.top < nextTop - 3 && image.top + image.height < boundary + 3);
                    int graphicPage = same ? i + 1 : -1;
                    if (!same && boundary == Float.MAX_VALUE
                            && j == current.labels.size() - 1 && i + 1 < geometries.size()) {
                        Geometry next = geometries.get(i + 1);
                        float firstLabel = next.labels.isEmpty() ? Float.MAX_VALUE : next.labels.getFirst().top;
                        float firstSection = next.sectionTops.stream().min(Float::compare).orElse(Float.MAX_VALUE);
                        if (next.images.stream().anyMatch(image -> image.top < firstLabel - 3
                                && image.top + image.height < firstSection + 3)) graphicPage = i + 2;
                    }
                    if (graphicPage > 0) artifacts.add(new PdfInspection.IllustratedArtifact(label.name, graphicPage));
                }
                var page = pages.get(i);
                result.add(new PdfInspection.PageText(page.pageNumber(), page.text(), page.hasVisualContent(), artifacts));
            }
            return List.copyOf(result);
        } catch (IOException | RuntimeException optionalMetadataUnavailable) {
            return pages;
        }
    }

    private static final class ImageCollector extends PDFGraphicsStreamEngine {
        private final PDPage page;
        private final List<Image> images = new ArrayList<>();
        ImageCollector(PDPage page) { super(page); this.page = page; }
        @Override public void drawImage(PDImage image) {
            var matrix = getGraphicsState().getCurrentTransformationMatrix();
            if (Math.abs(matrix.getShearX()) > .01 || Math.abs(matrix.getShearY()) > .01) return;
            float width = Math.abs(matrix.getScaleX()), height = Math.abs(matrix.getScaleY());
            if (width < 120 || height < 90 || width * height < 18000) return;
            float y1 = matrix.getTranslateY(), y2 = y1 + matrix.getScaleY();
            images.add(new Image(page.getCropBox().getUpperRightY() - Math.max(y1, y2), width, height));
        }
        @Override public void appendRectangle(Point2D a, Point2D b, Point2D c, Point2D d) { }
        @Override public void clip(int windingRule) { }
        @Override public void moveTo(float x, float y) { }
        @Override public void lineTo(float x, float y) { }
        @Override public void curveTo(float x1,float y1,float x2,float y2,float x3,float y3) { }
        @Override public Point2D getCurrentPoint() { return new Point2D.Float(); }
        @Override public void closePath() { }
        @Override public void endPath() { }
        @Override public void strokePath() { }
        @Override public void fillPath(int windingRule) { }
        @Override public void fillAndStrokePath(int windingRule) { }
        @Override public void shadingFill(COSName shadingName) { }
    }
}
