package com.capvault.backend.response;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;

@Entity
@Table(name = "form_responses",
    uniqueConstraints = @UniqueConstraint(name = "uq_response_workspace_deliverable_subject",
        columnNames = {"workspace_id", "deliverable_id", "google_subject"}))
public class FormResponse {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "deliverable_id", nullable = false)
    private UUID deliverableId;

    @Column(name = "google_subject", nullable = false)
    private String googleSubject;

    @Column(name = "google_email", nullable = false)
    private String googleEmail;

    @Column(name = "student_record_id", nullable = false)
    private UUID studentRecordId;

    @Column(name = "student_number", nullable = false, length = 80)
    private String studentNumber;

    @Column(name = "student_name", nullable = false, length = 240)
    private String studentName;

    @Column(name = "team_code", nullable = false, length = 160)
    private String teamCode;

    @Column(name = "values_json", nullable = false, columnDefinition = "TEXT")
    private String valuesJson;

    /** Doubles as the client-visible revision and the JPA optimistic lock counter. */
    @Version
    @Column(nullable = false)
    private long revision;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected FormResponse() {
    }

    public FormResponse(UUID id, UUID workspaceId, UUID deliverableId, String googleSubject, String googleEmail,
                        UUID studentRecordId, String studentNumber, String studentName, String teamCode,
                        String valuesJson, Instant submittedAt, Instant updatedAt) {
        this.id = id;
        this.workspaceId = workspaceId;
        this.deliverableId = deliverableId;
        this.googleSubject = googleSubject;
        this.googleEmail = googleEmail;
        this.studentRecordId = studentRecordId;
        this.studentNumber = studentNumber;
        this.studentName = studentName;
        this.teamCode = teamCode;
        this.valuesJson = valuesJson;
        this.revision = 1L;
        this.submittedAt = submittedAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() { return id; }
    public UUID getWorkspaceId() { return workspaceId; }
    public UUID getDeliverableId() { return deliverableId; }
    public String getGoogleSubject() { return googleSubject; }
    public String getGoogleEmail() { return googleEmail; }
    public UUID getStudentRecordId() { return studentRecordId; }
    public String getStudentNumber() { return studentNumber; }
    public String getStudentName() { return studentName; }
    public String getTeamCode() { return teamCode; }
    public String getValuesJson() { return valuesJson; }
    public void setValuesJson(String valuesJson) { this.valuesJson = valuesJson; }
    public long getRevision() { return revision; }
    public Instant getSubmittedAt() { return submittedAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
