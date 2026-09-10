package com.capvault.backend.project;

import java.time.LocalDateTime;
import java.util.UUID;

public record ProjectMetadataResponse(
    UUID id,
    String groupCode,
    String sourceGroupCode,
    String projectTitle,
    String softwareName,
    String description,
    String proposalRemarks,
    String demoComments,
    String adviserName,
    String projectStatus,
    String category,
    Integer sourceRowNumber,
    LocalDateTime updatedAt
) {

    public static ProjectMetadataResponse from(ProjectMetadata metadata) {
        return new ProjectMetadataResponse(
            metadata.getId(),
            metadata.getEffectiveGroupCode(),
            metadata.getGroupCode(),
            metadata.getProjectTitle(),
            metadata.getEffectiveSoftwareName(),
            metadata.getDescription(),
            metadata.getProposalRemarks(),
            metadata.getDemoComments(),
            metadata.getEffectiveAdviserName(),
            metadata.getProjectStatus(),
            metadata.getCategory(),
            metadata.getSourceRowNumber(),
            metadata.getUpdatedAt()
        );
    }
}
