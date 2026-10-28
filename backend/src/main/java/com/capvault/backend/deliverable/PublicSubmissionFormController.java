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
    private final DeliverableShareLinkService shareLinks;

    public PublicSubmissionFormController(
        AcademicWorkspaceService workspaceService,
        DeliverableService deliverableService,
        DeliverableShareLinkService shareLinks
    ) {
        this.workspaceService = workspaceService;
        this.deliverableService = deliverableService;
        this.shareLinks = shareLinks;
    }

    @GetMapping("/share/{token}")
    public PublicSubmissionFormResponse getSharedForm(@PathVariable String token, jakarta.servlet.http.HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Robots-Tag", "noindex, nofollow");
        var form = shareLinks.requireToken(token);
        var workspace = workspaceService.require(form.getWorkspaceId());
        return new PublicSubmissionFormResponse(AcademicWorkspaceResponse.from(workspace),
            deliverableService.getPublishedDeliverableBySlug(workspace.getId(), form.getSlug()));
    }

    @GetMapping("/{workspaceKey}/{slug}")
    public PublicSubmissionFormResponse getPublishedForm(
        @PathVariable String workspaceKey,
        @PathVariable String slug,
        jakarta.servlet.http.HttpServletRequest request,
        jakarta.servlet.http.HttpServletResponse response
    ) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Robots-Tag", "noindex, nofollow");
        var workspace = workspaceService.requireActivePublicKey(workspaceKey);
        if (!shareLinks.hasExistingAccess(workspace.getId(), request))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Published form was not found.");
        return new PublicSubmissionFormResponse(
            AcademicWorkspaceResponse.from(workspace),
            deliverableService.getPublishedDeliverableBySlug(workspace.getId(), slug)
        );
    }
}
