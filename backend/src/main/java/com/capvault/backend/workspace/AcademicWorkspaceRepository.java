package com.capvault.backend.workspace;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AcademicWorkspaceRepository extends JpaRepository<AcademicWorkspace, UUID> {

    List<AcademicWorkspace> findAllByOrderByActiveDescProgramAscCourseCodeAscAcademicYearDescSemesterAsc();

    Optional<AcademicWorkspace> findByProgramIgnoreCaseAndCourseCodeIgnoreCaseAndSemesterIgnoreCaseAndAcademicYearIgnoreCase(
        String program,
        String courseCode,
        String semester,
        String academicYear
    );
}

