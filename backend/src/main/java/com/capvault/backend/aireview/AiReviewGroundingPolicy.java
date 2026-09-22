package com.capvault.backend.aireview;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Conservative structural/identity checks on provider suggestions. Text-only checking cannot
 * establish academic correctness; when structure is ambiguous, avoid asserting that it is absent.
 */
final class AiReviewGroundingPolicy {
    private static final int MAX_TEMPLATE_ALERTS = 8;
    private static final Pattern TEMPLATE_BODY_NUMBERED_HEADING = Pattern.compile(
        "^(\\d+(?:\\.\\d+){0,5})[.)]?\\s+(.+)$");
    private static final Pattern OPTIONAL_SECTION = Pattern.compile(
        "(?i)\\b(?:optional|if applicable|when applicable|where applicable|as needed|"
            + "not required|for reference only|example only|illustrative only)\\b");
    private static final Pattern TOC_LEADER = Pattern.compile("^.*[.·…]{3,}\\s*\\d+\\s*$");
    private static final Pattern TOC_PAGE_ENTRY = Pattern.compile(
        "^(?:(?:\\d+(?:\\.\\d+)*|[IVXLC]+)[.)]?\\s+)?[\\p{L}][\\p{L}\\p{N} \\t,():/&'–-]{2,100}\\s+\\d{1,4}$");
    private static final Pattern TOC_NUMBERED_ENTRY = Pattern.compile(
        "^\\d+(?:\\.\\d+)*[.)]?\\s+[\\p{L}][\\p{L}\\p{N} \\t,():/&'–-]{2,100}$");
    private static final Pattern NUMBERED_HEADING = Pattern.compile(
        "^(?:[A-Z](?:\\.\\d+)*|\\d+(?:\\.(?:\\d+|[A-Za-z]))*|[IVXLC]+)[.)]?\\s+(.+)$");
    private static final Pattern QUOTED_HEADING = Pattern.compile("[\\\"'‘“]([^\\\"'’”]{3,100})[\\\"'’”]");
    private static final Pattern ABSENCE = Pattern.compile(
        "\\b(missing|absent|omitted|not present|not included|no section|lacks|does not contain)\\b",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern HEADING_ABSENCE = Pattern.compile(
        "(?i)(?:\\b(?:missing|absent|omitted|not present|not included|no)\\s+(?:required\\s+)?(?:body\\s+)?(?:section|heading)\\b|"
            + "\\b(?:section|heading)\\b.{0,110}\\b(?:missing|absent|omitted|not present|not included|does not appear|does not exist)\\b|"
            + "\\b(?:missing|absent|omitted)\\b.{0,110}\\b(?:section|heading)\\b)");
    private static final Pattern CONTENT_ABSENCE = Pattern.compile(
        "(?i)\\b(?:missing|absent|omitted|lacks?)\\s+(?:substantive\\s+)?"
            + "(?:content|detail|information|description|explanation|prose|paragraph|evidence|example)s?\\b");
    private static final Pattern NAMED_HEADING_ABSENCE = Pattern.compile(
        "(?i)\\b(?:is|are|was|were)\\s+(?:missing|absent|omitted|not\\s+present|not\\s+included)\\b");
    private static final Pattern FORMAT_REQUIREMENT = Pattern.compile(
        "(?i)\\b(?:no\\s+bullets?|bullets?\\s+(?:are\\s+)?(?:prohibited|forbidden|not\\s+allowed)|"
            + "(?:must|shall|required\\s+to|should)\\s+(?:be\\s+)?(?:written|presented|described)\\s+"
            + "(?:in\\s+)?(?:paragraphs?|prose|narrative)|paragraph\\s+format|prose\\s+format)\\b");
    private static final Pattern UNSUPPORTED_FORMAT_CRITICISM = Pattern.compile(
        "(?i)\\b(?:bullets?|bulleted|lists?)\\b.{0,150}\\b(?:instead\\s+of|rather\\s+than|"
            + "should|must|required|incorrect|inappropriate|noncompliant|not\\s+acceptable|"
            + "needs?\\s+to|prose|paragraph|narrative)\\b|"
            + "\\b(?:should|must|required|incorrect|inappropriate|noncompliant|not\\s+acceptable|"
            + "needs?\\s+to|prose|paragraph|narrative)\\b.{0,150}\\b(?:bullets?|bulleted|lists?)\\b");
    private static final Pattern WRONG_DELIVERABLE = Pattern.compile(
        "\\b(not (?:an? |the )?(?:actual |functional |valid |correct )?(?:software |project[- ]specific )?"
            + "(?:test document|requirements? (?:specification|document)|design document|deliverable)|"
            + "wrong (?:document|deliverable)|rather than (?:an? |the )?(?:software |project[- ]specific )?"
            + "(?:test document|requirements? (?:specification|document)|design document))\\b",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern NON_ISSUE = Pattern.compile(
        "(?i)\\b(?:not\\s+(?:a\\s+)?(?:non[- ]?compliance|violation|problem|issue|error|defect)|"
            + "(?:is|are)\\s+(?:acceptable|permitted|allowed|compliant)|"
            + "no\\s+(?:correction|change|action)\\s+(?:is\\s+)?(?:needed|required))\\b");

    private AiReviewGroundingPolicy() { }

    static List<AiReviewProvider.Finding> findings(List<AiReviewProvider.Finding> input, String title,
            String documentText, String templateText) {
        var accepted = new ArrayList<AiReviewProvider.Finding>();
        for (var finding : input) {
            String issue = finding.issue();
            // The provider occasionally places its own exculpatory observation
            // in the findings array. The screenshot's naming difference was
            // explicitly called "not a noncompliance". Such prose is not an
            // actionable finding and must not create a false successful review.
            if (NON_ISSUE.matcher(issue).find() && !WRONG_DELIVERABLE.matcher(issue).find()
                    && !ABSENCE.matcher(issue).find()
                    && !normalize(issue).matches("(?s).*(?:however|but|although|nevertheless)\\s+"
                        + ".*(?:missing|incorrect|incomplete|violat|noncompliance).*")) continue;
            if (unsupportedBulletFormattingClaim(finding)) continue;
            if (finding.source() == AiReviewProvider.FindingSource.DOCUMENT) {
                if (wrongDeliverableFromSyntheticLabel(issue, title, documentText)
                        || sampleNameConfusion(issue, documentText, templateText)
                        || contradictedAbsolutePlaceholderClaim(issue, documentText, templateText)) continue;
            } else if (unsupportedNamedSectionClaim(issue, finding.requirement(), finding.source())) {
                continue;
            }
            if (contradictedRequiredHeadingFinding(finding, documentText)) continue;
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

    /**
     * Suppress a model's OFFICIAL_TEMPLATE "missing required section" when its own
     * mapped authority explicitly identifies that very section as optional/conditional.
     * This does not override an independent, explicit Deliverable Instructions obligation.
     */
    static boolean optionalTemplateSection(String section, String templateText, String instructions) {
        if (templateText == null || templateText.isBlank()) return false;
        String expected = canonical(section);
        if (expected.isBlank()) return false;
        var lines = Objects.requireNonNullElse(templateText, "").lines().map(String::trim).toList();
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            Matcher heading = TEMPLATE_BODY_NUMBERED_HEADING.matcher(line);
            if (!heading.matches()) continue;
            String sourceTitle = heading.group(2).replaceFirst(
                "(?i)\\s*\\((?:optional|if applicable|when applicable|where applicable|as needed)\\)\\s*$", "").trim();
            if (canonical(sourceTitle).equals(expected) && optionalHeading(line, expected, lines, i, instructions))
                return true;
        }
        return false;
    }

    /**
     * An advisory comparison only: a numbered heading in a mapped template does not establish
     * that the corresponding section is mandatory for every project. Never add these observations
     * to missingRequiredSections, which is reserved for independently supplied requirements.
     *
     * Both PDFs must have an unambiguous body region. At least one template section must actually
     * be recognized in the submitted body, so a different document or an unparseable PDF is not
     * flooded with template-based absence assertions. A TOC entry is never body evidence.
     */
    static List<AiReviewProvider.Finding> templateBodyCrosscheck(String templateText, String documentText,
            String instructions, List<AiReviewProvider.Finding> accepted,
            List<AiReviewProvider.MissingRequiredSection> acceptedMissing) {
        if (templateText == null || templateText.isBlank() || documentText == null || documentText.isBlank()
                || templateText.length() > 300_000 || documentText.length() > 1_000_000) return List.of();
        var template = layout(templateText, true);
        var document = layout(documentText, true);
        if (!template.reliableBody() || !document.reliableBody()) return List.of();

        var expected = new ArrayList<TemplateHeading>();
        var deduplicated = new HashSet<String>();
        for (int i = 0; i < template.lines().size(); i++) {
            if (!template.inBody(i)) continue;
            String line = template.lines().get(i);
            Matcher heading = TEMPLATE_BODY_NUMBERED_HEADING.matcher(line);
            if (!heading.matches()) continue;
            String name = heading.group(2).trim();
            String canonical = canonical(name);
            if (name.length() > 100 || name.split("\\s+").length > 10 || canonical.length() < 4
                    || line.contains("...") || line.contains("…")
                    || !deduplicated.add(canonical) || optionalHeading(line, canonical, template.lines(), i, instructions))
                continue;
            // The exact numbered source line is a conservative, auditable template-body quote.
            expected.add(new TemplateHeading(line, canonical));
        }
        if (expected.size() < 2) return List.of();
        // A recognizable shared body heading confirms comparable structure. A wrong-document
        // submission should instead receive its own document-identity review, not bulk template alerts.
        long overlap = expected.stream().filter(head ->
            containsBodyHeading(documentText, head.quote())).count();
        if (overlap == 0) return List.of();

        var existingSections = new HashSet<String>();
        for (var missing : acceptedMissing) existingSections.add(canonical(missing.section()));
        for (var finding : accepted) {
            if (finding.source() == AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE
                    && finding.issue().contains("Mapped-template body heading")) {
                existingSections.add(canonical(finding.requirement()));
            }
        }
        var warnings = new ArrayList<AiReviewProvider.Finding>();
        for (var head : expected) {
            if (containsBodyHeading(documentText, head.quote()) || existingSections.contains(head.title())) continue;
            if (accepted.stream().anyMatch(finding -> ABSENCE.matcher(finding.issue()).find()
                    && normalize(finding.issue()).contains(head.title()))) continue;
            String quoted = head.quote();
            warnings.add(new AiReviewProvider.Finding(
                "Mapped-template body heading '" + quoted + "' was not detected in the submitted PDF body; "
                    + "confirm applicability and equivalent headings before requesting a change.",
                AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE,
                "Mapped official-template body heading: " + quoted
                    + ". No matching body heading detected in submitted PDF text; a Table of Contents entry alone is insufficient.",
                quoted));
            if (warnings.size() == MAX_TEMPLATE_ALERTS) break;
        }
        return List.copyOf(warnings);
    }

    private record TemplateHeading(String quote, String title) { }

    private static boolean optionalHeading(String heading, String canonical, List<String> lines,
            int lineIndex, String instructions) {
        if (OPTIONAL_SECTION.matcher(heading).find()) return true;
        // An optional/conditional annotation immediately beneath a heading applies to that
        // section. Ordinary illustrative body prose is not automatically an optional marker.
        for (int i = lineIndex + 1; i < Math.min(lines.size(), lineIndex + 3); i++) {
            String next = lines.get(i);
            if (next.isBlank()) continue;
            if (OPTIONAL_SECTION.matcher(next).find())
                return true;
            break;
        }
        String scope = normalize(instructions);
        if (scope.matches("(?s).*(?:all|every) (?:template )?sections? (?:are|is) optional.*"))
            return true;
        // Only close, explicit instruction-level section annotations are interpreted as optional.
        int mention = scope.indexOf(canonical);
        while (mention >= 0) {
            String before = scope.substring(Math.max(0, mention - 45), mention);
            String after = scope.substring(mention + canonical.length(),
                Math.min(scope.length(), mention + canonical.length() + 45));
            if (before.matches("(?s).*\\boptional\\s+(?:section\\s+)?$")
                    || after.matches("(?s)^\\s+(?:section\\s+)?(?:is|are)?\\s*optional\\b.*"))
                return true;
            mention = scope.indexOf(canonical, mention + canonical.length());
        }
        return false;
    }

    static boolean containsBodyHeading(String pdfText, String section) {
        String expected = canonical(section);
        if (expected.isBlank()) return false;
        // The Table of Contents is itself a front-matter section, not a body
        // chapter after the TOC. A real index heading with entries must not be
        // marked missing merely because layout() deliberately excludes the
        // index region when looking for chapter-body headings.
        if (expected.equals("table of contents") && containsTableOfContents(pdfText)) return true;
        // When filtering a model-proposed missing section, prefer not to call a potentially
        // present heading missing. For *new* automatic absence advisories, use stricter body
        // boundary confidence in templateBodyCrosscheck above.
        var region = layout(pdfText, false);
        var lines = region.lines();
        if (!region.reliableBody()) return false;
        for (int i = 0; i < lines.size(); i++) {
            if (!region.inBody(i)) continue;
            String line = lines.get(i);
            if (line.isBlank() || TOC_LEADER.matcher(line).matches()) continue;
            if (headingMatches(line, expected)) return true;
            // PDF text extraction can split a heading number and its title across lines.
            if (line.matches("^(?:\\d+(?:\\.\\d+)*|[A-Z](?:\\.\\d+)*)[.)]?$")) {
                for (int next = i + 1; next < Math.min(i + 3, lines.size()); next++) {
                    if (region.inBody(next) && headingMatches(lines.get(next), expected)) return true;
                    if (!lines.get(next).isBlank()) break;
                }
            }
        }
        return false;
    }

    private static boolean containsTableOfContents(String pdfText) {
        List<String> lines = Objects.requireNonNullElse(pdfText, "").lines().map(String::trim).toList();
        for (int heading = 0; heading < lines.size(); heading++) {
            if (!normalize(lines.get(heading)).equals("table of contents")) continue;
            int formattedEntries = 0;
            int numberedEntries = 0;
            int nonblank = 0;
            for (int i = heading + 1; i < lines.size() && nonblank < 36; i++) {
                String line = lines.get(i);
                if (line.isBlank()) continue;
                nonblank++;
                if (line.length() > 125 || line.split("\\s+").length > 16) break;
                // A later occurrence of the same title is usually a TOC entry
                // or the start of a different region, not an index entry itself.
                if (normalize(line).equals("table of contents")) break;
                if (TOC_LEADER.matcher(line).matches() || TOC_PAGE_ENTRY.matcher(line).matches()) formattedEntries++;
                if (TOC_NUMBERED_ENTRY.matcher(line).matches()) numberedEntries++;
                if (formattedEntries >= 2 || numberedEntries >= 3) return true;
            }
        }
        // A lone title or a paragraph mentioning the TOC is insufficient.
        return false;
    }

    private record Layout(List<String> lines, int toc, int tocEnd, boolean reliableBody) {
        boolean inBody(int index) { return toc < 0 || index < toc || index > tocEnd; }
    }

    private static Layout layout(String pdfText, boolean requireProvenBodyBoundary) {
        var lines = Objects.requireNonNullElse(pdfText, "").lines().map(String::trim).toList();
        int toc = -1;
        for (int i = 0; i < lines.size(); i++) {
            if (normalize(lines.get(i)).equals("table of contents")) { toc = i; break; }
        }
        int tocEnd = toc;
        boolean reliable = toc < 0;
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
            for (int entry = toc + 1; entry < lines.size(); entry++) {
                String first = lines.get(entry);
                if (first.isBlank()) continue;
                if (first.length() > 100 || first.split("\\s+").length > 10) break;
                // A TOC may include dotted page leaders or plain headings. Strip only
                // the dotted page reference when identifying the repeated body anchor.
                String tocHeading = first.replaceFirst("\\s*[.·…]{3,}\\s*\\d+\\s*$", "").trim();
                String anchor = canonical(tocHeading);
                if (anchor.isBlank() || !headingMatches(tocHeading, anchor)) continue;
                for (int body = entry + 1; body < lines.size(); body++) {
                    if (headingMatches(lines.get(body), anchor)
                            && !lines.get(body).equalsIgnoreCase("table of contents")
                            && (!requireProvenBodyBoundary || convincingBodyAnchor(lines, toc, body))) {
                        tocEnd = body - 1;
                        reliable = true;
                        break;
                    }
                }
                if (reliable) break;
            }
        }
        return new Layout(lines, toc, tocEnd, reliable);
    }

    private static boolean convincingBodyAnchor(List<String> lines, int toc, int candidate) {
        // A duplicate entry *inside the TOC* is not evidence that the body began. A repeated
        // heading must either have following substantive prose or a preceding PDF page header.
        // Empty headings with neither signal remain ambiguous and cannot authorize auto-add.
        for (int next = candidate + 1; next < Math.min(lines.size(), candidate + 4); next++) {
            String text = lines.get(next);
            if (text.isBlank()) continue;
            if (TOC_LEADER.matcher(text).matches() || TEMPLATE_BODY_NUMBERED_HEADING.matcher(text).matches())
                return false;
            if (text.length() >= 25 && text.split("\\s+").length >= 5) return true;
            break;
        }
        for (int before = Math.max(toc + 1, candidate - 4); before < candidate; before++) {
            if (normalize(lines.get(before)).matches("document version(?: \\d+)+")) return true;
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

    private static boolean contradictedRequiredHeadingFinding(AiReviewProvider.Finding finding, String documentText) {
        String issue = finding.issue();
        if (CONTENT_ABSENCE.matcher(issue).find()
                || !(HEADING_ABSENCE.matcher(issue).find() || NAMED_HEADING_ABSENCE.matcher(issue).find()))
            return false;
        if (normalize(issue).contains("table of contents")
                && normalize(finding.requirement()).contains("table of contents")
                && containsBodyHeading(documentText, "Table of Contents")) return true;
        Matcher quoted = QUOTED_HEADING.matcher(issue);
        while (quoted.find()) {
            if (containsBodyHeading(documentText, quoted.group(1))) return true;
        }
        // Section references are often unquoted in the generated finding. Prefer a numbered
        // heading explicitly named in the supplied authority and mentioned by the finding.
        if (finding.source() == AiReviewProvider.FindingSource.DOCUMENT) return false;
        Matcher required = TEMPLATE_BODY_NUMBERED_HEADING.matcher(finding.requirement().trim());
        if (required.matches() && normalize(issue).contains(normalize(required.group(2)))) {
            return containsBodyHeading(documentText, required.group(2));
        }
        for (String line : finding.requirement().lines().toList()) {
            Matcher numbered = TEMPLATE_BODY_NUMBERED_HEADING.matcher(line.trim());
            if (numbered.matches() && normalize(issue).contains(normalize(numbered.group(2)))
                    && containsBodyHeading(documentText, numbered.group(2))) return true;
        }
        return false;
    }

    private static boolean unsupportedBulletFormattingClaim(AiReviewProvider.Finding finding) {
        if (!UNSUPPORTED_FORMAT_CRITICISM.matcher(finding.issue()).find()) return false;
        // A document may be the wrong deliverable even when its visible structure is a list.
        // A formatting guard must not erase that independently observed identity mismatch.
        if (WRONG_DELIVERABLE.matcher(finding.issue()).find()
                || normalize(finding.issue()).matches("(?s).*\\b(?:wrong document|wrong deliverable|"
                    + "rather than the requested|not (?:an? )?(?:srs|std|sdd|spmp))\\b.*"))
            return false;
        // An observed bullet list is document evidence. Claiming it violates an unprovided
        // paragraph/prose rule requires an explicit source passage authorizing that rule.
        return finding.source() == AiReviewProvider.FindingSource.DOCUMENT
            || !FORMAT_REQUIREMENT.matcher(finding.requirement()).find();
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
        // PDF extraction often wraps one substantive paragraph into several
        // short lines. A real body paragraph refutes the absolute claim that
        // the entire document contains only headings and placeholders.
        StringBuilder paragraph = new StringBuilder();
        for (String raw : documentText.lines().toList()) {
            String line = raw.trim();
            boolean boundary = line.isBlank() || NUMBERED_HEADING.matcher(line).matches()
                || line.matches("(?i)^(?:document version|software test document|"
                    + "software requirements specification|software design document)(?::.*)?$");
            if (boundary) {
                if (substantiveParagraph(paragraph.toString())) return true;
                paragraph.setLength(0);
            } else if (line.toLowerCase(Locale.ROOT)
                    .matches("(?s).*(?:placeholder|insert system name|sample filler).*")) {
                paragraph.setLength(0);
            } else {
                if (!paragraph.isEmpty()) paragraph.append(' ');
                paragraph.append(line);
            }
        }
        return substantiveParagraph(paragraph.toString());
    }

    private static boolean substantiveParagraph(String candidate) {
        String text = candidate.toLowerCase(Locale.ROOT);
        if (text.contains("synthetic benchmark fixture") || text.contains("controlled test material")
                || text.contains("sample filler") || text.contains("not evidence that")) return false;
        return candidate.length() >= 110 && candidate.split("\\s+").length >= 18
            && candidate.contains(".");
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
