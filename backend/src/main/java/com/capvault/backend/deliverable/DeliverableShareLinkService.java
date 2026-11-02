package com.capvault.backend.deliverable;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.student.StudentAssociationService;
import com.capvault.backend.workspace.AcademicWorkspaceService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class DeliverableShareLinkService {
    private final DeliverableRepository deliverables;
    private final AcademicWorkspaceService workspaces;
    private final StudentAssociationSecurity security;
    private final StudentAssociationService associations;
    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    public DeliverableShareLinkService(DeliverableRepository deliverables, AcademicWorkspaceService workspaces,
            StudentAssociationSecurity security, StudentAssociationService associations, JdbcTemplate jdbc) {
        this.deliverables = deliverables;
        this.workspaces = workspaces;
        this.security = security;
        this.associations = associations;
        this.jdbc = jdbc;
    }

    public record ShareLink(String token, String path) { }

    @Transactional
    public ShareLink issue(UUID workspaceId, UUID deliverableId) {
        var form = deliverables.lockById(deliverableId).filter(d -> workspaceId.equals(d.getWorkspaceId()))
            .orElseThrow(() -> new IllegalArgumentException("Deliverable not found."));
        var existing = jdbc.query("select coalesce(short_token, token) from deliverable_share_links where deliverable_id = ?",
            (rs, row) -> rs.getString(1), form.getId());
        if (!existing.isEmpty()) {
            String token = existing.get(0);
            if (token.length() != 12) {
                token = newToken(new java.util.HashSet<>());
                jdbc.update("update deliverable_share_links set short_token = ? where deliverable_id = ?", token, form.getId());
            }
            return link(form, token);
        }
        String token = newToken(new java.util.HashSet<>());
        jdbc.update("insert into deliverable_share_links (deliverable_id, token, created_at) values (?, ?, ?)",
            form.getId(), token, java.sql.Timestamp.from(Instant.now()));
        return link(form, token);
    }

    /** Only call after checking administrator authorization. Locks rows in a stable order,
     * matching single-link issuance, so concurrent list and issuance calls reuse one token. */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public java.util.Map<UUID, String> pathsForWorkspace(UUID workspaceId) {
        var forms = deliverables.lockAllByWorkspaceId(workspaceId);
        if (forms.isEmpty()) return java.util.Map.of();
        var tokens = new java.util.HashMap<UUID, String>();
        jdbc.query("select l.deliverable_id, coalesce(l.short_token, l.token) from deliverable_share_links l join academic_deliverables d on d.id = l.deliverable_id where d.workspace_id = ?",
            rs -> { tokens.put(rs.getObject(1, UUID.class), rs.getString(2)); }, workspaceId);
        var missing = new java.util.ArrayList<Object[]>();
        var shortened = new java.util.ArrayList<Object[]>();
        var reserved = new java.util.HashSet<>(tokens.values());
        for (var form : forms) {
            if (!tokens.containsKey(form.getId())) {
                String token = newToken(reserved);
                tokens.put(form.getId(), token);
                missing.add(new Object[] { form.getId(), token, java.sql.Timestamp.from(Instant.now()) });
            } else if (tokens.get(form.getId()).length() != 12) {
                String token = newToken(reserved);
                tokens.put(form.getId(), token);
                shortened.add(new Object[] { token, form.getId() });
            }
        }
        if (!missing.isEmpty()) jdbc.batchUpdate(
            "insert into deliverable_share_links (deliverable_id, token, created_at) values (?, ?, ?)", missing);
        if (!shortened.isEmpty()) jdbc.batchUpdate(
            "update deliverable_share_links set short_token = ? where deliverable_id = ?", shortened);
        var paths = new java.util.HashMap<UUID, String>();
        String workspaceKey = AcademicWorkspaceService.publicKeyFor(workspaces.require(workspaceId));
        for (var form : forms) paths.put(form.getId(), link(form, tokens.get(form.getId()), workspaceKey).path());
        return paths;
    }

    private ShareLink link(Deliverable form, String token) {
        return link(form, token, AcademicWorkspaceService.publicKeyFor(workspaces.require(form.getWorkspaceId())));
    }

    private static ShareLink link(Deliverable form, String token, String workspaceKey) {
        return new ShareLink(token, "/s/" + workspaceKey + "/" + form.getSlug() + "/" + token);
    }

    private String newToken(java.util.Set<String> reserved) {
        for (int attempt = 0; attempt < 5; attempt++) {
            byte[] bytes = new byte[9];
            random.nextBytes(bytes);
            String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            if (!reserved.contains(token) && jdbc.queryForObject(
                    "select count(*) from deliverable_share_links where token = ? or short_token = ?", Integer.class, token, token) == 0) {
                reserved.add(token);
                return token;
            }
        }
        throw new IllegalStateException("Could not create a unique share link. Try again.");
    }

    @Transactional(readOnly = true)
    public Deliverable requireToken(String token) {
        if (token == null || !token.matches("(?:[A-Za-z0-9_-]{12}|[0-9a-f]{64})")) throw notFound();
        var ids = jdbc.query("select deliverable_id from deliverable_share_links where token = ? or short_token = ?",
            (rs, row) -> rs.getObject(1, UUID.class), token, token);
        if (ids.size() != 1) throw notFound();
        Deliverable form = deliverables.findById(ids.get(0)).orElseThrow(DeliverableShareLinkService::notFound);
        try {
            if (form.getStatus() != DeliverableStatus.PUBLISHED || !workspaces.require(form.getWorkspaceId()).isActive()) throw notFound();
        } catch (IllegalArgumentException missing) { throw notFound(); }
        return form;
    }

    public boolean hasExistingAccess(UUID workspaceId, HttpServletRequest request) {
        try {
            var session = security.requireSession(request);
            return !security.activeRoles(request).isEmpty() || associations.activeAssociation(workspaceId, session.googleSubject()).isPresent();
        } catch (AccessDeniedException denied) { return false; }
    }

    public void requireEntry(UUID workspaceId, UUID deliverableId, String token, HttpServletRequest request) {
        if (hasExistingAccess(workspaceId, request)) return;
        Deliverable form;
        try { form = requireToken(token); }
        catch (ResponseStatusException invalid) { throw new AccessDeniedException("A valid submission link is required."); }
        if (!form.getId().equals(deliverableId) || !form.getWorkspaceId().equals(workspaceId))
            throw new AccessDeniedException("A valid submission link is required.");
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Published form was not found.");
    }
}
