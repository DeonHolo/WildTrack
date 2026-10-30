package com.capvault.backend.aireview;

import com.capvault.backend.filecheck.PdfInspection;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Locates source text; a match never decides whether an instruction is satisfied. */
final class AiReviewQuotationLocator {
    private static final Pattern ATOM = Pattern.compile("[\\p{L}\\p{N}]+|->|<-|<=|>=|!=|==|[<>≠=+%#]|(?<=\\d)[.,:/-](?=\\d)|(?<![\\p{L}\\p{N}])[-−](?=\\d)");
    private static final Pattern WRAP = Pattern.compile("([\\p{L}]{3,})[-‐][ \\t]*\\r?\\n[ \\t]*([\\p{L}]{3,})");
    private static final Pattern OMISSION = Pattern.compile("\\[\\s*(?:…|\\.{3})\\s*\\]|\\.{3}");
    private static final Pattern PAGE_NUMBER = Pattern.compile("(?i)(?:page\\s*)?\\d+\\s*(?:of|/)\\s*\\d+");
    private static final Pattern HISTORY = Pattern.compile("(?i)(?:\\d+[.)]?\\s*)?(?:change|revision|version)\\s+(?:history|record|log)(?:\\s*[:.-])?");
    private record Atom(String value, int start, int end) { }
    private record Span(int start, int end) { }
    private record Piece(String text, int page) { }
    record Match(List<AiReviewProvider.DocumentExcerpt> excerpts, boolean continuous) {
        Match { excerpts = List.copyOf(excerpts); }
        static Match absent() { return new Match(List.of(), false); }
        boolean located() { return !excerpts.isEmpty(); }
    }

    static Match locate(String quotation, String document, List<PdfInspection.PageText> pages,
            AiReviewProvider.EvidenceLocation hint) {
        if (quotation == null || quotation.isBlank()) return Match.absent();
        var sourcePages = pages == null ? List.<PdfInspection.PageText>of() : pages;
        var ordered = new ArrayList<>(sourcePages);
        if (hint != null && hint.page() != null)
            ordered.sort(java.util.Comparator.comparingInt(p -> p.pageNumber() == hint.page() ? 0 : 1));
        for (var page : ordered) {
            var span = span(quotation, page.text());
            if (span != null) return match(page.text().substring(span.start(), span.end()), page.pageNumber(), true);
        }
        // Per-page PDFBox text can differ from its whole-document extraction.
        // Do not manufacture page offsets in the whole-document string.
        if (sourcePages.isEmpty()) {
            var span = span(quotation, document);
            return span == null ? Match.absent() : match(document.substring(span.start(), span.end()), null, true);
        }
        for (var page : ordered) {
            var parts = separated(quotation, page.text(), page.pageNumber());
            if (parts.located()) return parts;
        }
        return acrossPages(quotation, sourcePages);
    }

    static boolean continuous(String quotation, String source) {
        if (quotation == null || quotation.isBlank() || source == null || source.isBlank()) return false;
        String exact = tokenKey(quotation, false);
        if (exact.length() > 1 && tokenKey(source, false).contains(exact)) return true;
        String repaired = tokenKey(quotation, true);
        return repaired.length() > 1 && tokenKey(source, true).contains(repaired);
    }

    private static String tokenKey(String value, boolean dehyphenate) {
        String text = value;
        if (dehyphenate) text = WRAP.matcher(text).replaceAll(m -> m.group(1).length() + m.group(2).length() >= 8
            ? m.group(1) + m.group(2) : m.group());
        text = text.replaceAll("\\\\[nrt]", " ").replace("\u00ad", "")
            .replace("ﬀ", "ff").replace("ﬁ", "fi").replace("ﬂ", "fl").replace("ﬃ", "ffi").replace("ﬄ", "ffl")
            .replace("→", "->").replace("←", "<-").replace("≤", "<=").replace("≥", ">=").toLowerCase(Locale.ROOT);
        var key = new StringBuilder("\u001f");
        var matcher = ATOM.matcher(text);
        while (matcher.find()) key.append(matcher.group()).append('\u001f');
        return key.toString();
    }

