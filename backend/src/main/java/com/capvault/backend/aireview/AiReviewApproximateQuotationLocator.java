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
    private record Candidate(List<AiReviewProvider.DocumentExcerpt> excerpts, double score) { }
    private record SearchText(String text, List<AiReviewProvider.DocumentExcerpt> pieces) {
        static SearchText of(List<AiReviewProvider.DocumentExcerpt> pieces) {
            return new SearchText(String.join("\n", pieces.stream().map(AiReviewProvider.DocumentExcerpt::text).toList()), pieces);
        }
        List<AiReviewProvider.DocumentExcerpt> slice(int start, int end) {
            var result = new ArrayList<AiReviewProvider.DocumentExcerpt>();
            int offset = 0;
            for (var piece : pieces) {
                int a = Math.max(0, start - offset), b = Math.min(piece.text().length(), end - offset);
                if (a < b && !piece.text().substring(a, b).isBlank()) result.add(new AiReviewProvider.DocumentExcerpt(
                    piece.text().substring(a, b), piece.location()));
                offset += piece.text().length() + 1;
            }
            return List.copyOf(result);
        }
    }
    private AiReviewApproximateQuotationLocator() { }

    static AiReviewQuotationLocator.Match locate(String quotation, List<PdfInspection.PageText> pages) {
        return locate(quotation, pages, List.of());
    }

    static AiReviewQuotationLocator.Match locate(String quotation, List<PdfInspection.PageText> pages,
            List<List<AiReviewProvider.DocumentExcerpt>> windows) {
        var views = new ArrayList<SearchText>();
        // Check the citation and its neighbours before spending the bounded search on distant pages.
        int nearby = Math.min(3, pages.size());
        for (int index = 0; index < nearby; index++) views.add(pageView(pages.get(index)));
        for (var window : windows) views.add(SearchText.of(window));
        for (int index = nearby; index < pages.size(); index++) views.add(pageView(pages.get(index)));
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
            for (var view : views) {
                if (view.text() == null || view.text().length() > 100_000) continue;
                var source = words(view.text());
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
                    var candidate = candidate(query, source, start, end, view);
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

    private static SearchText pageView(PdfInspection.PageText page) {
        return new SearchText(page.text(), List.of(new AiReviewProvider.DocumentExcerpt(page.text(),
            new AiReviewProvider.EvidenceLocation(page.pageNumber(), null))));
    }

    private static Candidate candidate(List<Word> q, List<Word> source, int start, int end, SearchText view) {
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
        String text = view.text().substring(passage.getFirst().start(), passage.getLast().end());
        if (text.length() < 60 || text.length() > 1800) return null;
        double score = .6 * matches / q.size() + .4 * matches / passage.size();
        return new Candidate(view.slice(passage.getFirst().start(), passage.getLast().end()), score);
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
        if (!a.excerpts().stream().map(e -> e.location().page()).distinct().toList()
                .equals(b.excerpts().stream().map(e -> e.location().page()).distinct().toList())) return false;
        String at = String.join(" ", a.excerpts().stream().map(AiReviewProvider.DocumentExcerpt::text).toList()).replaceAll("\\s+", " ");
        String bt = String.join(" ", b.excerpts().stream().map(AiReviewProvider.DocumentExcerpt::text).toList()).replaceAll("\\s+", " ");
        return at.contains(bt) || bt.contains(at);
    }
    private static AiReviewQuotationLocator.Match result(Candidate best, Candidate other) {
        if (best == null || other != null && best.score() - other.score() < .035) return AiReviewQuotationLocator.Match.absent();
        return new AiReviewQuotationLocator.Match(best.excerpts(), false, true);
    }
}
