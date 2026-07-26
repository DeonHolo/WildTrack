package com.capvault.backend.workspace;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AcademicWorkspaceService {

    private final AcademicWorkspaceRepository repository;

    public AcademicWorkspaceService(AcademicWorkspaceRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<AcademicWorkspaceResponse> list() {
        return repository.findAllByOrderByActiveDescProgramAscCourseCodeAscAcademicYearDescSemesterAsc()
            .stream()
            .map(AcademicWorkspaceResponse::from)
            .toList();
    }

    @Transactional(readOnly = true)
    public AcademicWorkspace require(UUID workspaceId) {
        UUID resolvedId = workspaceId == null ? AcademicWorkspace.DEFAULT_IT_ID : workspaceId;
        return repository.findById(resolvedId)
            .orElseThrow(() -> new IllegalArgumentException("Academic workspace was not found."));
    }

    @Transactional
    public AcademicWorkspaceResponse create(AcademicWorkspaceRequest request) {
        String program = request.program().trim();
        String courseCode = request.courseCode().trim();
        String semester = request.semester().trim();
        String academicYear = request.academicYear().trim();
        repository.findByProgramIgnoreCaseAndCourseCodeIgnoreCaseAndSemesterIgnoreCaseAndAcademicYearIgnoreCase(
            program,
            courseCode,
            semester,
            academicYear
        ).ifPresent(existing -> {
            throw new IllegalArgumentException("A workspace already exists for this program, course, semester, and academic year.");
        });

        AcademicWorkspace workspace = new AcademicWorkspace(
            request.name().trim(),
            program,
            courseCode,
            semester,
            academicYear,
            request.active() == null || request.active()
        );
        return AcademicWorkspaceResponse.from(repository.save(workspace));
    }

    @Transactional
    public AcademicWorkspaceResponse update(UUID id, AcademicWorkspaceRequest request) {
        AcademicWorkspace workspace = require(id);
        workspace.setName(request.name().trim());
        workspace.setProgram(request.program().trim());
        workspace.setCourseCode(request.courseCode().trim());
        workspace.setSemester(request.semester().trim());
        workspace.setAcademicYear(request.academicYear().trim());
        workspace.setActive(request.active() == null || request.active());
        return AcademicWorkspaceResponse.from(repository.save(workspace));
    }
}

