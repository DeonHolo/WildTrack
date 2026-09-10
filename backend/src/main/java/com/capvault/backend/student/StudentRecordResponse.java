package com.capvault.backend.student;

import java.time.LocalDateTime;
import java.util.UUID;

public record StudentRecordResponse(
    UUID id,
    String studentNumber,
    String studentName,
    String teamCode,
    String teamFormationCode,
    String memberNumber,
    String sectionName,
    String adviserName,
    String softwareTitle,
    boolean currentActive,
    String institutionalEmail,
    Integer sourceRowNumber,
    LocalDateTime updatedAt
) {

    public static StudentRecordResponse from(StudentRecord record) {
        return new StudentRecordResponse(
            record.getId(),
            record.getStudentNumber(),
            record.getStudentName(),
            record.getTeamCode(),
            record.getTeamFormationCode(),
            record.getMemberNumber(),
            record.getSectionName(),
            record.getAdviserName(),
            record.getSoftwareTitle(),
            record.isCurrentActive(),
            record.getInstitutionalEmail(),
            record.getSourceRowNumber(),
            record.getUpdatedAt()
        );
    }
}
