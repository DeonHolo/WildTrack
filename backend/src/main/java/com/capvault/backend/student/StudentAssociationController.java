package com.capvault.backend.student;

import java.util.List;
import java.util.UUID;

import com.capvault.backend.student.StudentAssociationService.AssociationView;
import com.capvault.backend.student.StudentAssociationService.AccountBindingView;
import com.capvault.backend.student.StudentAssociationService.AccountManagementView;
import com.capvault.backend.student.StudentAssociationService.ConflictDetail;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workspace/students")
public class StudentAssociationController {

    private final StudentAssociationService associationService;
    private final StudentAssociationSecurity security;
    private final StudentEntryService studentEntryService;
    private final com.capvault.backend.deliverable.DeliverableRepository deliverables;
    private final com.capvault.backend.workspace.AcademicWorkspaceService workspaces;
    private final com.capvault.backend.deliverable.DeliverableShareLinkService shareLinks;

    public StudentAssociationController(StudentAssociationService associationService, StudentAssociationSecurity security, StudentEntryService studentEntryService,
            com.capvault.backend.deliverable.DeliverableRepository deliverables,
            com.capvault.backend.workspace.AcademicWorkspaceService workspaces,
            com.capvault.backend.deliverable.DeliverableShareLinkService shareLinks) {
        this.associationService = associationService;
        this.security = security;
        this.studentEntryService = studentEntryService;
        this.deliverables = deliverables;
        this.workspaces = workspaces;
        this.shareLinks = shareLinks;
    }

    public record ConfirmRequest(@NotBlank String studentNumber, @NotBlank String studentName, UUID deliverableId, String shareToken) {
    }

    public record ConnectRequest(@NotBlank @jakarta.validation.constraints.Size(max=80) String studentNumber,
        @NotBlank @jakarta.validation.constraints.Size(max=240) String studentName,
        @NotBlank @jakarta.validation.constraints.Size(max=160) String teamCode) {}

    @PostMapping("/connect")
    public AssociationView connect(@Valid @RequestBody ConnectRequest body, HttpServletRequest request) {
        var session = security.requireSession(request);
        return studentEntryService.connect(session.googleSubject(), session.googleEmail(), body.studentNumber(), body.studentName(), body.teamCode());
    }

    @org.springframework.web.bind.annotation.ExceptionHandler(StudentEntryService.ThrottledException.class)
    public ResponseEntity<java.util.Map<String,String>> throttled() {
        return ResponseEntity.status(429).header("Retry-After", "60")
            .body(java.util.Map.of("error", "Too many attempts. Wait a minute before trying again."));
    }

    public record ConflictDecisionRequest(@NotBlank String decision, String note, String confirmedSubject) {
    }

    public record RecoverAccountRequest(@NotBlank String confirmedSubject) {
    }

    @GetMapping("/me")
    public ResponseEntity<AssociationView> myAssociation(@RequestParam UUID workspaceId, HttpServletRequest request) {
        var session = security.requireSession(request);
        return associationService.activeAssociation(workspaceId, session.googleSubject())
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.ok().build());
    }

    @GetMapping("/options")
    public List<StudentRecordResponse> rosterOptions(@RequestParam UUID workspaceId, HttpServletRequest request) {
        if (!security.isAdmin(request)) {
            throw new org.springframework.security.access.AccessDeniedException("Admin authorization required.");
        }
        return associationService.workspaceRosterOptions(workspaceId);
    }

    @PostMapping("/associate")
    public AssociationView confirm(
        @RequestParam UUID workspaceId,
        @Valid @RequestBody ConfirmRequest body,
        HttpServletRequest request
    ) {
        var session = security.requireSession(request);
        shareLinks.requireEntry(workspaceId, body.deliverableId(), body.shareToken(), request);
        if (!workspaces.require(workspaceId).isActive() || body.deliverableId() == null || deliverables.findById(body.deliverableId())
            .filter(d -> workspaceId.equals(d.getWorkspaceId()) && d.getStatus() == com.capvault.backend.deliverable.DeliverableStatus.PUBLISHED).isEmpty()) {
            throw new org.springframework.security.access.AccessDeniedException("This submission form is unavailable.");
        }
        associationService.requireMatchingName(workspaceId, body.studentNumber(), body.studentName());
        return associationService.previewAssociation(workspaceId, session.googleSubject(), session.googleEmail(), body.studentNumber());
    }

    @DeleteMapping("/associate")
    public ResponseEntity<Void> disconnect(@RequestParam UUID workspaceId, HttpServletRequest request) {
        security.requireSession(request);
        throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,
            "Student account bindings can only be disconnected by an administrator.");
    }

    @GetMapping("/account-bindings")
    public AccountManagementView accountBindings(@RequestParam UUID workspaceId, HttpServletRequest request) {
        requireAdmin(request);
        return associationService.accountManagement(workspaceId);
    }

    @PostMapping("/account-bindings/{studentRecordId}/disconnect")
    public AccountBindingView adminDisconnect(
        @RequestParam UUID workspaceId,
        @PathVariable UUID studentRecordId,
        HttpServletRequest request
    ) {
        var session = requireAdmin(request);
        return associationService.adminDisconnect(workspaceId, studentRecordId, session.googleSubject(), session.googleEmail());
    }

    @PostMapping("/account-bindings/{studentRecordId}/recover")
    public AccountBindingView adminRecover(
        @RequestParam UUID workspaceId,
        @PathVariable UUID studentRecordId,
        @Valid @RequestBody RecoverAccountRequest body,
        HttpServletRequest request
    ) {
        var session = requireAdmin(request);
        return associationService.adminRecover(workspaceId, studentRecordId, body.confirmedSubject(), session.googleSubject(), session.googleEmail());
    }

    @GetMapping("/identity-conflicts")
    public List<ConflictDetail> conflicts(@RequestParam UUID workspaceId, @RequestParam(defaultValue = "false") boolean includeClosed, HttpServletRequest request) {
        requireAdmin(request);
        return includeClosed ? associationService.conflictHistory(workspaceId) : associationService.openConflictDetails(workspaceId);
    }

    /** Admin-only decision: RESOLVED or DISMISSED, recorded with who decided and when. */
    @PostMapping("/identity-conflicts/{conflictId}/decision")
    public ConflictDetail decideConflict(
        @RequestParam UUID workspaceId,
        @PathVariable UUID conflictId,
        @Valid @RequestBody ConflictDecisionRequest body,
        HttpServletRequest request
    ) {
        var session = requireAdmin(request);
        if ("RESOLVED".equalsIgnoreCase(body.decision()) && (body.confirmedSubject() == null || body.confirmedSubject().isBlank())) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Choose the correct account before resolving this conflict.");
        }
        return associationService.decideConflict(
            workspaceId, conflictId, body.decision(), session.googleSubject(), session.googleEmail(), body.note(), body.confirmedSubject());
    }

    private com.capvault.backend.auth.StoredWildTrackSession requireAdmin(HttpServletRequest request) {
        var session = security.requireSession(request);
        if (!security.activeRoles(request).contains(com.capvault.backend.staff.StaffRole.ADMIN)) {
            throw new org.springframework.security.access.AccessDeniedException("Admin authorization required.");
        }
        return session;
    }
}
