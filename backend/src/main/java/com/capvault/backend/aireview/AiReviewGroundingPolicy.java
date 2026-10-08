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
    private static final Pattern TOC_PREFIX_LEADER_ENTRY = Pattern.compile(
        "^((?:\\d+(?:\\.\\d+)*|[IVXLC]+)[.)]?)\\s*[.·…]{3,}\\s*(.+?)\\s+\\d{1,4}$");
    private static final Pattern TOC_NUMBERED_ENTRY = Pattern.compile(
        "^\\d+(?:\\.\\d+)*[.)]?\\s+[\\p{L}][\\p{L}\\p{N} \\t,():/&'–-]{2,100}$");
    private static final Pattern CLAIMED_TOC_SECTION = Pattern.compile(
        "(?i)(?:table\\s+of\\s+contents|\\btoc\\b).{0,120}"
            + "\\b(?:lists?|includes?|contains?|shows?)\\s+(?:the\\s+)?(?:section\\s+)?"
            + "(\\d+(?:\\.\\d+){1,5})\\b");
    private static final Pattern NUMBERED_HEADING = Pattern.compile(
        "^(?:[A-Z](?:\\.\\d+)*|\\d+(?:\\.(?:\\d+|[A-Za-z]))*|[IVXLC]+)[.)]?\\s+(.+)$");
    private static final Pattern QUOTED_HEADING = Pattern.compile("[\\\"'‘“]([^\\\"'’”]{3,100})[\\\"'’”]");
    private static final Pattern ABSENCE = Pattern.compile(
        "\\b(missing|absent|omitted|not present|not included|no section|lacks|does not contain)\\b",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern HEADING_ABSENCE = Pattern.compile(
        "(?i)(?:\\b(?:missing|absent|omitted|not present|not included|no)\\s+(?:required\\s+)?(?:body\\s+)?(?:section|heading)\\b|"
            + "\\b(?:section|heading)\\b.{0,110}\\b(?:missing|absent|omitted|not present|not included|does not appear|does not exist)\\b|"
            + "\\b(?:missing|absent|omitted|lacks?)\\b.{0,110}\\b(?:section|heading)\\b)");
    private static final Pattern CONTENT_ABSENCE = Pattern.compile(
        "(?i)\\b(?:(?:missing|absent|omitted|lacks?)\\s+(?:substantive\\s+)?"
            + "(?:content|detail|information|description|explanation|prose|paragraph|evidence|example)s?"
            + "|(?:fails?|does\\s+not)\\s+to\\s+(?:provide|include)\\s+(?:the\\s+)?(?:required\\s+)?"
            + "(?:content|detail|information|description|explanation|prose|paragraph|evidence|example|"
            + "definition|acronym|abbreviation)s?)\\b");
    private static final Pattern GENERIC_CONTENT_ABSENCE = Pattern.compile(
        "(?i)^\\s*(?:the\\s+document|(?:section\\s+)?[0-9.]*\\s*[a-z][a-z0-9 ,&/-]*)\\s+"
            + "(?:(?:fails?|does\\s+not)\\s+to\\s+(?:provide|include)\\s+(?:the\\s+)?(?:required\\s+)?"
            + "(?:content|(?:definitions?|acronyms?|abbreviations?)"
            + "(?:\\s*,?\\s*(?:and\\s+)?(?:definitions?|acronyms?|abbreviations?))*)"
            + "(?:\\s+for\\s+[a-z0-9 .&/-]+)?"
            + "|(?:is\\s+)?(?:missing|lacks?)\\s+(?:the\\s+)?(?:required\\s+)?"
            + "(?:content|details?|information|description|explanation|prose|paragraph|evidence|examples?))"
            + "\\s*[.]?\\s*$");
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
    private static final Pattern EXPLICIT_PLACEHOLDER = Pattern.compile(
        "(?im)^\\s*(?:(?:placeholder|todo|tbd)\\b\\s*(?::|-|$)|"
            + "(?:insert|replace|enter)\\b.{0,60}\\bhere\\b\\s*[.!]?\\s*$)");
    private static final Pattern MODULE_ONE_HEADING = Pattern.compile("(?i)^module\\s+1(?:\\b|\\s*[:.-]).*$");
    private static final Pattern MODULE_HEADING = Pattern.compile("(?i)^module\\s+(\\d+)(?:\\b|\\s*[:.-]).*$");
    private static final Pattern TOC_LISTING_CLAIM = Pattern.compile(
        "(?i)table\\s+of\\s+contents.{0,140}\\b(?:lists?|includes?|contains?)\\s+"
            + "(?:the\\s+)?(?:section\\s+)?(\\d+(?:\\.\\d+)+)\\b");
    private static final Pattern EXTERNAL_DOCUMENT_CITATION = Pattern.compile(
        "\\b((?:(?:[A-Z][\\p{L}\\p{N}&'â€™./-]*|[A-Z]{2,}[0-9]*)\\s+){1,8}"
            + "(?:Specification|Standard|Manual|Guide|Report|Policy|Procedure|Protocol))"
            + "\\s*\\(([^)\\r\\n]{3,180})\\)");
    private static final Pattern DOCUMENT_IDENTIFIER = Pattern.compile(
        "\\b(?=[A-Z0-9./-]{4,40}\\b)(?=[A-Z0-9./-]*[A-Z])(?=[A-Z0-9./-]*\\d)"
            + "[A-Z0-9]+(?:[-./][A-Z0-9]+)+\\b");
    private static final Pattern NUMERIC_CAP = Pattern.compile(
        "(?i)\\b(?:no\\s+more\\s+than|at\\s+most|up\\s+to|limit(?:ed)?\\s+(?:is|to))\\s+"
            + "(\\d{1,6})\\s+([^.;!?\\r\\n]{4,120})");
    private static final Pattern UPPERCASE_ACRONYM = Pattern.compile("\\b[A-Z][A-Z0-9]{2,7}\\b");
    private static final Set<String> DOCUMENT_TYPE_ACRONYMS =
        Set.of("SRS", "STD", "SDD", "SPMP", "PDF");
    private static final Set<String> COMMON_TECH_ACRONYMS =
        Set.of("API", "JSON", "HTTPS", "HTTP", "TLS", "URL", "URI", "UI", "UX",
            "TCP", "UDP", "SQL", "HTML", "CSS", "XML", "UUID");

    private AiReviewGroundingPolicy() { }

    static boolean uncertainExtractionObservation(AiReviewProvider.Finding finding, String documentText) {
        return unsupportedArtifactRenderingClaim(finding, documentText)
            || !hasReliableBodyBoundary(documentText) && (HEADING_ABSENCE.matcher(finding.issue()).find()
                || NAMED_HEADING_ABSENCE.matcher(finding.issue()).find()
                || GENERIC_CONTENT_ABSENCE.matcher(finding.issue()).matches());
    }


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
            if (unsupportedArtifactRenderingClaim(finding, documentText)) continue;
            if (unsupportedUnspecifiedCompletenessClaim(finding)) continue;
            if (finding.source() == AiReviewProvider.FindingSource.DOCUMENT) {
                if (wrongDeliverableFromSyntheticLabel(issue, title, documentText)
                        || sampleNameConfusion(issue + " " + finding.evidence(), documentText, templateText)
                        || contradictedAbsolutePlaceholderClaim(issue, documentText, templateText)
                        || contradictedDocumentContentReplacement(finding, documentText)
                        || inventedTableOfContentsEntry(finding, documentText)
                        || unsupportedDocumentSectionPlacementClaim(issue)
                        || unsupportedDocumentStyleCriticism(issue)
                        || unsupportedEmbeddedReviewerInstruction(issue + " " + finding.evidence())
                        || unsupportedDocumentAuthorityClaim(issue)) continue;
            } else if (finding.source() == AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE
                    && unsupportedTemplateSampleIdentityClaim(
                        issue + " " + finding.evidence(), finding.requirement(), documentText, templateText)) {
                continue;
            } else if (unsupportedNamedSectionClaim(issue, finding.requirement(), finding.source())) {
                continue;
            }
            if (contradictedRequiredHeadingFinding(finding, documentText)) continue;
            if (contradictedBlanketArtifactAbsence(finding, documentText)) continue;
            if (contradictedTocListingClaim(finding, documentText)) continue;
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
        if (source == AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE) {
            // Labels such as "Transaction Name" and "Module Name" are illustrative
            // placeholders in the official template. A student's project-specific
            // transaction/module title satisfies that shape; the literal placeholder
            // text must never become a mandatory submitted heading.
            if (illustrativeTemplateHeading(title)) return false;
            // A TOC/front-matter label in a template shows structure but does not by
            // itself make that label a mandatory submission section. Accept a
            // structural obligation only from a numbered body heading or explicit
            // normative language in the cited template passage.
            for (String raw : Objects.requireNonNullElse(requirement, "").lines().toList()) {
                Matcher numbered = TEMPLATE_BODY_NUMBERED_HEADING.matcher(raw.trim());
                if (numbered.matches() && canonical(numbered.group(2)).equals(title)) return true;
            }
            return normalized.matches("(?s).*(?:must|shall|required|mandatory).{0,120}"
                + Pattern.quote(title) + ".*")
                || normalized.matches("(?s).*" + Pattern.quote(title)
                    + ".{0,120}(?:must|shall|required|mandatory).*");
        }
        // A request to include some *content* (e.g., test cases, evidence, results) does not
        // necessarily impose a separate structural heading. Instructions must name a section.
        return source == AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS
            && normalized.matches("(?s).*(?:section|heading|chapter|subsection)\\b.*");
    }

    static boolean templateHasNumberedBodyHeading(String templateText, String section) {
        if (templateText == null || templateText.isBlank()) return false;
        String expected = canonical(section);
        if (expected.isBlank()) return false;
        Layout template = layout(templateText, true);
        if (!template.reliableBody()) return false;
        for (int i = 0; i < template.lines().size(); i++) {
            if (!template.inBody(i)) continue;
            Matcher heading = TEMPLATE_BODY_NUMBERED_HEADING.matcher(template.lines().get(i));
            if (heading.matches() && canonical(heading.group(2)).equals(expected)
                    && convincingBodyAnchor(template.lines(), template.toc(), i)) return true;
        }
        return false;
    }

    static boolean templateStructuralCitationMatchesSection(String requirement, String section) {
        String expected = canonical(section);
        if (expected.isBlank()) return false;
        for (String raw : Objects.requireNonNullElse(requirement, "").lines().toList()) {
            String line = raw.trim();
            Matcher prefixedLeader = TOC_PREFIX_LEADER_ENTRY.matcher(line);
            if (prefixedLeader.matches()
                    && numberedCitationMatchesSection(
                        prefixedLeader.group(1) + " " + prefixedLeader.group(2), expected)) return true;
            if (TOC_LEADER.matcher(line).matches()) {
                String reconstructed = line.replaceFirst("\\s*[.·…]{3,}\\s*\\d+\\s*$", "").trim();
                if (numberedCitationMatchesSection(reconstructed, expected)) return true;
            }
            if (TOC_PAGE_ENTRY.matcher(line).matches()) {
                String reconstructed = line.replaceFirst("\\s+\\d{1,4}\\s*$", "").trim();
                if (numberedCitationMatchesSection(reconstructed, expected)) return true;
            }
        }
        return false;
    }

    private static boolean numberedCitationMatchesSection(String citation, String expected) {
        Matcher numbered = TEMPLATE_BODY_NUMBERED_HEADING.matcher(citation);
        return numbered.matches() && canonical(numbered.group(2)).equals(expected);
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
                    || illustrativeTemplateHeading(canonical)
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
            String placeholder = explicitPlaceholderEvidence(document, head.title());
            if (placeholder != null && accepted.stream().noneMatch(finding ->
                    normalize(finding.issue()).contains(head.title())
                        && normalize(finding.issue()).contains("placeholder"))) {
                warnings.add(new AiReviewProvider.Finding(
                    "Mapped-template section '" + head.quote()
                        + "' contains explicit placeholder text in the submitted PDF body; "
                        + "confirm applicability and replace unresolved template text before treating the section as complete.",
                    AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE,
                    placeholder,
                    head.quote()));
                if (warnings.size() == MAX_TEMPLATE_ALERTS) break;
                continue;
            }
            if (containsBodyHeading(documentText, head.quote()) || existingSections.contains(head.title())) continue;
            if (accepted.stream().anyMatch(finding -> ABSENCE.matcher(finding.issue()).find()
                    && normalize(finding.issue()).contains(head.title()))) continue;
            String quoted = head.quote();
            warnings.add(new AiReviewProvider.Finding(
                "Mapped-template body heading '" + quoted + "' could not be located in extracted body text; "
                    + "confirm equivalent headings and the original PDF layout.",
                AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE,
                "",
                quoted,
                "Verify " + quoted,
                "Open the original PDF and confirm this section before requesting a revision.",
                null));
        }
        if (warnings.size() < MAX_TEMPLATE_ALERTS)
            addTransactionArtifactWarnings(template, document, accepted, warnings);
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

    static boolean containsBodySectionContent(String pdfText, String sectionOrTopic) {
        String expected = canonical(sectionOrTopic);
        if (expected.isBlank()) return false;
        var region = layout(pdfText, false);
        if (!region.reliableBody()) return false;
        int heading = bodyHeadingIndex(region, expected, true);
        if (heading < 0) return false;
        String inline = inlineBodyText(region.lines().get(heading), expected);
        if (inline != null) {
            if (EXPLICIT_PLACEHOLDER.matcher(inline).find()) return false;
            if (inline.length() >= 12 && inline.split("\\s+").length >= 3) return true;
        }
        for (int i = heading + 1; i < region.lines().size(); i++) {
            if (!region.inBody(i)) continue;
            String line = region.lines().get(i);
            if (line.isBlank()) continue;
            if (isBodyBoundaryAfter(region.lines().get(heading), line)) break;
            if (EXPLICIT_PLACEHOLDER.matcher(line).find()) return false;
            if (line.length() >= 12 && line.split("\\s+").length >= 3) return true;
        }
        return false;
    }

    static boolean bodySectionContainsEvidence(String pdfText, String sectionOrTopic, String evidence) {
        return containsBodySectionContent(pdfText, sectionOrTopic)
            && bodySectionContainsSourceSpan(pdfText, sectionOrTopic, evidence);
    }

    static boolean bodySectionContainsSourceSpan(String pdfText, String sectionOrTopic, String evidence) {
        String expected = canonical(sectionOrTopic);
        String normalizedEvidence = normalize(evidence);
        if (expected.isBlank() || normalizedEvidence.isBlank()) return false;
        var region = layout(pdfText, false);
        if (!region.reliableBody()) return false;
        int heading = bodyHeadingIndex(region, expected, true);
        if (heading < 0) return false;
        var body = new StringBuilder(region.lines().get(heading));
        for (int i = heading + 1; i < region.lines().size(); i++) {
            if (!region.inBody(i)) continue;
            String line = region.lines().get(i);
            if (line.isBlank()) continue;
            if (isBodyBoundaryAfter(region.lines().get(heading), line)) break;
            body.append(' ').append(line);
        }
        return normalize(body.toString()).contains(normalizedEvidence);
    }

    static boolean containsExplicitPlaceholder(String value) {
        return value != null && EXPLICIT_PLACEHOLDER.matcher(value).find();
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
                if (TOC_LEADER.matcher(line).matches() || TOC_PAGE_ENTRY.matcher(line).matches()
                        || TOC_PREFIX_LEADER_ENTRY.matcher(line).matches()) formattedEntries++;
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

    static boolean hasReliableBodyBoundary(String pdfText) {
        return pdfText != null && !pdfText.isBlank() && layout(pdfText, true).reliableBody();
    }

    private static Layout layout(String pdfText, boolean requireProvenBodyBoundary) {
        var lines = Objects.requireNonNullElse(pdfText, "").lines().map(String::trim).toList();
        int toc = -1;
        for (int i = 0; i < lines.size(); i++) {
            if (normalize(lines.get(i)).equals("table of contents")) { toc = i; break; }
        }
        if (toc < 0) return new Layout(lines, -1, -1, true);

        int earliestBody = lines.size();
        // TOC entries need not be in body order. The first entry may repeat much
        // later than Purpose/Scope, so inspect every candidate before selecting
        // the earliest independently supported body anchor.
        for (int entry = toc + 1; entry < earliestBody; entry++) {
            String first = lines.get(entry);
            if (first.isBlank()) continue;
            Matcher prefixedLeader = TOC_PREFIX_LEADER_ENTRY.matcher(first);
            String tocHeading = prefixedLeader.matches()
                ? prefixedLeader.group(1) + " " + prefixedLeader.group(2)
                : first.replaceFirst("\\s*[.·…]{3,}\\s*\\d+\\s*$", "").trim();
            if (TOC_PAGE_ENTRY.matcher(tocHeading).matches())
                tocHeading = tocHeading.replaceFirst("\\s+\\d{1,4}\\s*$", "").trim();
            if (tocHeading.length() > 100 || tocHeading.split("\\s+").length > 10) continue;
            String anchor = canonical(tocHeading);
            if (anchor.isBlank() || !headingMatches(tocHeading, anchor)) continue;
            for (int body = entry + 1; body < earliestBody; body++) {
                String line = lines.get(body);
                if (TOC_LEADER.matcher(line).matches() || TOC_PREFIX_LEADER_ENTRY.matcher(line).matches()) continue;
                int titleIndex = body;
                boolean matches = headingMatches(line, anchor);
                if (!matches && line.matches("^(?:\\d+(?:\\.\\d+)*|[A-Z](?:\\.\\d+)*)[.)]?$")) {
                    for (int next = body + 1; next < Math.min(body + 3, lines.size()); next++) {
                        if (lines.get(next).isBlank()) continue;
                        matches = headingMatches(line + " " + lines.get(next), anchor);
                        titleIndex = next;
                        break;
                    }
                }
                // A repeated TOC item alone is never proof that the body began.
                if (matches && convincingBodyAnchor(lines, toc, titleIndex, requireProvenBodyBoundary)) {
                    earliestBody = body;
                    break;
                }
            }
        }
        if (earliestBody == lines.size()) {
            return new Layout(lines, toc, lines.size() - 1, false);
        }
        return new Layout(lines, toc, earliestBody - 1, true);
    }


    private static boolean illustrativeTemplateHeading(String title) {
        return title.matches("(?i)(?:transaction|module|project|system|feature|function) name");
    }

    private static String explicitPlaceholderEvidence(Layout document, String section) {
        int heading = bodyHeadingIndex(document, section, false);
        if (heading < 0) return null;
        String inline = inlineBodyText(document.lines().get(heading), canonical(section));
        if (inline != null && EXPLICIT_PLACEHOLDER.matcher(inline).find()) return inline;
        for (int i = heading + 1; i < document.lines().size(); i++) {
            if (!document.inBody(i)) continue;
            String line = document.lines().get(i);
            if (line.isBlank()) continue;
            if (isBodyBoundaryAfter(document.lines().get(heading), line)) break;
            if (EXPLICIT_PLACEHOLDER.matcher(line).find()) return line;
        }
        return null;
    }

    private static int bodyHeadingIndex(Layout region, String section, boolean allowTopicMatch) {
        String expected = canonical(section);
        for (int i = 0; i < region.lines().size(); i++) {
            if (!region.inBody(i)) continue;
            String line = region.lines().get(i);
            if (line.isBlank() || TOC_LEADER.matcher(line).matches()) continue;
            if (headingMatches(line, expected)) return i;
            if (!allowTopicMatch || !looksLikeBodyHeading(line)) continue;
            String candidate = headingTitleCanonical(line);
            if (topicEquivalent(expected, candidate)) return i;
        }
        return -1;
    }

    private static boolean looksLikeBodyHeading(String line) {
        if (TEMPLATE_BODY_NUMBERED_HEADING.matcher(line).matches()) return true;
        String normalized = normalize(line);
        return normalized.matches("(?:constraints?|limitations?|assumptions?|dependencies|requirements?)");
    }

    private static boolean isBodyBoundaryAfter(String currentHeading, String candidate) {
        if (normalize(candidate).matches("module \\d+(?: .*)?")) return true;
        Matcher next = TEMPLATE_BODY_NUMBERED_HEADING.matcher(candidate);
        if (!next.matches()) return false;
        String nextTitle = next.group(2).trim();
        if (nextTitle.endsWith(".") || nextTitle.endsWith(";") || nextTitle.split("\\s+").length > 10) return false;
        Matcher current = TEMPLATE_BODY_NUMBERED_HEADING.matcher(currentHeading);
        if (!current.matches()) return true;
        int currentRoot = leadingNumber(current.group(1));
        int nextRoot = leadingNumber(next.group(1));
        return currentRoot < 0 || nextRoot < 0 || nextRoot >= currentRoot;
    }

    private static int leadingNumber(String value) {
        try { return Integer.parseInt(value.split("\\.")[0]); }
        catch (Exception ignored) { return -1; }
    }

    private static String headingTitleCanonical(String line) {
        String content = line.trim().replaceFirst("^[•*#-]+\\s*", "");
        Matcher numbered = NUMBERED_HEADING.matcher(content);
        if (numbered.matches()) content = numbered.group(1).trim();
        int colon = content.indexOf(':');
        if (colon >= 0 && colon < 110) content = content.substring(0, colon).trim();
        return canonical(content);
    }

    private static boolean topicEquivalent(String expected, String candidate) {
        return candidate.length() >= 5 && (candidate.equals(expected)
            || expected.endsWith(" " + candidate) || candidate.endsWith(" " + expected));
    }

    private static String inlineBodyText(String line, String expected) {
        String content = line.trim().replaceFirst("^[•*#-]+\\s*", "");
        Matcher numbered = NUMBERED_HEADING.matcher(content);
        if (numbered.matches()) content = numbered.group(1).trim();
        int colon = content.indexOf(':');
        if (colon < 0 || colon >= 110) return null;
        String heading = canonical(content.substring(0, colon));
        if (!topicEquivalent(expected, heading)) return null;
        String body = content.substring(colon + 1).trim();
        return body.isBlank() ? null : body;
    }

    private record TransactionRange(int start, int end) { }

    private static void addTransactionArtifactWarnings(Layout template, Layout document,
            List<AiReviewProvider.Finding> accepted, List<AiReviewProvider.Finding> warnings) {
        var templateRanges = moduleTransactionRanges(template);
        var documentRanges = moduleTransactionRanges(document);
        if (templateRanges.isEmpty() || documentRanges.isEmpty()) return;
        for (String artifact : List.of("use case description", "use case diagram", "activity diagram", "wireframe")) {
            if (warnings.size() >= MAX_TEMPLATE_ALERTS) return;
            String requirement = artifactLineInRange(template, templateRanges.get(0), artifact);
            if (requirement == null || OPTIONAL_SECTION.matcher(requirement).find()) continue;

            boolean repeatedTemplatePattern = templateRanges.size() >= 2
                && templateRanges.stream().allMatch(range -> {
                    String line = artifactLineInRange(template, range, artifact);
                    return line != null && !OPTIONAL_SECTION.matcher(line).find();
                });

            for (int index = 0; index < documentRanges.size(); index++) {
                if (index > 0 && !repeatedTemplatePattern) break;
                if (warnings.size() >= MAX_TEMPLATE_ALERTS) return;
                TransactionRange documentRange = documentRanges.get(index);
                if (artifactHasSubstantiveContentInRange(document, documentRange, artifact)) continue;

                String label = switch (artifact) {
                    case "use case description" -> "Use Case Description";
                    case "use case diagram" -> "Use Case Diagram";
                    case "activity diagram" -> "Activity Diagram";
                    case "wireframe" -> "Wireframe";
                    default -> artifact;
                };
                String transaction = transactionHeading(document, documentRange);
                if (acceptedFindingCoversTransactionArtifact(accepted, artifact, transaction, index)) continue;
                String location = index == 0
                    ? "the first transaction under Module 1"
                    : "transaction '" + transaction + "'";
                String submittedLabel = artifactLineInRange(document, documentRange, artifact);
                String mappedRequirement = index == 0 ? requirement
                    : repeatedTransactionArtifactEvidence(template, templateRanges, artifact);
                warnings.add(new AiReviewProvider.Finding(
                    "Text extraction could not verify '" + label + "' in " + location + ". "
                        + (submittedLabel == null ? "Its label was not located in the extracted transaction."
                            : "Its label is present, but graphical content cannot be assessed from text alone."),
                    AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE,
                    Objects.requireNonNullElse(submittedLabel, ""),
                    mappedRequirement,
                    "Verify " + label,
                    "Open the original PDF and inspect this transaction before requesting a revision.",
                    null));
            }
        }
    }

    private static boolean acceptedFindingCoversTransactionArtifact(
            List<AiReviewProvider.Finding> accepted, String artifact, String transaction, int index) {
        String normalizedTransaction = normalize(transaction);
        return accepted.stream().anyMatch(finding -> {
            String issue = normalize(finding.issue());
            if (!issue.contains(artifact)) return false;
            if (index == 0) return true;
            String context = issue + " " + normalize(finding.evidence());
            return !normalizedTransaction.isBlank() && context.contains(normalizedTransaction);
        });
    }

    private static String transactionHeading(Layout region, TransactionRange range) {
        if (range.start() >= 0 && range.start() < region.lines().size()) {
            String line = region.lines().get(range.start()).trim();
            if (!line.isBlank()) return line;
        }
        return "unidentified transaction";
    }

    private static String repeatedTransactionArtifactEvidence(Layout template,
            List<TransactionRange> ranges, String artifact) {
        // Cite the artifact itself once. Repeated template examples establish
        // context; concatenating whole transactions obscures the requirement.
        return artifactLineInRange(template, ranges.get(0), artifact);
    }

    static List<AiReviewProvider.Finding> unlistedReferencesRequiredByTemplate(
            String documentText, String templateText) {
        if (documentText == null || documentText.isBlank()
                || templateText == null || templateText.isBlank()) return List.of();
        String requirement = templateReferenceListRequirement(templateText);
        if (requirement.isBlank()) return List.of();

        Layout document = layout(documentText, false);
        if (!document.reliableBody()) return List.of();
        int referencesHeading = bodyHeadingIndex(document, "References", true);
        if (referencesHeading < 0) return List.of();
        int referencesEnd = document.lines().size();
        for (int i = referencesHeading + 1; i < document.lines().size(); i++) {
            if (!document.inBody(i)) continue;
            String line = document.lines().get(i);
            if (line.isBlank()) continue;
            if (isBodyBoundaryAfter(document.lines().get(referencesHeading), line)) {
                referencesEnd = i;
                break;
            }
        }
        String referencesText = normalize(String.join(" ",
            document.lines().subList(referencesHeading, referencesEnd)));

        var findings = new ArrayList<AiReviewProvider.Finding>();
        var seen = new HashSet<String>();
        for (int i = 0; i < document.lines().size(); i++) {
            if (!document.inBody(i) || i >= referencesHeading && i < referencesEnd) continue;
            var evidence = new StringBuilder();
            for (int j = i; j < Math.min(document.lines().size(), i + 3); j++) {
                if (!document.inBody(j) || j >= referencesHeading && j < referencesEnd) break;
                String candidateLine = document.lines().get(j);
                if (candidateLine.isBlank()) continue;
                if (evidence.length() > 0) evidence.append('\n');
                evidence.append(candidateLine);
            }
            if (evidence.isEmpty()) continue;
            Matcher citation = EXTERNAL_DOCUMENT_CITATION.matcher(
                evidence.toString().replace('\n', ' '));
            while (citation.find()) {
                String title = citation.group(1).trim();
                Matcher identifierMatcher = DOCUMENT_IDENTIFIER.matcher(citation.group(2));
                if (!identifierMatcher.find()) continue;
                String identifier = identifierMatcher.group();
                String key = normalize(title) + "|" + normalize(identifier);
                if (!seen.add(key)) continue;
                if (referencesText.contains(normalize(title))
                        || referencesText.contains(normalize(identifier))) continue;
                findings.add(new AiReviewProvider.Finding(
                    "The submitted PDF cites external document '" + title + "' (" + identifier
                        + ") outside the References section, but that concrete reference was not detected in References.",
                    AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE,
                    evidence.toString(),
                    requirement));
                if (findings.size() == 3) return List.copyOf(findings);
            }
        }
        return List.copyOf(findings);
    }

    private static String templateReferenceListRequirement(String templateText) {
        var lines = Objects.requireNonNullElse(templateText, "").lines().map(String::trim).toList();
        for (int i = 0; i < lines.size(); i++) {
            if (!normalize(lines.get(i)).contains("complete list")) continue;
            var passage = new StringBuilder();
            for (int width = 0; width < 3 && i + width < lines.size(); width++) {
                String line = lines.get(i + width);
                if (line.isBlank()) continue;
                if (passage.length() > 0) passage.append('\n');
                passage.append(line);
                String normalized = normalize(passage.toString());
                if (normalized.contains("complete list")
                        && normalized.contains("documents referenced")
                        && normalized.contains("srs")) return passage.toString();
            }
        }
        return "";
    }

    private static String artifactLineInRange(Layout region, TransactionRange range, String expected) {
        int index = artifactIndexInRange(region, range, expected);
        return index < 0 ? null : region.lines().get(index);
    }

    private static int artifactIndexInRange(Layout region, TransactionRange range, String expected) {
        String normalizedExpected = normalize(expected);
        for (int i = range.start(); i < range.end(); i++) {
            if (!region.inBody(i)) continue;
            String line = region.lines().get(i);
            String normalized = normalize(line);
            if (normalized.equals(normalizedExpected)) return i;
            if (artifactInlineContent(line, expected) != null) return i;
            if (line.length() <= 100 && line.split("\\s+").length <= 12
                    && normalized.contains(normalizedExpected)
                    && !ABSENCE.matcher(line).find()) return i;
        }
        return -1;
    }

    private static boolean artifactHasSubstantiveContentInRange(Layout region, TransactionRange range,
            String expected) {
        String normalizedExpected = normalize(expected);
        for (int i = range.start(); i < range.end(); i++) {
            if (!region.inBody(i)) continue;
            String line = region.lines().get(i);
            String normalized = normalize(line);
            if (normalized.equals(normalizedExpected)) return artifactLabelHasFollowingContent(region, i);
            String inline = artifactInlineContent(line, expected);
            if (inline != null) {
                return !inline.isBlank() && !EXPLICIT_PLACEHOLDER.matcher(inline).find();
            }
            if (line.length() <= 100 && line.split("\\s+").length <= 12
                    && normalized.contains(normalizedExpected)
                    && !ABSENCE.matcher(line).find()
                    && !normalized.matches("(?s).*\\b(?:placeholder|todo|tbd)\\b.*")) return true;
        }
        return false;
    }

    private static String artifactInlineContent(String line, String expected) {
        String content = Objects.requireNonNullElse(line, "").trim().replaceFirst("^[•*#]+\\s*", "");
        Matcher match = Pattern.compile("(?i)^" + Pattern.quote(expected)
            + "(?::\\s*|\\s+[-–—]\\s+)(.*)$").matcher(content);
        return match.matches() ? match.group(1).trim() : null;
    }

    private static boolean inventedTableOfContentsEntry(AiReviewProvider.Finding finding, String documentText) {
        Matcher claimed = CLAIMED_TOC_SECTION.matcher(
            Objects.requireNonNullElse(finding.issue(), "") + " "
                + Objects.requireNonNullElse(finding.evidence(), ""));
        if (!claimed.find()) return false;
        Layout region = layout(documentText, false);
        if (!region.reliableBody() || region.toc() < 0 || region.tocEnd() <= region.toc()) return false;
        do {
            String section = claimed.group(1);
            Pattern entry = Pattern.compile("^\\s*" + Pattern.quote(section)
                + "(?:[.)])?(?:\\s|$|[.·…])");
            for (int i = region.toc() + 1; i <= region.tocEnd() && i < region.lines().size(); i++) {
                if (entry.matcher(region.lines().get(i)).find()) return false;
            }
        } while (claimed.find());
        return true;
    }

    private static List<TransactionRange> moduleTransactionRanges(Layout region) {
        var ranges = new ArrayList<TransactionRange>();
        int moduleNumber = -1;
        int start = -1;
        for (int i = 0; i < region.lines().size(); i++) {
            if (!region.inBody(i)) continue;
            String line = region.lines().get(i);
            Matcher module = MODULE_HEADING.matcher(line);
            if (module.matches()) {
                if (start >= 0) ranges.add(new TransactionRange(start, i));
                moduleNumber = Integer.parseInt(module.group(1));
                start = -1;
                continue;
            }
            Matcher heading = TEMPLATE_BODY_NUMBERED_HEADING.matcher(line);
            if (!heading.matches() || moduleNumber < 0) continue;
            int root = leadingNumber(heading.group(1));
            if (root != moduleNumber) {
                if (start >= 0) ranges.add(new TransactionRange(start, i));
                start = -1;
                moduleNumber = -1;
                continue;
            }
            if (heading.group(1).matches("\\d+\\.\\d+")) {
                if (start >= 0) ranges.add(new TransactionRange(start, i));
                start = i;
            }
        }
        if (start >= 0) ranges.add(new TransactionRange(start, region.lines().size()));
        return List.copyOf(ranges);
    }

    private static boolean allModuleTransactionsContain(Layout document, String... artifacts) {
        var ranges = moduleTransactionRanges(document);
        if (ranges.isEmpty()) return false;
        return ranges.stream().allMatch(range ->
            java.util.Arrays.stream(artifacts)
                .allMatch(artifact -> artifactHasSubstantiveContentInRange(document, range, artifact)));
    }

    private static boolean convincingBodyAnchor(List<String> lines, int toc, int candidate) {
        return convincingBodyAnchor(lines, toc, candidate, true);
    }

    private static boolean convincingBodyAnchor(List<String> lines, int toc, int candidate, boolean strict) {
        // A repeated index entry alone is insufficient. Page furniture or authored prose
        // must distinguish the body. Suppressing an absence claim accepts short prose;
        // adding structural observations requires stronger evidence.
        for (int before = Math.max(toc + 1, candidate - 8); before < candidate; before++) {
            String context = normalize(lines.get(before));
            if (context.matches("document version(?: \\d+)+")
                    || context.matches("page \\d+ of \\d+")) return true;
        }
        for (int next = candidate + 1; next < Math.min(lines.size(), candidate + 4); next++) {
            String text = lines.get(next);
            if (text.isBlank()) continue;
            if (TOC_LEADER.matcher(text).matches() || TOC_PAGE_ENTRY.matcher(text).matches()
                    || TOC_PREFIX_LEADER_ENTRY.matcher(text).matches()
                    || TEMPLATE_BODY_NUMBERED_HEADING.matcher(text).matches()) return false;
            return strict ? text.length() >= 25 && text.split("\\s+").length >= 5
                : text.split("\\s+").length >= 2;
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
        boolean contentAbsence = CONTENT_ABSENCE.matcher(issue).find();
        if (contentAbsence && !GENERIC_CONTENT_ABSENCE.matcher(issue).matches()) return false;
        if (!contentAbsence
                && !(HEADING_ABSENCE.matcher(issue).find() || NAMED_HEADING_ABSENCE.matcher(issue).find())) return false;
        if (normalize(issue).contains("table of contents")
                && normalize(finding.requirement()).contains("table of contents")
                && containsBodyHeading(documentText, "Table of Contents")) return true;
        Matcher quoted = QUOTED_HEADING.matcher(issue);
        while (quoted.find()) {
            if (contentAbsence) {
                if (finding.source() != AiReviewProvider.FindingSource.DOCUMENT
                        && containsBodySectionContent(documentText, quoted.group(1))) return true;
            } else if (containsBodyHeading(documentText, quoted.group(1))) return true;
        }
        // Section references are often unquoted in the generated finding. Prefer a numbered
        // heading explicitly named in the supplied authority and mentioned by the finding.
        if (finding.source() == AiReviewProvider.FindingSource.DOCUMENT) return false;
        Matcher required = TEMPLATE_BODY_NUMBERED_HEADING.matcher(finding.requirement().trim());
        if (required.matches() && normalize(issue).contains(normalize(required.group(2)))) {
            return contentAbsence
                ? containsBodySectionContent(documentText, required.group(2))
                : containsBodyHeading(documentText, required.group(2));
        }
        for (String line : finding.requirement().lines().toList()) {
            Matcher numbered = TEMPLATE_BODY_NUMBERED_HEADING.matcher(line.trim());
            if (numbered.matches() && normalize(issue).contains(normalize(numbered.group(2)))
                    && (contentAbsence
                        ? containsBodySectionContent(documentText, numbered.group(2))
                        : containsBodyHeading(documentText, numbered.group(2)))) return true;
        }
        return false;
    }

    private static boolean contradictedTocListingClaim(AiReviewProvider.Finding finding, String documentText) {
        if (finding.source() != AiReviewProvider.FindingSource.DOCUMENT) return false;
        Matcher claim = TOC_LISTING_CLAIM.matcher(finding.issue());
        if (!claim.find()) return false;
        String sectionNumber = claim.group(1);
        Layout document = layout(documentText, false);
        if (document.toc() < 0) return true;
        int end = Math.min(document.lines().size() - 1, document.tocEnd());
        for (int i = document.toc() + 1; i <= end; i++) {
            String line = document.lines().get(i).trim();
            Matcher numbered = TEMPLATE_BODY_NUMBERED_HEADING.matcher(line);
            if (numbered.matches() && numbered.group(1).equals(sectionNumber)) return false;
            Matcher prefixedLeader = TOC_PREFIX_LEADER_ENTRY.matcher(line);
            if (prefixedLeader.matches()
                    && prefixedLeader.group(1).replaceFirst("[.)]$", "").equals(sectionNumber)) return false;
        }
        return true;
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

    private static boolean unsupportedArtifactRenderingClaim(AiReviewProvider.Finding finding,
            String documentText) {
        if (finding.source() == AiReviewProvider.FindingSource.DOCUMENT) return false;
        String statement = normalize(finding.issue() + " " + finding.evidence());
        if (!statement.matches("(?s).*(?:text based|textual|ascii|plain text).*"
                + "(?:diagram|wireframe).*")
                && !statement.matches("(?s).*(?:diagram|wireframe).*"
                    + "(?:text based|textual|ascii|plain text).*")) return false;
        String authority = normalize(finding.requirement());
        if (authority.matches("(?s).*(?:graphical|visual representation|image|drawn|rendered|"
                + "non text|must be visual|must be graphical).*")) return false;

        Layout document = layout(documentText, false);
        if (!document.reliableBody()) return false;
        return allModuleTransactionsContain(document,
            "use case diagram", "activity diagram", "wireframe");
    }

    private static boolean unsupportedUnspecifiedCompletenessClaim(AiReviewProvider.Finding finding) {
        if (finding.source() == AiReviewProvider.FindingSource.DOCUMENT) return false;
        String issue = normalize(finding.issue());
        if (issue.matches("(?s).*\\b(?:missing|undefined|not defined|omitted|absent|not specified|"
                + "not stated|does not state|does not specify)\\b.*")) return false;
        // Broad completeness allegations are not actionable unless the finding names the
        // concrete omitted item. "All terms" and "a complete list" alone do not identify one.
        return issue.matches("(?s).*definitions.*(?:all terms|all acronyms|all abbreviations).*" )
            || issue.matches("(?s).*references.*(?:complete list|all referenced documents).*" )
            || issue.matches("(?s).*(?:incomplete|not fully complete|does not fully cover|fails to fully cover|"
                + "not comprehensive|insufficiently complete).*");
    }

    static boolean unsupportedTemplateSampleIdentityClaim(String statement, String requirement,
            String documentText, String templateText) {
        if (!sampleNameConfusion(statement + " " + Objects.requireNonNullElse(requirement, ""),
                documentText, templateText)) return false;
        String authority = normalize(requirement);
        // A template example name is illustrative unless the quoted authority itself explicitly
        // imposes an identity/name obligation. Deliverable Instructions are handled separately.
        return !authority.matches("(?s).*(?:must|shall|required|mandatory).{0,80}"
            + "(?:name|named|title|project|system).*" )
            && !authority.matches("(?s).*(?:name|named|title|project|system).{0,80}"
                + "(?:must|shall|required|mandatory).*");
    }

    static List<AiReviewProvider.Finding> internalNumericContradictions(String documentText) {
        if (documentText == null || documentText.isBlank()) return List.of();
        record Cap(int value, String subject, String sentence) { }
        var caps = new ArrayList<Cap>();
        for (String raw : documentText.split("(?<=[.!?])\\s+|\\R+")) {
            String sentence = raw.trim();
            if (sentence.isBlank()) continue;
            Matcher matcher = NUMERIC_CAP.matcher(sentence);
            while (matcher.find()) {
                String subject = normalizeCapSubject(matcher.group(2));
                if (subject.length() >= 8 && subject.split(" ").length >= 2)
                    caps.add(new Cap(Integer.parseInt(matcher.group(1)), subject, sentence));
            }
        }
        var findings = new ArrayList<AiReviewProvider.Finding>();
        var seen = new HashSet<String>();
        for (int i = 0; i < caps.size(); i++) {
            for (int j = i + 1; j < caps.size(); j++) {
                Cap left = caps.get(i), right = caps.get(j);
                if (left.value() == right.value() || !sameCapSubject(left.subject(), right.subject())) continue;
                String key = left.subject() + ":" + Math.min(left.value(), right.value()) + ":"
                    + Math.max(left.value(), right.value());
                if (!seen.add(key)) continue;
                findings.add(new AiReviewProvider.Finding(
                    "The submitted PDF states conflicting maximum limits for " + left.subject()
                        + ": " + left.value() + " and " + right.value() + ".",
                    AiReviewProvider.FindingSource.DOCUMENT,
                    left.sentence() + " " + right.sentence(), ""));
                if (findings.size() == 3) return List.copyOf(findings);
            }
        }
        return List.copyOf(findings);
    }

    static List<AiReviewProvider.Finding> undefinedAcronymsRequiredByTemplate(
            String documentText, String templateText) {
        if (documentText == null || documentText.isBlank()
                || templateText == null || templateText.isBlank()) return List.of();

        String requirement = Objects.requireNonNullElse(templateText, "").lines()
            .map(String::trim)
            .filter(line -> {
                String normalized = normalize(line);
                return normalized.contains("definitions")
                    && normalized.contains("acronyms")
                    && normalized.contains("abbreviations")
                    && normalized.matches("(?s).*(?:required|needed).*interpret.*");
            })
            .findFirst().orElse("");
        if (requirement.isBlank()) return List.of();

        Layout document = layout(documentText, false);
        if (!document.reliableBody()) return List.of();
        int definitionsHeading = bodyHeadingIndex(document,
            "Definitions, Acronyms and Abbreviations", true);
        if (definitionsHeading < 0) return List.of();

        var definitions = new StringBuilder(document.lines().get(definitionsHeading));
        int definitionsEnd = document.lines().size();
        for (int i = definitionsHeading + 1; i < document.lines().size(); i++) {
            if (!document.inBody(i)) continue;
            String line = document.lines().get(i);
            if (line.isBlank()) continue;
            if (isBodyBoundaryAfter(document.lines().get(definitionsHeading), line)) {
                definitionsEnd = i;
                break;
            }
            definitions.append(' ').append(line);
        }
        String definitionsText = definitions.toString();

        int referencesHeading = bodyHeadingIndex(document, "References", true);
        int referencesEnd = referencesHeading < 0 ? -1 : document.lines().size();
        if (referencesHeading >= 0) {
            for (int i = referencesHeading + 1; i < document.lines().size(); i++) {
                if (!document.inBody(i)) continue;
                String line = document.lines().get(i);
                if (line.isBlank()) continue;
                if (isBodyBoundaryAfter(document.lines().get(referencesHeading), line)) {
                    referencesEnd = i;
                    break;
                }
            }
        }

        var evidenceByAcronym = new java.util.LinkedHashMap<String, String>();
        for (int i = 0; i < document.lines().size(); i++) {
            if (!document.inBody(i) || i >= definitionsHeading && i < definitionsEnd) continue;
            // Bibliographic titles, report identifiers, publishers and source locators are citation
            // metadata, not terminology required to interpret the SRS. If the same acronym is used
            // substantively elsewhere in the document it will still be discovered at that use site.
            if (referencesHeading >= 0 && i >= referencesHeading && i < referencesEnd) continue;
            String line = document.lines().get(i);
            // All-caps headings are labels/titles, not acronym use in prose.
            if (!line.matches("(?s).*[a-z].*")) continue;
            int labelColon = line.indexOf(':');
            Matcher matcher = UPPERCASE_ACRONYM.matcher(line);
            while (matcher.find()) {
                String acronym = matcher.group();
                if (DOCUMENT_TYPE_ACRONYMS.contains(acronym) || COMMON_TECH_ACRONYMS.contains(acronym)) continue;
                if (labelColon >= 0 && matcher.end() <= labelColon
                        && line.substring(0, labelColon).matches("[A-Z0-9 _/-]+")) continue;
                // Tokens embedded in identifiers such as LFT-0001 are trace IDs,
                // not terminology that belongs in the definitions section.
                int start = matcher.start(), end = matcher.end();
                if (start > 0 && line.charAt(start - 1) == '-'
                        || end < line.length() && line.charAt(end) == '-') continue;
                evidenceByAcronym.putIfAbsent(acronym, line.trim());
            }
        }

        var findings = new ArrayList<AiReviewProvider.Finding>();
        for (var entry : evidenceByAcronym.entrySet()) {
            String acronym = entry.getKey();
            if (acronymDefined(acronym, definitionsText, documentText)) continue;
            findings.add(new AiReviewProvider.Finding(
                "The acronym " + acronym
                    + " is used in the submitted PDF but is not defined in section 1.3 Definitions, Acronyms and Abbreviations.",
                AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE,
                entry.getValue(), requirement));
            if (findings.size() == 5) break;
        }
        return List.copyOf(findings);
    }

    private static boolean acronymDefined(String acronym, String definitionsText, String documentText) {
        String token = Pattern.quote(acronym);
        if (Pattern.compile("(?i)\\b" + token
                + "\\b\\s*(?:means|stands\\s+for|is\\s+defined\\s+as|[:=â€“—-])")
                .matcher(definitionsText).find()) return true;
        // Also accept a conventional expansion such as "Recovery Point Objective (RPO)"
        // anywhere in the submitted document.
        return Pattern.compile("(?i)\\b[A-Za-z][A-Za-z -]{4,100}\\(\\s*" + token + "\\s*\\)")
            .matcher(documentText).find();
    }

    private static String normalizeCapSubject(String value) {
        String subject = normalize(value).replaceFirst(
            "\\b(?:before|after|when|while|unless|until|if|because|whereas|however|but)\\b.*$", "").trim();
        return subject.replaceFirst("^(?:active|concurrent|simultaneous)\\s+", "active ");
    }

    private static boolean sameCapSubject(String left, String right) {
        return left.equals(right) || left.length() >= 12 && right.length() >= 12
            && (left.startsWith(right + " ") || right.startsWith(left + " "));
    }

    private static boolean contradictedDocumentContentReplacement(AiReviewProvider.Finding finding,
            String documentText) {
        String issue = normalize(finding.issue());
        if (!issue.contains("instead of") || !issue.contains("functional") || !issue.contains("non functional"))
            return false;
        return containsBodySectionContent(documentText, "Functional requirements")
            && containsBodySectionContent(documentText, "Non-functional requirements");
    }

    private static boolean unsupportedDocumentSectionPlacementClaim(String issue) {
        String text = normalize(issue);
        return text.matches("(?s).*\\b(?:incorrectly|improperly|wrongly)\\s+(?:placed|located|classified|categorized)\\b.*")
            || text.matches("(?s).*\\bcontradict(?:s|ed|ing|ion)?\\b.{0,120}\\b(?:document )?(?:organization|structure)\\b.*")
            || text.matches("(?s).*\\b(?:belongs?|should|must)\\s+(?:only\\s+)?(?:be\\s+)?(?:in|under)\\s+(?:section|subsection|chapter)\\b.*");
    }

    private static boolean unsupportedDocumentStyleCriticism(String issue) {
        String text = normalize(issue);
        if (!text.matches("(?s).*\\b(?:repetitive|redundant|nearly identical|excessive)\\b.*")) return false;
        // Repetition can be objectively observed, but document evidence alone cannot
        // turn it into a compliance defect. Keep independently checkable contradictions
        // or identifier conflicts; discard style/quality judgments unless an authority
        // source explicitly requires uniqueness or non-repetition.
        if (text.matches("(?s).*\\b(?:conflict|conflicting|contradict|contradictory|"
                + "inconsistent|different values?|duplicate identifiers?)\\b.*")) return false;
        return true;
    }

    private static boolean unsupportedEmbeddedReviewerInstruction(String issue) {
        String text = normalize(issue);
        return text.matches("(?s).*\\b(?:reviewer|review)\\b.*"
            + "\\b(?:ignore|override|authority hierarchy|require)\\b.*"
            + "\\b(?:template|authority|instruction|section)\\b.*");
    }

    private static boolean unsupportedDocumentAuthorityClaim(String issue) {
        String text = normalize(issue);
        if (!text.matches("(?s).*\\b(?:template|deliverable instruction|official requirement)\\b.*")) return false;
        return text.matches("(?s).*\\b(?:required|requires|required by|specified by|"
            + "noncompliant|non compliant|fails to|violates?)\\b.*");
    }

    private static boolean contradictedBlanketArtifactAbsence(AiReviewProvider.Finding finding, String documentText) {
        String issue = normalize(finding.issue());
        if (!issue.contains("functional requirements") || !issue.contains("use case diagram")
                || !issue.contains("activity diagram") || !issue.contains("wireframe")
                || !(issue.contains("lacks") || issue.contains("missing")
                    || issue.contains("fails to follow") && issue.contains("structure"))) return false;
        Layout document = layout(documentText, false);
        if (!document.reliableBody()) return false;
        return allModuleTransactionsContain(document,
            "use case description", "use case diagram", "activity diagram", "wireframe");
    }

    private static boolean artifactLabelHasFollowingContent(Layout document, int labelIndex) {
        for (int i = labelIndex + 1; i < document.lines().size(); i++) {
            if (!document.inBody(i)) continue;
            String raw = document.lines().get(i).trim();
            if (raw.isBlank()) continue;
            String line = normalize(raw);
            if (line.equals("use case description") || line.equals("use case diagram")
                    || line.equals("activity diagram") || line.equals("wireframe")
                    || MODULE_ONE_HEADING.matcher(raw).matches()
                    || TEMPLATE_BODY_NUMBERED_HEADING.matcher(raw).matches()
                    || looksLikeBodyHeading(raw)) return false;
            if (EXPLICIT_PLACEHOLDER.matcher(raw).find()
                    || line.matches("(?s).*\\b(?:placeholder|todo|tbd)\\b.*")) return false;
            return raw.length() >= 10 && raw.split("\\s+").length >= 2;
        }
        return false;
    }

    private static boolean unsupportedNamedSectionClaim(String issue, String requirement,
            AiReviewProvider.FindingSource source) {
        if (!ABSENCE.matcher(issue).find() || !normalize(issue).contains("section")) return false;
        if (source == AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE
                && !officialTemplateStructuralRequirement(requirement)) return true;
        Matcher quoted = QUOTED_HEADING.matcher(issue);
        while (quoted.find()) {
            String section = quoted.group(1);
            if (!sectionNamedByRequirement(section, requirement, source)) return true;
        }
        return false;
    }

    private static boolean officialTemplateStructuralRequirement(String requirement) {
        String normalized = normalize(requirement);
        if (normalized.matches("(?s).*(?:must|shall|required|mandatory).*")) return true;
        for (String raw : Objects.requireNonNullElse(requirement, "").lines().toList()) {
            if (TEMPLATE_BODY_NUMBERED_HEADING.matcher(raw.trim()).matches()) return true;
        }
        return false;
    }

    private static boolean wrongDeliverableFromSyntheticLabel(String issue, String title, String documentText) {
        String text = normalize(issue);
        if (!text.contains("synthetic") && !text.contains("benchmark") && !text.contains("sample")) return false;
        boolean mismatchClaim = WRONG_DELIVERABLE.matcher(issue).find()
            || text.matches("(?s).*(?:does not represent|mismatch(?:es|ed)?|different project|"
                + "rather than (?:a )?student authored deliverable|"
                + "not a student(?: authored)? (?:submission|document|project(?: submission)?|srs|"
                + "software requirements specification|software test document|software design document|"
                + "requirements specification)).*");
        if (!mismatchClaim) return false;
        String doc = normalize(documentText);
        String expected = normalize(title).replaceFirst(" (?:std|srs|sdd|spmp)$", "");
        if (expected.isBlank()) return false;
        // Explicitly labelling a correct-type PDF as synthetic is not evidence it is the wrong
        // artifact. Do NOT suppress genuine body mismatches such as an STD full of marketing text.
        boolean matchingType = doc.contains(expected)
            || expected.contains("software requirements specification")
                && (doc.contains("software requirements specification") || doc.matches("(?s).*\\bsrs\\b.*"))
            || expected.contains("software test document")
                && (doc.contains("software test document") || doc.matches("(?s).*\\bstd\\b.*"))
            || expected.contains("software design document")
                && (doc.contains("software design document") || doc.matches("(?s).*\\bsdd\\b.*"))
            || expected.equals("srs") && doc.contains("software requirements specification")
            || expected.equals("std") && doc.contains("software test document")
            || expected.equals("sdd") && doc.contains("software design document");
        return matchingType && !documentText.toLowerCase(Locale.ROOT).matches(
            "(?s).*(?:marketing campaign|rather than (?:a |an )?(?:srs|std|sdd)|not (?:an? )?(?:srs|std|sdd)).*");
    }

    static boolean sampleNameConfusion(String issue, String documentText, String templateText) {
        String text = normalize(issue);
        if (!text.matches("(?s).*(?:name|identity|named|project(?: title)?|system).*")
                || !text.matches("(?s).*(?:template|sample|example|must match|should match|should be named|"
                    + "does not match|mismatch|instead of|different project|requested).*") )
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
