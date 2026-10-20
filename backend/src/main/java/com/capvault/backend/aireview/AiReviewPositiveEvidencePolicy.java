package com.capvault.backend.aireview;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Prepares citation context, without deciding whether an observation is true or a requirement is met. */
final class AiReviewPositiveEvidencePolicy {
    private static final int MAX_PASSAGES = 20;
    private static final int MAX_PASSAGE_CHARS = 780;
    private static final Pattern SENTENCE_END = Pattern.compile("[.!?](?=\\s|$)");
    private static final Pattern NUMBERED_HEADING = Pattern.compile(
        "^(?:(?:\\d+(?:\\.\\d+){0,5}|[A-Z](?:\\.\\d+){0,5}|[IVXLC]+)[.)]?\\s+"
            + "|(?:chapter|section|annex|appendix)\\s+[\\p{L}\\p{N}.]+\\s*[:.-]?\\s+)(.+)$",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern METADATA_SECTION = Pattern.compile(
        "(?i)^(?:table of contents|contents|list of (?:tables|figures)|references|bibliography|"
            + "index|revision history|change history|document (?:control|history))$");
    private static final Pattern PLACEHOLDER = Pattern.compile(
        "(?i)^\\s*(?:[\\[<]\\s*)?(?:(?:placeholder|todo|tbd|tba)\\b(?:\\s*[:>-]|\\s*$)|"
            + "(?:insert|replace|enter)\\b.{0,100}\\bhere\\b|"
            + "(?:provide|describe|explain|list|identify)\\b.{0,160}[\\]>]\\s*$)");
    private static final Pattern METADATA_LINE = Pattern.compile(
        "(?i)^(?:page\\s+\\d+(?:\\s+(?:of|/)\\s*\\d+)?|\\d+\\s*/\\s*\\d+|"
            + "(?:document\\s+)?version\\s*[:#].*|(?:published|publication|submission|submitted)\\s+date\\s*:.*|"
            + "(?:prepared|submitted|approved|reviewed)\\s+by\\s*:.*|===\\s*pdf page\\s+\\d+\\s*===)$");
    private static final Pattern INDEX_ROW = Pattern.compile(
        "(?i)^.{2,130}?\\s+(?:\\d+(?:\\.\\d+)+|annex\\s+[a-z])"
            + "(?:\\s*[,;]\\s*(?:\\d+(?:\\.\\d+)*|annex\\s+[a-z]))+\\s*$");
    private static final Pattern SENTENCE_VERB = Pattern.compile(
        "(?i)\\b(?:shall|must|will|should|can|may|is|are|was|were|has|have|"
            + "requires?|provides?|describes?|defines?|records?|validates?|checks?)\\b");

    private AiReviewPositiveEvidencePolicy() { }

    static List<String> select(List<String> bodyLines) {
        if (bodyLines == null || bodyLines.isEmpty()) return List.of();
        var repeated = recurringMarginalLines(bodyLines);
        var candidates = new ArrayList<Candidate>();
        var seen = new HashSet<String>();
        var block = new StringBuilder();
        int section = 0;
        boolean metadataSection = false;
        for (String value : bodyLines) {
            String line = value == null ? "" : value;
            String inspected = line.replaceAll("\\p{Cf}", "").trim();
            String heading = headingTitle(inspected);
            if (heading != null && METADATA_SECTION.matcher(heading).matches()) {
                add(candidates, seen, block, section);
                section++;
                metadataSection = true;
                continue;
            }
            if (excludedLine(inspected, repeated)) {
                add(candidates, seen, block, section);
                continue;
            }
            if (heading != null) {
                // Bibliography row numbers are not a transition back to authored body.
                // Resume only at a visibly section-formatted heading, not "2 Vendor Docs".
                if (metadataSection && (!inspected.matches("(?i)^(?:\\d+(?:\\.\\d+)*\\.\\s+|\\d+\\.\\d+\\s+|(?:chapter|section|annex|appendix)\\s+).*" )
                    && !heading.matches("(?i)(?:definitions|overview|introduction|scope|project organization|"
                        + "managerial process plans|management process|technical process plans|supporting process plans|"
                        + "specific requirements|functional requirements|non.functional requirements|detailed design|"
                        + "architectural design|test plan|test design|risk management(?: plan)?|work plan)")
                    || inspected.matches("(?i).*\\b(?:IEEE|ISO|IEC|ACM|ANSI|doi|https?|ISBN|19\\d{2}|20\\d{2})\\b.*")))
                    continue;
                add(candidates, seen, block, section);
                section++;
                metadataSection = METADATA_SECTION.matcher(heading).matches();
                if (!metadataSection) append(candidates, seen, block, section, line);
                continue;
            }
            if (metadataSection) continue;
            if (line.isBlank() && block.length() >= 140 && endsSentence(block)) {
                add(candidates, seen, block, section);
                continue;
            }
            append(candidates, seen, block, section, line);
        }
        add(candidates, seen, block, section);
        return spread(candidates);
    }

    private static void append(List<Candidate> candidates, Set<String> seen, StringBuilder block,
            int section, String line) {
        if (block.length() + 1 + line.length() > MAX_PASSAGE_CHARS) {
            flushForSpace(candidates, seen, block, section);
            if (block.length() + 1 + line.length() > MAX_PASSAGE_CHARS) add(candidates, seen, block, section);
        }
        int start = 0;
        while (line.length() - start > MAX_PASSAGE_CHARS) {
            int end = line.lastIndexOf(' ', start + MAX_PASSAGE_CHARS);
            if (end <= start) end = start + MAX_PASSAGE_CHARS;
            block.append(line, start, end);
            add(candidates, seen, block, section);
            start = end;
            if (start < line.length() && line.charAt(start) == ' ') start++;
        }
        if (start < line.length() || line.isBlank()) {
            if (!block.isEmpty()) block.append('\n');
            block.append(line.substring(start));
        }
    }

    private static void flushForSpace(List<Candidate> candidates, Set<String> seen,
            StringBuilder block, int section) {
        String text = block.toString();
        var sentenceEnd = SENTENCE_END.matcher(text);
        int end = -1;
        while (sentenceEnd.find()) end = sentenceEnd.end();
        if (end >= 140 && end < text.length()) {
            String remainder = text.substring(end).stripLeading();
            block.setLength(end);
            add(candidates, seen, block, section);
            block.append(remainder);
        } else add(candidates, seen, block, section);
    }

    private static void add(List<Candidate> candidates, Set<String> seen, StringBuilder block, int section) {
        String passage = block.toString().strip();
        block.setLength(0);
        if (!passage.contains("\n") && (headingTitle(passage) != null
                || passage.matches("(?i)^(?:figure|table)\\s+.*"))) return;
        String normalized = normalize(passage);
        long letters = passage.codePoints().filter(Character::isLetter).count();
        if (passage.length() >= 80 && letters >= 55 && normalized.split(" ").length >= 12
                && seen.add(normalized)) candidates.add(new Candidate(passage, section, candidates.size()));
    }

    private static boolean endsSentence(StringBuilder block) {
        String text = block.toString().stripTrailing();
        return text.endsWith(".") || text.endsWith("!") || text.endsWith("?");
    }

    private static boolean excludedLine(String line, Set<String> repeated) {
        if (line.isBlank()) return false;
        if (METADATA_LINE.matcher(line).matches() || PLACEHOLDER.matcher(line).find()
                || repeated.contains(normalize(line)) || line.matches(".*[.·…]{3,}\\s*\\d+\\s*$")
                || INDEX_ROW.matcher(line).matches()) return true;
        long letters = line.codePoints().filter(Character::isLetter).count();
        long digits = line.codePoints().filter(Character::isDigit).count();
        return letters == 0 || digits > letters * 2;
    }

    private static String headingTitle(String line) {
        if (line.matches("[A-Z]{2,}(?:[-./][A-Z0-9]+)+")) return null;
        String title = line;
        var numbered = NUMBERED_HEADING.matcher(line);
        boolean numberedHeading = numbered.matches();
        if (numberedHeading) title = numbered.group(1).trim();
        if (METADATA_SECTION.matcher(title).matches()) return title;
        if (title.length() > 110 || title.split("\\s+").length > 12
                || title.matches(".*[.!?;]$") || SENTENCE_VERB.matcher(title).find()) return null;
        if (numberedHeading) return title;
        // Unnumbered capitals are common PDF section headings. Retain the heading in its
        // following passage so a table heading also keeps its nearby populated rows.
        return title.length() >= 4 && title.matches("[\\p{Lu}\\p{N} /&()–-]+") ? title : null;
    }

    private static Set<String> recurringMarginalLines(List<String> lines) {
        Map<String, Integer> counts = new HashMap<>();
        for (String value : lines) {
            String line = value == null ? "" : value.trim();
            if (line.length() < 3 || line.length() > 180 || line.matches(".*[.!?;]$")
                    || line.startsWith("•") || line.startsWith("●") || line.startsWith("-")) continue;
            counts.merge(normalize(line), 1, Integer::sum);
        }
        var repeated = new HashSet<String>();
        counts.forEach((line, count) -> { if (count >= 3) repeated.add(line); });
        return repeated;
    }

    private static List<String> spread(List<Candidate> candidates) {
        if (candidates.size() <= MAX_PASSAGES) return candidates.stream().map(Candidate::text).toList();
        Map<Integer, List<Candidate>> sections = new LinkedHashMap<>();
        for (var candidate : candidates) sections.computeIfAbsent(candidate.section(), ignored -> new ArrayList<>())
            .add(candidate);
        var groups = new ArrayList<>(sections.values());
        var selected = new HashSet<Candidate>();
        int groupCount = Math.min(MAX_PASSAGES, groups.size());
        for (int i = 0; i < groupCount; i++) {
            var group = groups.get(spreadIndex(i, groupCount, groups.size()));
            int quota = MAX_PASSAGES / groupCount + (i < MAX_PASSAGES % groupCount ? 1 : 0);
            int count = Math.min(quota, group.size());
            for (int j = 0; j < count; j++) {
                int index = count > 1 ? spreadIndex(j, count, group.size())
                    : i == 0 ? 0 : i == groupCount - 1 ? group.size() - 1 : group.size() / 2;
                selected.add(group.get(index));
            }
        }
        // Short sections can leave spare capacity. Fill it with source-spread context,
        // without repeating or overlapping any previously prepared passage.
        for (int i = 0; i < MAX_PASSAGES && selected.size() < MAX_PASSAGES; i++)
            selected.add(candidates.get(spreadIndex(i, MAX_PASSAGES, candidates.size())));
        return selected.stream().sorted(Comparator.comparingInt(Candidate::index)).map(Candidate::text).toList();
    }

    private static int spreadIndex(int index, int count, int size) {
        return count <= 1 ? size / 2 : (int) ((long) index * (size - 1) / (count - 1));
    }

    private static String normalize(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
    }

    private record Candidate(String text, int section, int index) { }
}
