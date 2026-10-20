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
            .contains("1. Overview", "2. Recovery").noneMatch(text -> text.contains("...") || text.contains("Budget"));
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
            .containsExactly("1. Scope", "2. Resources", "3. Schedule");
    }

    @Test void boundedPlanCountsOmittedAreasWithoutClaimingTheirCoverage() {
        String instructions = IntStream.rangeClosed(1, 31)
            .mapToObj(i -> "Describe the documented review scenario number " + i + ".").reduce("", (a, b) -> a + "\n" + b);
        var plan = AiReviewCoveragePolicy.plan(instructions, "");
        assertThat(plan.criteria()).hasSize(24);
        assertThat(plan.omittedCriteria()).isEqualTo(7);
        assertThat(plan.criteria()).extracting(AiReviewCoveragePolicy.Criterion::id).doesNotHaveDuplicates();
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
