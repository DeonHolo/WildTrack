package com.capvault.backend.drivehistory;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.drive.DriveLinkParser;
import com.capvault.backend.drivehistory.auth.DelegatedDriveAccessService;
import com.capvault.backend.drivehistory.auth.DelegatedDriveGateway;
import com.capvault.backend.drivehistory.auth.DelegatedDriveException;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.staff.StaffManagementService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationService;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.student.RegisteredDriveStudentResolver;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

/**
 * An authorized submitter's delegated access may unlock revision evidence for
 * other *submitters of that exact file*. Never grant access to arbitrary file IDs.
 * No Google token, grant-owner identity, or unrelated Drive metadata is returned.
 *
 * The gateway is queried on demand rather than storing a shared historical
 * snapshot, so disconnect/revocation takes effect on the next request.
 */
@Service
public class SharedDriveHistoryService {
    private static final String COVERAGE =
        "These are revision metadata returned by Google Drive for this exact submitted file. "
        + "An eligible submitter's authorization can make the same file history available to other "
        + "WildTrack submitters of the file. Google's API can omit older revisions, even when all "
        + "returned pages have been loaded. This is not proof of original authorship.";

    private final StudentAssociationSecurity security;
    private final StudentAssociationService associations;
    private final StaffManagementService staff;
    private final FormResponseRepository responses;
    private final DeliverableRepository deliverables;
    private final DeliverableFieldRepository fields;
    private final ObjectMapper json;
    private final DelegatedDriveAccessService access;
    private final DelegatedDriveGateway gateway;
    private final RegisteredDriveStudentResolver registeredStudents;
    // An opaque, short-lived cursor pins every subsequent Google page to the
    // same submitting grant. Provider page tokens are never sent to browsers.
    // A restarted instance invalidates cursors safely; clients can restart at page one.
    private static final Duration PAGE_TTL = Duration.ofMinutes(10);
    private final ConcurrentHashMap<String, PageCursor> pageCursors = new ConcurrentHashMap<>();
    private final SecureRandom cursorRandom = new SecureRandom();

    public SharedDriveHistoryService(
        StudentAssociationSecurity security,
        StudentAssociationService associations,
        StaffManagementService staff,
        FormResponseRepository responses,
        DeliverableRepository deliverables,
        DeliverableFieldRepository fields,
        ObjectMapper json,
        DelegatedDriveAccessService access,
        DelegatedDriveGateway gateway,
        RegisteredDriveStudentResolver registeredStudents
    ) {
        this.security = security;
        this.associations = associations;
        this.staff = staff;
        this.responses = responses;
        this.deliverables = deliverables;
        this.fields = fields;
        this.json = json;
        this.access = access;
        this.gateway = gateway;
        this.registeredStudents = registeredStudents;
    }

