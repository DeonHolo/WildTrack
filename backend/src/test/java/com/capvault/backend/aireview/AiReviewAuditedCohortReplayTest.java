package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.capvault.backend.filecheck.PdfInspection;
import com.capvault.backend.filecheck.PdfInspector;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/** Opt-in, provider-free replay of the saved real-PDF AI accuracy audit. */
class AiReviewAuditedCohortReplayTest {
    private static final String AUDIT_PROPERTY = "wildtrack.aiReview.auditPath";
    private static final String OUTPUT_DIRECTORY = ".scratch/ai-review-accuracy-repair-20261020/replay";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern ACRONYM = Pattern.compile("(?i)acronym\\s+([A-Z][A-Z0-9]{1,9})\\b");
    private static final Set<String> DELIVERABLES = Set.of("STD", "Refactored SRS", "Refactored SDD", "Refactored SPMP");

    @Test
    void replaysAuditedCohortAgainstCurrentProductionPostprocessor() throws Exception {
        String configured = System.getProperty(AUDIT_PROPERTY);
        assumeTrue(configured != null && !configured.isBlank(),
            "Set -D" + AUDIT_PROPERTY + "=<absolute audit directory> to enable the real-PDF replay");
        Path audit = Path.of(configured).toAbsolutePath().normalize();
        assumeTrue(audit.isAbsolute() && Files.isDirectory(audit), "Audit path must be an existing absolute directory");

        List<Case> all = loadCases(audit);
        Map<String, Case> unique = uniqueBySha(all);
        assertThat(all).as("saved audit records").hasSize(18);
        assertThat(unique).as("R16 is a duplicate of R15; replay each PDF once").hasSize(17);
        assertThat(unique.keySet()).containsExactly("R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08",
            "R09", "R10", "R11", "R12", "R13", "R14", "R15", "R17", "R18");

        Expectations expectations = expectations(unique);
        assertThat(expectations.supportedOccurrences())
            .as("genuine wholly supported acronym finding occurrences in the unique audit cohort").isEqualTo(11);

        Path output = repositoryRoot().resolve(OUTPUT_DIRECTORY);
        Files.createDirectories(output);
        ArrayNode documents = JSON.createArrayNode();
        Map<String, Replay> replays = new LinkedHashMap<>();
        int beforeFindings = 0, afterFindings = 0, beforeNotes = 0, afterNotes = 0;
        for (Case audited : unique.values()) {
            Replay replay = replay(audited, audit);
            replays.put(audited.id(), replay);
            beforeFindings += replay.audited().before().findings().size();
            afterFindings += replay.after().findings().size();
            beforeNotes += replay.audited().before().verificationNotes().size();
            afterNotes += replay.after().verificationNotes().size();
            documents.add(documentOutput(replay));
        }

        ObjectNode totals = JSON.createObjectNode();
        totals.put("records", all.size());
        totals.put("uniquePdfs", unique.size());
        totals.put("beforeAcceptedFindings", beforeFindings);
        totals.put("afterAcceptedFindings", afterFindings);
        totals.put("beforeVerificationNotes", beforeNotes);
        totals.put("afterVerificationNotes", afterNotes);
        totals.put("supportedAcronymOccurrences", expectations.supportedOccurrences());
        totals.put("forbiddenAcronymOccurrences", expectations.forbiddenOccurrences());
        totals.set("documents", documents);
        JSON.writerWithDefaultPrettyPrinter().writeValue(output.resolve("replay-summary.json").toFile(), totals);
        assertThat(Files.isRegularFile(output.resolve("replay-summary.json"))).isTrue();

        for (Case audited : unique.values()) {
            CaseExpectations expected = expectations.byRecord().get(audited.id());
            List<String> afterIssues = issueTexts(replays.get(audited.id()).after());
            assertThat(expected.forbiddenAcronyms()).allSatisfy(acronym ->
                assertThat(afterIssues).as(audited.id() + " forbidden acronym " + acronym)
                    .noneMatch(issue -> issue.toUpperCase(Locale.ROOT).contains("ACRONYM " + acronym)));
            assertThat(expected.supportedAcronyms()).allSatisfy(acronym ->
                assertThat(afterIssues).as(audited.id() + " genuine acronym " + acronym)
                    .anyMatch(issue -> issue.toUpperCase(Locale.ROOT).contains("ACRONYM " + acronym)));
            assertThat(expected.requiredIssueFragments()).allSatisfy(fragment ->
                assertThat(afterIssues).as(audited.id() + " retained supported issue " + fragment)
                    .anyMatch(issue -> issue.toLowerCase(Locale.ROOT).contains(fragment)));
        }
        var r02 = replays.get("R02").after();
        assertThat(r02.findings()).noneMatch(f -> f.issue().contains("completely different project"));
        assertThat(r02.findings()).anyMatch(f -> f.issue().contains("unfilled template instruction"));
        var r07 = replays.get("R07").after();
        for (String family : List.of("Use Case Diagram", "Activity Diagram", "Wireframe")) {
            assertThat(r07.verificationNotes()).as("R07 advisory figure family " + family)
                .anyMatch(f -> f.issue().contains(family) && f.issue().contains("label was not located"));
        }
        assertThat(r07.verifiedChecks()).noneMatch(c -> c.aspect().equals("Data Privacy Enforcement Compliance"));
        assertThat(replays.get("R12").after().verificationNotes())
            .noneMatch(f -> f.issue().contains("label was not located"));
        assertThat(replays.get("R14").after().verificationNotes())
            .noneMatch(f -> f.issue().contains("Use Case Description") || f.issue().contains("label was not located"));
    }

