package com.capvault.backend.aireview;

import com.capvault.backend.filecheck.PdfInspection;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

/** Detects unresolved authoring instructions, rather than inferring a defect from short text. */
final class AiReviewCompletenessPolicy {
    private static final Pattern HEADING = Pattern.compile("^\\d+(?:\\.\\d+)*[.)]?\\s+[\\p{L}].{2,100}$");
    private static final Pattern PROMPT = Pattern.compile("(?i)^(?:describe|specify|identify|list(?: and define)?)\\b"
        + ".{4,250}\\b(?:the system|this document|each major feature|different types of users|"
        + "hardware|software|important terms|assumptions|external dependencies)\\b.*");
    private static final Pattern EMPTY = Pattern.compile("^[•●*–—-]*$|^[\\p{L} ]{2,40}:$");

    private AiReviewCompletenessPolicy() { }

    static boolean authoringInstruction(String evidence) {
        return PROMPT.matcher(Objects.requireNonNullElse(evidence, "").trim()).matches();
    }

    static List<AiReviewProvider.Finding> documentTypeNotes(String requested, List<PdfInspection.PageText> pages) {
        if (!Objects.requireNonNullElse(requested, "").matches("(?is).*\\b(?:SRS|Software Requirements Specification)\\b.*")
                || pages == null || pages.isEmpty()) return List.of();
        var first = pages.get(0);
        var title = Pattern.compile("(?im)^[ \\t]*FUNCTIONAL[ \\t]+REQUIREMENTS[ \\t\\r\\n]+SPECIFICATION[ \\t]*(?:\\(FRS\\))?[ \\t]*$")
            .matcher(first.text());
        if (first.pageNumber() != 1 || !title.find()) return List.of();
        return List.of(new AiReviewProvider.Finding(
            "The cover identifies this document as a Functional Requirements Specification; confirm it is the requested SRS.",
            AiReviewProvider.FindingSource.DOCUMENT, title.group().trim(), "", "Confirm the submitted document type",
            "Compare the cover title and the document's contents with the requested deliverable.",
            new AiReviewProvider.EvidenceLocation(1, null)));
    }

    static List<AiReviewProvider.Finding> unresolvedInstructions(String documentText) {
        List<String> lines = Objects.requireNonNullElse(documentText, "").lines()
            .map(line -> line.replaceAll("\\p{Cf}", "").replace('\u00a0', ' ').trim()).toList();
        List<AiReviewProvider.Finding> findings = new ArrayList<>();
        for (int i = 0; i < lines.size() && findings.size() < 5; i++) {
            String heading = lines.get(i);
            if (!HEADING.matcher(heading).matches() || heading.matches(".*[.·…]{3,}.*")) continue;
            if (!heading.toLowerCase(java.util.Locale.ROOT).matches(".*\\b(?:purpose|scope|definitions|acronyms|"
                    + "perspective|user classes|user characteristics|operating environment|assumptions|"
                    + "dependencies|system features|functional requirements)\\b.*")) continue;
            String prompt = null;
            boolean authored = false;
            for (int next = i + 1; next < lines.size(); next++) {
                String line = lines.get(next);
                if (HEADING.matcher(line).matches() && !line.endsWith(".")
                        && !line.matches("(?i).*\\b(?:shall|must|should|will|can|may)\\b.*")) break;
                if (line.isBlank() || EMPTY.matcher(line).matches() || line.matches("(?i)^(?:page )?\\d+(?: of \\d+)?$"))
                    continue;
                if (PROMPT.matcher(line).matches()) prompt = line;
                else authored = true;
            }
            if (prompt == null || authored) continue;
            findings.add(new AiReviewProvider.Finding(
                "Section '" + heading + "' retains an unfilled template instruction without project-specific content.",
                AiReviewProvider.FindingSource.DOCUMENT, prompt, "", "Complete the section",
                "Replace the authoring instruction with the project's content for this section.", null));
        }
        return List.copyOf(findings);
    }
}
