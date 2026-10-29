package com.capvault.backend.aireview;

import static com.capvault.backend.aireview.AiReviewProvider.*;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class AiReviewCoveragePolicyTest {
    private static final String USERS = "Describe intended users and their tasks.";
    private static final String RECOVERY = "Describe recovery behavior after interrupted uploads.";
    private static final VerifiedCheck CHECK = new VerifiedCheck("Intended users", FindingSource.DOCUMENT,
        "Students submit project work and advisers review their assigned teams.", "");

    @Test void authorityPlanExcludesOptionalExamplesAndSubmissionOnlyRequests() {
        var plan = AiReviewCoveragePolicy.plan(USERS + "\n" + RECOVERY
            + "\nProvide a PDF Drive link.\nFor example, describe an optional notification screen."
            + "\nIf applicable, include a cost forecast.", "");
        assertThat(plan.criteria()).extracting(AiReviewCoveragePolicy.Criterion::requirement)
            .containsExactly(USERS, RECOVERY);
        assertThat(plan.criteria()).allSatisfy(row -> assertThat(row.source()).isEqualTo(FindingSource.DELIVERABLE_REQUIREMENTS));
    }

    @Test void templatePlanUsesBodyAreasAndExcludesTheContentsAndOptionalSection() {
        String template = "Table of Contents\n1. Overview ........ 2\n2. Recovery ........ 3\n3. Budget ........ 4\n"
            + "1. Overview\nDescribe the intended users and their operating context.\n"
            + "2. Recovery\nDescribe recovery behavior after an interrupted request.\n"
            + "3. Budget (optional)\nProvide a budget only if applicable to this project.\n";
        var plan = AiReviewCoveragePolicy.plan("", template);
        assertThat(plan.criteria()).extracting(AiReviewCoveragePolicy.Criterion::requirement)
            .contains("Describe the intended users and their operating context.",
                "Describe recovery behavior after an interrupted request.")
            .noneMatch(text -> text.contains("...") || text.contains("Budget"));
    }

    @Test void parentAndChildBodyDirectivesAreBothExtractedWithoutHeadingRows() {
        String template = "1. Overview\nDescribe the project boundaries and intended deliverables.\n"
            + "1.1 Purpose\nIdentify the intended users and operating context.\n";
        assertThat(AiReviewCoveragePolicy.plan("", template).criteria())
            .extracting(AiReviewCoveragePolicy.Criterion::requirement)
            .containsExactly("Describe the project boundaries and intended deliverables.",
                "Identify the intended users and operating context.");
    }

    @Test void reviewGuidanceAndNounsDoNotBecomeStudentContentObligations() {
        var plan = AiReviewCoveragePolicy.plan("The PDF document covers planning. "
            + "Review this fictional document against its mapped official template. "
            + "Do not infer additional mandatory sections or requirements. "
            + "The report lists background information. " + USERS + " The document must describe recovery behavior.", "");
        assertThat(plan.criteria()).extracting(AiReviewCoveragePolicy.Criterion::requirement)
            .containsExactly(USERS, "The document must describe recovery behavior.");
    }

    @Test void numberedExampleSentencesAreNotTemplateHeadings() {
        String template = "1. Scope\nDescribe the project boundary, intended deliverables and excluded work. "
            + "Explain the operating context so that the planning basis is clear to the reader.\n"
            + "2. Resources\nDescribe the accountable roles and the resources assigned to each work package. "
            + "The following figures illustrate one example allocation rather than a mandatory project size.\n"
            + "6 participants work thirty hours per week.\n"
            + "3. Schedule\nExplain the work dependencies and planned milestones. "
            + "Record the evidence used to determine whether each preceding activity has finished.\n"
            + "12 weeks are allocated to the sample project.\n";
        assertThat(AiReviewCoveragePolicy.plan("", template).criteria())
            .extracting(AiReviewCoveragePolicy.Criterion::requirement)
            .containsExactly(
                "Describe the project boundary, intended deliverables and excluded work. Explain the operating context so that the planning basis is clear to the reader.",
                "Describe the accountable roles and the resources assigned to each work package.",
                "Explain the work dependencies and planned milestones.");
    }

    @Test void planPreservesEveryExplicitInstructionBeyondTheOldAndTwoDigitLimits() {
        String instructions = IntStream.rangeClosed(1, 110)
            .mapToObj(i -> "Describe the documented review scenario number " + i + ".").reduce("", (a, b) -> a + "\n" + b);
        var plan = AiReviewCoveragePolicy.plan(instructions, "");
        assertThat(plan.criteria()).hasSize(110);
        assertThat(plan.omittedCriteria()).isZero();
        assertThat(plan.criteria()).extracting(AiReviewCoveragePolicy.Criterion::id).doesNotHaveDuplicates();
    }

    @Test void fixedInstructionsSharingAnAuthorityQuoteKeepTheirOwnVerdicts() {
        String authority = "Describe the project schedule and budget.";
        String quote = "The project manager reviews progress at the weekly milestone meeting.";
        var note = new Finding("The budget allocation is unclear.", FindingSource.OFFICIAL_TEMPLATE, "", authority);
        var check = new VerifiedCheck("Schedule", FindingSource.OFFICIAL_TEMPLATE, quote, authority);
        var rows = List.of(new CriterionAssessment("T1", authority, FindingSource.OFFICIAL_TEMPLATE,
                CoverageStatus.EVIDENCE_RECORDED, List.of(0), List.of(), List.of(), List.of(),
                CriterionAssessmentLabel.APPEARS_ADDRESSED, "Weekly milestone reviews are described.", quote, null),
            new CriterionAssessment("T2", authority, FindingSource.OFFICIAL_TEMPLATE,
                CoverageStatus.ISSUE_RECORDED, List.of(), List.of(), List.of(), List.of(0),
                CriterionAssessmentLabel.CHECK_MANUALLY, "The budget allocation is unclear.", "", null));
        var raw = new Result("Review", List.of(), List.of(), List.of(), "Inspect", List.of(check), List.of(note), null,
            new ReviewCoverage(rows, 0, 1, null, null));
        var plan = new AiReviewCoveragePolicy.Plan(List.of(
            new AiReviewCoveragePolicy.Criterion("T1", authority, FindingSource.OFFICIAL_TEMPLATE, "Schedule"),
            new AiReviewCoveragePolicy.Criterion("T2", authority, FindingSource.OFFICIAL_TEMPLATE, "Budget")), 0, "Fixed instructions");
        var coverage = AiReviewCoveragePolicy.grounded(raw, raw, plan, quote,
            List.of(new com.capvault.backend.filecheck.PdfInspection.PageText(3, quote, false)));
        assertThat(coverage.criteria()).extracting(CriterionAssessment::assessment)
            .containsExactly(CriterionAssessmentLabel.APPEARS_ADDRESSED, CriterionAssessmentLabel.CHECK_MANUALLY);
        assertThat(coverage.criteria().getFirst().verificationNoteIndexes()).isEmpty();
    }

    @Test void rejectedFixedInstructionEvidenceCannotKeepAnAppearsAddressedVerdict() {
        String authority = "Describe the project schedule and milestones.";
        String quote = "TODO: Describe the project schedule and milestones before submitting this document.";
        var check = new VerifiedCheck("Schedule", FindingSource.OFFICIAL_TEMPLATE, quote, authority);
        var row = new CriterionAssessment("T1", authority, FindingSource.OFFICIAL_TEMPLATE,
            CoverageStatus.EVIDENCE_RECORDED, List.of(0), List.of(), List.of(), List.of(),
            CriterionAssessmentLabel.APPEARS_ADDRESSED, "The schedule is described.", quote, null);
        var raw = with(List.of(check), List.of(row));
        var plan = new AiReviewCoveragePolicy.Plan(List.of(
            new AiReviewCoveragePolicy.Criterion("T1", authority, FindingSource.OFFICIAL_TEMPLATE, "Schedule")), 0, "Fixed instructions");
        var coverage = AiReviewCoveragePolicy.grounded(raw, result(List.of()), plan, quote,
            List.of(new com.capvault.backend.filecheck.PdfInspection.PageText(3, quote, false)));
        assertThat(coverage.criteria().getFirst().assessment()).isEqualTo(CriterionAssessmentLabel.CHECK_MANUALLY);
        assertThat(coverage.criteria().getFirst().documentEvidence()).isEqualTo(quote);
        assertThat(coverage.criteria().getFirst().location().page()).isEqualTo(3);
    }

    @Test void unsupportedEvidenceAndUnknownIdsCannotCreateCheckedAreas() {
        var raw = with(List.of(CHECK), List.of(mapping("C1", List.of(0)), mapping("C99", List.of(0))));
        var accepted = result(List.of());
        var coverage = AiReviewCoveragePolicy.grounded(raw, accepted, USERS + "\n" + RECOVERY, "");
        assertThat(coverage.criteria()).allSatisfy(row -> {
            assertThat(row.status()).isEqualTo(CoverageStatus.NOT_CHECKED);
            assertThat(row.verifiedCheckIndexes()).isEmpty();
        });
    }

    @Test void duplicateCriteriaOrMalformedReferencesStayUnchecked() {
        for (var mappings : List.of(List.of(mapping("C1", List.of(0)), mapping("C1", List.of(0))),
                List.of(mapping("C1", List.of(0, 0))), List.of(mapping("C1", List.of(0, 4))))) {
            var coverage = AiReviewCoveragePolicy.grounded(with(List.of(CHECK), mappings), result(List.of(CHECK)), USERS, "");
            assertThat(coverage.criteria().getFirst().status()).isEqualTo(CoverageStatus.NOT_CHECKED);
        }
    }

    @Test void aSingleRetainedObservationCannotInflateSeveralAreas() {
        var coverage = AiReviewCoveragePolicy.grounded(
            with(List.of(CHECK), List.of(mapping("C1", List.of(0)), mapping("C2", List.of(0)))),
            result(List.of(CHECK)), USERS + "\n" + RECOVERY, "");
        assertThat(coverage.criteria()).extracting(CriterionAssessment::status)
            .containsExactly(CoverageStatus.EVIDENCE_RECORDED, CoverageStatus.NOT_CHECKED);
    }

    @Test void aRealButUnrelatedQuotationDoesNotEstablishCriterionCoverage() {
        var coverage = AiReviewCoveragePolicy.grounded(
            with(List.of(CHECK), List.of(mapping("C1", List.of(0)))), result(List.of(CHECK)), RECOVERY, "");
        assertThat(coverage.criteria().getFirst().status()).isEqualTo(CoverageStatus.NOT_CHECKED);
        assertThat(coverage.criteria().getFirst().verifiedCheckIndexes()).isEmpty();
    }

    @Test void sharedTopicWordsCannotMapAConcernToAnotherObligation() {
        String first = "Describe storage encryption behavior.";
        String second = "Describe storage backup behavior.";
        var finding = new Finding("Backup content needs review.", FindingSource.DELIVERABLE_REQUIREMENTS,
            "Backups are stored on removable media.", second);
        var rows = List.of(new CriterionAssessment("C1", "invented", FindingSource.DOCUMENT,
            CoverageStatus.ISSUE_RECORDED, List.of(), List.of(0), List.of(), List.of()),
            new CriterionAssessment("C2", "invented", FindingSource.DOCUMENT,
            CoverageStatus.ISSUE_RECORDED, List.of(), List.of(0), List.of(), List.of()));
        var report = new Result("Review", List.of(finding), List.of(), List.of(), "Inspect", List.of(), List.of(), null,
            new ReviewCoverage(rows, 0, 1, null, null));
        var coverage = AiReviewCoveragePolicy.grounded(report, report, first + "\n" + second, "");
        assertThat(coverage.criteria()).extracting(CriterionAssessment::status)
            .containsExactly(CoverageStatus.NOT_CHECKED, CoverageStatus.ISSUE_RECORDED);
        assertThat(coverage.criteria().getLast().requirement()).isEqualTo(second);
        assertThat(coverage.criteria().getLast().source()).isEqualTo(FindingSource.DELIVERABLE_REQUIREMENTS);
    }

    @Test void legacySavedJsonDoesNotInventARecordedChecklist() throws Exception {
        var saved = new ObjectMapper().readValue("""
            {"summary":"Historical review","findings":[],"missingRequiredSections":[],
             "limitations":[],"suggestedAction":"Inspect","verifiedChecks":[],"outcome":"INCONCLUSIVE"}
            """, Result.class);
        assertThat(saved.coverage()).isNull();
        assertThat(saved.outcome()).isEqualTo(ReviewOutcome.INCONCLUSIVE);
    }

    @Test void explicitInstructionAssessmentsRemainIndependentOfGlobalPositiveChecks() {
        String instructions = IntStream.rangeClosed(1, 8)
            .mapToObj(i -> "Describe requirement area " + i + " with concrete project evidence.")
            .reduce("", (a, b) -> a + "\n" + b);
        String quote = "The project evidence describes the requirement area with concrete implementation details.";
        var rows = IntStream.rangeClosed(1, 8).mapToObj(i -> new CriterionAssessment("C" + i, "", null,
            CoverageStatus.NOT_CHECKED, List.of(), List.of(), List.of(), List.of(),
            CriterionAssessmentLabel.APPEARS_ADDRESSED, "Evidence supports this area.", quote, null)).toList();
        var raw = with(List.of(), rows);
        var accepted = result(List.of());
        var coverage = AiReviewCoveragePolicy.grounded(raw, accepted, instructions, "", quote,
            List.of(new com.capvault.backend.filecheck.PdfInspection.PageText(3, quote, false)));
        assertThat(coverage.criteria()).hasSize(8).allSatisfy(row -> {
            assertThat(row.assessment()).isEqualTo(CriterionAssessmentLabel.APPEARS_ADDRESSED);
            assertThat(row.location().page()).isEqualTo(3);
        });
    }

    @Test void downgradedAssessmentRetainsOnlyVerifiedPassageAndPage() {
        String requirement = "Describe the project schedule and milestones.";
        String quote = "The project manager reviews progress at the weekly milestone meeting.";
        var row = new CriterionAssessment("T1", requirement, FindingSource.OFFICIAL_TEMPLATE,
            CoverageStatus.NOT_CHECKED, List.of(), List.of(), List.of(), List.of(),
            CriterionAssessmentLabel.APPEARS_ADDRESSED, "The schedule is described.", quote, new EvidenceLocation(99, null));
        var plan = new AiReviewCoveragePolicy.Plan(List.of(
            new AiReviewCoveragePolicy.Criterion("T1", requirement, FindingSource.OFFICIAL_TEMPLATE, "Schedule")), 0, "Fixed");
        var pages = List.of(new com.capvault.backend.filecheck.PdfInspection.PageText(3, quote, false));
        var grounded = AiReviewCoveragePolicy.grounded(with(List.of(), List.of(row)), result(List.of()), plan, quote, pages).criteria().getFirst();
        assertThat(grounded.assessment()).isEqualTo(CriterionAssessmentLabel.CHECK_MANUALLY);
        assertThat(grounded.documentEvidence()).isEqualTo(quote);
        assertThat(grounded.location().page()).isEqualTo(3);
        assertThat(grounded.explanation()).contains("Unconfirmed AI observation: The schedule is described.",
            "not enough to confirm the full instruction", "Check Schedule in the PDF");
        var fabricated = new CriterionAssessment("T1", requirement, FindingSource.OFFICIAL_TEMPLATE,
            CoverageStatus.NOT_CHECKED, List.of(), List.of(), List.of(), List.of(),
            CriterionAssessmentLabel.APPEARS_ADDRESSED, "The schedule is described.", "The fabricated milestone schedule is complete.", new EvidenceLocation(99, null));
        var rejected = AiReviewCoveragePolicy.grounded(with(List.of(), List.of(fabricated)), result(List.of()), plan, quote, pages).criteria().getFirst();
        assertThat(rejected.assessment()).isEqualTo(CriterionAssessmentLabel.CHECK_MANUALLY);
        assertThat(rejected.documentEvidence()).isNull();
        assertThat(rejected.location()).isNull();
        assertThat(rejected.explanation()).contains("Unconfirmed AI observation: The schedule is described.",
            "No matching supporting passage");
    }

    @Test void verifiedSpecificNoteExplainsManualDowngrade() {
        String requirement = "Describe the project schedule and milestones.";
        String quote = "The project manager reviews progress at the weekly milestone meeting.";
        var note = new Finding("Confirm whether the weekly review covers all milestones.", FindingSource.OFFICIAL_TEMPLATE, quote, requirement);
        var row = new CriterionAssessment("T1", requirement, FindingSource.OFFICIAL_TEMPLATE, CoverageStatus.NOT_CHECKED,
            List.of(), List.of(), List.of(), List.of(0), CriterionAssessmentLabel.APPEARS_ADDRESSED, "Addressed.", quote, null);
        var report = new Result("Review", List.of(), List.of(), List.of(), "Inspect", List.of(), List.of(note), null,
            new ReviewCoverage(List.of(row), 0, 1, null, null));
        var plan = new AiReviewCoveragePolicy.Plan(List.of(new AiReviewCoveragePolicy.Criterion("T1", requirement, FindingSource.OFFICIAL_TEMPLATE, "Schedule")), 0, "Fixed");
        var grounded = AiReviewCoveragePolicy.grounded(report, report, plan, quote,
            List.of(new com.capvault.backend.filecheck.PdfInspection.PageText(3, quote, false))).criteria().getFirst();
        assertThat(grounded.assessment()).isEqualTo(CriterionAssessmentLabel.CHECK_MANUALLY);
        assertThat(grounded.explanation()).isEqualTo(note.issue());
        assertThat(grounded.documentEvidence()).isEqualTo(quote);
        assertThat(grounded.location().page()).isEqualTo(3);
    }

    @Test void headingOnlyQuoteCannotUpgradeAppearsAddressed() {
        String requirement = "Describe the project boundary and intended deliverables.";
        String quote = "1. Overview";
        var row = new CriterionAssessment("C1", "", null, CoverageStatus.NOT_CHECKED,
            List.of(), List.of(), List.of(), List.of(), CriterionAssessmentLabel.APPEARS_ADDRESSED,
            "Looks addressed.", quote, null);
        var coverage = AiReviewCoveragePolicy.grounded(with(List.of(), List.of(row)), result(List.of()),
            requirement, "", quote, List.of(new com.capvault.backend.filecheck.PdfInspection.PageText(1, quote, false)));
        assertThat(coverage.criteria().getFirst().assessment()).isEqualTo(CriterionAssessmentLabel.CHECK_MANUALLY);
        assertThat(coverage.criteria().getFirst().documentEvidence()).isNull();
    }

    @Test void instructionEvidenceControlsFinalOutcomeWithoutChangingLegacyRows() {
        var checks = List.of(
            new VerifiedCheck("Area one", FindingSource.DOCUMENT, "Body evidence for area one is present.", ""),
            new VerifiedCheck("Area two", FindingSource.DOCUMENT, "Body evidence for area two is present.", ""));
        var accepted = new Result("Review", List.of(), List.of(), List.of(), "Inspect", checks,
            List.of(), ReviewOutcome.INCONCLUSIVE);
        var positiveRows = List.of(
            new CriterionAssessment("C1", "Area one", FindingSource.DELIVERABLE_REQUIREMENTS,
                CoverageStatus.EVIDENCE_RECORDED, List.of(), List.of(), List.of(), List.of(),
                CriterionAssessmentLabel.APPEARS_ADDRESSED, "Observed.", checks.get(0).documentEvidence(), null),
            new CriterionAssessment("C2", "Area two", FindingSource.DELIVERABLE_REQUIREMENTS,
                CoverageStatus.EVIDENCE_RECORDED, List.of(), List.of(), List.of(), List.of(),
                CriterionAssessmentLabel.APPEARS_ADDRESSED, "Observed.", checks.get(1).documentEvidence(), null));
        assertThat(AiReviewService.instructionOutcome(accepted,
            new ReviewCoverage(positiveRows, 0, 1, null, null)))
            .isEqualTo(ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS);
        var manual = new CriterionAssessment("C1", "Area one", FindingSource.DELIVERABLE_REQUIREMENTS,
            CoverageStatus.NEEDS_VERIFICATION, List.of(), List.of(), List.of(), List.of(),
            CriterionAssessmentLabel.CHECK_MANUALLY, "Verify manually.", null, null);
        assertThat(AiReviewService.instructionOutcome(accepted,
            new ReviewCoverage(List.of(manual), 0, 1, null, null)))
            .isEqualTo(ReviewOutcome.INCONCLUSIVE);
        var legacy = new CriterionAssessment("C1", "Area one", FindingSource.DELIVERABLE_REQUIREMENTS,
            CoverageStatus.EVIDENCE_RECORDED, List.of(), List.of(), List.of(), List.of());
        assertThat(AiReviewService.instructionOutcome(accepted,
            new ReviewCoverage(List.of(legacy), 0, 1, null, null)))
            .isEqualTo(ReviewOutcome.INCONCLUSIVE);
    }

    @Test void combiningPassesRetainsDirectAssessmentWhenTheOtherPassHasOnlyLegacyMetadata() {
        var location = new EvidenceLocation(7, null);
        var first = new CriterionAssessment("C1", "Describe project roles.", FindingSource.OFFICIAL_TEMPLATE,
            CoverageStatus.NOT_CHECKED, List.of(), List.of(), List.of(), List.of(),
            CriterionAssessmentLabel.APPEARS_ADDRESSED, "The named members have assigned responsibilities.",
            "The project lead coordinates the assigned implementation and review responsibilities.", location, "Project roles");
        var combined = AiReviewCoveragePolicy.combine(with(List.of(), List.of(first)),
            with(List.of(), List.of(mapping("C1", List.of()))));
        var row = combined.coverage().criteria().getFirst();
        assertThat(row.assessment()).isEqualTo(first.assessment());
        assertThat(row.explanation()).isEqualTo(first.explanation());
        assertThat(row.documentEvidence()).isEqualTo(first.documentEvidence());
        assertThat(row.location()).isEqualTo(location);
        assertThat(row.title()).isEqualTo("Project roles");
    }

    @Test void combiningPassesKeepsTheSelectedAssessmentAndItsEvidenceTogether() {
        var first = new CriterionAssessment("C1", "Describe project roles.", FindingSource.OFFICIAL_TEMPLATE,
            CoverageStatus.NOT_CHECKED, List.of(), List.of(), List.of(), List.of(),
            CriterionAssessmentLabel.APPEARS_ADDRESSED, "Roles are described.",
            "The project lead coordinates the assigned implementation responsibilities.", new EvidenceLocation(7, null), "Project roles");
        var second = new CriterionAssessment("C1", "Describe project roles.", FindingSource.OFFICIAL_TEMPLATE,
            CoverageStatus.NOT_CHECKED, List.of(), List.of(), List.of(), List.of(),
            CriterionAssessmentLabel.CHECK_MANUALLY, "Confirm the overlapping approval responsibilities.",
            null, null, "Project roles");
        var combined = AiReviewCoveragePolicy.combine(with(List.of(), List.of(first)), with(List.of(), List.of(second)));
        var row = combined.coverage().criteria().getFirst();
        assertThat(row.assessment()).isEqualTo(second.assessment());
        assertThat(row.explanation()).isEqualTo(second.explanation());
        assertThat(row.documentEvidence()).isNull();
        assertThat(row.location()).isNull();
        assertThat(row.title()).isEqualTo("Project roles");
    }

    private static CriterionAssessment mapping(String id, List<Integer> checks) {
        return new CriterionAssessment(id, "", null, CoverageStatus.NOT_CHECKED, checks, List.of(), List.of(), List.of());
    }
    private static Result result(List<VerifiedCheck> checks) {
        return new Result("Review", List.of(), List.of(), List.of(), "Inspect", checks);
    }
    private static Result with(List<VerifiedCheck> checks, List<CriterionAssessment> mappings) {
        return AiReviewCoveragePolicy.withCoverage(result(checks), new ReviewCoverage(mappings, 0, 1, null, null));
    }
}
