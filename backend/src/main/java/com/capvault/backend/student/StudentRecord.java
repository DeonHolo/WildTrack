package com.capvault.backend.student;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "academic_student_records")
public class StudentRecord {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "student_number", length = 80)
    private String studentNumber;

    @Column(name = "student_name", nullable = false, length = 240)
    private String studentName;

    @Column(name = "team_code", nullable = false, length = 160)
    private String teamCode;

    @Column(name = "team_formation_code", length = 160)
    private String teamFormationCode;

    @Column(name = "member_number", length = 40)
    private String memberNumber;

    @Column(name = "section_name", length = 120)
    private String sectionName;

    @Column(name = "adviser_name", length = 200)
    private String adviserName;

    @Column(name = "software_title", length = 500)
    private String softwareTitle;

    @Column(name = "current_active", nullable = false)
    private Boolean currentActive = true;

    @Column(name = "institutional_email", length = 240)
    private String institutionalEmail;

    @Column(name = "source_row_number")
    private Integer sourceRowNumber;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected StudentRecord() {
    }

    public StudentRecord(
        UUID workspaceId,
        String studentNumber,
        String studentName,
        String teamCode,
        String memberNumber,
        String sectionName,
        String adviserName,
        String institutionalEmail,
        Integer sourceRowNumber
    ) {
        this.workspaceId = workspaceId;
        this.studentNumber = normalizeNullable(studentNumber);
        this.studentName = studentName;
        this.teamCode = teamCode;
        this.teamFormationCode = teamCode;
        this.memberNumber = normalizeNullable(memberNumber);
        this.sectionName = normalizeNullable(sectionName);
        this.adviserName = normalizeNullable(adviserName);
        this.institutionalEmail = normalizeNullable(institutionalEmail);
        this.sourceRowNumber = sourceRowNumber;
        this.updatedAt = LocalDateTime.now();
        this.currentActive = true;
    }

    public StudentRecord(
        UUID workspaceId,
        String studentNumber,
        String studentName,
        String teamCode,
        String teamFormationCode,
        String memberNumber,
        String sectionName,
        String adviserName,
        String institutionalEmail,
        String softwareTitle,
        Integer sourceRowNumber
    ) {
        this.workspaceId = workspaceId;
        this.studentNumber = normalizeNullable(studentNumber);
        this.studentName = studentName;
        this.teamCode = teamCode;
        this.teamFormationCode = normalizeNullable(teamFormationCode);
        this.memberNumber = normalizeNullable(memberNumber);
        this.sectionName = normalizeNullable(sectionName);
        this.adviserName = normalizeNullable(adviserName);
        this.institutionalEmail = normalizeNullable(institutionalEmail);
        this.softwareTitle = normalizeNullable(softwareTitle);
        this.sourceRowNumber = sourceRowNumber;
        this.updatedAt = LocalDateTime.now();
        this.currentActive = true;
    }

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (updatedAt == null) {
            updatedAt = LocalDateTime.now();
        }
    }

    public void updateFrom(
        String studentNumber,
        String studentName,
        String teamCode,
        String memberNumber,
        String sectionName,
        String adviserName,
        String institutionalEmail,
        Integer sourceRowNumber
    ) {
        this.studentNumber = normalizeNullable(studentNumber);
        this.studentName = studentName;
        this.teamCode = teamCode;
        this.memberNumber = normalizeNullable(memberNumber);
        this.sectionName = normalizeNullable(sectionName);
        this.adviserName = normalizeNullable(adviserName);
        this.institutionalEmail = normalizeNullable(institutionalEmail);
        this.sourceRowNumber = sourceRowNumber;
        this.updatedAt = LocalDateTime.now();
    }

    public void updateFromTeamFormation(
        String studentNumber,
        String studentName,
        String sourceTeamCode,
        String memberNumber,
        String sectionName,
        String adviserName,
        String institutionalEmail,
        Integer sourceRowNumber
    ) {
        String previousFormationCode = this.teamFormationCode;
        boolean currentTeamStillComesFromTeamFormation = this.teamCode == null
            || (previousFormationCode != null && this.teamCode.equalsIgnoreCase(previousFormationCode));
        this.studentNumber = normalizeNullable(studentNumber);
        this.studentName = studentName;
        this.teamFormationCode = normalizeNullable(sourceTeamCode);
        if (currentTeamStillComesFromTeamFormation) {
            this.teamCode = sourceTeamCode;
            this.memberNumber = normalizeNullable(memberNumber);
            this.sectionName = normalizeNullable(sectionName);
            this.adviserName = normalizeNullable(adviserName);
        }
        this.institutionalEmail = normalizeNullable(institutionalEmail);
        this.sourceRowNumber = sourceRowNumber;
        this.updatedAt = LocalDateTime.now();
    }

    public void updateFromTracker(
        String studentNumber,
        String studentName,
        String currentTeamCode,
        String memberNumber,
        String sectionName,
        String adviserName,
        String softwareTitle,
        Integer sourceRowNumber
    ) {
        this.studentNumber = normalizeNullable(studentNumber);
        this.studentName = studentName;
        this.teamCode = currentTeamCode;
        this.memberNumber = normalizeNullable(memberNumber);
        this.sectionName = normalizeNullable(sectionName);
        this.adviserName = normalizeNullable(adviserName);
        this.softwareTitle = normalizeNullable(softwareTitle);
        this.sourceRowNumber = sourceRowNumber;
        this.updatedAt = LocalDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getWorkspaceId() {
        return workspaceId;
    }

    public String getStudentNumber() {
        return studentNumber;
    }

    public String getStudentName() {
        return studentName;
    }

    public String getTeamCode() {
        return teamCode;
    }

    public String getTeamFormationCode() {
        return teamFormationCode;
    }

    public String getMemberNumber() {
        return memberNumber;
    }

    public String getSectionName() {
        return sectionName;
    }

    public String getAdviserName() {
        return adviserName;
    }

    public String getSoftwareTitle() {
        return softwareTitle;
    }

    public boolean isCurrentActive() {
        return Boolean.TRUE.equals(currentActive);
    }

    public void setCurrentActive(boolean currentActive) {
        this.currentActive = currentActive;
        this.updatedAt = LocalDateTime.now();
    }

    public String getInstitutionalEmail() {
        return institutionalEmail;
    }

    public Integer getSourceRowNumber() {
        return sourceRowNumber;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
