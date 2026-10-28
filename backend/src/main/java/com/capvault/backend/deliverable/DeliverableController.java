package com.capvault.backend.deliverable;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/deliverables")
public class DeliverableController {

    private final DeliverableService service;
    private final com.capvault.backend.student.StudentAssociationSecurity security;
    private final DeliverableShareLinkService shareLinks;

    public DeliverableController(DeliverableService service, com.capvault.backend.student.StudentAssociationSecurity security, DeliverableShareLinkService shareLinks) {
        this.service = service;
        this.security = security;
        this.shareLinks = shareLinks;
    }

    @PostMapping("/{id}/share-link")
    public DeliverableShareLinkService.ShareLink shareLink(@PathVariable UUID id, @RequestParam UUID workspaceId,
            jakarta.servlet.http.HttpServletRequest request, jakarta.servlet.http.HttpServletResponse response) {
        if (!security.isAdmin(request)) throw new org.springframework.security.access.AccessDeniedException("Admin authorization required.");
        response.setHeader("Cache-Control", "no-store");
        return shareLinks.issue(workspaceId, id);
    }

    @GetMapping
    public List<DeliverableResponse> listDeliverables(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        jakarta.servlet.http.HttpServletRequest http
    ) {
        if (!security.isAdmin(http)) throw new org.springframework.security.access.AccessDeniedException("Admin authorization required.");
        return service.listDeliverables(workspaceId);
    }

    @GetMapping("/{id}")
    public DeliverableResponse getDeliverable(
        @PathVariable UUID id,
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        jakarta.servlet.http.HttpServletRequest http
    ) {
        if (!security.isAdmin(http)) throw new org.springframework.security.access.AccessDeniedException("Admin authorization required.");
        return service.getDeliverable(workspaceId, id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DeliverableResponse createDeliverable(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        @Valid @RequestBody DeliverableRequest request
    ) {
        return service.createDeliverable(workspaceId, request);
    }

    @PostMapping("/unpublish-all")
    public List<DeliverableResponse> unpublishAllDeliverables(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId
    ) {
        return service.unpublishAll(workspaceId);
    }

    @PutMapping("/{id}")
    public DeliverableResponse updateDeliverable(
        @PathVariable UUID id,
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        @Valid @RequestBody DeliverableRequest request
    ) {
        return service.updateDeliverable(workspaceId, id, request);
    }
}