    static boolean positive(String quotation, String document, String title) {
        if (continuous(quotation, AiReviewGroundingPolicy.positiveEvidenceBody(document))) return true;
        // A change-history instruction legitimately refers to front matter.
        // A cover or contents quotation cannot support any other instruction.
        if (title == null || !HISTORY.matcher(title.strip()).matches()) return false;
        var lines = document == null ? List.<String>of() : document.lines().toList();
        for (int i = 0; i < lines.size(); i++) {
            if (!HISTORY.matcher(lines.get(i).strip()).matches()) continue;
            var section = new StringBuilder(lines.get(i));
            for (int next = i + 1; next < lines.size(); next++) {
                String line = lines.get(next).strip();
                if (line.matches("(?i).*(?:table of contents|contents\\s*\\.{2,}).*")
                        || line.matches("\\d+(?:\\.\\d+)*[.)]?\\s+[\\p{L}].*")) break;
                section.append('\n').append(lines.get(next));
            }
            if (continuous(quotation, section.toString())) return true;
        }
        return false;
    }

    private static Match match(String text, Integer page, boolean continuous) {
        return new Match(List.of(new AiReviewProvider.DocumentExcerpt(text,
            page == null ? null : new AiReviewProvider.EvidenceLocation(page, null))), continuous);
    }

    private static List<Atom> atoms(String text, boolean dehyphenate) {
        if (text == null || text.isEmpty()) return List.of();
        boolean[] skip = new boolean[text.length()];
        if (dehyphenate) {
            var wrap = WRAP.matcher(text);
            while (wrap.find()) if (wrap.group(1).length() + wrap.group(2).length() >= 8)
                java.util.Arrays.fill(skip, wrap.end(1), wrap.start(2), true);
        }
        var normalized = new StringBuilder(text.length());
        int[] starts = new int[text.length() * 3], ends = new int[starts.length];
        for (int i = 0; i < text.length(); i++) {
            if (skip[i] || text.charAt(i) == '\u00ad') continue;
            int original = i;
            int end = i + 1;
            String value;
            if (text.charAt(i) == '\\' && i + 1 < text.length() && "nrt".indexOf(text.charAt(i + 1)) >= 0) {
                value = " "; end = ++i + 1;
            } else value = switch (text.charAt(i)) {
                case 'ﬀ' -> "ff"; case 'ﬁ' -> "fi"; case 'ﬂ' -> "fl"; case 'ﬃ' -> "ffi"; case 'ﬄ' -> "ffl";
                case '→' -> "->"; case '←' -> "<-"; case '≤' -> "<="; case '≥' -> ">=";
                default -> String.valueOf(text.charAt(i)).toLowerCase(Locale.ROOT);
            };
            for (int j = 0; j < value.length(); j++) {
                starts[normalized.length()] = original; ends[normalized.length()] = end;
                normalized.append(value.charAt(j));
            }
        }
        var result = new ArrayList<Atom>();
        var matcher = ATOM.matcher(normalized);
        while (matcher.find()) result.add(new Atom(matcher.group(), starts[matcher.start()], ends[matcher.end() - 1]));
        return result;
    }

    private static Span span(String quotation, String source) {
        // Try the unchanged word boundaries before repairing line-end hyphenation.
        var quote = atoms(quotation, false);
        var found = span(quote, atoms(source, false));
        if (found == null) {
            quote = atoms(quotation, true);
            found = span(quote, atoms(source, true));
        }
        if (found == null) return null;
        String tail = quotation.substring(quote.getLast().end()).strip();
        return !tail.isEmpty() && source.startsWith(tail, found.end())
            ? new Span(found.start(), found.end() + tail.length()) : found;
    }

    private static Span span(List<Atom> quote, List<Atom> source) {
        if (quote.isEmpty() || quote.size() > source.size()) return null;
        for (int i = 0; i <= source.size() - quote.size(); i++) {
            int n = 0;
            while (n < quote.size() && quote.get(n).value().equals(source.get(i + n).value())) n++;
            if (n == quote.size()) return new Span(source.get(i).start(), source.get(i + n - 1).end());
        }
        return null;
    }

