package com.capvault.backend.filecheck;

import java.util.Arrays;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

@Component
public class TemplateComparator {

    private static final Pattern TOC_ENTRY =
        Pattern.compile("^.+\\.{2,}.+\\d+\\s*$");
    private static final Pattern TOP_LEVEL_HEADING =
        Pattern.compile("^\\d+[.)]?\\s+.+");

    private final FileCheckProperties properties;

    public TemplateComparator(FileCheckProperties properties) {
        this.properties = properties;
    }

    public TemplateComparison compare(String templateText, String submittedText) {
        if (templateText == null || templateText.isBlank()) {
            return TemplateComparison.unavailable();
        }

        Set<String> templateTokens = tokens(templateText);
        Set<String> submittedTokens = tokens(submittedText);
        long templateMatches = templateTokens.stream().filter(submittedTokens::contains).count();
        long addedTokens = submittedTokens.stream().filter(token -> !templateTokens.contains(token)).count();
        double coverage = ratio(templateMatches, templateTokens.size());
        double addedRatio = ratio(addedTokens, submittedTokens.size());

        List<String> templateLines = meaningfulLines(templateText);
        String normalizedSubmission = normalize(submittedText);
        int unchangedInstructions = (int) templateLines.stream()
            .filter(line -> normalizedSubmission.contains(normalize(line)))
            .count();
        List<String> expectedHeadings = structuralHeadings(templateText);
        List<TemplateComparison.SectionEvidence> sectionEvidence = expectedHeadings.stream()
            .map(heading -> headingEvidence(submittedText, heading))
            .toList();
        List<String> detectedHeadings = sectionEvidence.stream()
            .filter(evidence -> "DETECTED".equals(evidence.status()))
            .map(TemplateComparison.SectionEvidence::expectedHeading)
            .toList();
        // Preserve every finding. The previous eight-item cap made displayed
        // missing-section counts incorrect for templates with larger gaps.
        List<String> missingHeadings = sectionEvidence.stream()
            .filter(evidence -> "NOT_DETECTED".equals(evidence.status()))
            .map(TemplateComparison.SectionEvidence::expectedHeading)
            .toList();
        boolean templateOnly = coverage >= properties.templateCoverageThreshold()
            && addedRatio <= properties.maximumAddedContentRatio();

        return new TemplateComparison(
            true,
            round(coverage),
            round(addedRatio),
            unchangedInstructions,
            missingHeadings,
            templateOnly,
            expectedHeadings,
            detectedHeadings,
            sectionEvidence
        );
    }

    private static Set<String> tokens(String value) {
        Set<String> result = new LinkedHashSet<>();
        Arrays.stream(normalize(value).split("[^a-z0-9]+"))
            .filter(token -> token.length() >= 3)
            .forEach(result::add);
        return result;
    }

    private static List<String> meaningfulLines(String value) {
        return value.lines()
            .map(String::trim)
            .filter(line -> line.length() >= 24 && line.length() <= 240)
            .map(TemplateComparator::stripLeadingNumber)
            .distinct()
            .toList();
    }

    private static List<String> structuralHeadings(String value) {
        List<String> lines = value == null ? List.of() : value.lines().map(String::trim).toList();
        List<String> toc = tocHeadings(lines);
        if (toc.size() >= 2) return toc;

        // Without a usable TOC, stay conservative. Top-level numbered sections are much
        // safer than treating every numbered example row or uppercase sample value as a heading.
        return lines.stream()
            .filter(line -> line.length() >= 3 && line.length() <= 100)
            .filter(line -> TOP_LEVEL_HEADING.matcher(line).matches())
            .filter(line -> !isTocEntry(line))
            .map(TemplateComparator::stripLeadingNumber)
            .filter(line -> line.length() >= 3)
            .filter(line -> !isDocumentBoilerplate(line))
            .distinct()
            .toList();
    }

