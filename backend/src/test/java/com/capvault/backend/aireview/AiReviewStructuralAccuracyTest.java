package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import com.capvault.backend.filecheck.PdfInspection;
import java.util.List;
import org.junit.jupiter.api.Test;

class AiReviewStructuralAccuracyTest {
    private static final String TEMPLATE = """
        Software Requirements Specification
        1. Introduction
        This document defines the requirements for the project.
        3. Functional Requirements
        Module 1: Module Name
        1.1 Transaction Name
        Use Case Description
        Use Case Diagram
        Activity Diagram
        Wireframe
        1.2 Transaction Name
        Use Case Description
        Use Case Diagram
        Activity Diagram
        Wireframe
        """;

    @Test void equivalentUseCaseTablesAreDescriptionsAndMappingRowsAreNotTransactions() {
        String submitted = """
            1. Introduction
            This system records service requests and their current status.
            3. Functional Requirements
            Module 1: Service Records
            1.1 UC-EXT-01 Create record FR-EXT-01
            1.2 UC-EXT-02 Edit record FR-EXT-02
            UC-EXT-01 Create record
            Use Case Item Description
            Use Case Name Create record
            Primary Actor Vehicle owner
            Precondition The owner is authenticated.
            Trigger The owner chooses create record.
            Main Flow The service validates and saves the record.
            1. The owner submits the record.
            2. The system saves it and returns a receipt.
            Postcondition A durable record is available.
            Use Case Diagram: Owner -> Create
            Activity Diagram: Start -> Save -> End
            Wireframe: Record | Save
            """;
        assertThat(crosscheck(submitted, List.of())).isEmpty();
        String numbered = submitted.replace("UC-EXT-01 Create record\nUse Case Item Description",
            "1.1 Create record\nUse Case ID UC-EXT-01\nUse Case Item Description");
        assertThat(crosscheck(numbered, List.of())).isEmpty();
    }

    @Test void majorSectionWithTheSameNumberingRootDoesNotCreateAnotherTransaction() {
        String submitted = """
            1. Introduction
            This system records requests for staff review.
            3. Functional Requirements
            Module 3: Requests
            3.1 Submit request
            Use Case Description: A user submits a request and receives a receipt.
            Use Case Diagram: User -> Submit
            Activity Diagram: Start -> Submit -> End
            Wireframe: Request | Submit
            3.4 Non-functional requirements
            The system shall respond within two seconds under the defined workload.
            """;
        assertThat(crosscheck(submitted, List.of())).isEmpty();
    }

    @Test void longExplicitFigureCaptionsCanContainMissingInTheTransactionTitle() {
        String submitted = """
            1. Introduction
            This system tracks records needing correction.
            3. Functional Requirements
            Module 1: Validation
            Use Case ID UC-VAL-02
            Use Case Name Identify Missing Required and Flagged Fields
            Primary Actor Vehicle owner
            Preconditions The owner is signed in.
            Trigger The owner validates the record.
            Main Flow The service marks incomplete fields.
            Figure - Use Case Diagram for UC-VAL-02 Identify Missing Required and Flagged Fields
            Figure - Activity Diagram for UC-VAL-02 Identify Missing Required and Flagged Fields
            Figure - Low-Fidelity Wireframe for UC-VAL-02 Identify Missing Required and Flagged Fields
            """;
        assertThat(crosscheck(submitted, List.of())).isEmpty();
        assertThat(crosscheck(submitted.replace(
            "Figure - Use Case Diagram for UC-VAL-02 Identify Missing Required and Flagged Fields",
            "The Use Case Diagram is missing from this transaction."), List.of()))
            .anyMatch(f -> f.issue().contains("Use Case Diagram") && f.issue().contains("label was not located"));
    }

    @Test void documentTypeAdvisoryUsesAnExplicitFirstPageTitle() {
        var first = new PdfInspection.PageText(1, "FUNCTIONAL REQUIREMENTS\n  SPECIFICATION (FRS)\nProject Title:", false);
        assertThat(AiReviewCompletenessPolicy.documentTypeNotes("Refactored SRS", List.of(first)))
            .singleElement().satisfies(note -> assertThat(note.location().page()).isEqualTo(1));
        assertThat(AiReviewCompletenessPolicy.documentTypeNotes("Refactored FRS", List.of(first))).isEmpty();
        assertThat(AiReviewCompletenessPolicy.documentTypeNotes("Refactored SRS", List.of(
            new PdfInspection.PageText(1, "References include a Functional Requirements Specification.", false)))).isEmpty();
    }

