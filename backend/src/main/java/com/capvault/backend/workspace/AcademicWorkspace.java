package com.capvault.backend.workspace;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
    name = "academic_workspaces",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_academic_workspace_identity",
        columnNames = {"program", "course_code", "semester", "academic_year"}
    )
)
public class AcademicWorkspace {

    public static final UUID DEFAULT_IT_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    public static final UUID DEFAULT_CS_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");

    @Id
    private UUID id;

    @Column(name = "name", nullable = false, length = 240)
    private String name;

    @Column(name = "program", nullable = false, length = 80)
    private String program;

    @Column(name = "course_code", nullable = false, length = 120)
    private String courseCode;

    @Column(name = "semester", nullable = false, length = 80)
    private String semester;

    @Column(name = "academic_year", nullable = false, length = 40)
    private String academicYear;

    @Column(name = "active", nullable = false)
    private boolean active;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected AcademicWorkspace() {
    }

    public AcademicWorkspace(
        String name,
        String program,
        String courseCode,
        String semester,
        String academicYear,
        boolean active
    ) {
        this.name = name;
        this.program = program;
        this.courseCode = courseCode;
        this.semester = semester;
        this.academicYear = academicYear;
        this.active = active;
    }

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getProgram() {
        return program;
    }

    public void setProgram(String program) {
        this.program = program;
    }

    public String getCourseCode() {
        return courseCode;
    }

    public void setCourseCode(String courseCode) {
        this.courseCode = courseCode;
    }

    public String getSemester() {
        return semester;
    }

    public void setSemester(String semester) {
        this.semester = semester;
    }

    public String getAcademicYear() {
        return academicYear;
    }

    public void setAcademicYear(String academicYear) {
        this.academicYear = academicYear;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}

