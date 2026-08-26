package com.capvault.backend.deliverable;

import com.capvault.backend.workspace.AcademicWorkspaceResponse;
import com.capvault.backend.workspace.AcademicWorkspaceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/forms")
public class PublicSubmissionFormController {

    private final AcademicWorkspaceService workspaceService;
    private final DeliverableService deliverableService;

    public PublicSubmissionFormController(
        AcademicWorkspaceService workspaceService,
        DeliverableService deliverableService
    ) {
        this.workspaceService = workspaceService;
        this.deliverableService = deliverableService;
    }

    @GetMapping("/{workspaceKey}/{slug}")
    public PublicSubmissionFormResponse getPublishedForm(
        @PathVariable String workspaceKey,
        @PathVariable String slug
    ) {
        var workspace = workspaceService.requireActivePublicKey(workspaceKey);
        return new PublicSubmissionFormResponse(
            AcademicWorkspaceResponse.from(workspace),
            deliverableService.getPublishedDeliverableBySlug(workspace.getId(), slug)
        );
    }
}