    private static List<Case> loadCases(Path audit) throws IOException {
        try (var stream = Files.list(audit.resolve("documents"))) {
            return stream.filter(Files::isDirectory).sorted().map(dir -> readCase(dir, audit)).toList();
        }
    }

    private static Case readCase(Path directory, Path audit) {
        try {
            JsonNode record = JSON.readTree(directory.resolve("record.json").toFile());
            JsonNode report = record.path("report");
            JsonNode assessment = JSON.readTree(audit.resolve("assessments").resolve(directory.getFileName() + ".json").toFile());
            String deliverable = record.path("deliverable").asText();
            assertThat(DELIVERABLES).contains(deliverable);
            assertThat(report.isObject()).as(directory.getFileName() + " saved report").isTrue();
            AiReviewProvider.Result parsed = report.traverse(JSON).readValueAs(AiReviewProvider.Result.class);
            return new Case(directory.getFileName().toString(), directory, record, assessment, parsed);
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot read audit record " + directory, exception);
        }
    }

    private static Map<String, Case> uniqueBySha(List<Case> cases) {
        Map<String, Case> byDigest = new LinkedHashMap<>();
        for (Case audited : cases) {
            String digest = audited.record().path("sha256").asText();
            assertThat(digest).as(audited.id() + " SHA-256").matches("[0-9a-f]{64}");
            byDigest.putIfAbsent(digest, audited);
        }
        Map<String, Case> unique = new LinkedHashMap<>();
        byDigest.values().stream().sorted(java.util.Comparator.comparing(Case::id))
            .forEach(c -> unique.put(c.id(), c));
        return unique;
    }

