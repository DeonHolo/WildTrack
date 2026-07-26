package com.capvault.backend.workspace;

import java.time.LocalDateTime;
import java.util.UUID;

public record AcademicWorkspaceResponse(
    UUID id,
    String name,
    String program,
    String courseCode,
    String semester,
    String academicYear,
    boolean active,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
    public static AcademicWorkspaceResponse from(AcademicWorkspace workspace) {
        return new AcademicWorkspaceResponse(
            workspace.getId(),
            workspace.getName(),
            workspace.getProgram(),
            workspace.getCourseCode(),
            workspace.getSemester(),
            workspace.getAcademicYear(),
            workspace.isActive(),
            workspace.getCreatedAt(),
            workspace.getUpdatedAt()
        );
    }
}

