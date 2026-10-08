package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import com.capvault.backend.filecheck.PdfInspector;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** Deterministic post-processing, never Gemini, on sanitized PDF fixtures and unrelated templates. */
class AiReviewTemplateCrosscheckTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Path SRS = Path.of("docs/capstone-2-build/benchmarks/srs");

    private static Path root() {
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        return Files.isRegularFile(cwd.resolve("backend/pom.xml")) ? cwd : cwd.getParent();
    }

    private static String pdf(String name) throws Exception {
        var inspection = new PdfInspector().inspect(Files.readAllBytes(root().resolve(SRS)
            .resolve("fixtures").resolve(name + ".pdf")));
        assertThat(inspection.readable()).isTrue();
        return inspection.extractedText();
    }

    private static AiReviewProvider.Result raw(String id) throws Exception {
        Path result = root().resolve(SRS).resolve("results/srs-followup-20260921")
            .resolve(id).resolve("raw-report.json");
        return JSON.readValue(Files.readAllBytes(result), AiReviewProvider.Result.class);
    }

    private static AiReviewProvider.Result replay(String id, String fixture) throws Exception {
        return AiReviewService.postprocessForBenchmark(raw(id), "Software Requirements Specification (SRS)",
            Files.readString(root().resolve(SRS).resolve("SRS_AI_INSTRUCTIONS.txt")),
            pdf("SRS-01_template-only"), pdf(id + "_" + fixture));
    }

    @Test void realProviderOmissionOfTocOnlyHeadingIsAdvisoryAndNeverFabricatedRequiredSection() throws Exception {
        var original = raw("SRS-04");
        assertThat(original.missingRequiredSections()).isEmpty();
        var corrected = replay("SRS-04", "toc-only-heading");
        assertThat(corrected.verificationNotes()).anySatisfy(f -> {
            assertThat(f.source()).isEqualTo(AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE);
            assertThat(f.issue()).contains("Constraints", "could not be located", "confirm equivalent");
            assertThat(f.requirement()).contains("Constraints");
        });
        assertThat(corrected.missingRequiredSections()).isEmpty();
        assertThat(corrected.limitations()).anyMatch(s -> s.contains("advisory"));
        assertThat(corrected.findings()).noneMatch(f -> f.issue().startsWith("Mapped-template"));
    }


    @Test void whollyOmittedSubheadingCanBeFoundWithoutAnyProviderFinding() throws Exception {
        assertThat(raw("SRS-05").findings()).isEmpty();
        var corrected = replay("SRS-05", "section-missing");
        assertThat(corrected.verificationNotes()).anySatisfy(f -> {
            assertThat(f.issue()).contains("Communications interfaces", "confirm equivalent");
            assertThat(f.requirement()).contains("Communications interfaces");
        });
        assertThat(corrected.missingRequiredSections()).isEmpty();
        assertThat(corrected.findings()).noneMatch(f ->
            f.issue().contains("Software interfaces") || f.issue().contains("Hardware interfaces"));
    }

    @Test void completeOrPartiallyPopulatedBodiesDoNotProduceMissingHeadingAlerts() throws Exception {
        for (String[] fixture : List.of(
                new String[]{"SRS-01", "template-only"},
                new String[]{"SRS-02", "completed"},
                new String[]{"SRS-03", "partially-complete"})) {
            var corrected = replay(fixture[0], fixture[1]);
            assertThat(corrected.findings()).noneMatch(f -> f.issue().startsWith("Mapped-template body heading"));
        }
    }

    @Test void bogusDocumentRequirementIsNotElevatedToMappedAuthority() throws Exception {
        var checked = replay("SRS-06", "bogus-requirement");
        assertThat(checked.findings()).noneMatch(f ->
            f.issue().startsWith("Mapped-template body heading") && f.issue().contains("Quantum Registry"));
        assertThat(checked.missingRequiredSections()).noneMatch(m ->
            m.section().contains("Quantum Registry"));
    }

    @Test void explicitOptionalAndConditionalSectionsNeverBecomeMissingOrMandatory() {
        String mapped = """
            Document Outline
            1. Overview
            A complete overview paragraph about a hypothetical system and its users.
            2. Risk Assessment (optional)
            Optional: may be omitted by teams without risks.
            3. Performance Requirements
            Include measurable response time and throughput where applicable.
            4. Audit Appendix
            If applicable, attach supporting records.
            5. Functional Interfaces
            Describe interfaces provided by the hypothetical system.
            """;
        String submitted = """
            Document Outline
            1. Overview
            This text outlines a hypothetical system and its users.
            5. Functional Interfaces
            The system has a web interface and JSON API.
            """;
        var findings = AiReviewGroundingPolicy.templateBodyCrosscheck(mapped, submitted,
            "", List.of(), List.of());
        assertThat(findings).noneMatch(f ->
            f.issue().contains("Risk Assessment") || f.issue().contains("Performance Requirements")
                || f.issue().contains("Audit Appendix"));
    }

    @Test void pureLeaderlessTocWithoutProvableBodyAnchorDoesNotTriggerCrosscheck() {
        String template = """
            Table of Contents
            1. Overview
            1.1. Scope
            1.2. Constraints
            1. Overview
            The example project is described in this body paragraph.
            1.1. Scope
            This describes the actual in-scope behavior.
            1.2. Constraints
            The prototype has limits.
            """;
        String uncertain = """
            Table of Contents
            1. Overview
            1.1. Scope
            1.2. Constraints
            """;
        assertThat(AiReviewGroundingPolicy.templateBodyCrosscheck(template, uncertain,
            "", List.of(), List.of())).isEmpty();
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(uncertain, "Constraints")).isFalse();
    }

    @Test void anotherDocumentTypeUsesTheSamePolicyWithoutHardcodedSrsHeadings() {
        String template = """
            Table of Contents
            1. Project Context ........... 1
            1.1. Release Scope ............ 2
            1.2. Risk Register ............ 3
            1. Project Context
            The fictional project context describes a limited local queue application for controlled test cases.
            1.1. Release Scope
            The project release scope includes request validation and deterministic queue state changes.
            1.2. Risk Register
            Applicable risks.
            """;
        String document = """
            Table of Contents
            1. Project Context ........... 1
            1.1. Release Scope ............ 2
            1.2. Risk Register ............ 3
            1. Project Context
            The fictional project context describes a limited local queue application for controlled test cases.
            1.1. Release Scope
            The project release scope includes request validation and deterministic queue state changes.
            """;
        var findings = AiReviewGroundingPolicy.templateBodyCrosscheck(template, document,
            "", List.of(), List.of());
        assertThat(findings).anyMatch(f -> f.issue().contains("Risk Register"));
        assertThat(findings).noneMatch(f -> f.issue().contains("Project Context") || f.issue().contains("Release Scope"));
    }

    @Test void noMappedTemplateMeansNoCrosscheckRegardlessOfInstructions() {
        assertThat(AiReviewGroundingPolicy.templateBodyCrosscheck("", "1. Overview",
            "Include a Software Architecture section.", List.of(), List.of())).isEmpty();
    }

    @Test void optionalTemplateScopeDoesNotCreateATransactionArtifactWarning() {
        String template = """
            1. Functional Requirements
            Example transaction structure follows.
            2. Quality Requirements
            Example quality criteria follow.
            Module 1
            1.1 Transaction Name
            Use Case Description
            Example description.
            Use Case Diagram
            Activity Diagram
            """;
        String document = """
            1. Functional Requirements
            Project-specific transaction structure follows.
            2. Quality Requirements
            Project-specific quality criteria follow.
            Module 1: Account Access
            1.1 Create Account
            Use Case Description
            The user creates an account.
            Activity Diagram
            """;
        assertThat(AiReviewGroundingPolicy.templateBodyCrosscheck(template, document,
            "All template sections are optional.", List.of(), List.of()))
            .noneMatch(finding -> finding.issue().contains("Use Case Diagram"));
    }

    @Test void qualifiedUseCaseDiagramCaptionCountsInsideTheFirstTransaction() {
        String template = """
            1. Functional Requirements
            Example transaction structure follows.
            2. Quality Requirements
            Example quality criteria follow.
            Module 1
            1.1 Transaction Name
            Use Case Description
            Example description.
            Use Case Diagram
            Activity Diagram
            """;
        String document = """
            1. Functional Requirements
            Project-specific transaction structure follows.
            2. Quality Requirements
            Project-specific quality criteria follow.
            Module 1: Account Access
            1.1 Create Account
            Use Case Description
            The user creates an account.
            Figure 1: Use Case Diagram
            Activity Diagram
            """;
        assertThat(AiReviewGroundingPolicy.templateBodyCrosscheck(template, document,
            "", List.of(), List.of()))
            .noneMatch(finding -> finding.issue().contains("Use Case Diagram"));
    }

    @Test void emptyUseCaseDiagramLabelDoesNotCountAsArtifactContent() {
        String template = """
            1. Functional Requirements
            Example transaction structure follows.
            2. Quality Requirements
            Example quality criteria follow.
            Module 1
            1.1 Transaction Name
            Use Case Description
            Example description.
            Use Case Diagram
            Activity Diagram
            """;
        String document = """
            1. Functional Requirements
            Project-specific transaction structure follows.
            2. Quality Requirements
            Project-specific quality criteria follow.
            Module 1: Account Access
            1.1 Create Account
            Use Case Description
            The user creates an account.
            Use Case Diagram
            Activity Diagram
            Start -> validate -> authorize -> persist
            Wireframe
            Account form with submit and status controls.
            """;
        assertThat(AiReviewGroundingPolicy.templateBodyCrosscheck(template, document,
            "", List.of(), List.of()))
            .anyMatch(finding -> finding.issue().contains("Use Case Diagram"));
    }

    @Test void missingActivityDiagramInFirstTransactionIsDetected() {
        String template = """
            1. Functional Requirements
            Example transaction structure follows.
            2. Quality Requirements
            Example quality criteria follow.
            Module 1
            1.1 Transaction Name
            Use Case Description
            Example description.
            Use Case Diagram
            Example diagram.
            Activity Diagram
            Example activity.
            Wireframe
            Example wireframe.
            """;
        String document = """
            1. Functional Requirements
            Project-specific transaction structure follows.
            2. Quality Requirements
            Project-specific quality criteria follow.
            Module 1: Account Access
            1.1 Create Account
            Use Case Description
            The user creates an account.
            Use Case Diagram
            Actor -> validate -> authorize -> persist
            Wireframe
            Account form with submit and status controls.
            """;
        assertThat(AiReviewGroundingPolicy.templateBodyCrosscheck(template, document,
            "", List.of(), List.of()))
            .anyMatch(finding -> finding.issue().contains("Activity Diagram"));
    }

    @Test void providerCannotPromoteAnExplicitlyOptionalTemplateHeadingToRequired() {
        String template = """
            1. Project Overview
            The fictional project requirements and scope.
            2. Illustrations (Optional)
            Optional: example diagrams are not required.
            3. Interfaces
            The fictional system interfaces.
            """;
        String pdf = """
            1. Project Overview
            The fictional project requirements and scope are documented.
            3. Interfaces
            The system provides a local JSON interface.
            """;
        var optional = new AiReviewProvider.MissingRequiredSection("2. Illustrations",
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE, "2. Illustrations (Optional)");
        var required = new AiReviewProvider.MissingRequiredSection("4. Acceptance Criteria",
            AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS,
            "The submission must include a 4. Acceptance Criteria section.");
        var raw = new AiReviewProvider.Result("Model review", List.of(),
            List.of(optional, required), List.of(), "Model action");
        var checked = AiReviewService.postprocessForBenchmark(raw, "Software Requirements Specification",
            "The submission must include a 4. Acceptance Criteria section.", template, pdf);
        assertThat(checked.missingRequiredSections()).containsExactly(required);
        assertThat(checked.findings()).noneMatch(f -> f.issue().contains("Illustrations"));
    }

    @Test void appendedCrosscheckNeverExceedsTheExistingFiftyFindingBound() {
        String template = """
            1. Introduction
            This hypothetical document describes an imaginary project and its interface.
            2. Operations
            The process includes requests and successful responses.
            3. Recovery
            The sample process describes failure handling.
            """;
        String pdf = """
            1. Introduction
            This hypothetical document describes an imaginary project and its interface.
            2. Operations
            The process includes requests and successful responses.
            """;
        var observations = new java.util.ArrayList<AiReviewProvider.Finding>();
        for (int i = 0; i < 50; i++) {
            observations.add(new AiReviewProvider.Finding("Observed document fact " + i,
                AiReviewProvider.FindingSource.DOCUMENT, "Page 1, paragraph " + i, ""));
        }
        var original = new AiReviewProvider.Result("Model review", List.copyOf(observations),
            List.of(), List.of(), "Model action");
        var processed = AiReviewService.postprocessForBenchmark(original, "Requirements Specification",
            "", template, pdf);
        assertThat(processed.findings()).hasSize(50).containsExactlyElementsOf(observations);
    }

    @Test void repeatedTemplateShapeDetectsMissingArtifactInLaterTransaction() {
        String template = """
            1. Functional Requirements
            Example transactions follow.
            2. Quality Requirements
            Quality requirements follow.
            Module 1
            1.1 Transaction Name
            Use Case Description
            Example description.
            Use Case Diagram
            Actor -> action -> result
            Activity Diagram
            Start -> action -> End
            Wireframe
            Example controls.
            1.2 Transaction Name
            Use Case Description
            Example description.
            Use Case Diagram
            Actor -> action -> result
            Activity Diagram
            Start -> action -> End
            Wireframe
            Example controls.
            """;
        String pdf = """
            1. Functional Requirements
            Project transactions follow.
            2. Quality Requirements
            Project quality requirements follow.
            Module 1: Dispatch
            1.1 Request Dispatch
            Use Case Description
            Request details are recorded.
            Use Case Diagram
            Requester -> submit -> service
            Activity Diagram
            Start -> validate -> save -> End
            Wireframe
            Asset | action | status
            1.2 Finalize Transfer
            Use Case Description
            Approval details are recorded.
            Use Case Diagram
            Custodian -> approve -> service
            Activity Diagram
            Start -> authorize -> save -> End
            """;
        var raw = new AiReviewProvider.Result("Model review", List.of(), List.of(), List.of(), "Model action");
        var processed = AiReviewService.postprocessForBenchmark(raw,
            "Software Requirements Specification", "", template, pdf);
        assertThat(processed.verificationNotes()).anyMatch(finding ->
            finding.issue().contains("Wireframe") && finding.issue().contains("1.2 Finalize Transfer"));
    }

    @Test void repeatedTemplateShapeDetectsPlaceholderOnlyArtifactInLaterTransaction() {
        String template = """
            1. Functional Requirements
            Example transactions follow.
            2. Quality Requirements
            Quality requirements follow.
            Module 1
            1.1 Transaction Name
            Use Case Description
            Example description.
            Use Case Diagram
            Actor -> action -> result
            Activity Diagram
            Start -> action -> End
            Wireframe
            Example controls.
            1.2 Transaction Name
            Use Case Description
            Example description.
            Use Case Diagram
            Actor -> action -> result
            Activity Diagram
            Start -> action -> End
            Wireframe
            Example controls.
            """;
        String pdf = """
            1. Functional Requirements
            Project transactions follow.
            2. Quality Requirements
            Project quality requirements follow.
            Module 1: Dispatch
            1.1 Request Dispatch
            Use Case Description
            Request details are recorded.
            Use Case Diagram
            Requester -> submit -> service
            Activity Diagram
            Start -> validate -> save -> End
            Wireframe
            Asset | action | status
            1.2 Finalize Transfer
            Use Case Description
            Approval details are recorded.
            Use Case Diagram
            Custodian -> approve -> service
            Activity Diagram
            Start -> authorize -> save -> End
            Wireframe
            TODO: replace this placeholder with the completed transaction wireframe
            """;
        var raw = new AiReviewProvider.Result("Model review", List.of(), List.of(), List.of(), "Model action");
        var processed = AiReviewService.postprocessForBenchmark(raw,
            "Software Requirements Specification", "", template, pdf);
        assertThat(processed.verificationNotes()).anyMatch(finding ->
            finding.issue().contains("Wireframe")
                && finding.issue().contains("1.2 Finalize Transfer")
                && finding.requirement().contains("Wireframe")
                && finding.evidence().equals("Wireframe"));
    }

    @Test void singleIllustrativeTemplateTransactionDoesNotImposeArtifactOnLaterTransactions() {
        String template = """
            1. Functional Requirements
            One illustrative transaction follows.
            2. Quality Requirements
            Quality requirements follow.
            Module 1
            1.1 Transaction Name
            Use Case Description
            Example description.
            Use Case Diagram
            Actor -> action -> result
            Activity Diagram
            Start -> action -> End
            Wireframe
            Example controls.
            """;
        String pdf = """
            1. Functional Requirements
            Project transactions follow.
            2. Quality Requirements
            Project quality requirements follow.
            Module 1: Dispatch
            1.1 Request Dispatch
            Use Case Description
            Request details are recorded.
            Use Case Diagram
            Requester -> submit -> service
            Activity Diagram
            Start -> validate -> save -> End
            Wireframe
            Asset | action | status
            1.2 Finalize Transfer
            Use Case Description
            Approval details are recorded.
            Use Case Diagram
            Custodian -> approve -> service
            Activity Diagram
            Start -> authorize -> save -> End
            """;
        assertThat(AiReviewGroundingPolicy.templateBodyCrosscheck(template, pdf, "", List.of(), List.of()))
            .noneMatch(finding -> finding.issue().contains("Wireframe")
                && finding.issue().contains("1.2 Finalize Transfer"));
    }

    @Test void providerFindingForFirstTransactionDoesNotHideLaterArtifactOmission() {
        String template = """
            1. Functional Requirements
            Example transactions follow.
            2. Quality Requirements
            Quality requirements follow.
            Module 1
            1.1 Transaction Name
            Use Case Description
            Example description.
            Use Case Diagram
            Actor -> action -> result
            Activity Diagram
            Start -> action -> End
            Wireframe
            Example controls.
            1.2 Transaction Name
            Use Case Description
            Example description.
            Use Case Diagram
            Actor -> action -> result
            Activity Diagram
            Start -> action -> End
            Wireframe
            Example controls.
            """;
        String pdf = """
            1. Functional Requirements
            Project transactions follow.
            2. Quality Requirements
            Project quality requirements follow.
            Module 1: Dispatch
            1.1 Request Dispatch
            Use Case Description
            Request details are recorded.
            Use Case Diagram
            Requester -> submit -> service
            Activity Diagram
            Start -> validate -> save -> End
            1.2 Finalize Transfer
            Use Case Description
            Approval details are recorded.
            Use Case Diagram
            Custodian -> approve -> service
            Activity Diagram
            Start -> authorize -> save -> End
            """;
        var firstOnly = new AiReviewProvider.Finding(
            "Transaction 1.1 Request Dispatch is missing its Wireframe.",
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE,
            "1.1 Request Dispatch has no Wireframe content.",
            "Wireframe");
        assertThat(AiReviewGroundingPolicy.templateBodyCrosscheck(
            template, pdf, "", List.of(firstOnly), List.of()))
            .anyMatch(finding -> finding.issue().contains("Wireframe")
                && finding.issue().contains("1.2 Finalize Transfer"));
    }

    @Test void explicitUnlistedExternalReferenceIsDetectedWithoutProviderFinding() {
        String template = """
            1.4 References
            Provide a complete list of all documents referenced elsewhere in the SRS;
            Identify each document by title, report number (if applicable), date, and publishing organization;
            Specify the sources from which the references can be obtained.
            """;
        String pdf = """
            1. Introduction
            This specification describes a fictional dispatch service.
            1.4 References
            No external documents are referenced by this SRS.
            2. Overall Description
            The platform coordinates fictional dispatch activity.
            3.1.2 Software interfaces
            Export behavior follows the Northwind Interchange Specification (NW-IS-204, 14 May 2026, HarborRelay Synthetic
            Lab Systems Office).
            """;
        var raw = new AiReviewProvider.Result("Model review", List.of(), List.of(), List.of(), "Model action");
        var processed = AiReviewService.postprocessForBenchmark(raw,
            "Software Requirements Specification", "", template, pdf);
        assertThat(processed.findings()).anyMatch(finding ->
            finding.source() == AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE
                && finding.issue().contains("Northwind Interchange Specification")
                && finding.issue().contains("NW-IS-204")
                && finding.requirement().contains("complete list of all documents referenced elsewhere"));
    }

    @Test void listedExternalReferenceAndGenericSpecificationPhraseRemainClean() {
        String template = """
            1.4 References
            Provide a complete list of all documents referenced elsewhere in the SRS;
            Identify each document by title, report number (if applicable), date, and publishing organization;
            """;
        String pdf = """
            1. Introduction
            This specification describes a fictional dispatch service.
            1.4 References
            Northwind Interchange Specification; report NW-IS-204; 14 May 2026; Northwind Lab.
            2. Overall Description
            A generic gateway specification is discussed as an internal design concept.
            3.1.2 Software interfaces
            Export behavior follows the Northwind Interchange Specification (NW-IS-204, 14 May 2026, Northwind Lab).
            """;
        assertThat(AiReviewGroundingPolicy.unlistedReferencesRequiredByTemplate(pdf, template)).isEmpty();
    }

    @Test void externalCitationWithoutMappedCompleteListRequirementDoesNotCreateFinding() {
        String template = """
            1.4 References
            Example references may be listed here.
            """;
        String pdf = """
            1. Introduction
            This specification describes a fictional dispatch service.
            1.4 References
            No external documents are listed.
            2. Overall Description
            Export behavior follows the Northwind Interchange Specification
            (NW-IS-204, 14 May 2026, Northwind Lab).
            """;
        assertThat(AiReviewGroundingPolicy.unlistedReferencesRequiredByTemplate(pdf, template)).isEmpty();
    }

    @Test void frozenV6QualifiedInlineArtifactLabelsRemainSubstantiveAfterPdfExtraction() throws Exception {
        Path repo = root();
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.isRegularFile(repo.resolve(
            "docs/capstone-2-build/WildTrack_SRS_Benchmark/reference/Official_SRS_TEMPLATE.pdf"))
            && Files.isRegularFile(repo.resolve("docs/capstone-2-build/benchmarks/srs-goal2-heldout-v6/fixtures/"
                + "G2V6-10_qualified_artifact_labels_clean.pdf")), "Optional frozen local benchmark is not present.");

        var inspector = new PdfInspector();
        String template = inspector.inspect(Files.readAllBytes(repo.resolve(
            "docs/capstone-2-build/WildTrack_SRS_Benchmark/reference/Official_SRS_TEMPLATE.pdf"))).extractedText();
        String submitted = inspector.inspect(Files.readAllBytes(repo.resolve(
            "docs/capstone-2-build/benchmarks/srs-goal2-heldout-v6/fixtures/"
                + "G2V6-10_qualified_artifact_labels_clean.pdf"))).extractedText();

        var findings = AiReviewGroundingPolicy.templateBodyCrosscheck(
            template, submitted, "", List.of(), List.of());

        assertThat(findings).noneMatch(finding -> finding.issue().contains("Wireframe"));
    }

    @Test void frozenV7DashQualifiedArtifactLabelsRemainSubstantiveAfterPdfExtraction() throws Exception {
        Path repo = root();
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.isRegularFile(repo.resolve(
            "docs/capstone-2-build/WildTrack_SRS_Benchmark/reference/Official_SRS_TEMPLATE.pdf"))
            && Files.isRegularFile(repo.resolve("docs/capstone-2-build/benchmarks/srs-goal2-heldout-v7/fixtures/"
                + "G2V7-01_qualified_dash_artifacts_clean.pdf")), "Optional frozen local benchmark is not present.");

        var inspector = new PdfInspector();
        String template = inspector.inspect(Files.readAllBytes(repo.resolve(
            "docs/capstone-2-build/WildTrack_SRS_Benchmark/reference/Official_SRS_TEMPLATE.pdf"))).extractedText();
        String submitted = inspector.inspect(Files.readAllBytes(repo.resolve(
            "docs/capstone-2-build/benchmarks/srs-goal2-heldout-v7/fixtures/"
                + "G2V7-01_qualified_dash_artifacts_clean.pdf"))).extractedText();

        var findings = AiReviewGroundingPolicy.templateBodyCrosscheck(
            template, submitted, "", List.of(), List.of());

        assertThat(findings).noneMatch(finding ->
            finding.issue().contains("Use Case Description")
                || finding.issue().contains("Use Case Diagram")
                || finding.issue().contains("Activity Diagram")
                || finding.issue().contains("Wireframe"));
    }

}