    private static List<String> tocHeadings(List<String> lines) {
        int tocStart = -1;
        for (int index = 0; index < lines.size(); index++) {
            if ("table of contents".equals(normalize(lines.get(index)))) {
                tocStart = index + 1;
                break;
            }
        }
        if (tocStart < 0) return List.of();

        List<String> result = new ArrayList<>();
        int lastEntryIndex = -1;
        for (int index = tocStart; index < lines.size() && index < tocStart + 180; index++) {
            String line = lines.get(index);
            if (isTocEntry(line)) {
                String heading = tocHeading(line);
                if (heading.length() >= 3
                        && !isDocumentBoilerplate(heading)
                        && !isTemplatePlaceholderHeading(heading)
                        && !result.contains(heading)) {
                    result.add(heading);
                    lastEntryIndex = index;
                }
                continue;
            }
            if (lastEntryIndex >= 0 && index - lastEntryIndex > 12) break;
        }
        return List.copyOf(result);
    }

    private static TemplateComparison.SectionEvidence headingEvidence(String text, String expectedHeading) {
        String expected = normalize(expectedHeading);
        if (!expected.isBlank()) {
            List<String> lines = (text == null ? "" : text).lines().toList();
            for (int index = 0; index < lines.size(); index++) {
                String line = lines.get(index).trim();
                if (line.isBlank() || isTocEntry(line)) continue;
                if (expected.equals(canonicalHeadingLine(line))) {
                    return new TemplateComparison.SectionEvidence(
                        expectedHeading, "DETECTED", line, index + 1, "NORMALIZED_EXACT");
                }
            }
        }
        return new TemplateComparison.SectionEvidence(expectedHeading, "NOT_DETECTED", null, null, null);
    }

    private static boolean isTocEntry(String line) {
        return line != null && TOC_ENTRY.matcher(line.trim()).matches();
    }

    private static String tocHeading(String line) {
        String value = line == null ? "" : line.trim();
        value = value.replaceFirst("\\s+\\d+\\s*$", "");
        value = value.replaceFirst(
            "^((?:\\d+(?:\\.(?:\\d+|[A-Za-z]))*\\.?|[A-Z](?:\\.\\d+)*\\.?)\\s*)\\.{2,}\\s*",
            "$1"
        );
        value = value.replaceFirst("\\s*\\.{2,}\\s*$", "");
        return displayHeading(value);
    }

    private static String canonicalHeadingLine(String line) {
        return normalize(displayHeading(line));
    }

    private static String displayHeading(String line) {
        return stripLeadingNumber(line == null ? "" : line.trim())
            .replaceFirst("^[^A-Za-z0-9]+", "")
            .trim();
    }

    private static boolean isTemplatePlaceholderHeading(String heading) {
        String normalized = normalize(heading);
        return normalized.matches(".*\\bcase n\\b.*")
            || normalized.matches(".*\\btest n\\b.*")
            || normalized.equals("transaction name")
            || normalized.startsWith("insert ");
    }

    private static boolean isDocumentBoilerplate(String value) {
        String normalized = normalize(value);
        return normalized.startsWith("cebu institute of technology")
            || normalized.equals("university")
            || normalized.startsWith("college of computer studies")
            || normalized.startsWith("department of ")
            || normalized.equals("software requirements specification")
            || normalized.equals("software design description")
            || normalized.equals("table of contents")
            || normalized.equals("change history")
            || normalized.equals("document revision history")
            || normalized.equals("revision history");
    }

    private static String stripLeadingNumber(String value) {
        return value.replaceFirst(
            "^(?:\\d+(?:\\.(?:\\d+|[A-Za-z]))*|[A-Z](?:\\.\\d+)*|[IVXLC]+)[.)]?\\s+",
            ""
        ).trim();
    }

    private static String normalize(String value) {
        return value == null ? "" : value
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", " ")
            .trim();
    }

    private static double ratio(long numerator, long denominator) {
        return denominator == 0 ? 0 : (double) numerator / denominator;
    }

    private static double round(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }
}
