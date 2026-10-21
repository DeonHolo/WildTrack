package com.capvault.backend.aireview;

import static com.capvault.backend.aireview.AiReviewProvider.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.function.BiPredicate;
import java.util.regex.Pattern;

/** Request-local review areas and links to evidence that survived the existing grounding rules. */
final class AiReviewCoveragePolicy {
    static final int MAX_CRITERIA = 24;
    private static final Pattern HEADING = Pattern.compile("^(\\d+(?:\\.\\d+)*)(?:[.)])?\\s+([\\p{L}].{2,150})$");
    private static final Pattern CONDITIONAL = Pattern.compile("(?i)\\b(?:optional|if applicable|when applicable|where applicable|as needed|example|sample|illustrative|e\\.g\\.|for instance|not required|need not)\\b");
    private static final Pattern DIRECTIVE = Pattern.compile("(?i)(?:^(?:[-*•]\\s*)?(?:\\d+[.)]\\s*)?(?:include|provide|describe|specify|identify|list|document|explain|show|discuss|evaluate|justify|report|contain|define|compare|address)\\b|\\b(?:must|shall|required|mandatory)\\b)");
    private static final Pattern REVIEW_GUIDANCE = Pattern.compile("(?i)^(?:(?:review|assess|check)\\s+(?:this|the)\\s+(?:(?:submitted|fictional|attached)\\s+)?(?:document|pdf|submission)\\b|do\\s+not\\s+(?:infer|invent|assume)\\b|don['’]t\\s+(?:infer|invent|assume)\\b)");
    private static final String SCOPE = "Review areas were derived from explicit content instructions and recognizable body headings in the mapped template. Ambiguous prose, optional/example sections and submission-only requests are not treated as mandatory checks. Recorded evidence is not a compliance decision.";
    private AiReviewCoveragePolicy() { }

    record Criterion(String id, String requirement, FindingSource source) { }
    record Plan(List<Criterion> criteria, int omittedCriteria, String scopeNote) { }

    static Plan plan(String instructions, String template) {
        var candidates = new LinkedHashMap<String, Criterion>();
        for (String raw : Objects.requireNonNullElse(instructions, "").split("(?<=[.!?])\\s+|\\R+")) {
            String text = raw.strip();
            if (text.length() < 10 || text.length() > 1500 || CONDITIONAL.matcher(text).find()
                    || !DIRECTIVE.matcher(text).find() || REVIEW_GUIDANCE.matcher(text).find()
                    || AiReviewEvidencePolicy.submissionOnlyAuthority(text)) continue;
            String normalized = key(text);
            if (normalized.matches(".*\\b(?:sharing permissions|anyone with the link|google drive folder|file naming|filename)\\b.*")
                    && !normalized.matches(".*\\b(?:section|diagram|schedule|risk|test|evidence|results|functional|architecture)\\b.*")) continue;
            candidates.putIfAbsent(normalized, new Criterion("", text, FindingSource.DELIVERABLE_REQUIREMENTS));
        }
        List<String> lines = Objects.requireNonNullElse(template, "").lines().map(String::strip).toList();
        for (int i = 0; i < lines.size(); i++) {
            String text = lines.get(i);
            var heading = HEADING.matcher(text);
            if (!heading.matches() || CONDITIONAL.matcher(text).find() || text.contains("...") || text.contains("…")
                    || text.matches(".*[.!?;]$")) continue;
            String number = heading.group(1), name = heading.group(2);
            String titleKey = key(name);
            if (titleKey.matches("(?:transaction|module|project|system|feature|function) name")
                    || titleKey.matches(".*\\b(?:table of contents|revision history|change history|approval|references|appendices)\\b.*")
                    || !AiReviewGroundingPolicy.templateHasNumberedBodyHeading(template, name)
                    || AiReviewGroundingPolicy.optionalTemplateSection(name, template, instructions)) continue;
            // Prefer the named subsections over counting both their parent and the same child area.
            boolean hasChild = false;
            for (int n = i + 1; n < lines.size(); n++) {
                var next = HEADING.matcher(lines.get(n));
                if (!next.matches()) continue;
                hasChild = next.group(1).startsWith(number + ".");
                break;
            }
            if (!hasChild) candidates.putIfAbsent(titleKey, new Criterion("", text, FindingSource.OFFICIAL_TEMPLATE));
        }
        var selected = new ArrayList<Criterion>();
        for (var item : candidates.values()) {
            if (selected.size() == MAX_CRITERIA) break;
            selected.add(new Criterion("C" + (selected.size() + 1), item.requirement(), item.source()));
        }
        return new Plan(List.copyOf(selected), Math.max(0, candidates.size() - selected.size()), selected.isEmpty()
            ? "No applicable content checklist could be derived from the supplied instructions or mapped official template. Document observations are still shown; this is not a whole-document compliance assessment."
            : SCOPE);
    }

