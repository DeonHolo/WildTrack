package com.capvault.backend.filecheck;

import java.util.List;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.drive.DriveLinkParser;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.staff.StaffManagementService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import org.springframework.security.access.AccessDeniedException;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/file-checks")
public class FileCheckController {

    private final FileCheckService service;
    private final GoogleDriveGateway drive;
    private final StudentAssociationSecurity security;
    private final StaffManagementService staff;
    private final FormResponseRepository responses;

    public FileCheckController(FileCheckService service, GoogleDriveGateway drive,
            StudentAssociationSecurity security, StaffManagementService staff,
            FormResponseRepository responses) {
        this.service = service;
        this.drive = drive;
        this.security = security;
        this.staff = staff;
        this.responses = responses;
    }

    public record BatchRequest(List<FileCheckRequest> checks) { }
    public record BatchItem(String responseId, String fieldId, FileCheckResponse report, String error) { }

    /**
     * Deduplicated manual batch: one metadata request, one download and one PDF
     * parse per unique Drive file ID, while each response receives its own
     * validated, field-scoped report and corresponding template comparison.
     * Do not use a shared report as if submissions had the same response identity.
     */
    @PostMapping("/batch")
    public List<BatchItem> checkBatch(@RequestParam UUID workspaceId,
            @Valid @RequestBody BatchRequest request, HttpServletRequest http) {
        var session = security.requireSession(http);
        var roles = security.activeRoles(http);
        if (!roles.contains(StaffRole.ADMIN) && !roles.contains(StaffRole.ADVISER)) {
            throw new AccessDeniedException("Staff authorization required.");
        }
        Set<String> assignedTeams = roles.contains(StaffRole.ADMIN) ? Set.of()
            : Set.copyOf(staff.assignedTeams(session.googleSubject(), workspaceId));
        List<FileCheckRequest> items = request == null ? null : request.checks();
        if (items == null || items.size() > 400) {
            throw new IllegalArgumentException("Choose at most 400 PDF artifacts per batch.");
        }
        Map<String, List<FileCheckRequest>> grouped = new LinkedHashMap<>();
        List<BatchItem> results = new ArrayList<>();
        for (FileCheckRequest item : items) {
            try {
                if (item == null || item.fieldId() == null || item.fieldId().isBlank())
                    throw new IllegalArgumentException("A field-scoped PDF artifact is required.");
                var response = responses.findById(UUID.fromString(item.responseId()))
                    .filter(saved -> workspaceId.equals(saved.getWorkspaceId()))
                    .orElseThrow(() -> new IllegalArgumentException("Submission is unavailable."));
                if (!roles.contains(StaffRole.ADMIN) && !assignedTeams.contains(response.getTeamCode())) {
                    throw new AccessDeniedException("Submission is outside your assigned teams.");
                }
                FileCheckRequest validated = service.validateBatchTarget(workspaceId, item);
                DriveFileReference ref = DriveLinkParser.parse(validated.sourceUrl());
                grouped.computeIfAbsent(ref.fileId(), unused -> new ArrayList<>()).add(validated);
            } catch (AccessDeniedException denied) {
                throw denied;
            } catch (RuntimeException invalid) {
                results.add(new BatchItem(item == null ? "" : item.responseId(),
                    item == null ? null : item.fieldId(), null, "Invalid submitted PDF link or field."));
            }
        }
        for (List<FileCheckRequest> shared : grouped.values()) {
            FileCheckRequest first = shared.get(0);
            FileCheckService.CapturedPdf captured = null;
            RuntimeException providerFailure = null;
            boolean metadataFailure = true;
            try {
                // A shared file may be submitted with and without a resource key.
                // Prefer a submitted resource key so the single provider fetch can
                // access the file without breaking file-ID-level deduplication.
                DriveFileReference reference = shared.stream()
                    .map(item -> DriveLinkParser.parse(item.sourceUrl()))
                    .filter(ref -> ref.resourceKey() != null && !ref.resourceKey().isBlank())
                    .findFirst().orElseGet(() -> DriveLinkParser.parse(first.sourceUrl()));
                var metadata = drive.getMetadata(reference);
                if (metadata == null || !reference.fileId().equals(metadata.id())) {
                    throw new IllegalStateException("Google Drive returned metadata for another file or no file.");
                }
                metadataFailure = false;
                captured = service.capture(reference, metadata);
            } catch (RuntimeException unavailable) {
                providerFailure = unavailable;
            }
            for (FileCheckRequest item : shared) {
                try {
                    FileCheckResponse report = providerFailure == null
                        ? service.checkCaptured(workspaceId, item, captured)
                        : service.recordBatchProviderFailure(workspaceId, item, metadataFailure,
                            providerFailure.getMessage());
                    results.add(new BatchItem(item.responseId(), item.fieldId(), report, null));
                } catch (RuntimeException problem) {
                    results.add(new BatchItem(item.responseId(), item.fieldId(), null,
                        "Document Check could not verify this submitted PDF. Refresh the response and try again."));
                }
            }
        }
        return results;
    }

    @GetMapping("/status")
    public DriveConnectionStatus status() {
        return service.connectionStatus();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FileCheckResponse check(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        @Valid @RequestBody FileCheckRequest request
    ) {
        return service.check(workspaceId, request);
    }

    @GetMapping("/{responseId}")
    public ResponseEntity<FileCheckResponse> latest(
        @PathVariable String responseId,
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        @RequestParam(required = false) String fieldId
    ) {
        return ResponseEntity.of(service.findLatest(workspaceId, responseId, fieldId));
    }

    @GetMapping("/{responseId}/history")
    public List<FileCheckResponse> history(
        @PathVariable String responseId,
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        @RequestParam(required = false) String fieldId
    ) {
        return service.history(workspaceId, responseId, fieldId);
    }
}
