package com.capvault.backend.template;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/** Keep explicit directions intact; readable slot wording cannot import filled sample facts. */
final class TemplateDraftText {
    private static final Pattern DIRECTIVE = Pattern.compile(
        "(?i)^(?:provide|describe|specify|define|explain|identify|list|record|write|state|indicate|include|prepare|ensure|document|create)\\b");
    private static final Pattern MODAL = Pattern.compile("\\b(?:shall|must|should|may|might)\\b");
    private static final Pattern SAMPLE = Pattern.compile(
        "(?i)\\b(?:is|are|was|were|will|integrates|serves|supports|includes|provides|contains)\\b|^[^:]{1,100}:\\s*\\S");
    private static final Set<String> SCAFFOLD = Set.of("provide", "content", "for", "the", "a", "an", "each",
        "and", "with", "including", "of", "in", "under", "this", "section", "describe", "include");
    private TemplateDraftText() { }

    static String instruction(String kind, String proposed, List<TemplateSourceCatalog.Block> sources,
            List<TemplateSourceCatalog.Block> context) {
        var body = sources.stream().filter(b -> !b.kindHint().equals("HEADING")).map(b -> layout(b.text())).toList();
        String scope = context.stream().filter(b -> !b.kindHint().equals("HEADING")).map(b -> layout(b.text()))
            .filter(t -> DIRECTIVE.matcher(t.replaceFirst("^- ", "")).find() || MODAL.matcher(t).find()
                || t.matches("(?is).*\\b(?:for each|for every|for all|if|when|unless|except|only)\\b.*"))
            .filter(t -> body.stream().noneMatch(b -> b.contains(t))).distinct()
            .collect(java.util.stream.Collectors.joining("\n\n"));
        boolean explicit = body.stream().anyMatch(t -> DIRECTIVE.matcher(t.replaceFirst("^- ", "")).find()
            || MODAL.matcher(t).find());
        boolean filled = !explicit && body.stream().anyMatch(t -> SAMPLE.matcher(t.replaceFirst("^- ", "")).find());
        if (explicit || kind.equals("INSTRUCTION")) {
            // Format the complete original direction instead of asking a model to preserve every qualifier.
            return scoped(scope, TemplateInstructionProtocol.draftText(String.join("\n\n", body.isEmpty()
                ? sources.stream().map(b -> layout(b.text())).toList() : body)));
        }

        var headings = sources.stream().filter(b -> b.kindHint().equals("HEADING")).map(b -> layout(b.text())).toList();
        var labels = filled || body.isEmpty() ? headings : body;
        if (labels.isEmpty()) labels = sources.stream().map(b -> layout(b.text())).toList();
        if (!filled) {
            var allowed = new HashSet<>(SCAFFOLD);
            labels.forEach(label -> allowed.addAll(words(label)));
            sources.stream().filter(b -> b.kindHint().equals("HEADING")).forEach(b -> allowed.addAll(words(b.text())));
            context.stream().filter(b -> b.kindHint().equals("HEADING") || !SAMPLE.matcher(layout(b.text())).find())
                .forEach(b -> allowed.addAll(words(b.text())));
            var actual = words(proposed);
            var required = new HashSet<String>();
            labels.forEach(label -> required.addAll(words(label)));
            required.removeAll(SCAFFOLD);
            long alternatives = labels.stream().flatMap(t -> Pattern.compile("\\bor\\b", Pattern.CASE_INSENSITIVE).matcher(t).results()).count();
            long retained = Pattern.compile("\\bor\\b", Pattern.CASE_INSENSITIVE).matcher(proposed).results().count();
            String comparable = layout(proposed).toLowerCase(java.util.Locale.ROOT);
            boolean criticalLabels = labels.stream().filter(t -> t.matches("(?is).*\\bor\\b.*|.*[<>=≤≥0-9].*"))
                .filter(t -> !repeatedEntityLabel(t, proposed))
                .allMatch(t -> comparable.contains(t.replaceFirst("^- ", "").replaceFirst("[.;:]$", "").toLowerCase(java.util.Locale.ROOT)));
            var numbers = new HashSet<String>();
            sources.forEach(b -> Pattern.compile("\\d+(?:[.,]\\d+)?").matcher(b.text()).results()
                .forEach(m -> numbers.add(m.group())));
            boolean noNewNumbers = Pattern.compile("\\d+(?:[.,]\\d+)?").matcher(proposed).results()
                .allMatch(m -> numbers.contains(m.group()));
            if (allowed.containsAll(actual) && actual.containsAll(required) && retained >= alternatives && criticalLabels && noNewNumbers)
                return scoped(scope, TemplateInstructionProtocol.draftText(proposed));
        }
        // A completed example supplies its section name, never compulsory sample features or dates.
        if (labels.size() == 1) return scoped(scope, "Provide content for " + labels.getFirst().replaceFirst("[.:]+$", "") + ".");
        return scoped(scope, "Provide content for:\n" + labels.stream().map(t -> "- " + t.replaceFirst("^- ", ""))
            .collect(java.util.stream.Collectors.joining("\n")));
    }

    static String layout(String raw) {
        var parts = new ArrayList<String>();
        var paragraph = new StringBuilder();
        for (String line : raw.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1)) {
            String clean = line.replaceAll("[\\t\\p{Zs}]+", " ").strip();
            if (clean.matches("[_\\s]{3,}")) continue;
            boolean bullet = clean.matches("^(?:[\\p{Co}•●▪◦*]|o)\\s+.*");
            if (clean.isEmpty() || bullet) {
                if (!paragraph.isEmpty()) { parts.add(paragraph.toString()); paragraph.setLength(0); }
                if (bullet) parts.add("- " + clean.replaceFirst("^(?:[\\p{Co}•●▪◦*]|o)\\s+", ""));
            } else {
                if (!paragraph.isEmpty()) paragraph.append(' ');
                paragraph.append(clean);
            }
        }
        if (!paragraph.isEmpty()) parts.add(paragraph.toString());
        return Normalizer.normalize(String.join("\n", parts), Normalizer.Form.NFC);
    }

    private static Set<String> words(String value) {
        var words = new HashSet<String>();
        Pattern.compile("[\\p{L}][\\p{L}\\p{N}]*").matcher(layout(value).toLowerCase(java.util.Locale.ROOT)).results()
            .map(java.util.regex.MatchResult::group).filter(w -> !w.equals("s")).forEach(w ->
                words.add(w.length() > 3 && w.endsWith("s") ? w.substring(0, w.length() - 1) : w));
        return words;
    }

    private static boolean repeatedEntityLabel(String label, String proposed) {
        var numbered = Pattern.compile("^([\\p{L} -]{1,60})\\s+\\d+(?:\\.\\d+)*$").matcher(label);
        if (!numbered.matches()) return false;
        return Pattern.compile("(?i)\\b(?:each|every)\\s+" + Pattern.quote(numbered.group(1).strip()) + "\\b")
            .matcher(proposed).find();
    }

    private static String scoped(String scope, String instruction) {
        if (scope.matches("(?i)^for (?:each|every) [^,.]+, (?:provide|record|complete) the following\\.?$")) {
            String subject = scope.substring(0, scope.indexOf(','));
            if (instruction.regionMatches(true, 0, subject, 0, subject.length())) return instruction;
        }
        return scope.isBlank() || instruction.contains(scope) ? instruction : scope + "\n\n" + instruction;
    }
}
