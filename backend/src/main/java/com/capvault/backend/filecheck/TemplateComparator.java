package com.capvault.backend.filecheck;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

@Component
public class TemplateComparator {

    private static final Pattern NUMBERED_HEADING =
        Pattern.compile("^(\\d+(\\.\\d+)*|[IVXLC]+)[.)]?\\s+.+", Pattern.CASE_INSENSITIVE);

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
        List<String> missingHeadings = headingCandidates(templateText).stream()
            .filter(heading -> !normalizedSubmission.contains(normalize(heading)))
            .limit(8)
            .toList();
        boolean templateOnly = coverage >= properties.templateCoverageThreshold()
            && addedRatio <= properties.maximumAddedContentRatio();

        return new TemplateComparison(
            true,
            round(coverage),
            round(addedRatio),
            unchangedInstructions,
            missingHeadings,
            templateOnly
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

    private static List<String> headingCandidates(String value) {
        return value.lines()
            .map(String::trim)
            .filter(line -> line.length() >= 3 && line.length() <= 100)
            .filter(line -> line.split("\\s+").length <= 12)
            .filter(line -> NUMBERED_HEADING.matcher(line).matches() || uppercaseRatio(line) >= 0.60)
            .map(TemplateComparator::stripLeadingNumber)
            .filter(line -> line.length() >= 3)
            .filter(line -> !isDocumentBoilerplate(line))
            .distinct()
            .toList();
    }

    private static boolean isDocumentBoilerplate(String value) {
        String normalized = normalize(value);
        return normalized.startsWith("cebu institute of technology")
            || normalized.startsWith("college of computer studies")
            || normalized.startsWith("department of ")
            || normalized.equals("software requirements specification")
            || normalized.equals("software design description")
            || normalized.equals("table of contents")
            || normalized.equals("document revision history")
            || normalized.equals("revision history");
    }

    private static String stripLeadingNumber(String value) {
        return value.replaceFirst("^(\\d+(\\.\\d+)*|[IVXLC]+)[.)]?\\s+", "").trim();
    }

    private static double uppercaseRatio(String value) {
        long letters = value.chars().filter(Character::isLetter).count();
        if (letters == 0) {
            return 0;
        }
        long uppercase = value.chars().filter(Character::isUpperCase).count();
        return (double) uppercase / letters;
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
