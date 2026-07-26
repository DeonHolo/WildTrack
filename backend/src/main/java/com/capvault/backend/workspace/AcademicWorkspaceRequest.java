package com.capvault.backend.workspace;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AcademicWorkspaceRequest(
    @NotBlank(message = "Workspace name is required")
    @Size(max = 240, message = "Workspace name is too long")
    String name,

    @NotBlank(message = "Program is required")
    @Size(max = 80, message = "Program is too long")
    String program,

    @NotBlank(message = "Course or section is required")
    @Size(max = 120, message = "Course or section is too long")
    String courseCode,

    @NotBlank(message = "Semester is required")
    @Size(max = 80, message = "Semester is too long")
    String semester,

    @NotBlank(message = "Academic year is required")
    @Size(max = 40, message = "Academic year is too long")
    String academicYear,

    Boolean active
) {
}

