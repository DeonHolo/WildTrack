package com.capvault.backend.tracker;

import java.util.Optional;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.sheets.GoogleSheetsGateway;
import com.capvault.backend.workspace.WorkspaceSource;
import com.capvault.backend.workspace.WorkspaceSourceRepository;
import com.capvault.backend.workspace.WorkspaceSourceType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TrackerWritebackService {

    private final TrackerRowRepository trackerRowRepository;
    private final TrackerColumnRepository trackerColumnRepository;
    private final TrackerCellRepository trackerCellRepository;
    private final TrackerWritebackRepository trackerWritebackRepository;
    private final DeliverableRepository deliverableRepository;
    private final WorkspaceSourceRepository workspaceSourceRepository;
    private final GoogleSheetsGateway googleSheetsGateway;

    public TrackerWritebackService(
        TrackerRowRepository trackerRowRepository,
        TrackerColumnRepository trackerColumnRepository,
        TrackerCellRepository trackerCellRepository,
        TrackerWritebackRepository trackerWritebackRepository,
        DeliverableRepository deliverableRepository,
        WorkspaceSourceRepository workspaceSourceRepository,
        GoogleSheetsGateway googleSheetsGateway
    ) {
        this.trackerRowRepository = trackerRowRepository;
        this.trackerColumnRepository = trackerColumnRepository;
        this.trackerCellRepository = trackerCellRepository;
        this.trackerWritebackRepository = trackerWritebackRepository;
        this.deliverableRepository = deliverableRepository;
        this.workspaceSourceRepository = workspaceSourceRepository;
        this.googleSheetsGateway = googleSheetsGateway;
    }

    @Transactional
    public TrackerWritebackResponse writeBack(UUID workspaceId, TrackerWritebackRequest request) {
        TrackerRow row = findTargetRow(workspaceId, request);
        TrackerColumn column = trackerColumnRepository.findByWorkspaceIdAndColumnKeyIgnoreCase(workspaceId, request.trackerColumnKey().trim())
            .orElseThrow(() -> new IllegalArgumentException("Tracker column was not found."));

        String rawValue = String.valueOf(request.daysLate());
        String normalizedStatus = request.daysLate() == 0 ? "ON_TIME" : "LATE";
        TrackerCell cell = trackerCellRepository.findByTrackerRowIdAndTrackerColumnId(row.getId(), column.getId())
            .orElseGet(() -> new TrackerCell(
                row,
                column,
                rawValue,
                normalizedStatus,
                row.getSourceRowNumber(),
                column.getSourceColumnIndex()
            ));
        cell.updateValue(rawValue, normalizedStatus, row.getSourceRowNumber(), column.getSourceColumnIndex());
        trackerCellRepository.save(cell);

        Deliverable deliverable = request.deliverableId() == null
            ? null
            : deliverableRepository.findById(request.deliverableId())
                .filter(item -> item.getWorkspaceId().equals(workspaceId))
                .orElseThrow(() -> new IllegalArgumentException("Deliverable was not found."));

        WorkspaceSource trackerSource = workspaceSourceRepository.findByWorkspaceIdAndSourceType(workspaceId, WorkspaceSourceType.TRACKER)
            .orElse(null);
        String a1Cell = toA1Range(trackerSource == null ? null : trackerSource.getDisplayName(), row.getSourceRowNumber(), column.getSourceColumnIndex());

        TrackerWritebackStatus status = TrackerWritebackStatus.LOCAL_UPDATED;
        String message = "Local tracker cell updated.";
        TrackerWriteback writeback = new TrackerWriteback(
            workspaceId,
            row.getStudentNumber(),
            row.getTeamCode(),
            row.getMemberNumber(),
            deliverable,
            column.getColumnKey(),
            request.daysLate(),
            row.getSourceRowNumber(),
            column.getSourceColumnIndex(),
            a1Cell,
            status,
            message
        );

        if (Boolean.TRUE.equals(request.writeToGoogleSheet())) {
            if (trackerSource == null || trackerSource.getSheetId() == null || trackerSource.getSheetId().isBlank()) {
                writeback.markFailed("Tracker source is not connected.");
            } else if (!googleSheetsGateway.isConfigured()) {
                writeback = new TrackerWriteback(
                    workspaceId,
                    row.getStudentNumber(),
                    row.getTeamCode(),
                    row.getMemberNumber(),
                    deliverable,
                    column.getColumnKey(),
                    request.daysLate(),
                    row.getSourceRowNumber(),
                    column.getSourceColumnIndex(),
                    a1Cell,
                    TrackerWritebackStatus.PENDING_GOOGLE_CREDENTIALS,
                    "Local tracker cell updated. Google Sheets credentials are not configured yet."
                );
            } else {
                try {
                    googleSheetsGateway.updateSingleCell(trackerSource.getSheetId(), a1Cell, rawValue);
                    writeback.markSheetWritten("Local tracker cell updated and Google Sheet writeback completed.");
                } catch (RuntimeException exception) {
                    writeback.markFailed(exception.getMessage());
                }
            }
        }

        return TrackerWritebackResponse.from(trackerWritebackRepository.save(writeback));
    }

    private TrackerRow findTargetRow(UUID workspaceId, TrackerWritebackRequest request) {
        String studentNumber = request.studentNumber() == null ? "" : request.studentNumber().trim();
        if (!studentNumber.isBlank()) {
            Optional<TrackerRow> byStudentNumber = trackerRowRepository.findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, studentNumber);
            if (byStudentNumber.isPresent()) {
                return byStudentNumber.get();
            }
        }

        String teamCode = request.teamCode().trim();
        String memberNumber = request.memberNumber() == null ? "" : request.memberNumber().trim();
        if (!memberNumber.isBlank()) {
            return trackerRowRepository.findFirstByWorkspaceIdAndTeamCodeIgnoreCaseAndMemberNumberIgnoreCase(workspaceId, teamCode, memberNumber)
                .orElseThrow(() -> new IllegalArgumentException("No tracker row matched the given team and member number."));
        }

        throw new IllegalArgumentException("Provide either Student Number or member number for tracker writeback.");
    }

    static String toA1Range(String sheetName, int oneBasedRowNumber, int zeroBasedColumnIndex) {
        String cell = toColumnLetters(zeroBasedColumnIndex) + oneBasedRowNumber;
        if (sheetName == null || sheetName.isBlank()) {
            return cell;
        }
        String escapedSheetName = sheetName.replace("'", "''");
        return "'" + escapedSheetName + "'!" + cell;
    }

    static String toColumnLetters(int zeroBasedColumnIndex) {
        int number = zeroBasedColumnIndex + 1;
        StringBuilder builder = new StringBuilder();
        while (number > 0) {
            int remainder = (number - 1) % 26;
            builder.insert(0, (char) ('A' + remainder));
            number = (number - 1) / 26;
        }
        return builder.toString();
    }
}