    static ReviewCoverage proposed(Plan plan, List<CriterionAssessment> mappings) {
        var byId = uniqueMappings(mappings);
        var rows = plan.criteria().stream().map(criterion -> {
            var mapping = byId.get(criterion.id());
            return new CriterionAssessment(criterion.id(), criterion.requirement(), criterion.source(), CoverageStatus.NOT_CHECKED,
                mapping == null ? List.of() : mapping.verifiedCheckIndexes(),
                mapping == null ? List.of() : mapping.findingIndexes(),
                mapping == null ? List.of() : mapping.missingSectionIndexes(),
                mapping == null ? List.of() : mapping.verificationNoteIndexes());
        }).toList();
        return new ReviewCoverage(rows, plan.omittedCriteria(), 1, null, plan.scopeNote());
    }

    static ReviewCoverage grounded(Result raw, Result accepted, String instructions, String template) {
        var plan = plan(instructions, template);
        var byId = uniqueMappings(raw.coverage() == null ? List.of() : raw.coverage().criteria());
        var usedChecks = new HashSet<Integer>();
        var rows = plan.criteria().stream().map(criterion -> {
            var mapping = byId.get(criterion.id());
            if (mapping == null || !validReferences(mapping, raw))
                return row(criterion, List.of(), List.of(), List.of(), List.of());
            var checks = remap(mapping.verifiedCheckIndexes(), raw.verifiedChecks(), accepted.verifiedChecks(), AiReviewCoveragePolicy::sameCheck)
                .stream().filter(index -> relatedCheck(criterion, accepted.verifiedChecks().get(index)))
                .filter(usedChecks::add).toList();
            var findings = remap(mapping.findingIndexes(), raw.findings(), accepted.findings(), AiReviewCoveragePolicy::sameFinding)
                .stream().filter(index -> related(criterion, accepted.findings().get(index).source(), accepted.findings().get(index).requirement())).toList();
            var missing = remap(mapping.missingSectionIndexes(), raw.missingRequiredSections(), accepted.missingRequiredSections(), AiReviewCoveragePolicy::sameMissing)
                .stream().filter(index -> related(criterion, accepted.missingRequiredSections().get(index).source(), accepted.missingRequiredSections().get(index).requirement())).toList();
            var notes = new ArrayList<>(remap(mapping.verificationNoteIndexes(), raw.verificationNotes(), accepted.verificationNotes(), AiReviewCoveragePolicy::sameFinding)
                .stream().filter(index -> related(criterion, accepted.verificationNotes().get(index).source(), accepted.verificationNotes().get(index).requirement())).toList());
            // Deterministic template crosschecks are already grounded, but have no model-array index.
            for (int index = 0; index < accepted.verificationNotes().size(); index++) {
                var note = accepted.verificationNotes().get(index);
                if (note.source() == criterion.source() && key(note.requirement()).equals(key(criterion.requirement())) && !notes.contains(index)) notes.add(index);
            }
            return row(criterion,
                checks, findings, missing, List.copyOf(notes));
        }).toList();
        return new ReviewCoverage(rows, plan.omittedCriteria(), 1, null, plan.scopeNote());
    }

    static Result withCoverage(Result result, ReviewCoverage coverage) {
        return new Result(result.summary(), result.findings(), result.missingRequiredSections(), result.limitations(),
            result.suggestedAction(), result.verifiedChecks(), result.verificationNotes(), result.outcome(), coverage,
            result.documentOverview());
    }

    static Result withPasses(Result result, int passes, String notice) {
        var coverage = result.coverage();
        if (coverage == null) return result;
        return withCoverage(result, new ReviewCoverage(coverage.criteria(), coverage.omittedCriteria(),
            passes, notice, coverage.scopeNote()));
    }

    static List<String> unusedPassages(String documentText, List<String> priorEvidence) {
        return AiReviewGroundingPolicy.positiveEvidencePassages(documentText).stream()
            .filter(passage -> priorEvidence.stream().noneMatch(prior -> overlaps(passage, prior))).toList();
    }

    static boolean canFollowUp(Result result, String documentText) {
        return canFollowUp(result, documentText, result.coverage() != null);
    }

