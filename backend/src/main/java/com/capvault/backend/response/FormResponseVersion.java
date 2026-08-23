package com.capvault.backend.response;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "form_response_versions")
public class FormResponseVersion {

    @Id
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "response_id", nullable = false)
    private FormResponse response;

    @Column(name = "values_json", nullable = false, columnDefinition = "TEXT")
    private String valuesJson;

    @Column(nullable = false)
    private long revision;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected FormResponseVersion() {
    }

    public FormResponseVersion(UUID id, FormResponse response, String valuesJson, long revision, Instant createdAt) {
        this.id = id;
        this.response = response;
        this.valuesJson = valuesJson;
        this.revision = revision;
        this.createdAt = createdAt;
    }

    public UUID getId() { return id; }
    public FormResponse getResponse() { return response; }
    public String getValuesJson() { return valuesJson; }
    public long getRevision() { return revision; }
    public Instant getCreatedAt() { return createdAt; }
}
