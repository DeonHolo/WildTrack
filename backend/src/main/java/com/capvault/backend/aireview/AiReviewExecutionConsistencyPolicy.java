package com.capvault.backend.aireview;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.NavigableMap;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Supplements a semantic review only where an execution record proves its own contradiction. */
final class AiReviewExecutionConsistencyPolicy {
    private static final int MAX_FINDINGS = 8;
    private static final int MAX_EXCERPT = 2_000;
    private static final Pattern CASE = Pattern.compile(
        "(?i:\\b(?:test\\s+(?:case|id)|case)\\s*[:#-]?\\s+[a-z0-9][a-z0-9_.-]{0,30}\\b"
            + "|\\bTC[-:#]\\s*[a-z0-9][a-z0-9_.-]{0,30}\\b)"
            + "|\\b(?!HTTP-)[A-Z][A-Z0-9]{0,9}-[A-Z0-9]{1,12}(?:-[A-Z0-9]{1,12})?\\b");
    private static final Pattern FIELD = Pattern.compile(
        "(?i)\\b(expected(?:\\s+(?:outcome|result|response|HTTP(?:\\s+status)?|status(?:\\s+code)?))?"
            + "|actual(?:\\s+(?:outcome|result|response|HTTP(?:\\s+status)?|status(?:\\s+code)?))?"
            + "|result|verdict|status)\\s*[:=]\\s*");
    private static final Pattern PASS = Pattern.compile("(?i)^pass(?:ed)?\\b(?!\\s*[/|]\\s*fail)");
    private static final Pattern CONDITIONAL_VERDICT = Pattern.compile(
        "(?i)^\\s*[.;]?\\s*(?:if|when|unless|only|pending|subject to|provisional|conditional|tentative|after|once|provided)\\b");
    private static final Pattern NEGATED_CODE = Pattern.compile(
        "(?i)(?:(?:\\b(?:not|no|never|except|other than|anything but|without|different from|cannot)\\b"
            + "|\\b(?:isn|wasn|weren|aren|didn|doesn|don|hasn|hadn|haven|shouldn|mustn|can|won|couldn|wouldn)['’]t\\b)"
            + "[^.;\\n]{0,40}|!=|<>)\\s*$");
    private static final Pattern NEGATED_CODE_SUFFIX = Pattern.compile(
        "(?i)^\\s*(?:(?:(?:is|was|were|are|did|does|do|has|had|have|should|must|will|would|could|can)"
            + "(?:\\s+be)?\\s+)?(?:not|never)\\b|cannot\\b"
            + "|(?:isn|wasn|weren|aren|didn|doesn|don|hasn|hadn|haven|shouldn|mustn|can|won|couldn|wouldn)['’]t\\b)");
    private static final Pattern HTTP = Pattern.compile(
        "(?i)\\bHTTP(?:/\\d(?:\\.\\d)?)?\\s*(?:(?:response|status)(?:\\s+code)?\\s*[:=]?\\s*)?([1-5]\\d\\d)\\b");
    private static final Pattern CODE = Pattern.compile("\\b([1-5]\\d\\d)\\b");
    private static final Pattern ALTERNATIVE = Pattern.compile(
        "(?i)\\b(?:or|either|any|one of|between|may|might|if|when|unless|alternatively|not run|not executed|pending)\\b");
    private static final Pattern NON_EXECUTION = Pattern.compile(
        "(?i)\\b(?:examples?|samples?|illustrat(?:ive|ion)|hypothetical|demonstration|template instructions?"
            + "|not run|not executed|unexecuted|planned only|retests?|reruns?|previous(?:ly)?|historical|superseded)\\b");
    private static final Pattern CONTEXT_CHANGE = Pattern.compile(
        "(?im)^\\s*(?:build|environment|execution|(?:test\\s+)?run)(?:\\s+id)?"
            + "(?:\\s*[:#=]|\\s+[a-z0-9][a-z0-9_.-]*\\s*$).*$");
    private static final Pattern SCOPED_VALUE = Pattern.compile(
        "(?i)\\b(?:build|environment|staging|production|development|deployment|recorded on|observed on|previous run)\\b");
    private static final Pattern EXECUTION_HEADING = Pattern.compile(
        "(?i)(?:(?:recorded|actual|executed|current)\\s+)?(?:test\\s+)?"
            + "(?:execution(?:\\s+results)?|results|test cases|execution log|test log):?");
    private static final Pattern ACTUAL_FAILURE = Pattern.compile(
        "(?i)^\\s*(?:(?:the\\s+)?(?:operation|request|execution|test)\\s+(?:has\\s+)?failed\\b"
            + "|failed(?:\\s+to\\b|[.:;]|\\s*$)|failure\\s*[:;])");
    private static final Pattern EXPECTED_SUCCESS = Pattern.compile(
        "(?i)\\b(?:succeed(?:s|ed)?|success(?:ful|fully)?|completed|saved|created|updated|deleted|persisted|allowed|accepted)\\b");
    private static final Pattern NEGATIVE_EXPECTATION = Pattern.compile(
        "(?i)\\b(?:not|no|denied|reject(?:ed)?|forbidden|fail(?:ed|ure)?|prevent(?:ed)?|block(?:ed)?)\\b");

