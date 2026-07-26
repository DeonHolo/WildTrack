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

    public StudentRecordController(StudentRecordRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<StudentRecordResponse> listStudents(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId
    ) {
        return repository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId)
            .stream()
            .map(StudentRecordResponse::from)
            .toList();
    }
}
