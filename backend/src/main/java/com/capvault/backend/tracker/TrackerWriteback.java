package com.capvault.backend.tracker;

import java.time.LocalDateTime;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "academic_tracker_writebacks")
public class TrackerWriteback {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "student_number", length = 80)
    private String studentNumber;

    @Column(name = "team_code", nullable = false, length = 160)
    private String teamCode;

    @Column(name = "member_number", length = 40)
    private String memberNumber;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "deliverable_id")
    private Deliverable deliverable;

    @Column(name = "tracker_column_key", nullable = false, length = 180)
    private String trackerColumnKey;

    @Column(name = "days_late", nullable = false)
    private Integer daysLate;

    @Column(name = "target_row_number")
    private Integer targetRowNumber;

    @Column(name = "target_column_index")
    private Integer targetColumnIndex;

    @Column(name = "target_a1_range", length = 240)
    private String targetA1Range;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 80)
    private TrackerWritebackStatus status;

    @Column(name = "message", length = 1000)
    private String message;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    @Column(name = "written_at")
    private LocalDateTime writtenAt;

    protected TrackerWriteback() {
    }

    public TrackerWriteback(
        UUID workspaceId,
        String studentNumber,
        String teamCode,
        String memberNumber,
        Deliverable deliverable,
        String trackerColumnKey,
        Integer daysLate,
        Integer targetRowNumber,
        Integer targetColumnIndex,
        String targetA1Range,
        TrackerWritebackStatus status,
        String message
    ) {
        this.workspaceId = workspaceId;
        this.studentNumber = normalizeNullable(studentNumber);
        this.teamCode = teamCode;
        this.memberNumber = normalizeNullable(memberNumber);
        this.deliverable = deliverable;
        this.trackerColumnKey = trackerColumnKey;
        this.daysLate = daysLate;
        this.targetRowNumber = targetRowNumber;
        this.targetColumnIndex = targetColumnIndex;
        this.targetA1Range = targetA1Range;
        this.status = status;
        this.message = message;
        this.requestedAt = LocalDateTime.now();
        if (status == TrackerWritebackStatus.WRITTEN_TO_SHEET) {
            this.writtenAt = LocalDateTime.now();
        }
    }

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (requestedAt == null) {
            requestedAt = LocalDateTime.now();
        }
    }

    public void markSheetWritten(String message) {
        this.status = TrackerWritebackStatus.WRITTEN_TO_SHEET;
        this.message = message;
        this.writtenAt = LocalDateTime.now();
    }

    public void markFailed(String message) {
        this.status = TrackerWritebackStatus.FAILED;
        this.message = message;
    }

    public UUID getId() {
        return id;
    }

    public UUID getWorkspaceId() {
        return workspaceId;
    }

    public String getStudentNumber() {
        return studentNumber;
    }

    public String getTeamCode() {
        return teamCode;
    }

    public String getMemberNumber() {
        return memberNumber;
    }

    public Deliverable getDeliverable() {
        return deliverable;
    }

    public String getTrackerColumnKey() {
        return trackerColumnKey;
    }

    public Integer getDaysLate() {
        return daysLate;
    }

    public Integer getTargetRowNumber() {
        return targetRowNumber;
    }

    public Integer getTargetColumnIndex() {
        return targetColumnIndex;
    }

    public String getTargetA1Range() {
        return targetA1Range;
    }

    public TrackerWritebackStatus getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }

    public LocalDateTime getRequestedAt() {
        return requestedAt;
    }

    public LocalDateTime getWrittenAt() {
        return writtenAt;
    }

    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
