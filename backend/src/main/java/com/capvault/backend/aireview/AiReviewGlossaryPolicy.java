package com.capvault.backend.aireview;

import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Small, conservative checks for glossary entries and acronym use. */
final class AiReviewGlossaryPolicy {
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z][A-Za-z0-9]{1,15}");
    private static final Pattern EXPANSION_BEFORE_TOKEN = Pattern.compile(
        "(?i)\\b(?:[A-Za-z][A-Za-z0-9/&'-]*\\s+){1,12}[A-Za-z][A-Za-z0-9/&'-]*\\s*\\(\\s*%s\\s*\\)");
    private static final Pattern TOKEN_DEFINITION = Pattern.compile(
        "(?i)\\b%s\\b\\s*(?:means|stands\\s+for|is\\s+defined\\s+as|[:=]|[-\\u2013\\u2014])\\s*(.*)$");
    private static final Pattern DATE_PLACEHOLDER = Pattern.compile(
        "(?i)\\b(?:DD|MM|MMM|MMMM|YYYY)(?:[\\s/.-]+(?:DD|MM|MMM|MMMM|YYYY)){1,3}\\b");
    private static final Pattern VERSION_ID = Pattern.compile("(?i)^V\\d{1,5}$");
    private static final Set<String> MONTHS = Set.of(
        "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
        "JANUARY", "FEBRUARY", "MARCH", "APRIL", "JUNE", "JULY", "AUGUST", "SEPTEMBER",
        "OCTOBER", "NOVEMBER", "DECEMBER");
    private static final Set<String> NAMED_LANGUAGE_OR_FRAMEWORK = Set.of(
        "ASP", "PHP", "PYTHON", "JAVA", "JAVASCRIPT", "TYPESCRIPT", "KOTLIN", "SWIFT", "RUBY",
        "HTML", "CSS", "SQL", "REACT", "SPRING", "DJANGO", "LARAVEL", "NODE", "NODEJS");

    private AiReviewGlossaryPolicy() { }

    /**
     * Returns true only when the token has a nearby, meaningful glossary definition or a
     * conventional expansion in the document. The nearby limit is intentional: a random
     * occurrence elsewhere in a long definitions section must not prove a definition.
     */
    static boolean acronymDefined(String token, String definitionsText, String fullDocument) {
        String acronym = Objects.requireNonNullElse(token, "").trim();
        if (!TOKEN.matcher(acronym).matches()) return false;
        String quoted = Pattern.quote(acronym);

        String document = Objects.requireNonNullElse(fullDocument, "");
        if (Pattern.compile(String.format(EXPANSION_BEFORE_TOKEN.pattern(), quoted))
                .matcher(document).find()) return true;
        Matcher caption = Pattern.compile("(?m)^[ \\t]*((?:[A-Z][a-z]+[ \\t]+){1,7}[A-Z][a-z]+)[ \\t]*[:–—-][ \\t]*"
            + quoted + "\\b").matcher(document);
        while (caption.find()) {
            String initials = java.util.Arrays.stream(caption.group(1).split("\\s+"))
                .map(word -> word.substring(0, 1)).collect(java.util.stream.Collectors.joining());
            if (initials.equalsIgnoreCase(acronym)) return true;
        }

        String definitions = Objects.requireNonNullElse(definitionsText, "");
        if (definitions.isBlank()) return false;
        String[] lines = definitions.split("\\R", -1);
        for (int i = 0; i < lines.length; i++) {
            Matcher occurrence = Pattern.compile("(?i)\\b" + quoted + "\\b").matcher(lines[i]);
            if (!occurrence.find()) continue;

            StringBuilder nearby = new StringBuilder(lines[i]);
            for (int next = i + 1; next < lines.length && next <= i + 2; next++) {
                if (!lines[next].isBlank()) nearby.append(' ').append(lines[next]);
            }
            String region = nearby.toString();
            Matcher grouped = Pattern.compile("^\\s*((?:[A-Z][A-Za-z0-9-]*\\s*[/|,]\\s*)+"
                + "[A-Z][A-Za-z0-9-]*)\\s*(?::|[-–—])?\\s+(.+)$").matcher(region);
            if (grouped.matches() && Pattern.compile("\\b" + quoted + "\\b").matcher(grouped.group(1)).find()
                    && meaningfulDefinition(grouped.group(2), acronym)) return true;
            if (lines[i].trim().equalsIgnoreCase(acronym)
                    && i + 1 < lines.length && expansionRow(lines[i + 1], acronym)) return true;
            Matcher direct = Pattern.compile(String.format(TOKEN_DEFINITION.pattern(), quoted)).matcher(region);
            if (direct.find() && meaningfulDefinition(direct.group(1), acronym)) return true;

            // Some extracted glossary tables lose their column separator and become
            // "JWT JSON Web Token". Accept only the same row, keeping the bounded rule.
            String row = lines[i].trim();
            if (row.regionMatches(true, 0, acronym, 0, acronym.length())
                    && row.length() > acronym.length()
                    && !Character.isLetterOrDigit(row.charAt(acronym.length()))
                    && expansionRow(row.substring(acronym.length()), acronym)) return true;

            // Table rows commonly put a group of tokens before a colon, pipe, or dash, with
            // the wrapped expansion on the same row or the next one.
            if (groupedTokenRow(lines[i], acronym)) {
                if (hasSeparator(lines[i]) && meaningfulDefinition(afterSeparator(region), acronym)) return true;
                if (!hasSeparator(lines[i]) && i + 1 < lines.length
                        && lines[i + 1].contains("/")
                        && meaningfulDefinition(lines[i + 1], acronym)) return true;
            }
        }
        return false;
    }

    /** Returns false when an apparent acronym occurrence is a date, identifier, setting, or label. */
    static boolean terminologyUse(String token, String line, int start, int end) {
        String value = Objects.requireNonNullElse(token, "").trim();
        String text = Objects.requireNonNullElse(line, "");
        if (value.isBlank() || start < 0 || end <= start || end > text.length()
                || !text.substring(start, end).equals(value)) return false;
        if (start > 0 && Character.isLetterOrDigit(text.charAt(start - 1))
                || end < text.length() && Character.isLetterOrDigit(text.charAt(end))) return false;

        String upper = value.toUpperCase(Locale.ROOT);
        String upperLine = text.toUpperCase(Locale.ROOT);
        if (VERSION_ID.matcher(upper).matches()) return false;
        if (upper.matches("[A-Z]{1,6}\\d{1,4}")) return false;
        if (text.trim().split("\\s+").length < 3) return false;
        if ((upper.equals("NET") || upper.equals("ASP"))
                && Pattern.compile("(?i)\\bASP\\s*\\.\\s*NET(?:\\s+CORE)?\\b").matcher(text).find()) return false;
        if ((upper.equals("RFC") || upper.equals("ISO") || upper.equals("IEEE"))
                && Pattern.compile("\\b" + upper + "\\s+\\d").matcher(text).find()) return false;
        if (Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS").contains(upper)) return false;
        if (Set.of("PASS", "FAIL", "FAILED", "SKIPPED", "PENDING", "COMPLETED", "INCONCLUSIVE", "SUCCESS").contains(upper)
                && (Pattern.compile("(?i)\\b(?:status|result|outcome|historical|test|locally|TC[-A-Z0-9]+)\\b")
                    .matcher(text).find() || Pattern.compile("\\b\\d+\\s+" + upper + "\\b").matcher(text).find())) return false;
        if (upper.equals("CMD") && Pattern.compile("(?i)\\b(?:powershell|shell|script|command)\\b").matcher(text).find())
            return false;
        if ((start > 0 && text.charAt(start - 1) == '/' || end < text.length() && text.charAt(end) == '/')
                && Pattern.compile("(?i)\\b(?:identifiers?|reserved|trace(?:ability)?|IDs)\\b").matcher(text).find())
            return false;
        Matcher quotedPhrase = Pattern.compile("[\"“]([A-Z][A-Z0-9 ]{2,60})[\"”]").matcher(text);
        while (quotedPhrase.find()) {
            if (quotedPhrase.start() < start && quotedPhrase.end() > end && quotedPhrase.group(1).contains(" "))
                return false;
        }
        if (upper.equals("ASP") && Pattern.compile("(?i)\\bASP\\s*\\.\\s*NET(?:\\s+CORE)?\\b").matcher(text).find()) return false;
        if (MONTHS.contains(upper) && dateOrPublicationContext(upperLine, upper)) return false;
        if ((upper.equals("MMMM") || upper.equals("YYYY") || upper.equals("DD"))
                && DATE_PLACEHOLDER.matcher(upperLine).find()) return false;
        if (upper.equals("MINIMAL") && Pattern.compile(
                "(?i)\\b(?:AI|default|thinking|reasoning|generation|setting|configuration|config|mode|level)\\b.{0,45}\\bMINIMAL\\b|"
                    + "\\bMINIMAL\\b.{0,45}\\b(?:token|output|cap|thinking|reasoning|generation|setting|configuration|config|mode|level)\\b")
                .matcher(text).find()) return false;

        if (NAMED_LANGUAGE_OR_FRAMEWORK.contains(upper)
                && Pattern.compile("(?i)\\b(?:programming\\s+)?language|\\bframework\\b|\\btechnology\\s+stack\\b|"
                    + "\\bruntime\\b|\\bplatform\\b|\\blibrary\\b|\\bbackend\\b")
                .matcher(text).find()) return false;
        return true;
    }

    /**
     * Identifies a provider concern that is contradicted by the supplied glossary or evidence.
     * This is deliberately limited to concerns that name an acronym/abbreviation explicitly.
     */
    static boolean contradictedConcern(String issue, String evidence, String definitionsText,
            String fullDocument) {
        String allegation = Objects.requireNonNullElse(issue, "");
        if (!Pattern.compile("(?i)\\b(?:undefined|not defined|not expanded|missing.{0,30}definition|"
                + "definition.{0,30}missing|without.{0,20}definition)\\b").matcher(allegation).find()
                || Pattern.compile("(?i)\\b(?:incorrect|wrong|inconsistent|conflicting|ambiguous)\\b")
                    .matcher(allegation).find()) return false;
        String concern = Objects.requireNonNullElse(issue, "") + " "
            + Objects.requireNonNullElse(evidence, "");
        Matcher named = Pattern.compile("(?i)\\b(?:acronym|abbreviation)\\s+([A-Z][A-Z0-9]{1,15})\\b")
            .matcher(concern);
        if (!named.find()) return false;
        String token = named.group(1);
        if (acronymDefined(token, definitionsText, fullDocument)) return true;
        Matcher occurrence = Pattern.compile("\\b" + Pattern.quote(token) + "\\b").matcher(evidence);
        return occurrence.find() && !terminologyUse(token, evidence, occurrence.start(), occurrence.end());
    }

    private static boolean groupedTokenRow(String region, String acronym) {
        return Pattern.compile("(?i)(?:^|[|:/,])\\s*" + Pattern.quote(acronym) + "\\b|"
            + "\\b" + Pattern.quote(acronym) + "\\s*(?:/|\\||,)").matcher(region).find();
    }

    private static String afterSeparator(String region) {
        int colon = region.indexOf(':');
        int pipe = region.indexOf('|');
        int dash = Math.min(indexOrEnd(region, " - "), indexOrEnd(region, " – "));
        int separator = Math.min(nonNegative(colon), Math.min(nonNegative(pipe), dash));
        return separator == Integer.MAX_VALUE ? region : region.substring(separator + 1);
    }

    private static boolean hasSeparator(String value) {
        return value.indexOf(':') >= 0 || value.indexOf('|') >= 0
            || value.contains(" - ") || value.contains(" – ");
    }

    private static int indexOrEnd(String value, String separator) {
        int index = value.indexOf(separator);
        return index < 0 ? Integer.MAX_VALUE : index;
    }

    private static int nonNegative(int value) {
        return value < 0 ? Integer.MAX_VALUE : value;
    }

    private static boolean meaningfulDefinition(String value, String token) {
        String clean = Objects.requireNonNullElse(value, "")
            .replaceAll("(?i)\\b" + Pattern.quote(token) + "\\b", " ")
            .replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
        if (clean.isBlank()) return false;
        if (Pattern.compile("(?i)\\b(?:not (?:defined|provided|specified|available)|undefined|"
                + "definition (?:missing|pending)|tbd|todo)\\b").matcher(clean).find()) return false;
        String[] words = clean.split("\\s+");
        long substantial = java.util.Arrays.stream(words).filter(word -> word.length() >= 2).count();
        boolean descriptive = java.util.Arrays.stream(words)
            .anyMatch(word -> word.chars().anyMatch(Character::isLowerCase) || word.length() >= 6);
        return substantial >= 2 && descriptive && clean.length() >= 6;
    }

    private static boolean expansionRow(String line, String token) {
        if (!meaningfulDefinition(line, token)) return false;
        String[] terms = line.trim().split(",\\s*");
        if (terms.length == token.length() && terms.length >= 2) {
            String initials = java.util.Arrays.stream(terms)
                .map(term -> term.isBlank() ? "" : term.trim().substring(0, 1))
                .collect(java.util.stream.Collectors.joining());
            if (initials.equalsIgnoreCase(token)) return true;
        }
        String expansion = line.trim().split("(?:\\s+[—–-]\\s+|[.;,])", 2)[0];
        String[] words = expansion.split("\\s+");
        long named = java.util.Arrays.stream(words).filter(word -> !word.isEmpty()
            && Character.isUpperCase(word.charAt(0))).count();
        return named >= 2 && named * 2 >= words.length;
    }

    private static boolean dateOrPublicationContext(String line, String month) {
        if (DATE_PLACEHOLDER.matcher(line).find()) return true;
        if (Pattern.compile("\\b(?:\\d{1,2}\\s+)?" + month + "(?:\\s+\\d{2,4})?\\b").matcher(line).find()
                && Pattern.compile("\\b(?:publication|published|date|issue|volume|month|year|copyright|as\\s+of)\\b")
                    .matcher(line).find()) return true;
        if (Pattern.compile("\\b" + month + "\\s+\\d{4}\\b").matcher(line).find()) return true;
        return Pattern.compile("\\b\\d{1,2}\\s+" + month + "\\s+\\d{2,4}\\b").matcher(line).find();
    }
}
