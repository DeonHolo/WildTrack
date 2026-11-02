package com.capvault.backend.aireview;

import com.capvault.backend.filecheck.PdfInspection;
import java.util.*;
import java.util.regex.Pattern;

/** Bounded reference search. Returns original PDF text, never a corrected quotation or a verdict. */
final class AiReviewApproximateQuotationLocator {
    private static final Pattern WORD = Pattern.compile("[\\p{L}]+|[+-]?\\d+(?:[.,:/-]\\d+)*|<=|>=|!=|[<>=%]");
    private static final Set<String> NEGATIONS = Set.of("not", "no", "never", "without", "unless", "except", "only", "cannot");
    private static final Set<String> UNITS = Set.of("second", "seconds", "minute", "minutes", "hour", "hours", "day", "days", "percent", "percentage", "ms", "mb", "gb");
    private static final Set<String> COMMON = Set.of("the", "and", "for", "that", "this", "with", "from", "shall", "will", "must", "system");
    private record Word(String text, int start, int end) { }
    private record Candidate(String text, int page, double score) { }
    private AiReviewApproximateQuotationLocator() { }

    static AiReviewQuotationLocator.Match locate(String quotation, List<PdfInspection.PageText> pages) {
        var variants = new ArrayList<String>();
        variants.add(quotation);
        // Tables often precede the actual sentence with field names. Never remove its interior words.
        var description = Pattern.compile("(?i)\\bdescription\\s*[:–-]?\\s+").matcher(quotation);
        if (description.find() && description.start() < 200) variants.add(quotation.substring(description.end()));
        Candidate best = null, other = null;
        long work = 0;
        for (var variant : variants) {
            var query = words(variant);
            if (query.size() < 12 || query.size() > 200) continue;
            for (var page : pages) {
                if (page.text() == null || page.text().length() > 100_000) continue;
                var source = words(page.text());
                var origins = new LinkedHashSet<Integer>();
                for (int q = 0; q < query.size(); q++) {
                    String anchor = query.get(q).text();
                    if (anchor.length() < 4 || COMMON.contains(anchor)) continue;
                    for (int s = 0; s < source.size(); s++) if (anchor.equals(source.get(s).text())) {
                        // Allow a few labels or reordered cells at the edges, not an unlimited bag of words.
                        for (int offset = -3; offset <= 3; offset++) origins.add(Math.max(0, s - q + offset));
                        if (origins.size() >= 72) break;
                    }
                    if (origins.size() >= 72) break;
                }
                for (int start : origins) {
                    int end = Math.min(source.size(), start + query.size() + 6);
                    if (end - start < 12) continue;
                    work += (long) query.size() * (end - start);
                    if (work > 3_000_000) return result(best, other);
                    var candidate = candidate(query, source, start, end, page);
                    if (candidate == null) continue;
                    if (best == null || candidate.score() > best.score()) {
                        if (best != null && !same(candidate, best)) other = best;
                        best = candidate;
                    } else if (!same(candidate, best) && (other == null || candidate.score() > other.score())) other = candidate;
                }
            }
        }
        return result(best, other);
    }

    private static Candidate candidate(List<Word> q, List<Word> source, int start, int end, PdfInspection.PageText page) {
        var s = source.subList(start, end);
        // LCS preserves word order. Its bounded matrix is at most 201 x 207 integers.
        int[][] matrix = new int[q.size() + 1][s.size() + 1];
        for (int i = 1; i <= q.size(); i++) for (int j = 1; j <= s.size(); j++)
            matrix[i][j] = q.get(i - 1).text().equals(s.get(j - 1).text()) ? matrix[i - 1][j - 1] + 1
                : Math.max(matrix[i - 1][j], matrix[i][j - 1]);
        int matches = matrix[q.size()][s.size()];
        if (matches < 12 || matches / (double) q.size() < .84) return null;
        int i = q.size(), j = s.size(), first = -1, last = -1;
        while (i > 0 && j > 0) {
            if (q.get(i - 1).text().equals(s.get(j - 1).text())) { first = j - 1; if (last < 0) last = j - 1; i--; j--; }
            else if (matrix[i - 1][j] >= matrix[i][j - 1]) i--; else j--;
        }
        if (first < 0 || last - first + 1 < 12 || matches / (double) (last - first + 1) < .88) return null;
        var passage = s.subList(first, last + 1);
        if (!critical(q).equals(critical(passage))) return null;
        // A high overlap can hide one changed verb, actor or qualifier. Require every query word
        // to occur in this passage, apart from a small OCR typo or a split word. No synonym guessing.
        for (int word = 0; word < q.size(); word++) {
            String token = q.get(word).text();
            boolean present = passage.stream().anyMatch(w -> w.text().equals(token) || ocrTypo(token, w.text()));
            if (!present && word + 1 < q.size()) {
                String joined = token + q.get(word + 1).text();
                present = passage.stream().anyMatch(w -> w.text().equals(joined));
                if (present) word++;
            }
            if (!present) return null;
        }
        // Do not clip an immediately preceding negation out of the recovered text.
        for (int before = Math.max(0, start + first - 3); before < start + first; before++)
            if (NEGATIONS.contains(source.get(before).text()) && !NEGATIONS.contains(q.getFirst().text())) return null;
        String text = page.text().substring(passage.getFirst().start(), passage.getLast().end());
        if (text.length() < 60 || text.length() > 1800) return null;
        double score = .6 * matches / q.size() + .4 * matches / passage.size();
        return new Candidate(text, page.pageNumber(), score);
    }

    private static Map<String, Integer> critical(List<Word> words) {
        var values = new TreeMap<String, Integer>();
        for (var word : words) if (NEGATIONS.contains(word.text()) || UNITS.contains(word.text())
                || word.text().matches(".*[\\d<>=%].*")) values.merge(word.text(), 1, Integer::sum);
        return values;
    }
    private static boolean ocrTypo(String a, String b) {
        if (a.length() < 7 || b.length() < 7 || Math.abs(a.length() - b.length()) > 1) return false;
        int i = 0, j = 0, changes = 0;
        while (i < a.length() && j < b.length()) {
            if (a.charAt(i) == b.charAt(j)) { i++; j++; continue; }
            if (++changes > 1) return false;
            if (a.length() >= b.length()) i++;
            if (b.length() >= a.length()) j++;
        }
        return changes + (a.length() - i) + (b.length() - j) <= 1;
    }
    private static List<Word> words(String text) {
        var result = new ArrayList<Word>();
        var matcher = WORD.matcher(text);
        while (matcher.find()) result.add(new Word(matcher.group().toLowerCase(Locale.ROOT), matcher.start(), matcher.end()));
        return result;
    }
    private static boolean same(Candidate a, Candidate b) {
        // Overlapping windows for the same passage are not independent alternatives.
        return a.page() == b.page() && (a.text().contains(b.text()) || b.text().contains(a.text()));
    }
    private static AiReviewQuotationLocator.Match result(Candidate best, Candidate other) {
        if (best == null || other != null && best.score() - other.score() < .035) return AiReviewQuotationLocator.Match.absent();
        return new AiReviewQuotationLocator.Match(List.of(new AiReviewProvider.DocumentExcerpt(best.text(),
            new AiReviewProvider.EvidenceLocation(best.page(), null))), false, true);
    }
}
