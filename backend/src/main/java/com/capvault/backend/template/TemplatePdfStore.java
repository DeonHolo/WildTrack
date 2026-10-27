package com.capvault.backend.template;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;

/** Immutable source versions and atomically published PDF renditions. */
@Repository
public class TemplatePdfStore {
    private final JdbcTemplate db;

    public TemplatePdfStore(JdbcTemplate db) {
        this.db = db;
    }

    public void capture(DocumentTemplate template) {
        boolean available = template.isBytesAvailable() && template.getContentBytes() != null;
        db.update("""
            INSERT INTO academic_document_template_versions (
                id, template_id, workspace_id, deliverable_key, field_id, display_name,
                original_filename, source_content_type, source_sha256, source_bytes,
                pdf_state, conversion_error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
            """, UUID.randomUUID(), template.getId(), template.getWorkspaceId(),
            template.getDeliverableKey(), template.getFieldId(), template.getDisplayName(),
            template.getOriginalFilename(), template.getContentType(), template.getSha256(),
            template.getContentBytes(), available ? "PENDING" : "FAILED",
            available ? null : "The original template file is unavailable. Replace the template to prepare its PDF.");
        if (available) {
            // A same-file replacement can restore a migrated legacy row. Never
            // replace an already retained source or its completed PDF.
            db.update("""
                UPDATE academic_document_template_versions
                SET source_bytes = ?, pdf_state = 'PENDING', conversion_error = NULL
                WHERE template_id = ? AND source_sha256 = ?
                  AND source_bytes IS NULL AND pdf_state = 'FAILED'
                """, template.getContentBytes(), template.getId(), template.getSha256());
        }
    }

    public Status current(UUID workspaceId, UUID templateId) {
        return db.query("""
            SELECT v.id, v.template_id, v.source_sha256, t.original_filename, v.pdf_state,
                   v.pdf_pages, v.conversion_error, (v.source_bytes IS NOT NULL) AS original_available,
                   (v.pdf_state = 'FAILED' AND v.source_bytes IS NOT NULL
                    AND LOWER(v.source_content_type) = 'application/pdf') AS retryable
            FROM academic_document_template_versions v
            JOIN academic_document_templates t ON t.id = v.template_id AND t.sha256 = v.source_sha256
            WHERE t.workspace_id = ? AND v.workspace_id = ? AND t.id = ?
            """, this::status, workspaceId, workspaceId, templateId).stream().findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Template was not found."));
    }

