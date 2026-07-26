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

    @Column(name = "member_number", length = 40)
    private String memberNumber;

    @Column(name = "section_name", length = 120)
    private String sectionName;

    @Column(name = "adviser_name", length = 200)
    private String adviserName;

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
        this.memberNumber = normalizeNullable(memberNumber);
        this.sectionName = normalizeNullable(sectionName);
        this.adviserName = normalizeNullable(adviserName);
        this.institutionalEmail = normalizeNullable(institutionalEmail);
        this.sourceRowNumber = sourceRowNumber;
        this.updatedAt = LocalDateTime.now();
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

    public String getMemberNumber() {
        return memberNumber;
    }

    public String getSectionName() {
        return sectionName;
    }

    public String getAdviserName() {
        return adviserName;
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