    @Test void idBasedUseCaseTablesRevealUnlocatedFigureFamilies() {
        String submitted = """
            1. Introduction
            This system manages registration requests for a consortium.
            3. Functional Requirements
            Module 1: User Management
            Use Case ID UC-UM-01
            Use Case Name User Registration
            Primary Actor Guest user
            Preconditions User has an institutional email address.
            Trigger User chooses Register.
            Main Success Scenario
            The service validates the email and creates a pending application.
            Postconditions The application is saved for administrator review.
            """;
        var notes = crosscheck(submitted, List.of());
        assertThat(notes).hasSize(3).allSatisfy(note -> {
            assertThat(note.issue()).contains("UC-UM-01", "label was not located");
            assertThat(note.source()).isEqualTo(AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE);
        });
        assertThat(notes).noneMatch(note -> note.issue().contains("Use Case Description"));
    }

    @Test void labelledFigureOnFollowingPageDoesNotCreateASuspectedOmission() {
        String first = """
            1. Introduction
            This system manages registration requests and their status.
            3. Functional Requirements
            Module 1: Registration
            1.1 Register
            Use Case Description: A guest submits registration information.
            Use Case Diagram
            """;
        String second = "Activity Diagram: Start -> Save -> End\nWireframe: Email | Register";
        var notes = crosscheck(first + second, List.of(new PdfInspection.PageText(1, first, false,
            List.of(new PdfInspection.IllustratedArtifact("use case diagram", 2))),
            new PdfInspection.PageText(2, second, true)));
        assertThat(notes).isEmpty();
    }

    @Test void proseDescriptionNeverReceivesGraphicalInspectionWording() {
        String submitted = """
            1. Introduction
            This system manages registration requests for a consortium.
            3. Functional Requirements
            Module 1: Registration
            1.1 Register
            Use Case Description
            The guest submits information and receives a pending registration identifier.
            Use Case Diagram: Guest -> Register
            Activity Diagram: Start -> Save -> End
            Wireframe: Email | Register
            """;
        assertThat(crosscheck(submitted, List.of())).isEmpty();
    }

    @Test void compressedWordTemplateHeadingsStillEstablishBodyAndArtifactAuthority() {
        String template = "Table of Contents\n1.Introduction3\n3.Functional Requirements4\n4.Constraints5\n"
            + TEMPLATE + "4.Constraints\nProvide a description of the implementation constraints.";
        String submitted = "1.Introduction\nThis system manages registration requests for a consortium.\n"
            + "3.Functional Requirements\nModule 1: Registration\nUse Case ID UC-UM-01\n"
            + "Use Case Name Register\nPrimary Actor Guest user\nPreconditions The user has an email address.\n"
            + "Trigger The user chooses Register.\nMain Success Scenario The service creates a pending request.";
        assertThat(AiReviewGroundingPolicy.templateBodyCrosscheck(template, submitted, "", List.of(), List.of()))
            .anyMatch(note -> note.issue().contains("Use Case Diagram") && note.issue().contains("UC-UM-01"));
    }

    @Test void detectsUnfilledInstructionsButPreservesAuthoredSectionsAndRequirements() {
        String prompt = "Describe the purpose of the system and the intended audience of this document.";
        assertThat(AiReviewCompletenessPolicy.unresolvedInstructions("1.1 Purpose\n" + prompt + "\n1.2 Scope\n"
            + "Describe what the system will do and its boundaries.\n")).hasSize(2);
        assertThat(AiReviewCompletenessPolicy.unresolvedInstructions("1.1 Purpose\n" + prompt + "\n"
            + "The portal allows consortium members to submit and track registration requests.")).isEmpty();
        assertThat(AiReviewCompletenessPolicy.unresolvedInstructions("1.2 Scope\nDescribe the system and its scope.\n"
            + "1. Users shall submit requests.\n2. Staff shall review requests.\n1.3 Definitions\nTerms follow.")).isEmpty();
        assertThat(AiReviewCompletenessPolicy.unresolvedInstructions("3.1 Functional Requirements\n"
            + "The system shall list important terms used in this document.\n"
            + "Describe the system status is the name of the user action.\n"
            + "The service returns a status report.")).isEmpty();
    }

    private static List<AiReviewProvider.Finding> crosscheck(String document, List<PdfInspection.PageText> pages) {
        return AiReviewGroundingPolicy.templateBodyCrosscheck(TEMPLATE, document, "", List.of(), List.of(), pages);
    }
}