    public Pdf readPdf(UUID workspaceId, UUID templateId, UUID versionId) {
        var rows = db.query("""
            SELECT v.pdf_state, v.pdf_bytes, v.pdf_sha256,
                   COALESCE(t.original_filename, v.original_filename) AS original_filename
            FROM academic_document_template_versions v
            LEFT JOIN academic_document_templates t ON t.id = v.template_id AND t.sha256 = v.source_sha256
            WHERE v.workspace_id = ? AND v.template_id = ? AND v.id = ?
            """, (rs, row) -> {
                if (!"READY".equals(rs.getString("pdf_state"))) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "The template PDF is not ready.");
                }
                return new Pdf(rs.getBytes("pdf_bytes"), rs.getString("pdf_sha256"),
                    rs.getString("original_filename").replaceFirst("(?i)\\.docx$", ".pdf"));
            }, workspaceId, templateId, versionId);
        return rows.stream().findFirst().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Template version was not found."));
    }

    public boolean retry(UUID workspaceId, UUID templateId, UUID versionId) {
        return db.update("""
            UPDATE academic_document_template_versions
            SET pdf_state = 'PENDING', conversion_error = NULL,
                conversion_claim = NULL, conversion_lease_until = NULL
            WHERE workspace_id = ? AND template_id = ? AND id = ?
              AND pdf_state = 'FAILED' AND source_bytes IS NOT NULL
              AND LOWER(source_content_type) = 'application/pdf'
              AND source_sha256 = (SELECT sha256 FROM academic_document_templates
                  WHERE id = ? AND workspace_id = ?)
            """, workspaceId, templateId, versionId, templateId, workspaceId) == 1;
    }

    public Optional<Source> claimNext() {
        var ids = db.query("""
            SELECT v.id FROM academic_document_template_versions v
            JOIN academic_document_templates t ON t.id = v.template_id AND t.sha256 = v.source_sha256
            WHERE v.source_bytes IS NOT NULL AND
                (v.pdf_state = 'PENDING' OR
                 (v.pdf_state = 'PROCESSING' AND v.conversion_lease_until < CURRENT_TIMESTAMP))
            ORDER BY v.created_at, v.id FETCH FIRST 1 ROW ONLY
            """, (rs, row) -> rs.getObject(1, UUID.class));
        if (ids.isEmpty()) return Optional.empty();
        UUID id = ids.get(0);
        UUID token = UUID.randomUUID();
        int claimed = db.update("""
            UPDATE academic_document_template_versions
            SET pdf_state = 'PROCESSING', conversion_claim = ?, conversion_error = NULL,
                conversion_lease_until = CURRENT_TIMESTAMP + INTERVAL '3' MINUTE
            WHERE id = ? AND (pdf_state = 'PENDING' OR
                (pdf_state = 'PROCESSING' AND conversion_lease_until < CURRENT_TIMESTAMP))
            """, token, id);
        if (claimed != 1) return Optional.empty();
        return db.query("""
            SELECT id, source_content_type, source_bytes, original_filename, source_sha256
            FROM academic_document_template_versions WHERE id = ? AND conversion_claim = ?
            """, (rs, row) -> new Source(rs.getObject("id", UUID.class), token,
                rs.getString("source_content_type"), rs.getBytes("source_bytes"),
                rs.getString("original_filename"), rs.getString("source_sha256")), id, token)
            .stream().findFirst();
    }

    public boolean complete(Source source, byte[] pdf, String pdfSha256, int pages) {
        return db.update("""
            UPDATE academic_document_template_versions
            SET pdf_state = 'READY', pdf_bytes = ?, pdf_sha256 = ?, pdf_pages = ?,
                prepared_at = CURRENT_TIMESTAMP, conversion_error = NULL,
                conversion_claim = NULL, conversion_lease_until = NULL
            WHERE id = ? AND conversion_claim = ? AND pdf_state = 'PROCESSING'
            """, pdf, pdfSha256, pages, source.versionId(), source.claim()) == 1;
    }

    public boolean fail(Source source, String message) {
        return db.update("""
            UPDATE academic_document_template_versions
            SET pdf_state = 'FAILED', conversion_error = ?,
                conversion_claim = NULL, conversion_lease_until = NULL
            WHERE id = ? AND conversion_claim = ? AND pdf_state = 'PROCESSING'
            """, message, source.versionId(), source.claim()) == 1;
    }

    private Status status(ResultSet rs, int row) throws SQLException {
        return new Status(rs.getObject("id", UUID.class), rs.getObject("template_id", UUID.class),
            rs.getString("source_sha256"), rs.getString("original_filename"),
            rs.getString("pdf_state"), rs.getObject("pdf_pages", Integer.class),
            rs.getString("conversion_error"), rs.getBoolean("original_available"), rs.getBoolean("retryable"));
    }

    public record Status(UUID versionId, UUID templateId, String sourceSha256,
                         String originalFilename, String state, Integer pages, String error,
                         boolean originalAvailable, boolean retryable) {
        public Status(UUID versionId, UUID templateId, String sourceSha256, String originalFilename,
                      String state, Integer pages, String error, boolean originalAvailable) {
            this(versionId, templateId, sourceSha256, originalFilename, state, pages, error, originalAvailable,
                "FAILED".equals(state) && originalAvailable);
        }
    }
    public record Source(UUID versionId, UUID claim, String contentType, byte[] bytes,
                         String filename, String sourceSha256) {}
    public record Pdf(byte[] bytes, String sha256, String filename) {}
}
