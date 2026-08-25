package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.student.StudentAssociationService;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.response.FormResponseService;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Ticket 07 — Pilot capacity fixtures and cap verification.
 *
 * Generates 60 non-production student identities with realistic teams and
 * deliverables (none using real student personal data), proves the application
 * has no product-level 30- or 60-student cap, and exercises the submit path
 * at pilot scale.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PilotCapacityTest {

    @Autowired
    private AcademicWorkspaceRepository workspaceRepository;

    @Autowired
    private StudentRecordRepository studentRecordRepository;

    @Autowired
    private DeliverableRepository deliverableRepository;

    @Autowired
    private StudentAssociationService associationService;

    @Autowired
    private FormResponseService responseService;

    /**
     * No product-level 30-student or 60-student cap exists. 60 fixture students
     * are created, associated, and each successfully submits a response.
     */
    @Test
    void sixtyStudentsPilotSubmissionsSucceedWithNoCap() {
        AcademicWorkspace workspace = workspaceRepository.save(new AcademicWorkspace(
            "IT332 Pilot", "IT", "IT332", "Pilot Sem", "2099-00", true));
        UUID workspaceId = workspace.getId();

        Deliverable deliverable = deliverableRepository.save(new Deliverable(
            workspaceId, "SRS", "SRS Submission", "srs-week9",
            "Submit a PDF Drive link.",
            LocalDateTime.parse("2026-04-18T23:59:00"),
            true, DeliverableStatus.PUBLISHED));
        UUID deliverableId = deliverable.getId();

        // Generate 60 non-production student identities across 12 teams (5 per team)
        for (int i = 1; i <= 60; i++) {
            String teamNumber = String.format("%02d", ((i - 1) / 5) + 1);
            String memberNumber = String.valueOf(((i - 1) % 5) + 1);
            String studentNumber = String.format("25-%04d-%03d", 1000 + i, i);
            String studentName = "PILOT STUDENT " + String.format("%03d", i);
            String teamCode = "2526-sem2-it332-" + teamNumber;
            String section = "IT" + teamNumber;
            String adviserName = "Adviser " + teamNumber;

            studentRecordRepository.save(new StudentRecord(
                workspaceId, studentNumber, studentName, teamCode,
                memberNumber, section, adviserName, null, i));
        }

        // Associate and submit for all 60 students
        int successfulSubmissions = 0;
        for (int i = 1; i <= 60; i++) {
            String subject = "pilot-student-subject-" + i;
            String email = "pilot.student." + i + "@example.test";
            String studentNumber = String.format("25-%04d-%03d", 1000 + i, i);

            associationService.confirmAssociation(workspaceId, subject, email, studentNumber);

            FormResponseService.SaveResult result = responseService.submit(
                new FormResponseService.SubmitCommand(
                    workspaceId, deliverableId, subject, email,
                    Map.of("driveLink", "https://drive.example.test/pilot-" + i)));

            assertThat(result.changed()).isTrue();
            assertThat(result.response().getStudentNumber()).isEqualTo(studentNumber);
            successfulSubmissions++;
        }

        assertThat(successfulSubmissions)
            .as("All 60 pilot students should submit successfully with no product-level cap")
            .isEqualTo(60);

        // Verify all 60 responses are independently owned
        for (int i = 1; i <= 60; i++) {
            String subject = "pilot-student-subject-" + i;
            var response = responseService.ownedResponse(workspaceId, deliverableId, subject);
            assertThat(response)
                .as("Student " + i + " should own their response")
                .isPresent();
            assertThat(response.get().getValuesJson())
                .contains("pilot-" + i);
        }
    }

    /**
     * Students beyond 60 are also accepted — the application enforces no
     * artificial ceiling.
     */
    @Test
    void noCeilingBeyondSixtyStudents() {
        AcademicWorkspace workspace = workspaceRepository.save(new AcademicWorkspace(
            "IT332 Overflow", "IT", "IT332", "Overflow Sem", "2098-99", true));
        UUID workspaceId = workspace.getId();

        Deliverable deliverable = deliverableRepository.save(new Deliverable(
            workspaceId, "Final", "Final Output", "final-week14",
            "Submit the final output.",
            LocalDateTime.parse("2026-06-01T23:59:00"),
            true, DeliverableStatus.PUBLISHED));
        UUID deliverableId = deliverable.getId();

        // Create 75 students (beyond 60)
        for (int i = 1; i <= 75; i++) {
            String studentNumber = String.format("25-%04d-%03d", 2000 + i, i);
            String teamCode = "2526-sem2-it332-" + String.format("%02d", ((i - 1) / 5) + 1);
            studentRecordRepository.save(new StudentRecord(
                workspaceId, studentNumber, "OVERFLOW STUDENT " + i, teamCode,
                String.valueOf(((i - 1) % 5) + 1), "IT99", "Adviser Overflow", null, i));
        }

        // Submit for all 75
        for (int i = 1; i <= 75; i++) {
            String subject = "overflow-subject-" + i;
            String email = "overflow." + i + "@example.test";
            String studentNumber = String.format("25-%04d-%03d", 2000 + i, i);

            associationService.confirmAssociation(workspaceId, subject, email, studentNumber);
            FormResponseService.SaveResult result = responseService.submit(
                new FormResponseService.SubmitCommand(
                    workspaceId, deliverableId, subject, email,
                    Map.of("driveLink", "https://drive.example.test/overflow-" + i)));
            assertThat(result.changed()).isTrue();
        }
    }
}
