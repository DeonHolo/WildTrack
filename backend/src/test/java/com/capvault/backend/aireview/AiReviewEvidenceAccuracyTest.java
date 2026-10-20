package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import com.capvault.backend.filecheck.PdfInspection;
import java.util.List;
import org.junit.jupiter.api.Test;

class AiReviewEvidenceAccuracyTest {
    @Test void genericPdfSubmissionInstructionsCannotAuthorizeTechnicalChecks() {
        for (String instruction : List.of("Submit your Refactored SDD as a PDF Drive file.",
                "Submit the required link for STD.", "Link to Updated Software Design Description (PDF).")) {
            assertThat(AiReviewEvidencePolicy.submissionOnlyAuthority(instruction)).as(instruction).isTrue();
        }
        for (String instruction : List.of("The PDF must define the expected response time.",
                "Submit an SDD including the architectural diagram.",
                "Provide a PDF with readable diagrams.", "Upload a file accessible to anyone with the link.")) {
            assertThat(AiReviewEvidencePolicy.submissionOnlyAuthority(instruction)).as(instruction).isFalse();
        }
    }

    @Test void weakAuthorityCheckIsDiscardedWithoutLosingDocumentBackedObservations() {
        String evidence = "The service shall retain immutable response revisions and reject stale updates.";
        var technical = check("Response revision design", AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS,
            evidence, "Submit your Refactored SDD as a PDF Drive file.");
        var descriptive = check("Response revisions are described", AiReviewProvider.FindingSource.DOCUMENT,
            evidence, "");
        var result = process(List.of(technical, descriptive), "1. Design\n" + evidence, null,
            "Submit your Refactored SDD as a PDF Drive file.");
        assertThat(result.verifiedChecks()).containsExactly(descriptive);
    }

    @Test void dependencyStatementCannotVerifyReliabilityRequirements() {
        String evidence = "The system relies completely on an active cloud database server to log transaction states.";
        assertThat(process(List.of(check("Reliability requirements", AiReviewProvider.FindingSource.DOCUMENT,
            evidence, "")), "1. Assumptions\n" + evidence, null, "").verifiedChecks()).isEmpty();
        assertThat(AiReviewEvidencePolicy.aspectMismatch("Reliability requirements",
            "The service relies on three replicas for automatic failover and 99.9% availability.")).isFalse();
        assertThat(AiReviewEvidencePolicy.aspectMismatch("Reliability requirements",
            "The system shall provide retries and a cached fallback if the database is unavailable.")).isFalse();
        assertThat(AiReviewEvidencePolicy.aspectMismatch("Cloud service dependencies", evidence)).isFalse();
    }

    @Test void introductoryPurposeDoesNotVerifyArchitectureTechnologies() {
        assertThat(AiReviewEvidencePolicy.aspectMismatch("Application Structure and Technologies",
            "This document specifies how the application implements the functional and non-functional requirements."))
            .isTrue();
        assertThat(AiReviewEvidencePolicy.aspectMismatch("Application Architecture and Technologies",
            "This document describes the functional and non-functional requirements using a React frontend and Java backend."))
            .isFalse();
    }

    @Test void namingTheRegulatorDoesNotVerifySystemCompliance() {
        assertThat(AiReviewEvidencePolicy.aspectMismatch("Data Privacy Enforcement Compliance",
            "Enforcement is overseen by the National Privacy Commission (NPC).")).isTrue();
        assertThat(AiReviewEvidencePolicy.aspectMismatch("Privacy regulator is identified",
            "Enforcement is overseen by the National Privacy Commission (NPC).")).isFalse();
    }

    @Test void aSingleMockupIdentityCannotContradictABlankProjectTitle() {
        var allegation = new AiReviewProvider.Finding("Internal contradiction regarding project identity and UI mockups for a different project.",
            AiReviewProvider.FindingSource.DOCUMENT, "SchedEase Smart Appointment Scheduling", "");
        assertThat(AiReviewEvidencePolicy.unsupportedIdentityContradiction(allegation,
            "Project Title:\n\nPrepared By: Student\nSchedEase Smart Appointment Scheduling")).isTrue();
        assertThat(AiReviewEvidencePolicy.unsupportedIdentityContradiction(allegation,
            "Project Title: FarmTrack\nPrepared By: Student\nSchedEase Smart Appointment Scheduling")).isFalse();
        var genericTitle = new AiReviewProvider.Finding("Internal contradiction in project identity and branding.",
            AiReviewProvider.FindingSource.DOCUMENT,
            "UI screenshots reference SchedEase, whereas the cover identifies Systems Integration and Architecture 1 Functional Requirements Specification.", "");
        assertThat(AiReviewEvidencePolicy.unsupportedIdentityContradiction(genericTitle,
            "Project Title:\nPrepared By: Student\nSchedEase Smart Appointment Scheduling")).isTrue();
    }

    @Test void recheckAcceptanceCriterionDoesNotVerifyHumanArtifactAcceptance() {
        String evidence = "Acceptance: A recheck targets the selected artifact and does not overwrite another workspace.";
        assertThat(AiReviewEvidencePolicy.aspectMismatch("Artifact Acceptance", evidence)).isTrue();
        assertThat(AiReviewEvidencePolicy.aspectMismatch("Artifact recheck acceptance criterion", evidence)).isFalse();
        assertThat(AiReviewEvidencePolicy.aspectMismatch("Artifact Acceptance",
            "Authorized staff may approve the artifact after its recheck and record the acceptance decision.")).isFalse();
    }

    @Test void missingProviderLocationIsFilledOnlyWhenTheQuoteIdentifiesOnePhysicalPage() {
        String evidence = "The archive preserves the source revision and its submission timestamp.";
        var check = check("Archive provenance", AiReviewProvider.FindingSource.DOCUMENT, evidence, "");
        var inspection = new PdfInspection(true, false, 2, 2, evidence.length(),
            "1. Archive\n" + evidence, "", List.of(
                new PdfInspection.PageText(1, "1. Archive", false),
                new PdfInspection.PageText(2, evidence, false)));
        var result = process(List.of(check), inspection.extractedText(), inspection, "");
        assertThat(result.verifiedChecks()).hasSize(1);
        assertThat(result.verifiedChecks().getFirst().location())
            .isEqualTo(new AiReviewProvider.EvidenceLocation(2, null));
        var repeated = new PdfInspection(true, false, 2, 2, evidence.length(),
            inspection.extractedText(), "", List.of(
                new PdfInspection.PageText(1, evidence, false),
                new PdfInspection.PageText(2, evidence, false)));
        assertThat(process(List.of(check), repeated.extractedText(), repeated, "")
            .verifiedChecks().getFirst().location()).isNull();
    }

    private static AiReviewProvider.VerifiedCheck check(String aspect, AiReviewProvider.FindingSource source,
            String evidence, String requirement) {
        return new AiReviewProvider.VerifiedCheck(aspect, source, evidence, requirement);
    }

    private static AiReviewProvider.Result process(List<AiReviewProvider.VerifiedCheck> checks, String text,
            PdfInspection inspection, String instructions) {
        var raw = new AiReviewProvider.Result("Review", List.of(), List.of(), List.of(), "Inspect", checks);
        return inspection == null
            ? AiReviewService.postprocessForBenchmark(raw, "SDD", instructions, "", text)
            : AiReviewService.postprocessForBenchmark(raw, "SDD", instructions, "", inspection);
    }
}
