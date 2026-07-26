package com.capvault.backend.tracker;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
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

    public TrackerController(
        TrackerColumnRepository columnRepository,
        TrackerRowRepository rowRepository,
        TrackerCellRepository cellRepository,
        TrackerWritebackRepository writebackRepository,
        TrackerWritebackService writebackService
    ) {
        this.columnRepository = columnRepository;
        this.rowRepository = rowRepository;
        this.cellRepository = cellRepository;
        this.writebackRepository = writebackRepository;
        this.writebackService = writebackService;
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
}
