package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;
import com.capvault.backend.filecheck.PdfInspection;
import org.junit.jupiter.api.Test;

class AiReviewMetadataGroundingTest {
    private static final String TEXT = "1.1 Purpose\nTODO: define capacity.\n1.2 Scope\nThe system supports students and advisers.\n"
        + "2. Archive\nThe archive stores submitted PDF documents.";
    private static final PdfInspection INSPECTION = new PdfInspection(true, false, 2, 2, TEXT.length(), TEXT, "",
        List.of(new PdfInspection.PageText(1, "1.2 Scope\nThe system supports students and advisers.\n2. Archive\nThe archive stores submitted PDF documents.", false),
            new PdfInspection.PageText(2, "1.1 Purpose\nTODO: define capacity.", false)));

    @Test void stripsInventedMetadataWithoutDroppingAcceptedFindingAndKeepsValidPhysicalLocation() {
        var bad = new AiReviewProvider.Finding("The draft contains an unresolved placeholder.",
            AiReviewProvider.FindingSource.DOCUMENT, "TODO: define capacity.", "",
            "Mandatory certification is missing", "Add mandatory certification in 24 hours",
            new AiReviewProvider.EvidenceLocation(999, "Invented section"));
        var report = process(new AiReviewProvider.Result("Report", List.of(bad), List.of(), List.of(), "Action"));
        assertThat(report.findings()).hasSize(1);
        var finding = report.findings().get(0);
        assertThat(finding.title()).isNull();
        assertThat(finding.nextAction()).doesNotContain("certification", "24 hours");
        assertThat(finding.location()).isNull();
        var good = new AiReviewProvider.Finding(bad.issue(), bad.source(), bad.evidence(), "",
            "unresolved placeholder", null, new AiReviewProvider.EvidenceLocation(2, "1.1 Purpose"));
        assertThat(process(new AiReviewProvider.Result("Report", List.of(good), List.of(), List.of(), "Action"))
            .findings().get(0).location()).isEqualTo(good.location());
    }

    @Test void dropsSectionWhenQuotedEvidenceBelongsToAnotherSection() {
        var finding = new AiReviewProvider.Finding("The draft contains an unresolved placeholder.",
            AiReviewProvider.FindingSource.DOCUMENT, "TODO: define capacity.", "", null, null,
            new AiReviewProvider.EvidenceLocation(null, "1.2 Scope"));
        var report = process(new AiReviewProvider.Result("Report", List.of(finding), List.of(), List.of(), "Action"));
        assertThat(report.findings()).hasSize(1);
        assertThat(report.findings().get(0).location()).isNull();
    }

    @Test void retainsValidPageButDropsWrongSectionOnThatPage() {
        var check = new AiReviewProvider.VerifiedCheck("Scope identifies users",
            AiReviewProvider.FindingSource.DOCUMENT, "The system supports students and advisers.", "",
            new AiReviewProvider.EvidenceLocation(1, "2. Archive"));
        var report = process(new AiReviewProvider.Result("Report", List.of(), List.of(), List.of(), "Action",
            List.of(check)));
        assertThat(report.verifiedChecks()).hasSize(1);
        assertThat(report.verifiedChecks().get(0).location())
            .isEqualTo(new AiReviewProvider.EvidenceLocation(1, null));
    }


    @Test void fabricatedNoteEvidenceNeverAppearsAsSubmittedEvidenceAndCannotCreateGreenResult() {
        var notes = List.of(new AiReviewProvider.Finding("Manual verification is needed.",
            AiReviewProvider.FindingSource.DOCUMENT, "The document demands mandatory certification.", ""));
        var checks = List.of(
            new AiReviewProvider.VerifiedCheck("Scope identifies users", AiReviewProvider.FindingSource.DOCUMENT,
                "The system supports students and advisers.", "", new AiReviewProvider.EvidenceLocation(999, "Invented section")),
            new AiReviewProvider.VerifiedCheck("Archive stores PDFs", AiReviewProvider.FindingSource.DOCUMENT,
                "The archive stores submitted PDF documents.", "", new AiReviewProvider.EvidenceLocation(1, "2. Archive")));
        var report = process(new AiReviewProvider.Result("All approved", List.of(), List.of(), List.of(), "Approve",
            checks, notes, AiReviewProvider.ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS));
        assertThat(report.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.INCONCLUSIVE);
        assertThat(report.verifiedChecks()).hasSize(2);
        assertThat(report.verifiedChecks().get(0).location()).isNull();
        assertThat(report.verifiedChecks().get(1).location().page()).isEqualTo(1);
        assertThat(report.verificationNotes()).hasSize(1).allSatisfy(note -> assertThat(note.evidence()).isEmpty());
        assertThat(report.summary()).containsIgnoringCase("inconclusive").doesNotContain("approved");
    }

    @Test void uncertainTocBoundaryCannotEstablishRequiredSectionAbsence() {
        String tocOnly = "Table of Contents\n1.1 Purpose .... 4\n1.2 Scope .... 5\n1.1 Purpose\n1.2 Scope";
        var raw = new AiReviewProvider.Result("Report", List.of(), List.of(), List.of(), "Action");
        var report = AiReviewService.postprocessForBenchmark(raw, "SRS", "The Purpose body section must contain explanatory prose.", "", tocOnly);
        assertThat(report.missingRequiredSections()).isEmpty();
        assertThat(report.verificationNotes()).isNotEmpty();
        assertThat(report.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.INCONCLUSIVE);
    }

    private static AiReviewProvider.Result process(AiReviewProvider.Result raw) {
        return AiReviewService.postprocessForBenchmark(raw, "SRS", "", "", INSPECTION);
    }
}