    static boolean canFollowUp(Result result, String documentText, boolean coverageWasProposed) {
        boolean noChecklistRecords = coverageWasProposed && result.coverage() != null
            && !result.coverage().criteria().isEmpty()
            && result.coverage().criteria().stream().allMatch(area -> area.status() == CoverageStatus.NOT_CHECKED);
        return result.findings().isEmpty() && result.missingRequiredSections().isEmpty()
            && (result.verifiedChecks().size() < 2 || noChecklistRecords)
            && unusedPassages(documentText, result.verifiedChecks().stream().map(VerifiedCheck::documentEvidence).toList()).size()
                >= Math.max(1, 2 - result.verifiedChecks().size());
    }

    static Result combine(Result first, Result second) {
        var findings = unique(first.findings(), second.findings(), AiReviewCoveragePolicy::sameFinding);
        var missing = unique(first.missingRequiredSections(), second.missingRequiredSections(), AiReviewCoveragePolicy::sameMissing);
        var checks = unique(first.verifiedChecks(), second.verifiedChecks(), AiReviewCoveragePolicy::sameCheck);
        var notes = unique(first.verificationNotes(), second.verificationNotes(), AiReviewCoveragePolicy::sameFinding);
        var combined = new Result(first.summary(), findings, missing, first.limitations(), first.suggestedAction(), checks, notes, null,
            null, first.documentOverview() != null ? first.documentOverview() : second.documentOverview());
        var a = mergeCoverage(first, combined);
        var b = mergeCoverage(second, combined);
        if (a == null) return withCoverage(combined, b);
        if (b == null) return withCoverage(combined, a);
        var secondRows = uniqueMappings(b.criteria());
        var merged = a.criteria().stream().map(item -> {
            var other = secondRows.get(item.id());
            if (other == null) return item;
            return row(new Criterion(item.id(), item.requirement(), item.source()),
                union(item.verifiedCheckIndexes(), other.verifiedCheckIndexes()),
                union(item.findingIndexes(), other.findingIndexes()),
                union(item.missingSectionIndexes(), other.missingSectionIndexes()),
                union(item.verificationNoteIndexes(), other.verificationNoteIndexes()));
        }).toList();
        return withCoverage(combined, new ReviewCoverage(merged, a.omittedCriteria(), 2, null, a.scopeNote()));
    }

    private static ReviewCoverage mergeCoverage(Result from, Result into) {
        if (from.coverage() == null) return null;
        return new ReviewCoverage(from.coverage().criteria().stream().map(item -> row(
            new Criterion(item.id(), item.requirement(), item.source()),
            remap(item.verifiedCheckIndexes(), from.verifiedChecks(), into.verifiedChecks(), AiReviewCoveragePolicy::sameCheck),
            remap(item.findingIndexes(), from.findings(), into.findings(), AiReviewCoveragePolicy::sameFinding),
            remap(item.missingSectionIndexes(), from.missingRequiredSections(), into.missingRequiredSections(), AiReviewCoveragePolicy::sameMissing),
            remap(item.verificationNoteIndexes(), from.verificationNotes(), into.verificationNotes(), AiReviewCoveragePolicy::sameFinding))).toList(),
            from.coverage().omittedCriteria(), 2, null, from.coverage().scopeNote());
    }

    private static HashMap<String, CriterionAssessment> uniqueMappings(List<CriterionAssessment> mappings) {
        var result = new HashMap<String, CriterionAssessment>();
        var duplicates = new HashSet<String>();
        if (mappings == null || mappings.size() > MAX_CRITERIA * 2) return result;
        for (var mapping : mappings) {
            if (mapping == null || mapping.id() == null) continue;
            if (result.putIfAbsent(mapping.id(), mapping) != null) duplicates.add(mapping.id());
        }
        duplicates.forEach(result::remove);
        return result;
    }

    private static CriterionAssessment row(Criterion criterion, List<Integer> checks, List<Integer> findings,
            List<Integer> missing, List<Integer> notes) {
        CoverageStatus status = !findings.isEmpty() || !missing.isEmpty() ? CoverageStatus.ISSUE_RECORDED
            : !notes.isEmpty() ? CoverageStatus.NEEDS_VERIFICATION
            : !checks.isEmpty() ? CoverageStatus.EVIDENCE_RECORDED : CoverageStatus.NOT_CHECKED;
        return new CriterionAssessment(criterion.id(), criterion.requirement(), criterion.source(), status,
            checks, findings, missing, notes);
    }

    private static <T> List<Integer> remap(List<Integer> indexes, List<T> before, List<T> after, BiPredicate<T, T> same) {
        var result = new ArrayList<Integer>();
        if (indexes == null || indexes.size() > 50) return List.of();
        for (Integer index : indexes) {
            if (index == null || index < 0 || index >= before.size()) continue;
            for (int next = 0; next < after.size(); next++) {
                if (same.test(before.get(index), after.get(next))) {
                    if (!result.contains(next)) result.add(next);
                    break;
                }
            }
        }
        return List.copyOf(result);
    }