    public SharedDriveHistoryView forSubmission(
        UUID workspaceId,
        UUID responseId,
        String fieldId,
        String pageToken,
        HttpServletRequest request
    ) {
        var session = security.requireSession(request);
        FormResponse target = responses.findById(responseId)
            .filter(item -> workspaceId.equals(item.getWorkspaceId()))
            .orElseThrow(() -> new IllegalArgumentException("Submission was not found in the selected workspace."));
        boolean staffViewer = authorizedStaff(workspaceId, target, session.googleSubject(), request);
        if (!staffViewer && !ownsActiveResponse(target, session.googleSubject())) {
            throw new AccessDeniedException("You cannot view the private history for this submission.");
        }
        SubmittedFile selected = submittedFile(target, fieldId)
            .orElseThrow(() -> new IllegalArgumentException("Choose a submitted PDF artifact to see its history."));
        String fileId = selected.fileId();
        if (pageToken != null && pageToken.length() > 2048) {
            throw new IllegalArgumentException("Invalid Drive history page token.");
        }
        PageCursor continuing = pageToken == null || pageToken.isBlank() ? null
            : resolveCursor(pageToken, session.googleSubject(), target.getId(), selected.fieldId(), fileId);
        if (!access.isConfigured()) {
            return SharedDriveHistoryView.unavailable("UNAVAILABLE",
                "Drive revision history is not enabled in this WildTrack environment yet. "
                + "A WildTrack administrator needs to finish enabling it. Document Check remains available.", fileId);
        }

        // Subject preference avoids trying other people's tokens for a file the
        // signed-in submitter can read with their own authorization.
        Set<String> candidates = new LinkedHashSet<>();
        if (ownsActiveResponse(target, session.googleSubject()) && access.connected(session.googleSubject())) {
            candidates.add(session.googleSubject());
        }
        // Only actual, still-authorized submitters of the *same Drive file ID*
        // may contribute a grant. Google must separately authorize the operation.
        for (FormResponse other : responses.findAll()) {
            String subject = other.getGoogleSubject();
            if (subject == null || candidates.contains(subject) || !access.connected(subject)
                    || !ownsActiveResponse(other, subject)) continue;
            if (submittedFiles(other).stream().anyMatch(value -> fileId.equals(value.fileId()))) {
                candidates.add(subject);
            }
        }

        if (continuing != null) {
            // Never switch grants partway through a paginated revision list.
            candidates.removeIf(subject -> !subject.equals(continuing.grantSubject()));
        }
        boolean attempted = false;
        boolean permissionDenied = false;
        boolean revokedAccess = false;
        for (String subject : candidates) {
            Optional<String> token = access.accessTokenForSubject(subject);
            if (token.isEmpty()) continue;
            attempted = true;
            try {
                DelegatedDriveGateway.Page result = gateway.revisions(token.get(), fileId,
                    continuing == null ? null : continuing.providerPageToken(), 50);
                List<SharedDriveHistoryView.Revision> revisions = result.revisions().stream()
                    .map(item -> new SharedDriveHistoryView.Revision(
                        item.id(), item.modifiedTime(), item.mimeType(), item.size(), item.keepForever(),
                        staffViewer ? item.modifiedBy() : null,
                        staffViewer ? item.modifiedByEmail() : null))
                    .toList();
                SharedDriveHistoryView.FileMetadata fileMetadata = null;
                if (continuing == null) {
                    try {
                        DelegatedDriveGateway.FileDetails details = gateway.fileMetadata(token.get(), fileId);
                        if (details != null) {
                            fileMetadata = new SharedDriveHistoryView.FileMetadata(
                                details.createdTime(),
                                staffViewer ? details.driveOwner() : null,
                                details.lastModifiedTime(),
                                staffViewer ? details.lastModifiedBy() : null,
                                staffViewer ? registeredStudents.resolve(workspaceId, details.driveOwnerEmail()).orElse(null) : null,
                                staffViewer ? registeredStudents.resolve(workspaceId, details.lastModifiedByEmail()).orElse(null) : null);
                        }
                    } catch (DelegatedDriveException metadataFailure) {
                        // A successful revisions.list result stays valid if the
                        // separate current-file metadata request is unavailable.
                        if (metadataFailure.reason() == DelegatedDriveException.Reason.AUTH_REVOKED) {
                            access.markRevoked(subject);
                        }
                    }
                }
                String nextPageCursor = issueCursor(result.nextPageToken(), session.googleSubject(),
                    target.getId(), selected.fieldId(), fileId, subject);
                return new SharedDriveHistoryView("Google Drive revision metadata", COVERAGE,
                    "AVAILABLE", fileId, revisions, nextPageCursor, true, fileMetadata);
            } catch (DelegatedDriveException failure) {
                switch (failure.reason()) {
                    case PERMISSION_DENIED -> permissionDenied = true;
                    case AUTH_REVOKED -> {
                        access.markRevoked(subject);
                        revokedAccess = true;
                    }
                    case PROVIDER_UNAVAILABLE -> {
                        return SharedDriveHistoryView.unavailable("UNAVAILABLE",
                            "Google Drive history could not be retrieved right now. Try again later.", fileId);
                    }
                }
            }
        }
        if (permissionDenied) {
            return SharedDriveHistoryView.unavailable("PERMISSION_DENIED",
                "Connected submitters do not currently have sufficient Google Drive permission to read revisions of this file.", fileId);
        }
        if (revokedAccess) {
            return SharedDriveHistoryView.unavailable("NOT_CONNECTED",
                "Previously connected Drive history access has expired or was revoked. "
                + "An eligible submitter can reconnect Drive history access in WildTrack.", fileId);
        }
        return SharedDriveHistoryView.unavailable(attempted ? "UNAVAILABLE" : "NOT_CONNECTED",
            "No eligible submitter of this exact PDF currently has usable Drive history access. "
            + "A submitter with permission to view its revisions can connect Drive history in WildTrack.", fileId);
    }

