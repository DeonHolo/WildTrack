package com.capvault.backend.template;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Exact source units and layout hints; these hints do not decide what is required. */
public final class TemplateSourceCatalog {
    private static final Pattern NUMBERED = Pattern.compile("^(\\d+(?:\\.\\d+){0,7})\\.?\\s+\\p{L}.*");
    private static final Pattern PAGE_COUNTER = Pattern.compile("(?i)^(?:page\\s+)?\\d{1,4}(?:\\s+(?:of|/)\\s*\\d{1,4})?$");
    private static final Pattern EXAMPLE = Pattern.compile("(?i)^(?:(?:illustrative|worked|completed)\\s+)?(?:example|sample)(?:\\s*\\d+)?\\s*(?:(?::|[—–-]).*|$)");
    private static final Pattern CAPTION = Pattern.compile("(?i)^\\[?(?:table|figure|fig\\.|diagram)\\s+\\d[\\d.\\-]*[\\] .:—–-].*");
    private static final Pattern BULLET = Pattern.compile("^(?:[•●▪◦*\\-]|[a-zA-Z][.)]|o)\\s+.*");
    private static final Pattern SPACES = Pattern.compile("[\\s\\p{Z}]+", Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern DIGITS = Pattern.compile("\\d+");
    private static final Pattern INLINE_PAGE_COUNTER = Pattern.compile("(?i)^(.+?\\p{L}[: ._-]*)(\\d{1,4})(?:\\s+(?:of|/)\\s*\\d{1,4})?$");

    private TemplateSourceCatalog() {}

    public record Span(int page, int firstLine, int lastLine) {
        public Span {
            if (page < 1 || firstLine < 1 || lastLine < firstLine) {
                throw new IllegalArgumentException("Invalid source span");
            }
        }
    }

    public record Block(String id, String text, int page, List<Span> spans, String kindHint,
                        List<String> headingPath, boolean exampleHint) {
        public Block {
            spans = List.copyOf(spans);
            headingPath = List.copyOf(headingPath);
        }
    }

    public static Catalog build(List<String> pageTexts) {
        if (pageTexts == null || pageTexts.stream().anyMatch(x -> x == null)) {
            throw new IllegalArgumentException("Source pages are required");
        }
        List<String[]> pages = pageTexts.stream().map(x -> x.split("\\R", -1)).toList();
        Set<String> furniture = repeatedFurniture(pages);
        Map<String, Integer> runningFurniture = runningFurniture(pages);
        Set<String> repeatedMargins = repeatedMargins(pages);
        List<Unit> units = new ArrayList<>();
        for (int p = 0; p < pages.size(); p++) {
            String[] lines = pages.get(p);
            Unit active = null;
            for (int i = 0; i < lines.length; i++) {
                String text = lines[i];
                String trimmed = text.strip();
                if (trimmed.isEmpty()) {
                    active = null;
                    continue;
                }
                if (isFurniture(lines, i, p + 1, furniture, runningFurniture)) continue;
                String kind = kind(trimmed);
                Line line = new Line(p + 1, i + 1, text);
                boolean marginBoundary = margin(lines, i) && repeatedMargins.contains(furnitureKey(lines, i));
                if (active != null && kind.equals("TEXT") && active.kind.equals("TEXT")
                    && !active.marginBoundary && !marginBoundary
                    && continues(active.last().text(), trimmed)) {
                    active.lines.add(line);
                } else {
                    active = new Unit(kind, line, marginBoundary);
                    units.add(active);
                }
            }
        }
        joinPageContinuations(units);
        List<Block> blocks = new ArrayList<>();
        List<Heading> headings = new ArrayList<>();
        boolean example = false;
        for (Unit unit : units) {
            String id = "p" + unit.first().page() + "l" + unit.first().number();
            var numbered = NUMBERED.matcher(unit.text().strip());
            if (unit.kind.equals("HEADING") && numbered.matches()) {
                int depth = headingDepth(numbered.group(1));
                while (!headings.isEmpty() && headings.getLast().depth() >= depth) {
                    headings.removeLast();
                }
                example = false;
                blocks.add(unit.block(id, headings.stream().map(Heading::id).toList(), false));
                headings.add(new Heading(id, depth));
            } else {
                if (unit.kind.equals("EXAMPLE_MARKER")) example = true;
                blocks.add(unit.block(id, headings.stream().map(Heading::id).toList(), example));
            }
        }
        return new Catalog(blocks, pages.size());
    }

    public static final class Catalog {
        private final List<Block> blocks;
        private final Map<String, Block> byId;
        private final Map<String, Integer> positions;
        private final int pages;

        private Catalog(List<Block> blocks, int pages) {
            this.blocks = List.copyOf(blocks);
            this.pages = pages;
            Map<String, Block> indexed = new LinkedHashMap<>();
            Map<String, Integer> offsets = new HashMap<>();
            for (int i = 0; i < blocks.size(); i++) {
                indexed.put(blocks.get(i).id(), blocks.get(i));
                offsets.put(blocks.get(i).id(), i);
            }
            byId = Map.copyOf(indexed);
            positions = Map.copyOf(offsets);
        }

        public List<Block> blocks() { return blocks; }

        public Block require(String id) {
            Block block = id == null ? null : byId.get(id);
            if (block == null) throw new IllegalArgumentException("Unknown template source ID: " + id);
            return block;
        }

        /** Ownership is the first page, never a continuation page. Other units are context only. */
        public List<Map<String, Object>> promptBlocks(int firstPage, int lastPage) {
            if (firstPage < 1 || lastPage < firstPage || lastPage > pages) {
                throw new IllegalArgumentException("Invalid template source page range");
            }
            Set<String> included = new HashSet<>();
            for (int i = 0; i < blocks.size(); i++) {
                Block earlier = blocks.get(i);
                if (earlier.page() < firstPage && earlier.kindHint().equals("HEADING")
                    && earlier.headingPath().isEmpty()) {
                    included.add(earlier.id());
                    includeOpening(included, i, blocks.size());
                }
            }
            for (int i = 0; i < blocks.size(); i++) {
                Block owned = blocks.get(i);
                if (owned.page() < firstPage || owned.page() > lastPage) continue;
                included.add(owned.id());
                if (i > 0) included.add(blocks.get(i - 1).id());
                for (String ancestorId : owned.headingPath()) {
                    included.add(ancestorId);
                    int ancestor = positions.get(ancestorId);
                    includeOpening(included, ancestor, i);
                }
                if (owned.exampleHint()) {
                    for (int j = i; j >= 0; j--) {
                        Block context = blocks.get(j);
                        if (!context.exampleHint()) break;
                        if (context.kindHint().equals("EXAMPLE_MARKER")) {
                            included.add(context.id());
                            break;
                        }
                    }
                }
            }
            return blocks.stream().filter(x -> included.contains(x.id())).map(x -> Map.<String, Object>of(
                "id", x.id(), "text", x.text(), "page", x.page(),
                "spans", x.spans().stream().map(s -> Map.of(
                    "page", s.page(), "firstLine", s.firstLine(), "lastLine", s.lastLine())).toList(),
                "kindHint", x.kindHint(), "headingPath", x.headingPath(), "exampleHint", x.exampleHint(),
                "inRequestedRange", x.page() >= firstPage && x.page() <= lastPage)).toList();
        }

        private void includeOpening(Set<String> included, int heading, int limit) {
            for (int j = heading + 1; j < Math.min(blocks.size(), limit); j++) {
                Block context = blocks.get(j);
                if (!context.kindHint().equals("TEXT") || context.exampleHint()) break;
                included.add(context.id());
            }
        }

        /** Source order is authoritative even if a model supplies IDs out of order. */
        public String text(List<String> ids) {
            if (ids == null) throw new IllegalArgumentException("Source IDs are required");
            Set<String> selected = new LinkedHashSet<>();
            for (String id : ids) {
                require(id);
                if (!selected.add(id)) throw new IllegalArgumentException("Duplicate template source ID: " + id);
            }
            return String.join("\n\n", blocks.stream().filter(x -> selected.contains(x.id()))
                .map(Block::text).toList());
        }
    }

    private static String kind(String text) {
        if (EXAMPLE.matcher(text).matches()) return "EXAMPLE_MARKER";
        if (CAPTION.matcher(text).matches()) return "CAPTION";
        if (NUMBERED.matcher(text).matches() && text.length() <= 140) return "HEADING";
        return "TEXT";
    }

    private static boolean continues(String previous, String next) {
        String prior = previous.strip();
        if (BULLET.matcher(next).matches()) return false;
        if (prior.matches(".*[.!?;:]$")) return false;
        boolean wrapped = prior.length() >= 70 || prior.endsWith("-");
        if (!wrapped) return false;
        // A short title/field remains selectable rather than disappearing into prior prose.
        return next.length() >= 70 || next.matches(".*[.!?,;]$")
            || (!next.isEmpty() && Character.isLowerCase(next.codePointAt(0)));
    }

    private static Set<String> repeatedFurniture(List<String[]> pages) {
        if (pages.size() < 3) return Set.of();
        Map<String, Set<Integer>> seen = new HashMap<>();
        int fullPages = 0;
        for (int p = 0; p < pages.size(); p++) {
            String[] lines = pages.get(p);
            if (!fullPage(lines)) continue;
            fullPages++;
            for (int i = 0; i < lines.length; i++) {
                String normalized = normalized(lines[i]);
                if (margin(lines, i) && furnitureCandidate(normalized)) {
                    seen.computeIfAbsent(furnitureKey(lines, i), unused -> new HashSet<>()).add(p);
                }
            }
        }
        int threshold = Math.max(3, (fullPages + 1) / 2);
        Set<String> result = new HashSet<>();
        seen.forEach((text, found) -> { if (found.size() >= threshold) result.add(text); });
        return result;
    }

    private static boolean isFurniture(String[] lines, int index, int page, Set<String> furniture,
                                       Map<String, Integer> runningFurniture) {
        if (!margin(lines, index)) return false;
        String normalized = normalized(lines[index]);
        return PAGE_COUNTER.matcher(normalized).matches()
            || (fullPage(lines) && furniture.contains(furnitureKey(lines, index)))
            || runningFurniture.getOrDefault(runningKey(lines, index, page), page) != page;
    }

    /** A repeated margin next to the actual running page counter is stronger than page density. */
    private static Map<String, Integer> runningFurniture(List<String[]> pages) {
        Map<String, Set<Integer>> seen = new HashMap<>();
        for (int p = 0; p < pages.size(); p++) {
            String[] lines = pages.get(p);
            for (int i = 0; i < lines.length; i++) {
                if (!margin(lines, i) || counterText(lines[i], p + 1) == null) continue;
                seen.computeIfAbsent(runningKey(lines, i, p + 1), unused -> new HashSet<>()).add(p + 1);
                int start = i < 5 ? 0 : Math.max(0, lines.length - 3);
                int end = i < 5 ? i : lines.length;
                for (int j = start; j < end; j++) {
                    if (j == i || !furnitureCandidate(lines[j])) continue;
                    seen.computeIfAbsent(furnitureKey(lines, j), unused -> new HashSet<>()).add(p + 1);
                }
            }
        }
        int threshold = Math.max(3, (pages.size() + 1) / 2);
        Map<String, Integer> result = new HashMap<>();
        seen.forEach((key, found) -> {
            if (found.size() >= threshold) result.put(key, found.stream().min(Integer::compare).orElseThrow());
        });
        return result;
    }

    /** Uncertain repeated margins stay selectable but must never be mistaken for wrapped body text. */
    private static Set<String> repeatedMargins(List<String[]> pages) {
        Map<String, Set<Integer>> seen = new HashMap<>();
        for (int p = 0; p < pages.size(); p++) {
            String[] lines = pages.get(p);
            for (int i = 0; i < lines.length; i++) {
                if (margin(lines, i) && furnitureCandidate(lines[i])) {
                    seen.computeIfAbsent(furnitureKey(lines, i), unused -> new HashSet<>()).add(p);
                }
            }
        }
        Set<String> result = new HashSet<>();
        seen.forEach((key, found) -> { if (found.size() >= 2) result.add(key); });
        return result;
    }

    private static boolean furnitureCandidate(String text) {
        String normalized = normalized(text);
        return normalized.length() >= 3 && normalized.length() <= 140
            && !normalized.matches(".*[.!?;:]$") && !NUMBERED.matcher(normalized).matches()
            && !BULLET.matcher(normalized).matches() && !PAGE_COUNTER.matcher(normalized).matches();
    }

    private static boolean fullPage(String[] lines) {
        int nonblank = 0;
        for (String line : lines) if (!line.isBlank()) nonblank++;
        return nonblank >= 12;
    }

    private static String furnitureKey(String[] lines, int index) {
        String position = index < 5 ? "top" + index : "bottom" + (lines.length - index);
        return position + ":" + normalized(lines[index]);
    }

    private static String runningKey(String[] lines, int index, int page) {
        String counter = counterText(lines[index], page);
        if (counter == null) return furnitureKey(lines, index);
        String position = index < 5 ? "top" + index : "bottom" + (lines.length - index);
        return position + ":" + counter;
    }

    /** PDF extraction can place a footer counter on the same line as its running label. */
    private static String counterText(String text, int page) {
        String value = normalized(text);
        if (PAGE_COUNTER.matcher(value).matches()) {
            var digits = DIGITS.matcher(value);
            return digits.find() && Integer.parseInt(digits.group()) == page ? "<page>" : null;
        }
        var inline = INLINE_PAGE_COUNTER.matcher(value);
        if (!inline.matches() || Integer.parseInt(inline.group(2)) != page
                || !furnitureCandidate(inline.group(1).strip())) return null;
        return inline.group(1) + "<page>";
    }

    private static boolean margin(String[] lines, int index) {
        return index < Math.min(5, lines.length) || index >= Math.max(0, lines.length - 3);
    }

    private static String normalized(String text) { return SPACES.matcher(text.strip()).replaceAll(" "); }

    private static int headingDepth(String number) {
        String meaningful = number.endsWith(".0") ? number.substring(0, number.length() - 2) : number;
        return (int) meaningful.chars().filter(x -> x == '.').count() + 1;
    }

    private static void joinPageContinuations(List<Unit> units) {
        for (int i = 1; i < units.size();) {
            Unit prior = units.get(i - 1);
            Unit next = units.get(i);
            String tail = prior.last().text().strip();
            String head = next.first().text().strip();
            if (prior.kind.equals("TEXT") && next.kind.equals("TEXT")
                && !prior.marginBoundary && !next.marginBoundary
                && next.first().page() == prior.last().page() + 1
                && !tail.matches(".*[.!?;:]$")
                && (tail.length() >= 60 || tail.matches("(?is).*\\b(?:and|or)$"))
                && !head.isEmpty() && Character.isLowerCase(head.codePointAt(0))) {
                prior.lines.addAll(next.lines);
                units.remove(i);
            } else {
                i++;
            }
        }
    }

    private record Heading(String id, int depth) {}
    private record Line(int page, int number, String text) {}

    private static final class Unit {
        private final String kind;
        private final boolean marginBoundary;
        private final List<Line> lines = new ArrayList<>();
        private Unit(String kind, Line line, boolean marginBoundary) {
            this.kind = kind;
            this.marginBoundary = marginBoundary;
            lines.add(line);
        }
        private Line first() { return lines.getFirst(); }
        private Line last() { return lines.getLast(); }
        private String text() { return String.join("\n", lines.stream().map(Line::text).toList()); }
        private Block block(String id, List<String> path, boolean example) {
            List<Span> spans = new ArrayList<>();
            for (Line line : lines) {
                if (!spans.isEmpty() && spans.getLast().page() == line.page()
                    && spans.getLast().lastLine() + 1 == line.number()) {
                    Span last = spans.removeLast();
                    spans.add(new Span(last.page(), last.firstLine(), line.number()));
                } else {
                    spans.add(new Span(line.page(), line.number(), line.number()));
                }
            }
            return new Block(id, text(), first().page(), spans, kind, path, example);
        }
    }
}
