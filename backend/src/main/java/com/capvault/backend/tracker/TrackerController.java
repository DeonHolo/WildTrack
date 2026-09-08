package com.capvault.backend.tracker;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import com.capvault.backend.student.StudentAssociationSecurity;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/tracker")
public class TrackerController {

    private final TrackerColumnRepository columnRepository;
    private final TrackerRowRepository rowRepository;
    private final TrackerCellRepository cellRepository;
    private final TrackerWritebackRepository writebackRepository;
    private final TrackerWritebackService writebackService;
    private final StudentAssociationSecurity security;

    public TrackerController(
        TrackerColumnRepository columnRepository,
        TrackerRowRepository rowRepository,
        TrackerCellRepository cellRepository,
        TrackerWritebackRepository writebackRepository,
        TrackerWritebackService writebackService,
        StudentAssociationSecurity security
    ) {
        this.columnRepository = columnRepository;
        this.rowRepository = rowRepository;
        this.cellRepository = cellRepository;
        this.writebackRepository = writebackRepository;
        this.writebackService = writebackService;
        this.security = security;
    }

    public record TrackerColumnRequest(
        @NotBlank String columnKey,
        @NotBlank String label,
        @NotBlank String sourceColumn,
        Integer sourceColumnIndex,
        Integer displayOrder,
        Boolean active,
        Boolean pdfRequired
    ) {
    }

    @GetMapping("/columns")
    @Transactional(readOnly = true)
    public List<TrackerColumnResponse> listColumns(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId
    ) {
        return columnRepository.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(workspaceId)
            .stream()
            .map(TrackerColumnResponse::from)
            .toList();
    }

    @GetMapping("/rows")
    @Transactional(readOnly = true)
    public List<TrackerRowResponse> listRows(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId
    ) {
        return rowRepository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId)
            .stream()
            .map(row -> {
                List<TrackerCell> cells = cellRepository.findAllByTrackerRowId(row.getId())
                    .stream()
                    .sorted(Comparator.comparing(cell -> cell.getTrackerColumn().getDisplayOrder()))
                    .toList();
                return TrackerRowResponse.from(row, cells);
            })
            .toList();
    }

    @PostMapping("/columns")
    public TrackerColumnResponse createColumn(
        @RequestParam UUID workspaceId,
        @Valid @RequestBody TrackerColumnRequest request,
        HttpServletRequest http
    ) {
        requireAdmin(http);
        int nextOrder = request.displayOrder() == null
            ? columnRepository.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(workspaceId).size()
            : request.displayOrder();
        TrackerColumn column = new TrackerColumn(
            workspaceId,
            request.columnKey(),
            request.label(),
            request.sourceColumn(),
            request.sourceColumnIndex() == null ? nextOrder : request.sourceColumnIndex(),
            nextOrder,
            request.active() == null || request.active(),
            request.pdfRequired() != null && request.pdfRequired()
        );
        return TrackerColumnResponse.from(columnRepository.save(column));
    }

    @PutMapping("/columns/{columnId}")
    public TrackerColumnResponse updateColumn(
        @RequestParam UUID workspaceId,
        @PathVariable UUID columnId,
        @Valid @RequestBody TrackerColumnRequest request,
        HttpServletRequest http
    ) {
        requireAdmin(http);
        TrackerColumn column = columnRepository.findById(columnId)
            .filter(item -> workspaceId.equals(item.getWorkspaceId()))
            .orElseThrow(() -> new IllegalArgumentException("Tracker column not found."));
        column.updateFrom(
            request.columnKey(),
            request.label(),
            request.sourceColumn(),
            request.sourceColumnIndex() == null ? column.getSourceColumnIndex() : request.sourceColumnIndex(),
            request.displayOrder() == null ? column.getDisplayOrder() : request.displayOrder(),
            request.active() == null ? column.getActive() : request.active(),
            request.pdfRequired() == null ? column.getPdfRequired() : request.pdfRequired()
        );
        return TrackerColumnResponse.from(columnRepository.save(column));
    }

    @PostMapping("/writebacks")
    public TrackerWritebackResponse writeBack(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        @Valid @RequestBody TrackerWritebackRequest request
    ) {
        return writebackService.writeBack(workspaceId, request);
    }

    @GetMapping("/writebacks")
    @Transactional(readOnly = true)
    public List<TrackerWritebackResponse> listWritebacks(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId
    ) {
        return writebackRepository.findTop50ByWorkspaceIdOrderByRequestedAtDesc(workspaceId)
            .stream()
            .map(TrackerWritebackResponse::from)
            .toList();
    }

    private void requireAdmin(HttpServletRequest http) {
        if (!security.isAdmin(http)) throw new AccessDeniedException("Admin authorization required.");
    }
}