    private String issueCursor(String providerToken, String viewer, UUID responseId,
                               String fieldId, String fileId, String grantSubject) {
        if (providerToken == null || providerToken.isBlank()) return null;
        if (providerToken.length() > 2048) return null;
        Instant now = Instant.now();
        pageCursors.entrySet().removeIf(entry -> !entry.getValue().expiresAt().isAfter(now));
        byte[] bytes = new byte[24];
        cursorRandom.nextBytes(bytes);
        String opaque = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        pageCursors.put(opaque, new PageCursor(viewer, responseId, fieldId,
            fileId, grantSubject, providerToken, now.plus(PAGE_TTL)));
        return opaque;
    }

    private PageCursor resolveCursor(String opaque, String viewer, UUID responseId,
                                     String fieldId, String fileId) {
        PageCursor cursor = pageCursors.get(opaque);
        if (cursor == null || !cursor.expiresAt().isAfter(Instant.now())
                || !Objects.equals(cursor.viewer(), viewer)
                || !Objects.equals(cursor.responseId(), responseId)
                || !Objects.equals(cursor.fieldId(), fieldId)
                || !Objects.equals(cursor.fileId(), fileId)) {
            throw new IllegalArgumentException("Drive history page expired or does not match this submission. Return to page one.");
        }
        return cursor;
    }

    private record PageCursor(String viewer, UUID responseId, String fieldId,
                              String fileId, String grantSubject, String providerPageToken,
                              Instant expiresAt) { }

    private boolean authorizedStaff(UUID workspaceId, FormResponse target, String subject,
                                    HttpServletRequest request) {
        Set<StaffRole> roles = security.activeRoles(request);
        return roles.contains(StaffRole.ADMIN)
            || roles.contains(StaffRole.ADVISER) && staff.assignedTeams(subject, workspaceId).stream()
                .anyMatch(team -> team.equalsIgnoreCase(target.getTeamCode()));
    }

    private boolean ownsActiveResponse(FormResponse response, String subject) {
        if (!Objects.equals(subject, response.getGoogleSubject())) return false;
        return associations.activeAssociation(response.getWorkspaceId(), subject)
            .map(value -> Objects.equals(response.getStudentRecordId(), value.studentRecordId()))
            .orElse(false);
    }

    private Optional<SubmittedFile> submittedFile(FormResponse response, String fieldId) {
        List<SubmittedFile> submitted = submittedFiles(response);
        if (fieldId != null && !fieldId.isBlank()) {
            return submitted.stream().filter(item -> fieldId.equals(item.fieldId())).findFirst();
        }
        // Do not silently choose one of multiple PDFs.
        return submitted.size() == 1 ? Optional.of(submitted.get(0)) : Optional.empty();
    }

    private List<SubmittedFile> submittedFiles(FormResponse response) {
        Deliverable deliverable = deliverables.findById(response.getDeliverableId())
            .filter(item -> response.getWorkspaceId().equals(item.getWorkspaceId()))
            .orElse(null);
        if (deliverable == null) return List.of();
        JsonNode values;
        try { values = json.readTree(response.getValuesJson()); }
        catch (Exception invalid) { return List.of(); }
        if (values == null || !values.isObject()) return List.of();

        List<DeliverableField> definitions = fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverable.getId());
        List<SubmittedFile> found = new ArrayList<>();
        if (!definitions.isEmpty()) {
            for (DeliverableField definition : definitions) {
                if (definition.getFieldType() != DeliverableFieldType.DRIVE_PDF) continue;
                parseSubmitted(values.path(definition.getFieldKey()).asText(null), definition.getId()).ifPresent(found::add);
            }
        } else if (deliverable.isPdfRequired()) {
            // Compatibility for old one-link deliverables saved before typed fields.
            for (String legacyKey : List.of("documentPdf", "driveLink", "pdfDriveLink")) {
                parseSubmitted(values.path(legacyKey).asText(null), legacyKey).ifPresent(found::add);
            }
        }
        return found.stream().distinct().toList();
    }

    private Optional<SubmittedFile> parseSubmitted(String url, String fieldId) {
        if (url == null || url.isBlank()) return Optional.empty();
        try {
            return Optional.of(new SubmittedFile(DriveLinkParser.parse(url).fileId(), fieldId));
        } catch (IllegalArgumentException invalid) {
            return Optional.empty();
        }
    }

    private record SubmittedFile(String fileId, String fieldId) { }
}
