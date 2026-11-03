package com.capvault.backend.aireview;

import static com.capvault.backend.aireview.AiReviewProvider.*;

import java.util.ArrayList;
import java.util.List;
import com.capvault.backend.filecheck.PdfInspection;

/** Preserve model judgments; locate supporting references without turning lookup failures into verdicts. */
final class AiReviewInstructionEvidencePolicy {
    private AiReviewInstructionEvidencePolicy() { }

    static Result locate(Result raw, PdfInspection inspection) {
        return locate(raw, inspection, new AiReviewQuotationSource(null, inspection));
    }

    static Result locate(Result raw, PdfInspection inspection, AiReviewQuotationSource source) {
        var findings = new ArrayList<Finding>();
        for (var finding : raw.findings()) {
            if (finding.source() == FindingSource.OFFICIAL_TEMPLATE) continue;
            var match = source.locate(finding.evidence(), finding.location());
            findings.add(new Finding(finding.issue(), finding.source(), match.continuous() ? match.excerpts().getFirst().text() : "",
                finding.requirement(), finding.title(), finding.nextAction(), match.continuous() ? match.excerpts().getFirst().location() : null));
        }
        var notes = new ArrayList<Finding>();
        var checks = new ArrayList<VerifiedCheck>();
        var rows = new ArrayList<CriterionAssessment>();
        for (var row : raw.coverage().criteria()) {
            var priorReference = row.evidenceVerification();
            String quotation = priorReference != null && priorReference.providerQuotation() != null
                ? priorReference.providerQuotation() : row.documentEvidence();
            var cited = priorReference != null && priorReference.citedLocation() != null ? priorReference.citedLocation() : row.location();
            var match = source.locate(quotation, cited);
            var suppliedVisual = row.evidenceVerification() == null ? null : row.evidenceVerification().visualObservation();
            var visual = suppliedVisual == null ? null : new VisualObservation(suppliedVisual.description(), suppliedVisual.location(),
                suppliedVisual.location() != null && suppliedVisual.location().page() != null
                    && suppliedVisual.location().page() > 0 && suppliedVisual.location().page() <= inspection.pageCount());
            var status = quotation == null || quotation.isBlank()
                ? visual == null ? QuotationStatus.NOT_PROVIDED : QuotationStatus.VISUAL_REFERENCE
                : match.continuous() ? QuotationStatus.LOCATED : match.approximate() ? QuotationStatus.CLOSE_MATCH
                    : match.located() ? QuotationStatus.SEPARATE_EXCERPTS : QuotationStatus.NOT_LOCATED;
            String evidence = match.continuous() ? match.excerpts().getFirst().text() : null;
            EvidenceLocation location = match.continuous() ? match.excerpts().getFirst().location() : null;
            var checkIndexes = new ArrayList<Integer>();
            var findingIndexes = new ArrayList<Integer>();
            var noteIndexes = new ArrayList<Integer>();
            if (row.assessment() == CriterionAssessmentLabel.APPEARS_ADDRESSED && evidence != null) {
                checkIndexes.add(checks.size());
                checks.add(new VerifiedCheck(row.title(), row.source(), evidence, row.requirement(), location));
            } else if (row.assessment() == CriterionAssessmentLabel.NEEDS_ATTENTION) {
                findingIndexes.add(findings.size());
                findings.add(new Finding(row.explanation(), row.source(), evidence == null ? "" : evidence,
                    row.requirement(), row.title(), null, location));
            } else if (row.assessment() == CriterionAssessmentLabel.CHECK_MANUALLY) {
                noteIndexes.add(notes.size());
                notes.add(new Finding(row.explanation(), row.source(), evidence == null ? "" : evidence,
                    row.requirement(), row.title(), null, location));
            }
            CoverageStatus coverageStatus = row.assessment() == CriterionAssessmentLabel.NEEDS_ATTENTION ? CoverageStatus.ISSUE_RECORDED
                : row.assessment() == CriterionAssessmentLabel.CHECK_MANUALLY ? CoverageStatus.NEEDS_VERIFICATION
                : evidence != null ? CoverageStatus.EVIDENCE_RECORDED : CoverageStatus.ASSESSED;
            rows.add(new CriterionAssessment(row.id(), row.requirement(), row.source(), coverageStatus,
                checkIndexes, findingIndexes, List.of(), noteIndexes, row.assessment(), row.explanation(), evidence,
                location, row.title(), match.continuous() ? List.of() : match.excerpts(),
                new EvidenceVerification(status, quotation, cited, visual)));
        }
        boolean attention = !findings.isEmpty() || raw.documentOverview() != null && raw.documentOverview().wrongDocument();
        ReviewOutcome outcome = attention ? ReviewOutcome.ISSUES_IDENTIFIED
            : !notes.isEmpty() ? ReviewOutcome.INCONCLUSIVE : ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS;
        return new Result(raw.summary(), findings, raw.missingRequiredSections(), raw.limitations(), raw.suggestedAction(),
            checks, notes, outcome, new ReviewCoverage(rows, raw.coverage().omittedCriteria(), raw.coverage().completedPasses(),
                raw.coverage().followupNotice(), raw.coverage().scopeNote()), raw.documentOverview());
    }
}
