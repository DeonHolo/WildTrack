package com.capvault.backend.academic;

import java.util.List;
import java.util.UUID;

import com.capvault.backend.deliverable.DeliverableResponse;
import com.capvault.backend.project.ProjectMetadataResponse;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.student.StudentRecordResponse;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/academic-data")
public class AcademicDataController {

    private final AcademicDataService service;
    private final StudentAssociationSecurity security;

    public AcademicDataController(AcademicDataService service, StudentAssociationSecurity security) {
        this.service = service;
        this.security = security;
    }

    @GetMapping
    public AcademicDataService.Snapshot snapshot(@RequestParam UUID workspaceId, HttpServletRequest http) {
        requireAdmin(http);
        return service.snapshot(workspaceId);
    }

    @PutMapping("/students")
    public List<StudentRecordResponse> saveStudents(
        @RequestParam UUID workspaceId,
        @RequestBody AcademicDataService.StudentBatch request,
        HttpServletRequest http
    ) {
        requireAdmin(http);
        return service.saveStudents(workspaceId, request);
    }

    @PutMapping("/projects")
    public List<ProjectMetadataResponse> saveProjects(
        @RequestParam UUID workspaceId,
        @RequestBody AcademicDataService.ProjectBatch request,
        HttpServletRequest http
    ) {
        requireAdmin(http);
        return service.saveProjects(workspaceId, request);
    }

    @PutMapping("/deliverables")
    public List<DeliverableResponse> saveDeliverables(
        @RequestParam UUID workspaceId,
        @RequestBody AcademicDataService.DeliverableBatch request,
        HttpServletRequest http
    ) {
        requireAdmin(http);
        return service.saveDeliverables(workspaceId, request);
    }

    private void requireAdmin(HttpServletRequest http) {
        if (!security.activeRoles(http).contains(StaffRole.ADMIN)) {
            throw new AccessDeniedException("Admin authorization required.");
        }
    }
}
