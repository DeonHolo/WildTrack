package com.capvault.backend.template;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Private provider handles, scoped to both immutable PDF identity and credential context. */
@Repository
public class TemplateProviderFileStore {
    private final JdbcTemplate db;
    public TemplateProviderFileStore(JdbcTemplate db) { this.db = db; }

    public Optional<File> find(UUID versionId, String context, String hash) {
        return db.query("""
            SELECT file_name, file_uri, expires_at FROM template_provider_files
            WHERE version_id = ? AND provider_context = ? AND pdf_sha256 = ?
              AND expires_at > CURRENT_TIMESTAMP + INTERVAL '5' MINUTE
            """, (rs, row) -> new File(rs.getString(1), rs.getString(2), rs.getTimestamp(3).toInstant()),
            versionId, context, hash).stream().findFirst();
    }

    public Optional<UUID> claim(UUID versionId, String context, String hash) {
        db.update("""
            INSERT INTO template_provider_files(version_id, provider_context, pdf_sha256)
            VALUES (?, ?, ?) ON CONFLICT DO NOTHING
            """, versionId, context, hash);
        UUID token = UUID.randomUUID();
        return db.update("""
            UPDATE template_provider_files SET claim_token = ?,
                lease_until = CURRENT_TIMESTAMP + INTERVAL '15' MINUTE
            WHERE version_id = ? AND provider_context = ? AND pdf_sha256 = ?
              AND (claim_token IS NULL OR lease_until < CURRENT_TIMESTAMP)
            """, token, versionId, context, hash) == 1 ? Optional.of(token) : Optional.empty();
    }

    public boolean complete(UUID versionId, String context, UUID token, File file) {
        return db.update("""
            UPDATE template_provider_files SET file_name = ?, file_uri = ?, expires_at = ?,
                claim_token = NULL, lease_until = NULL
            WHERE version_id = ? AND provider_context = ? AND claim_token = ?
            """, file.name(), file.uri(), Timestamp.from(file.expiresAt()), versionId, context, token) == 1;
    }

    public void invalidate(UUID versionId, String context, String name) {
        db.update("""
            UPDATE template_provider_files SET expires_at = CURRENT_TIMESTAMP
            WHERE version_id = ? AND provider_context = ? AND file_name = ?
            """, versionId, context, name);
    }

    public void release(UUID versionId, String context, UUID token) {
        db.update("""
            UPDATE template_provider_files SET claim_token = NULL, lease_until = NULL
            WHERE version_id = ? AND provider_context = ? AND claim_token = ?
            """, versionId, context, token);
    }

    public record File(String name, String uri, Instant expiresAt) { }
}