    private static boolean validReferences(CriterionAssessment mapping, Result report) {
        return validIndexes(mapping.verifiedCheckIndexes(), report.verifiedChecks().size())
            && validIndexes(mapping.findingIndexes(), report.findings().size())
            && validIndexes(mapping.missingSectionIndexes(), report.missingRequiredSections().size())
            && validIndexes(mapping.verificationNoteIndexes(), report.verificationNotes().size());
    }

    private static boolean validIndexes(List<Integer> indexes, int size) {
        return indexes != null && indexes.size() <= 50
            && new HashSet<>(indexes).size() == indexes.size()
            && indexes.stream().allMatch(index -> index != null && index >= 0 && index < size);
    }

    private static <T> List<T> unique(List<T> first, List<T> second, BiPredicate<T, T> same) {
        var result = new ArrayList<T>(first);
        for (T item : second) if (result.size() < 50 && result.stream().noneMatch(existing -> same.test(existing, item))) result.add(item);
        return List.copyOf(result);
    }
    private static List<Integer> union(List<Integer> first, List<Integer> second) {
        var result = new java.util.LinkedHashSet<Integer>(first); result.addAll(second); return List.copyOf(result);
    }
    private static boolean sameCheck(VerifiedCheck a, VerifiedCheck b) {
        return a != null && b != null && a.source() == b.source() && key(a.aspect()).equals(key(b.aspect()))
            && key(a.documentEvidence()).equals(key(b.documentEvidence())) && key(a.requirement()).equals(key(b.requirement()));
    }
    private static boolean sameFinding(Finding a, Finding b) {
        return a != null && b != null && a.source() == b.source() && key(a.issue()).equals(key(b.issue()))
            && key(a.evidence()).equals(key(b.evidence())) && key(a.requirement()).equals(key(b.requirement()));
    }
    private static boolean sameMissing(MissingRequiredSection a, MissingRequiredSection b) {
        return a != null && b != null && a.source() == b.source() && key(a.section()).equals(key(b.section()))
            && key(a.requirement()).equals(key(b.requirement()));
    }
    private static boolean relatedCheck(Criterion criterion, VerifiedCheck check) {
        if (check.source() != FindingSource.DOCUMENT)
            return related(criterion, check.source(), check.requirement());
        // The model chooses the semantic link, but a wholly unrelated grounded
        // quotation cannot be used as coverage just because its array index exists.
        var generic = java.util.Set.of("must", "shall", "required", "include", "provide", "describe", "specify",
            "identify", "explain", "section", "document", "requirement", "should", "system", "project",
            "these", "their", "with", "from", "that", "this", "each", "following", "appropriate");
        var topics = java.util.Arrays.stream(key(criterion.requirement()).split(" "))
            .map(AiReviewCoveragePolicy::wordRoot).filter(word -> word.length() >= 4 && !generic.contains(word))
            .distinct().toList();
        var observed = java.util.Arrays.stream(key(check.aspect() + " " + check.documentEvidence()).split(" "))
            .map(AiReviewCoveragePolicy::wordRoot).collect(java.util.stream.Collectors.toSet());
        return !topics.isEmpty() && topics.stream().filter(observed::contains).count() >= Math.min(2, topics.size());
    }
    private static String wordRoot(String word) {
        return word.length() > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.substring(0, word.length() - 1) : word;
    }
    private static boolean related(Criterion criterion, FindingSource source, String requirement) {
        if (source != criterion.source() || requirement == null || requirement.isBlank()) return false;
        String first = key(criterion.requirement()), second = key(requirement);
        // A shared topic word cannot connect two different obligations. The exact
        // authority citation must name this area, or be a meaningful excerpt of it.
        if (first.equals(second)) return true;
        var ignored = java.util.Set.of("must", "shall", "required", "include", "provide", "describe", "section", "document", "requirements", "requirement", "should", "system", "project", "these", "their", "with", "from", "that", "this");
        String shorter = first.length() < second.length() ? first : second;
        boolean meaningful = java.util.Arrays.stream(shorter.split(" "))
            .anyMatch(word -> word.length() >= 4 && !ignored.contains(word));
        return meaningful && (first.contains(second) || second.contains(first));
    }
    private static boolean overlaps(String a, String b) { return !key(a).isBlank() && !key(b).isBlank() && (key(a).contains(key(b)) || key(b).contains(key(a))); }
    private static String key(String text) { return Objects.requireNonNullElse(text, "").toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").strip().replaceAll("\\s+", " "); }
}
