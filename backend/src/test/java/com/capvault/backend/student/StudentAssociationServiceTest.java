package com.capvault.backend.student;

import java.time.Clock;
import java.util.UUID;

import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class StudentAssociationServiceTest {

    @Autowired
    private StudentAssociationService service;

    @Autowired
    private StudentRecordRepository studentRecordRepository;

    @Autowired
    private AcademicWorkspaceRepository workspaceRepository;

    @Autowired
    private StudentIdentityConflictRepository conflictRepository;

    private UUID workspaceId;

    @BeforeEach
    void seedWorkspaceAndRoster() {
        AcademicWorkspace workspace = workspaceRepository.save(new AcademicWorkspace("IT332 Sem 2 2026-27", "IT", "IT332", "Semester 1", "2026-27", true));
        workspaceId = workspace.getId();
        studentRecordRepository.save(new StudentRecord(
            workspaceId, "20-0649-750", "Deon Holo", "2526-sem2-it332-41", "1", "IT41", "Sir Adviser", null, 2));
        studentRecordRepository.save(new StudentRecord(
            workspaceId, "20-0000-001", "Other Student", "2526-sem2-it332-41", "2", "IT41", "Sir Adviser", null, 3));
    }

    @Test
    void confirmCreatesSelfDeclaredAssociation() {
        var view = service.confirmAssociation(workspaceId, "sub-A", "a@gmail.com", "20-0649-750");

        assertThat(view.assuranceLevel()).isEqualTo("SELF_DECLARED");
        assertThat(view.studentNumber()).isEqualTo("20-0649-750");
        assertThat(view.studentName()).isEqualTo("Deon Holo");
        assertThat(service.activeAssociation(workspaceId, "sub-A")).isPresent();
    }

    @Test
    void returningSessionReloadsAssociationWithoutReconfirming() {
        service.confirmAssociation(workspaceId, "sub-A", "a@gmail.com", "20-0649-750");
        var again = service.confirmAssociation(workspaceId, "sub-A", "a@gmail.com", "20-0649-750");

        assertThat(again.studentNumber()).isEqualTo("20-0649-750");
        // still exactly one active association for this subject
        assertThat(service.activeAssociation(workspaceId, "sub-A")).isPresent();
    }

    @Test
    void unknownStudentNumberIsRejected() {
        assertThatThrownBy(() -> service.confirmAssociation(workspaceId, "sub-B", "b@gmail.com", "NOPE"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void duplicateIdentityOnSameRecordRecordsConflictButStillAssociates() {
        service.confirmAssociation(workspaceId, "sub-A", "a@gmail.com", "20-0649-750");
        var second = service.confirmAssociation(workspaceId, "sub-B", "b@gmail.com", "20-0649-750");

        assertThat(second.studentNumber()).isEqualTo("20-0649-750");
        assertThat(conflictRepository.findAllByWorkspaceIdOrderByCreatedAtDesc(workspaceId)).hasSize(1);
        // both identities hold active associations independently
        assertThat(service.activeAssociation(workspaceId, "sub-A")).isPresent();
        assertThat(service.activeAssociation(workspaceId, "sub-B")).isPresent();
    }

    @Test
    void reselectingDifferentRecordDeactivatesPriorAssociation() {
        service.confirmAssociation(workspaceId, "sub-A", "a@gmail.com", "20-0649-750");
        service.confirmAssociation(workspaceId, "sub-A", "a@gmail.com", "20-0000-001");

        var current = service.activeAssociation(workspaceId, "sub-A").orElseThrow();
        assertThat(current.studentNumber()).isEqualTo("20-0000-001");
    }

    @Test
    void disconnectKeepsHistoryAndAllowsReconnect() {
        service.confirmAssociation(workspaceId, "sub-A", "a@gmail.com", "20-0649-750");
        service.disconnect(workspaceId, "sub-A");

        assertThat(service.activeAssociation(workspaceId, "sub-A")).isEmpty();

        service.confirmAssociation(workspaceId, "sub-A", "a@gmail.com", "20-0649-750");
        assertThat(service.activeAssociation(workspaceId, "sub-A")).isPresent();
    }

    @Test
    void rosterOptionsAreWorkspaceScopedOnly() {
        // seed a second workspace with its own roster entry
        AcademicWorkspace other = workspaceRepository.save(new AcademicWorkspace("CS Sem 1", "CS", "CS101", "Semester 1", "2026-27", true));
        studentRecordRepository.save(new StudentRecord(
            other.getId(), "99-9999-999", "CS Student", "cs-team", "1", "CS1", "Other Adviser", null, 1));

        var options = service.workspaceRosterOptions(workspaceId);

        assertThat(options).hasSize(2);
        assertThat(options).allSatisfy(o -> assertThat(o.teamCode()).startsWith("2526"));
    }
}