    private AiReviewExecutionConsistencyPolicy() { }

    /** Ambiguous or absent identifiers must not merge two separately recorded executions. */
    static String executionIdentity(String text) {
        if (text == null || text.isBlank()) return null;
        Set<String> identities = new HashSet<>();
        Matcher cases = CASE.matcher(text);
        while (cases.find()) {
            identities.add(cases.group().replaceFirst("(?i)^(?:test\\s+(?:case|id)|case)\\s*[:#-]?\\s+", "")
                .replaceAll("\\s+", "").toLowerCase(Locale.ROOT));
            if (identities.size() > 1) return null;
        }
        return identities.isEmpty() ? null : identities.iterator().next();
    }

    static List<AiReviewProvider.Finding> findings(String documentText) {
        if (documentText == null || documentText.isBlank() || documentText.length() > 1_000_000
                || !AiReviewGroundingPolicy.hasReliableBodyBoundary(documentText)) return List.of();
        List<AiReviewProvider.Finding> findings = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        NavigableMap<Integer, Boolean> excludedSections = excludedSections(documentText);
        Matcher cases = CASE.matcher(documentText);
        List<CaseStart> starts = new ArrayList<>();
        while (cases.find()) starts.add(new CaseStart(cases.start(), cases.end(), cases.group()));
        for (int index = 0; index < starts.size() && findings.size() < MAX_FINDINGS; index++) {
            CaseStart start = starts.get(index);
            int end = index + 1 < starts.size() ? starts.get(index + 1).start() : documentText.length();
            // Keep natural case boundaries. The retained record ends at its own verdict,
            // so later exit/retest instructions cannot suppress or supply its evidence.
            String block = documentText.substring(start.start(), end).stripTrailing();
            if (excludedSection(excludedSections, start.start())) continue;
            List<Field> fields = new ArrayList<>();
            Matcher labels = FIELD.matcher(block);
            while (fields.size() < 3 && labels.find()) fields.add(new Field(labels.group(1), labels.start(), labels.end()));
            if (fields.size() != 3) continue;
            Field expected = fields.get(0), actual = fields.get(1), verdict = fields.get(2);
            if (!expected.label().toLowerCase(Locale.ROOT).startsWith("expected")
                    || !actual.label().toLowerCase(Locale.ROOT).startsWith("actual")
                    || verdict.label().toLowerCase(Locale.ROOT).startsWith("expected")
                    || verdict.label().toLowerCase(Locale.ROOT).startsWith("actual")) continue;
            String expectedValue = block.substring(expected.end(), actual.start()).trim();
            String actualValue = block.substring(actual.end(), verdict.start()).trim();
            String verdictValue = block.substring(verdict.end()).trim();
            int passEnd = passEnd(verdictValue);
            if (passEnd < 0) continue;
            String reason = contradiction(expected.label(), expectedValue, actual.label(), actualValue);
            if (reason == null) continue;
            // Preserve only the complete record through its verdict, not unrelated following prose.
            int evidenceEnd = verdict.end() + leadingWhitespace(block.substring(verdict.end())) + passEnd;
            String evidence = block.substring(0, evidenceEnd);
            if (NON_EXECUTION.matcher(context(documentText, start.start(), evidence)).find()
                    || CONTEXT_CHANGE.matcher(evidence.substring(expected.start())).find()) continue;
            add(findings, seen, documentText, start.id(), evidence, reason);
        }
        tableFindings(documentText, findings, seen, excludedSections);
        return List.copyOf(findings);
    }

