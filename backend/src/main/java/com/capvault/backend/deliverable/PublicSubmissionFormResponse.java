package com.capvault.backend.deliverable;

import com.capvault.backend.workspace.AcademicWorkspaceResponse;

/** The small, intentional anonymous surface for a published submission link. */
public record PublicSubmissionFormResponse(
    AcademicWorkspaceResponse workspace,
    DeliverableResponse deliverable
) {
}
