package com.capvault.backend.tracker;

import java.util.Optional;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.sheets.GoogleSheetsGateway;
import com.capvault.backend.workspace.WorkspaceSource;
import com.capvault.backend.workspace.WorkspaceSourceRepository;
import com.capvault.backend.workspace.WorkspaceSourceType;
import com.capvault.backend.workspace.AcademicWorkspace;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class TrackerWritebackService {

    private final TrackerRowRepository trackerRowRepository;
    private final TrackerColumnRepository trackerColumnRepository;
    private final TrackerCellRepository trackerCellRepository;
    private final TrackerWritebackRepository trackerWritebackRepository;
    private final DeliverableRepository deliverableRepository;
    private final WorkspaceSourceRepository workspaceSourceRepository;
    private final GoogleSheetsGateway googleSheetsGateway;
    private final EntityManager entityManager;
    private final TransactionTemplate transactions;

    public TrackerWritebackService(
        TrackerRowRepository trackerRowRepository,
        TrackerColumnRepository trackerColumnRepository,
        TrackerCellRepository trackerCellRepository,
        TrackerWritebackRepository trackerWritebackRepository,
        DeliverableRepository deliverableRepository,
        WorkspaceSourceRepository workspaceSourceRepository,
        GoogleSheetsGateway googleSheetsGateway,
        EntityManager entityManager,
        org.springframework.transaction.PlatformTransactionManager transactionManager
    ) {
        this.trackerRowRepository = trackerRowRepository;
        this.trackerColumnRepository = trackerColumnRepository;
        this.trackerCellRepository = trackerCellRepository;
        this.trackerWritebackRepository = trackerWritebackRepository;
        this.deliverableRepository = deliverableRepository;
        this.workspaceSourceRepository = workspaceSourceRepository;
        this.googleSheetsGateway = googleSheetsGateway;
        this.entityManager = entityManager;
        this.transactions = new TransactionTemplate(transactionManager);
        this.transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public TrackerWritebackResponse writeBack(UUID workspaceId, TrackerWritebackRequest request) {
        Prepared prepared = transactions.execute(status -> prepare(workspaceId, request));
        if (!prepared.deliver()) return prepared.response();
        return deliverResponse(workspaceId, prepared.response().id());
    }

    public TrackerWritebackResponse retry(UUID workspaceId, UUID writebackId) {
        return deliverResponse(workspaceId, writebackId);
    }

    private Prepared prepare(UUID workspaceId, TrackerWritebackRequest request) {
        lockWorkspace(workspaceId);
        TrackerRow row = findTargetRow(workspaceId, request);
        TrackerColumn column = trackerColumnRepository.findByWorkspaceIdAndColumnKeyIgnoreCase(workspaceId, request.trackerColumnKey().trim())
            .orElseThrow(() -> new IllegalArgumentException("Tracker column was not found."));
        String targetKey = workspaceId + ":" + row.getId() + ":" + column.getId();
        String rawValue = String.valueOf(request.daysLate());
        String normalizedStatus = request.daysLate() == 0 ? "ON_TIME" : "LATE";
        TrackerCell cell = trackerCellRepository.findByTrackerRowIdAndTrackerColumnId(row.getId(), column.getId())
            .orElseGet(() -> new TrackerCell(row, column, rawValue, normalizedStatus, row.getSourceRowNumber(), column.getSourceColumnIndex()));
        cell.updateValue(rawValue, normalizedStatus, row.getSourceRowNumber(), column.getSourceColumnIndex());
        trackerCellRepository.save(cell);
        Deliverable deliverable = request.deliverableId() == null ? null : deliverableRepository.findById(request.deliverableId())
            .filter(item -> item.getWorkspaceId().equals(workspaceId))
            .orElseThrow(() -> new IllegalArgumentException("Deliverable was not found."));
        WorkspaceSource source = workspaceSourceRepository.findByWorkspaceIdAndSourceType(workspaceId, WorkspaceSourceType.TRACKER).orElse(null);
        String a1Cell = toA1Range(source == null ? null : source.getDisplayName(), row.getSourceRowNumber(), column.getSourceColumnIndex());
        TrackerWriteback writeback = new TrackerWriteback(workspaceId, row.getStudentNumber(), row.getTeamCode(), row.getMemberNumber(), deliverable,
            column.getColumnKey(), request.daysLate(), row.getSourceRowNumber(), column.getSourceColumnIndex(), a1Cell,
            TrackerWritebackStatus.LOCAL_UPDATED, "Local tracker cell updated.");
        var previous = trackerWritebackRepository.findTopByTargetKeyOrderByGenerationDesc(targetKey);
        long generation = previous.map(item -> item.getGeneration() + 1).orElse(1L);
        previous.filter(item -> item.getStatus() == TrackerWritebackStatus.PENDING_SHEET_WRITE
                || item.getStatus() == TrackerWritebackStatus.UNCERTAIN).ifPresent(TrackerWriteback::markSuperseded);
        writeback.setTarget(targetKey, generation, source == null ? null : source.getSheetId());
        boolean deliver = Boolean.TRUE.equals(request.writeToGoogleSheet());
        if (deliver && (source == null || source.getSheetId() == null || source.getSheetId().isBlank())) {
            writeback.markFailed("Tracker source is not connected.");
            return prepared(trackerWritebackRepository.save(writeback), false);
        }
        if (deliver && !googleSheetsGateway.isConfigured()) {
            writeback = new TrackerWriteback(workspaceId, row.getStudentNumber(), row.getTeamCode(), row.getMemberNumber(), deliverable,
                column.getColumnKey(), request.daysLate(), row.getSourceRowNumber(), column.getSourceColumnIndex(), a1Cell,
                TrackerWritebackStatus.PENDING_GOOGLE_CREDENTIALS, "Local tracker cell updated. Google Sheets credentials are not configured yet.");
            writeback.setTarget(targetKey, generation, source.getSheetId());
            return prepared(trackerWritebackRepository.save(writeback), false);
        }
        if (!deliver) return prepared(trackerWritebackRepository.save(writeback), false);
        writeback.markPending();
        return prepared(trackerWritebackRepository.save(writeback), deliver);
    }

    private TrackerWritebackResponse deliverResponse(UUID workspaceId, UUID writebackId) {
        return transactions.execute(status -> {
            // Read the receipt only after acquiring the same lock as local writes and imports.
            // The already committed PENDING receipt survives a crash or a delivery commit failure.
            lockWorkspace(workspaceId);
            TrackerWriteback writeback = trackerWritebackRepository.findById(writebackId)
                .filter(item -> workspaceId.equals(item.getWorkspaceId()))
                .orElseThrow(() -> new IllegalArgumentException("Tracker writeback was not found."));
            if (writeback.getStatus() != TrackerWritebackStatus.PENDING_SHEET_WRITE
                    && writeback.getStatus() != TrackerWritebackStatus.UNCERTAIN)
                return TrackerWritebackResponse.from(writeback);
            TrackerWriteback latest = trackerWritebackRepository.findTopByTargetKeyOrderByGenerationDesc(writeback.getTargetKey()).orElseThrow();
            if (!latest.getId().equals(writebackId)) {
                writeback.markSuperseded();
                return TrackerWritebackResponse.from(trackerWritebackRepository.save(writeback));
            }
            if (!stillTargetsCurrentCell(writeback)) {
                writeback.markSuperseded();
                return TrackerWritebackResponse.from(trackerWritebackRepository.save(writeback));
            }
            try {
                googleSheetsGateway.updateSingleCell(writeback.getSheetId(), writeback.getTargetA1Range(), String.valueOf(writeback.getDaysLate()));
                writeback.markSheetWritten("Local tracker cell updated and Google Sheet writeback completed.");
            } catch (RuntimeException exception) {
                writeback.markUncertain();
            }
            return TrackerWritebackResponse.from(trackerWritebackRepository.save(writeback));
        });
    }

    void lockWorkspace(UUID workspaceId) {
        if (entityManager.find(AcademicWorkspace.class, workspaceId, LockModeType.PESSIMISTIC_WRITE) == null)
            throw new IllegalArgumentException("Academic workspace was not found.");
    }

    private boolean stillTargetsCurrentCell(TrackerWriteback writeback) {
        String[] key = writeback.getTargetKey().split(":", -1);
        if (key.length != 3) return false;
        try {
            UUID rowId = UUID.fromString(key[1]);
            UUID columnId = UUID.fromString(key[2]);
            TrackerCell cell = trackerCellRepository.findByTrackerRowIdAndTrackerColumnId(rowId, columnId).orElse(null);
            TrackerRow row = trackerRowRepository.findById(rowId).orElse(null);
            TrackerColumn column = trackerColumnRepository.findById(columnId).orElse(null);
            WorkspaceSource source = workspaceSourceRepository.findByWorkspaceIdAndSourceType(
                writeback.getWorkspaceId(), WorkspaceSourceType.TRACKER).orElse(null);
            return cell != null
                && row != null && column != null && Boolean.TRUE.equals(column.getActive())
                && writeback.getWorkspaceId().equals(row.getWorkspaceId())
                && writeback.getWorkspaceId().equals(column.getWorkspaceId())
                && java.util.Objects.equals(writeback.getStudentNumber(), row.getStudentNumber())
                && java.util.Objects.equals(writeback.getTeamCode(), row.getTeamCode())
                && java.util.Objects.equals(writeback.getMemberNumber(), row.getMemberNumber())
                && writeback.getTrackerColumnKey().equalsIgnoreCase(column.getColumnKey())
                && row.getSourceRowNumber().equals(writeback.getTargetRowNumber())
                && column.getSourceColumnIndex().equals(writeback.getTargetColumnIndex())
                && String.valueOf(writeback.getDaysLate()).equals(cell.getRawValue())
                && cell.getSourceRowNumber().equals(writeback.getTargetRowNumber())
                && cell.getSourceColumnIndex().equals(writeback.getTargetColumnIndex())
                && source != null
                && writeback.getSheetId().equals(source.getSheetId())
                && writeback.getTargetA1Range().equals(toA1Range(source.getDisplayName(),
                    cell.getSourceRowNumber(), cell.getSourceColumnIndex()));
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private Prepared prepared(TrackerWriteback writeback, boolean deliver) {
        return new Prepared(deliver, TrackerWritebackResponse.from(writeback));
    }

    private record Prepared(boolean deliver, TrackerWritebackResponse response) { }

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