    private static String contradiction(String expectedLabel, String expected, String actualLabel, String actual) {
        if (expected.length() > 600 || actual.length() > 600
                || ALTERNATIVE.matcher(expected).find() || ALTERNATIVE.matcher(actual).find()
                || SCOPED_VALUE.matcher(expected).find() || SCOPED_VALUE.matcher(actual).find()) return null;
        Integer expectedCode = httpCode(expectedLabel, expected), actualCode = httpCode(actualLabel, actual);
        if (expectedCode != null && actualCode != null) {
            return expectedCode.equals(actualCode) ? null
                : "the expected HTTP status " + expectedCode + " differs from the actual HTTP status " + actualCode;
        }
        if (ACTUAL_FAILURE.matcher(actual).find()
                && !NEGATIVE_EXPECTATION.matcher(expected).find()
                && (EXPECTED_SUCCESS.matcher(expected).find() || expectedCode != null && expectedCode < 300)) {
            return "its actual outcome explicitly records failure rather than the stated successful outcome";
        }
        return null;
    }

    private static Integer httpCode(String label, String value) {
        Matcher explicit = HTTP.matcher(value);
        Integer code = null;
        while (explicit.find()) {
            if (code != null || NEGATED_CODE.matcher(value.substring(0, explicit.start())).find()
                    || NEGATED_CODE_SUFFIX.matcher(value.substring(explicit.end())).find()) return null;
            code = Integer.valueOf(explicit.group(1));
        }
        if (code != null) {
            Matcher all = CODE.matcher(value);
            int count = 0;
            while (all.find()) count++;
            return count == 1 ? code : null;
        }
        if (!label.toLowerCase(Locale.ROOT).contains("http")) return null;
        Matcher bare = Pattern.compile("^([1-5]\\d\\d)(?:\\s+[A-Za-z ]+)?[.;]?$", Pattern.CASE_INSENSITIVE)
            .matcher(value.trim());
        return bare.matches() && !NEGATED_CODE_SUFFIX.matcher(value.substring(bare.end(1))).find()
            ? Integer.valueOf(bare.group(1)) : null;
    }

    /** Only explicit separators establish column association; whitespace extraction alone is ambiguous. */
    private static void tableFindings(String text, List<AiReviewProvider.Finding> findings, Set<String> seen,
            NavigableMap<Integer, Boolean> excludedSections) {
        String[] lines = text.split("\\R", -1);
        int[] offsets = new int[lines.length];
        Matcher lineMatcher = Pattern.compile("(?m)^.*$").matcher(text);
        for (int i = 0; i < offsets.length && lineMatcher.find(); i++) offsets[i] = lineMatcher.start();
        for (int header = 0; header < lines.length && findings.size() < MAX_FINDINGS; header++) {
            String delimiter = lines[header].contains("|") ? "\\|" : lines[header].contains("\t") ? "\\t" : null;
            if (delimiter == null) continue;
            List<String> columns = cells(lines[header], delimiter);
            int expected = column(columns, "expected"), actual = column(columns, "actual");
            int verdict = column(columns, "result|verdict|status"), id = column(columns, "(?:test\\s*)?(?:case|id)|test\\s+id");
            if (expected < 0 || actual < 0 || verdict < 0 || id < 0
                    || expected == actual || expected == verdict || actual == verdict) continue;
            String headerContext = context(text, offsets[header], lines[header]);
            if (excludedSection(excludedSections, offsets[header]) || NON_EXECUTION.matcher(headerContext).find()) continue;
            for (int row = header + 1; row < Math.min(lines.length, header + 10)
                    && findings.size() < MAX_FINDINGS; row++) {
                if (lines[row].isBlank()) break;
                if (lines[row].matches("[|+:\\-\\s]+")) continue;
                List<String> values = cells(lines[row], delimiter);
                if (values.size() != columns.size()) break;
                Matcher rowId = CASE.matcher(values.get(id));
                if (!rowId.matches() || !values.get(verdict).matches("(?i)pass(?:ed)?[.;]?")) continue;
                String reason = contradiction(columns.get(expected), values.get(expected), columns.get(actual), values.get(actual));
                if (reason == null) continue;
                int end = offsets[row] + lines[row].length();
                if (end - offsets[header] > MAX_EXCERPT) break;
                String evidence = text.substring(offsets[header], end);
                if (NON_EXECUTION.matcher(evidence).find() || CONTEXT_CHANGE.matcher(evidence).find()) continue;
                add(findings, seen, text, values.get(id), evidence, reason);
            }
        }
    }