    private static Match separated(String quotation, String source, int page) {
        boolean omitted = OMISSION.matcher(quotation).find();
        String[] parts = omitted ? OMISSION.split(quotation) : quotation.split("\\R");
        var excerpts = new ArrayList<AiReviewProvider.DocumentExcerpt>();
        int cursor = 0;
        for (String part : parts) {
            if (part.isBlank()) continue;
            var span = span(part, source.substring(cursor));
            if (span == null) return Match.absent();
            int a = cursor + span.start(), b = cursor + span.end();
            int start = source.lastIndexOf('\n', a - 1) + 1, end = source.indexOf('\n', b);
            if (end < 0) end = source.length();
            String line = source.substring(start, end);
            boolean heading = values(line).equals(values(part));
            boolean bulletHeading = source.substring(start, a).strip().matches("[•●▪◦○\\-–—* ]*")
                && source.substring(b, end).strip().matches("[-–—:].*");
            if ((!omitted && !heading) || (atoms(part, true).size() < 6 && !heading && !bulletHeading)) return Match.absent();
            excerpts.add(new AiReviewProvider.DocumentExcerpt(source.substring(a, b), new AiReviewProvider.EvidenceLocation(page, null)));
            cursor = b;
        }
        return excerpts.size() < 2 ? Match.absent() : new Match(excerpts, false);
    }

    private static List<String> values(String text) { return atoms(text, true).stream().map(Atom::value).toList(); }

    private static Match acrossPages(String quotation, List<PdfInspection.PageText> pages) {
        var counts = new HashMap<String, Integer>();
        for (var page : pages) page.text().lines().map(String::strip).filter(s -> !s.isBlank()).limit(6)
            .map(s -> s.toLowerCase(Locale.ROOT)).distinct().forEach(line -> counts.merge(line, 1, Integer::sum));
        int threshold = Math.max(3, (int) Math.ceil(pages.size() * .6));
        for (int index = 0; index + 1 < pages.size(); index++) {
            // Bounded two-page views keep memory proportional to page size, not PDF length.
            var pieces = new ArrayList<Piece>();
            pieces.addAll(contentPieces(pages.get(index), counts, threshold));
            pieces.addAll(contentPieces(pages.get(index + 1), counts, threshold));
            var joined = new StringBuilder();
            for (var piece : pieces) joined.append(piece.text());
            var span = span(quotation, joined.toString());
            if (span == null) continue;
            var excerpts = new ArrayList<AiReviewProvider.DocumentExcerpt>();
            int offset = 0;
            for (var piece : pieces) {
                int a = Math.max(0, span.start() - offset), b = Math.min(piece.text().length(), span.end() - offset);
                if (a < b && !piece.text().substring(a, b).isBlank()) excerpts.add(new AiReviewProvider.DocumentExcerpt(
                    piece.text().substring(a, b), new AiReviewProvider.EvidenceLocation(piece.page(), null)));
                offset += piece.text().length();
            }
            if (excerpts.size() > 1) return new Match(excerpts, false);
        }
        return Match.absent();
    }

    private static List<Piece> contentPieces(PdfInspection.PageText page, HashMap<String, Integer> counts, int threshold) {
        var lines = Pattern.compile(".*(?:\\R|$)").matcher(page.text());
        var rows = new ArrayList<String>();
        while (lines.find()) if (!lines.group().isEmpty()) rows.add(lines.group());
        var nonempty = new ArrayList<Integer>();
        for (int i = 0; i < rows.size(); i++) if (!rows.get(i).isBlank()) nonempty.add(i);
        var removed = new java.util.HashSet<Integer>();
        var prefix = new ArrayList<Integer>();
        for (int i : nonempty.stream().limit(6).toList()) {
            String text = rows.get(i).strip();
            if (text.length() >= 3 && counts.getOrDefault(text.toLowerCase(Locale.ROOT), 0) >= threshold
                    || PAGE_NUMBER.matcher(text).matches()) prefix.add(i);
            else break;
        }
        if (prefix.size() >= 2) removed.addAll(prefix);
        for (int n = 0; n < nonempty.size(); n++) if (n < 6 || n >= nonempty.size() - 6) {
            int i = nonempty.get(n);
            if (PAGE_NUMBER.matcher(rows.get(i).strip()).matches()) removed.add(i);
        }
        var pieces = new ArrayList<Piece>();
        var text = new StringBuilder();
        for (int i = 0; i < rows.size(); i++) {
            if (removed.contains(i)) {
                if (!text.isEmpty()) { pieces.add(new Piece(text.toString(), page.pageNumber())); text.setLength(0); }
            } else text.append(rows.get(i));
        }
        if (!text.isEmpty()) pieces.add(new Piece(text.toString(), page.pageNumber()));
        return pieces;
    }
}
