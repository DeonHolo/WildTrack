package com.capvault.backend.student;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/students")
public class StudentRecordController {

    private final StudentRecordRepository repository;
    private final StudentAssociationSecurity security;

    public StudentRecordController(StudentRecordRepository repository, StudentAssociationSecurity security) {
        this.repository = repository;
        this.security = security;
    }

    @GetMapping
    public List<StudentRecordResponse> listStudents(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        jakarta.servlet.http.HttpServletRequest request
    ) {
        if (!security.isAdmin(request)) throw new org.springframework.security.access.AccessDeniedException("Admin authorization required.");
        return repository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId)
            .stream()
            .filter(StudentRecord::isCurrentActive)
            .map(StudentRecordResponse::from)
            .toList();
    }
}