    private static List<String> cells(String row, String delimiter) {
        String value = row.trim();
        if (delimiter.equals("\\|")) value = value.replaceAll("^\\||\\|$", "");
        return List.of(value.split(delimiter, -1)).stream().map(String::trim).toList();
    }

    private static int column(List<String> columns, String label) {
        int found = -1;
        Pattern pattern = Pattern.compile("(?i)^(?:" + label + ")(?:\\s+(?:outcome|response|result|status|code|HTTP|HTTP status))?$");
        for (int i = 0; i < columns.size(); i++) {
            if (!pattern.matcher(columns.get(i)).matches()) continue;
            if (found != -1) return -1;
            found = i;
        }
        return found;
    }

    private static String context(String text, int start, String block) {
        String before = text.substring(Math.max(0, start - 600), start);
        String[] lines = before.split("\\R");
        StringBuilder context = new StringBuilder();
        int retained = 0;
        for (int i = lines.length - 1; i >= 0 && retained < 2; i--) {
            if (lines[i].isBlank()) continue;
            context.insert(0, lines[i] + "\n");
            retained++;
        }
        return context + block;
    }

    private static NavigableMap<Integer, Boolean> excludedSections(String text) {
        NavigableMap<Integer, Boolean> sections = new TreeMap<>();
        Matcher lines = Pattern.compile("(?m)^.*$").matcher(text);
        while (lines.find()) {
            String title = lines.group().strip().replaceFirst("^(?:\\d+(?:\\.\\d+)*[.)]?|#+)\\s+", "");
            if (title.isBlank() || title.length() > 110 || title.endsWith(".")
                    || FIELD.matcher(title).find() || CASE.matcher(title).find()) continue;
            if (NON_EXECUTION.matcher(title).find()) sections.put(lines.start(), true);
            else if (EXECUTION_HEADING.matcher(title).matches()) sections.put(lines.start(), false);
        }
        return sections;
    }

    private static boolean excludedSection(NavigableMap<Integer, Boolean> sections, int offset) {
        var section = sections.floorEntry(offset);
        return section != null && section.getValue();
    }

    private static int passEnd(String value) {
        Matcher pass = PASS.matcher(value);
        if (!pass.find()) return -1;
        String tail = value.substring(pass.end());
        if (CONDITIONAL_VERDICT.matcher(tail).find()) return -1;
        if (tail.isBlank()) return pass.end();
        String trimmed = tail.stripLeading();
        if ((trimmed.startsWith(".") || trimmed.startsWith(";"))
                && (trimmed.length() == 1 || Character.isWhitespace(trimmed.charAt(1)))) return pass.end();
        if (tail.matches("(?s)^[ \\t]*\\R.*")) return pass.end();
        return -1;
    }

    private static int leadingWhitespace(String value) {
        int offset = 0;
        while (offset < value.length() && Character.isWhitespace(value.charAt(offset))) offset++;
        return offset;
    }

    private static void add(List<AiReviewProvider.Finding> findings, Set<String> seen, String document,
            String id, String evidence, String reason) {
        if (findings.size() >= MAX_FINDINGS || evidence.length() > MAX_EXCERPT
                || !AiReviewGroundingPolicy.positiveQuoteOccursInBody(document, evidence)
                || !seen.add(id + ":" + reason)) return;
        findings.add(new AiReviewProvider.Finding(
            "Test execution " + id + " is marked PASS, but " + reason + ".",
            AiReviewProvider.FindingSource.DOCUMENT, evidence, ""));
    }

    private record CaseStart(int start, int end, String id) { }
    private record Field(String label, int start, int end) { }
}