    private static Replay replay(Case audited, Path audit) throws IOException {
        byte[] bytes = Files.readAllBytes(audited.directory().resolve("source.pdf"));
        assertThat(bytes.length).as(audited.id() + " source-size metadata")
            .isEqualTo(requiredInt(audited.record(), audited.id(), "sourceSize"));
        String sha256 = AiReviewService.sha256(bytes);
        assertThat(sha256).as(audited.id() + " PDF integrity").isEqualTo(audited.record().path("sha256").asText());
        PdfInspection inspection = new PdfInspector().inspect(bytes);
        assertThat(inspection.readable()).as(audited.id() + " readable PDF").isTrue();
        int recordedPages = requiredInt(audited.record(), audited.id(), "pages");
        int fileCheckPages = requiredInt(audited.record(), audited.id(), "fileCheck", "document", "pageCount");
        assertThat(inspection.pageCount()).as(audited.id() + " top-level page metadata").isEqualTo(recordedPages);
        assertThat(inspection.pageCount()).as(audited.id() + " Document Check page metadata").isEqualTo(fileCheckPages);
        assertThat(inspection.textBearingPageCount()).isGreaterThan(0);
        String deliverable = audited.record().path("deliverable").asText();
        String title = titleFor(deliverable);
        String template = Files.readString(audit.resolve("templates").resolve(templateFor(deliverable)), StandardCharsets.UTF_8);
        String instructions = "Submit your " + title + " as a PDF Drive file.";
        AiReviewProvider.Result seed = replaySeed(audited.before());
        assertThat(seed.verificationNotes()).as(audited.id() + " replay seed notes")
            .allSatisfy(note -> assertThat(note.evidence()).as("seed note evidence").isNotBlank());
        AiReviewProvider.Result after = AiReviewService.postprocessForBenchmark(seed, title, instructions, template, inspection);
        return new Replay(audited, inspection, seed, after);
    }

    private static AiReviewProvider.Result replaySeed(AiReviewProvider.Result saved) {
        List<AiReviewProvider.Finding> notes = saved.verificationNotes().stream()
            .filter(note -> note.evidence() != null && !note.evidence().isBlank())
            .filter(note -> !generatedAdvisory(note.issue()))
            .toList();
        return new AiReviewProvider.Result(saved.summary(), saved.findings(), saved.missingRequiredSections(),
            saved.limitations(), saved.suggestedAction(), saved.verifiedChecks(), notes, saved.outcome());
    }

    private static boolean generatedAdvisory(String issue) {
        String text = issue == null ? "" : issue;
        return text.startsWith("Mapped-template body heading")
            || text.startsWith("Text extraction could not verify")
            || text.startsWith("Text extraction cannot establish")
            || text.startsWith("Some provider observations");
    }

    private static Expectations expectations(Map<String, Case> unique) {
        Map<String, CaseExpectations> byRecord = new LinkedHashMap<>();
        int supportedOccurrences = 0;
        int forbiddenOccurrences = 0;
        for (Case audited : unique.values()) {
            CaseExpectations expected = new CaseExpectations(new LinkedHashSet<>(), new LinkedHashSet<>(), new LinkedHashSet<>());
            supportedOccurrences += collectAcronyms(audited.assessment().path("findings"), expected.supportedAcronyms(), expected.forbiddenAcronyms());
            supportedOccurrences += collectAcronyms(audited.assessment().path("verificationNotes"), expected.supportedAcronyms(), expected.forbiddenAcronyms());
            forbiddenOccurrences += countForbidden(audited.assessment().path("findings"));
            forbiddenOccurrences += countForbidden(audited.assessment().path("verificationNotes"));
            collectRequiredIssues(audited.assessment().path("findings"), expected.requiredIssueFragments());
            collectRequiredIssues(audited.assessment().path("verificationNotes"), expected.requiredIssueFragments());
            byRecord.put(audited.id(), expected);
        }
        return new Expectations(byRecord, supportedOccurrences, forbiddenOccurrences);
    }

    private static int collectAcronyms(JsonNode entries, Set<String> supported, Set<String> forbidden) {
        int supportedOccurrences = 0;
        if (!entries.isArray()) return 0;
        for (JsonNode entry : entries) {
            String issue = entry.path("savedItem").path("issue").asText();
            if (issue.isBlank()) issue = entry.path("issue").asText();
            Matcher matcher = ACRONYM.matcher(issue);
            if (!matcher.find()) continue;
            String acronym = matcher.group(1).toUpperCase(Locale.ROOT);
            switch (entry.path("classification").asText()) {
                case "supported" -> {
                    supported.add(acronym);
                    supportedOccurrences++;
                }
                case "unsupported" -> forbidden.add(acronym);
                default -> { }
            }
        }
        return supportedOccurrences;
    }

