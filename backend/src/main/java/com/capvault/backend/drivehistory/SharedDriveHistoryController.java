package com.capvault.backend.drivehistory;

import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/drive-history")
public class SharedDriveHistoryController {
    private final SharedDriveHistoryService service;

    public SharedDriveHistoryController(SharedDriveHistoryService service) {
        this.service = service;
    }

    @GetMapping
    public SharedDriveHistoryView history(@RequestParam UUID workspaceId,
                                          @RequestParam UUID responseId,
                                          @RequestParam(required = false) String fieldId,
                                          @RequestParam(required = false) String pageToken,
                                          HttpServletRequest request) {
        return service.forSubmission(workspaceId, responseId, fieldId, pageToken, request);
    }
}
