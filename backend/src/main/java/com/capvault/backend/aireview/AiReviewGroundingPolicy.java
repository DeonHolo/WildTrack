package com.capvault.backend.aireview;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Conservative structural/identity checks on provider suggestions. Text-only checking cannot
 * establish academic correctness; when structure is ambiguous, avoid asserting that it is absent.
 */
final class AiReviewGroundingPolicy {
    private static final Pattern TOC_LEADER = Pattern.compile("^.*[.·…]{3,}\\s*\\d+\\s*$");
    private static final Pattern NUMBERED_HEADING = Pattern.compile(
        "^(?:[A-Z](?:\\.\\d+)*|\\d+(?:\\.(?:\\d+|[A-Za-z]))*|[IVXLC]+)[.)]?\\s+(.+)$");
    private static final Pattern QUOTED_HEADING = Pattern.compile("[\\\"'‘“]([^\\\"'’”]{3,100})[\\\"'’”]");
    private static final Pattern ABSENCE = Pattern.compile(
        "\\b(missing|absent|omitted|not present|not included|no section|lacks|does not contain)\\b",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern WRONG_DELIVERABLE = Pattern.compile(
        "\\b(not (?:an? |the )?(?:actual |functional |valid |correct )?(?:software |project[- ]specific )?"
            + "(?:test document|requirements? (?:specification|document)|design document|deliverable)|"
            + "wrong (?:document|deliverable)|rather than (?:an? |the )?(?:software |project[- ]specific )?"
            + "(?:test document|requirements? (?:specification|document)|design document))\\b",
        Pattern.CASE_INSENSITIVE);

    private AiReviewGroundingPolicy() { }

    static List<AiReviewProvider.Finding> findings(List<AiReviewProvider.Finding> input, String title,
            String documentText, String templateText) {
        var accepted = new ArrayList<AiReviewProvider.Finding>();
        for (var finding : input) {
            String issue = finding.issue();
            if (finding.source() == AiReviewProvider.FindingSource.DOCUMENT) {
                if (wrongDeliverableFromSyntheticLabel(issue, title, documentText)
                        || sampleNameConfusion(issue, documentText, templateText)
                        || contradictedAbsolutePlaceholderClaim(issue, documentText, templateText)
                        || contradictedMissingBodyFinding(issue, documentText)) continue;
            } else if (unsupportedNamedSectionClaim(issue, finding.requirement(), finding.source())) {
                continue;
            }
            accepted.add(finding);
        }
        return List.copyOf(accepted);
    }

    static boolean sectionNamedByRequirement(String section, String requirement,
            AiReviewProvider.FindingSource source) {
        String title = canonical(section);
        if (title.isBlank()) return false;
        // An unrelated paragraph quoted verbatim from the authority does not authorize
        // claiming some OTHER section is mandatory.
        String normalized = normalize(requirement);
        if (!normalized.contains(title)) return false;
        if (source == AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE) return true;
        // A request to include some *content* (e.g., test cases, evidence, results) does not
        // necessarily impose a separate structural heading. Instructions must name a section.
        return source == AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS
            && normalized.matches("(?s).*(?:section|heading|chapter|subsection)\\b.*");
    }

    static boolean containsBodyHeading(String pdfText, String section) {
        String expected = canonical(section);
        if (expected.isBlank()) return false;
        var lines = Objects.requireNonNullElse(pdfText, "").lines().map(String::trim).toList();
        int toc = -1;
        for (int i = 0; i < lines.size(); i++) {
            if (normalize(lines.get(i)).equals("table of contents")) { toc = i; break; }
        }
        int tocEnd = toc;
        if (toc >= 0) {
            for (int i = toc + 1; i < lines.size(); i++) {
                if (TOC_LEADER.matcher(lines.get(i)).matches()) tocEnd = i;
                // A plain non-TOC paragraph following the entry list starts the actual body.
                if (tocEnd > toc && i > tocEnd && !lines.get(i).isBlank()
                        && lines.get(i).length() > 90) break;
            }
            // PDFBox often extracts a TOC without dotted leaders or page numbers. A chapter
            // heading listed in that TOC is then repeated when the actual body begins.
            // Find that repeated heading as an independent body anchor rather than treating
            // every leaderless TOC line as a real body section.
            if (tocEnd == toc) {
                for (int entry = toc + 1; entry < lines.size(); entry++) {
                    String first = lines.get(entry);
                    if (first.isBlank()) continue;
                    if (first.length() > 100 || first.split("\\s+").length > 10) break;
                    String anchor = canonical(first);
                    if (anchor.isBlank() || !headingMatches(first, anchor)) continue;
                    for (int body = entry + 1; body < lines.size(); body++) {
                        if (headingMatches(lines.get(body), anchor) && !lines.get(body).equalsIgnoreCase("table of contents")) {
                            tocEnd = body - 1;
                            break;
                        }
                    }
                    if (tocEnd > toc) break;
                }
            }
        }
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            if (line.isBlank() || TOC_LEADER.matcher(line).matches()) continue;
            // Change History and other actual front-matter headings can precede the TOC.
            if (toc >= 0 && i >= toc && i <= tocEnd) continue;
            if (headingMatches(line, expected)) return true;
            // PDF text extraction can split a heading number and its title across lines.
            if (line.matches("^(?:\\d+(?:\\.\\d+)*|[A-Z](?:\\.\\d+)*)[.)]?$")) {
                for (int next = i + 1; next < Math.min(i + 3, lines.size()); next++) {
                    if (headingMatches(lines.get(next), expected)) return true;
                    if (!lines.get(next).isBlank()) break;
                }
            }
        }
        return false;
    }

