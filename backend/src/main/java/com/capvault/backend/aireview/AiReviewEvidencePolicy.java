package com.capvault.backend.aireview;

import java.util.Locale;
import java.util.regex.Pattern;

/** Conservative checks on what a quoted passage can actually establish. */
final class AiReviewEvidencePolicy {
    private AiReviewEvidencePolicy() { }

    static boolean submissionOnlyAuthority(String requirement) {
        String text = normalize(requirement);
        if (text.isBlank() || text.split(" ").length > 35) return false;
        if (!text.matches("^(?:please )?(?:submit|upload|provide|share|link to|link for)\\b.*")) return false;
        if (!Pattern.compile("\\b(?:pdf|drive|file|url|link)\\b").matcher(text).find()) return false;
        // A submission instruction can also contain a real content or access requirement.
        return !Pattern.compile("\\b(?:with|including|include|containing|contains|must|shall|"
            + "describe|define|explain|demonstrate|ensure|accessible|permissions|readable|"
            + "sections|criteria|evidence|results|requirements)\\b").matcher(
                text.replace("software requirements specification", "srs")).find();
    }

    static boolean aspectMismatch(String aspect, String evidence) {
        String label = normalize(aspect), quote = normalize(evidence);
        if (label.contains("compliance")
                && quote.matches(".*\\b(?:overseen by|enforced by|administered by|regulated by)\\b.*")
                && !quote.matches(".*\\b(?:shall|must|implements|encryption|consent|retention|access control)\\b.*"))
            return true;
        if (label.contains("reliability")
                && Pattern.compile("\\b(?:depends? on|relies? (?:completely |entirely )?on|"
                    + "requires? an? active|cannot (?:operate|function) without)\\b").matcher(quote).find()
                && !Pattern.compile("\\b(?:shall|must|retry|retries|recover\\w*|failover|replica\\w*|"
                    + "backup|restore\\w*|redundan\\w*|toleran\\w*|fallback|automatically|availability)\\b")
                    .matcher(quote).find()
                && !evidence.matches("(?s).*\\d+(?:\\.\\d+)?\\s*%.*")) return true;
        if ((label.contains("architecture") || label.contains("technolog"))
                && quote.matches("^(?:this|the) (?:document|specification|sdd|srs) "
                    + "(?:specifies|defines|describes|presents).*")
                && quote.contains("functional and non functional requirements")
                && !Pattern.compile("\\b(?:using|built with|implemented in|consists of|components|"
                    + "frontend|backend|front end|back end|database|framework)\\b").matcher(quote).find()) return true;
        return label.contains("artifact acceptance") && quote.contains("recheck")
            && !label.matches(".*\\b(?:criteria|criterion|check|recheck|test)\\b.*")
            && !Pattern.compile("\\b(?:accepted|approval|approve|staff|adviser|administrator|"
                + "decision|revoke|revocation)\\b").matcher(quote).find();
    }

    static boolean unsupportedIdentityContradiction(AiReviewProvider.Finding finding, String documentText) {
        String issue = normalize(finding.issue());
        if (finding.source() != AiReviewProvider.FindingSource.DOCUMENT
                || !issue.matches(".*(?:project identity|different project|inconsistent project name).*")) return false;
        // A blank declared project title and a single mockup name cannot establish
        // two conflicting identities. Retain claims whose citation identifies both.
        boolean blankTitle = Pattern.compile("(?im)^\\s*Project\\s+Title[ \\t]*:[ \\t]*\\R(?:[ \\t]*\\R)*"
            + "[ \\t]*(?:Prepared\\s+By|Date|Version)\\b").matcher(documentText).find();
        return blankTitle && !normalize(finding.evidence()).matches(
            ".*\\b(?:project title|project name|system name)\\b.*");
    }

    private static String normalize(String text) {
        return text == null ? "" : text.toLowerCase(Locale.ROOT)
            .replaceAll("[^\\p{L}\\p{N}]+", " ").trim().replaceAll("\\s+", " ");
    }
}