    private static int countForbidden(JsonNode entries) {
        if (!entries.isArray()) return 0;
        int count = 0;
        for (JsonNode entry : entries) {
            String issue = entry.path("savedItem").path("issue").asText();
            if (issue.isBlank()) issue = entry.path("issue").asText();
            if ("unsupported".equals(entry.path("classification").asText()) && ACRONYM.matcher(issue).find()) count++;
        }
        return count;
    }

    private static void collectRequiredIssues(JsonNode entries, Set<String> required) {
        if (!entries.isArray()) return;
        for (JsonNode entry : entries) {
            if (!"supported".equals(entry.path("classification").asText())) continue;
            String issue = entry.path("savedItem").path("issue").asText();
            String lower = issue.toLowerCase(Locale.ROOT);
            if (lower.contains("unrelated") || lower.contains("wrong document")) required.add("unrelated");
            if (lower.contains("no substantive content") || lower.contains("empty")) required.add("no substantive content");
        }
    }

    private static List<String> issueTexts(AiReviewProvider.Result result) {
        List<String> issues = new ArrayList<>();
        result.findings().forEach(f -> issues.add(f.issue()));
        result.verificationNotes().forEach(f -> issues.add(f.issue()));
        return issues;
    }

    private static int requiredInt(JsonNode root, String recordId, String... path) {
        JsonNode value = root;
        for (String segment : path) value = value.path(segment);
        assertThat(value.isIntegralNumber()).as(recordId + " metadata " + String.join(".", path)).isTrue();
        return value.intValue();
    }

    private static ObjectNode documentOutput(Replay replay) {
        ObjectNode result = JSON.createObjectNode();
        result.put("recordId", replay.audited().id());
        result.put("sha256", replay.audited().record().path("sha256").asText());
        result.put("pageCount", replay.inspection().pageCount());
        result.put("textBearingPageCount", replay.inspection().textBearingPageCount());
        result.put("extractedCharacterCount", replay.inspection().extractedCharacterCount());
        result.set("before", JSON.valueToTree(replay.audited().before()));
        result.set("seed", JSON.valueToTree(replay.seed()));
        result.set("after", JSON.valueToTree(replay.after()));
        result.set("assessment", replay.audited().assessment());
        return result;
    }

    private static String titleFor(String deliverable) {
        return switch (deliverable) {
            case "STD" -> "Software Test Document (STD)";
            case "Refactored SRS" -> "Software Requirements Specification (SRS)";
            case "Refactored SDD" -> "Software Design Description (SDD)";
            case "Refactored SPMP" -> "Software Project Management Plan (SPMP)";
            default -> throw new IllegalArgumentException(deliverable);
        };
    }

    private static String templateFor(String deliverable) {
        return switch (deliverable) {
            case "STD" -> "STD.txt";
            case "Refactored SRS" -> "SRS.txt";
            case "Refactored SDD" -> "SDD.txt";
            case "Refactored SPMP" -> "SPMP.txt";
            default -> throw new IllegalArgumentException(deliverable);
        };
    }

    private static Path repositoryRoot() {
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        if (Files.isRegularFile(cwd.resolve("backend/pom.xml"))) return cwd;
        if ("backend".equals(cwd.getFileName().toString())) return cwd.getParent();
        throw new IllegalStateException("Expected repository root or backend working directory");
    }

    private record Case(String id, Path directory, JsonNode record, JsonNode assessment, AiReviewProvider.Result before) { }
    private record Replay(Case audited, PdfInspection inspection, AiReviewProvider.Result seed,
                          AiReviewProvider.Result after) { }
    private record CaseExpectations(Set<String> supportedAcronyms, Set<String> forbiddenAcronyms,
                                    Set<String> requiredIssueFragments) { }
    private record Expectations(Map<String, CaseExpectations> byRecord, int supportedOccurrences,
                                int forbiddenOccurrences) { }
}
