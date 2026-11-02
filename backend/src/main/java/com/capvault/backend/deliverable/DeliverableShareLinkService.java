package com.capvault.backend.deliverable;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
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
        var existing = jdbc.query("select token from deliverable_share_links where deliverable_id = ?",
            (rs, row) -> rs.getString(1), form.getId());
        if (!existing.isEmpty()) return link(form, existing.get(0));
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = HexFormat.of().formatHex(bytes);
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
        jdbc.query("select l.deliverable_id, l.token from deliverable_share_links l join academic_deliverables d on d.id = l.deliverable_id where d.workspace_id = ?",
            rs -> { tokens.put(rs.getObject(1, UUID.class), rs.getString(2)); }, workspaceId);
        var missing = new java.util.ArrayList<Object[]>();
        for (var form : forms) {
            if (!tokens.containsKey(form.getId())) {
                byte[] bytes = new byte[32];
                random.nextBytes(bytes);
                String token = HexFormat.of().formatHex(bytes);
                tokens.put(form.getId(), token);
                missing.add(new Object[] { form.getId(), token, java.sql.Timestamp.from(Instant.now()) });
            }
        }
        if (!missing.isEmpty()) jdbc.batchUpdate(
            "insert into deliverable_share_links (deliverable_id, token, created_at) values (?, ?, ?)", missing);
        var paths = new java.util.HashMap<UUID, String>();
        for (var form : forms) paths.put(form.getId(), link(form, tokens.get(form.getId())).path());
        return paths;
    }

    private static ShareLink link(Deliverable form, String token) {
        return new ShareLink(token, "/s/" + form.getSlug() + "/" + token);
    }

    @Transactional(readOnly = true)
    public Deliverable requireToken(String token) {
        if (token == null || !token.matches("[0-9a-f]{64}")) throw notFound();
        var ids = jdbc.query("select deliverable_id from deliverable_share_links where token = ?",
            (rs, row) -> rs.getObject(1, UUID.class), token);
        if (ids.isEmpty()) throw notFound();
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