    private static boolean headingMatches(String line, String expected) {
        if (line.length() > 200) return false;
        String content = line.trim().replaceFirst("^[•*#-]+\\s*", "");
        Matcher numbered = NUMBERED_HEADING.matcher(content);
        if (numbered.matches()) content = numbered.group(1).trim();
        String candidate = canonical(content);
        if (candidate.equals(expected)) return true;
        // Allow headings followed by prose on the same extracted line, but not an incidental
        // mention of the section in a paragraph or a longer unrelated section name.
        int colon = content.indexOf(':');
        return colon >= 0 && colon < 110 && canonical(content.substring(0, colon)).equals(expected);
    }

    private static boolean contradictedMissingBodyFinding(String issue, String documentText) {
        if (!ABSENCE.matcher(issue).find() || !normalize(issue).contains("section")) return false;
        Matcher quoted = QUOTED_HEADING.matcher(issue);
        while (quoted.find()) {
            if (containsBodyHeading(documentText, quoted.group(1))) return true;
        }
        return false;
    }

    private static boolean unsupportedNamedSectionClaim(String issue, String requirement,
            AiReviewProvider.FindingSource source) {
        if (!ABSENCE.matcher(issue).find() || !normalize(issue).contains("section")) return false;
        Matcher quoted = QUOTED_HEADING.matcher(issue);
        while (quoted.find()) {
            String section = quoted.group(1);
            if (!sectionNamedByRequirement(section, requirement, source)) return true;
        }
        return false;
    }

    private static boolean wrongDeliverableFromSyntheticLabel(String issue, String title, String documentText) {
        if (!WRONG_DELIVERABLE.matcher(issue).find()) return false;
        if (!normalize(issue).contains("synthetic") && !normalize(issue).contains("benchmark")
                && !normalize(issue).contains("sample")) return false;
        String doc = normalize(documentText);
        String expected = normalize(title).replaceFirst(" (?:std|srs|sdd|spmp)$", "");
        if (expected.isBlank()) return false;
        // Explicitly labelling a correct-type PDF as synthetic is not evidence it is the wrong
        // artifact. Do NOT suppress genuine body mismatches such as an STD full of marketing text.
        boolean matchingType = doc.contains(expected)
            || expected.equals("srs") && doc.contains("software requirements specification")
            || expected.equals("std") && doc.contains("software test document")
            || expected.equals("sdd") && doc.contains("software design document");
        return matchingType && !documentText.toLowerCase(Locale.ROOT).matches(
            "(?s).*(?:marketing campaign|rather than (?:a |an )?(?:srs|std|sdd)|not (?:an? )?(?:srs|std|sdd)).*");
    }

    private static boolean sampleNameConfusion(String issue, String documentText, String templateText) {
        String text = normalize(issue);
        if (!text.matches("(?s).*(?:name|identity|named|project title).*")
                || !text.matches("(?s).*(?:template|sample|example|must match|should match|should be named).*"))
            return false;
        if (templateText == null || templateText.isBlank()) return false;
        // A name shown only in the official template cannot determine the identity of a
        // separately submitted project. If the same name appears in the PDF too, don't infer.
        for (Pattern pattern : List.of(
                Pattern.compile("(?im)\\b(?:for|project|system)\\s+([A-Z][A-Za-z0-9_-]{3,})"),
                Pattern.compile("(?im)^\\s*(?:Software Test Document|Software Requirements? Specification|"
                    + "Software Design Document)\\s*\\R\\s*([A-Z][A-Za-z0-9_-]{3,})\\s*$"))) {
            Matcher candidate = pattern.matcher(templateText);
            while (candidate.find()) {
                String name = candidate.group(1);
                if (text.contains(normalize(name)) && !normalize(documentText).contains(normalize(name))) return true;
            }
        }
        return false;
    }

    private static boolean contradictedAbsolutePlaceholderClaim(String issue, String documentText,
            String templateText) {
        String text = normalize(issue);
        if (!(text.matches("(?s).*\\b(?:entirely|only|all sections|no actual project content)\\b.*")
                && text.matches("(?s).*(?:placeholder|heading|no actual project content).*"))) return false;
        String doc = normalize(documentText);
        if (!normalize(templateText).isBlank() && doc.equals(normalize(templateText))) return false;
        // A full, substantive paragraph in a body section disproves an absolute assertion
        // that the document contains ONLY headings/placeholders. It does not establish completeness.
        return documentText.lines().map(String::trim).anyMatch(line ->
            line.length() >= 95 && line.split("\\s+").length >= 15
                && !line.toLowerCase(Locale.ROOT).matches("(?s).*(?:placeholder|insert system name|sample filler).*"));
    }

    private static String canonical(String text) {
        return normalize(Objects.requireNonNullElse(text, "")
            .replaceFirst("^(?:\\d+(?:\\.(?:\\d+|[A-Za-z]))*|[A-Z](?:\\.\\d+)*|[IVXLC]+)[.)]?\\s+", ""));
    }

    private static String normalize(String text) {
        return Objects.requireNonNullElse(text, "").toLowerCase(Locale.ROOT)
            .replaceAll("[^\\p{L}\\p{N}]+", " ").trim().replaceAll("\\s+", " ");
    }
}
