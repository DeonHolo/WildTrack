package com.capvault.backend.student;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Staff-only attribution from Google's structured email to an active, unambiguous
 * canonical account binding AND current roster entry in the requested workspace.
 * Never infer a Drive actor from the submitter or Google's display name. */
@Service
public class RegisteredDriveStudentResolver {
    public record Student(String studentName, String email) { }

    private final CanonicalStudentAccountBindingRepository bindings;
    private final StudentRecordRepository students;

    public RegisteredDriveStudentResolver(CanonicalStudentAccountBindingRepository bindings,
                                          StudentRecordRepository students) {
        this.bindings = bindings;
        this.students = students;
    }

    @Transactional(readOnly = true)
    public Optional<Student> resolve(UUID workspaceId, String providerEmail) {
        if (workspaceId == null || providerEmail == null || providerEmail.isBlank()) return Optional.empty();
        String email = providerEmail.trim().toLowerCase(Locale.ROOT);
        List<CanonicalStudentAccountBinding> matches = bindings.findAllByGoogleEmailIgnoreCase(email).stream()
            .filter(CanonicalStudentAccountBinding::isBound)
            .filter(binding -> binding.getGoogleEmail() != null
                && email.equals(binding.getGoogleEmail().trim().toLowerCase(Locale.ROOT)))
            .toList();
        // Never attribute ambiguous/recovered accounts to a guessed student.
        if (matches.size() != 1) return Optional.empty();
        CanonicalStudentAccountBinding bound = matches.get(0);
        List<StudentRecord> roster = students.findAllByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId,
                bound.getStudentNumberKey())
            .stream().filter(StudentRecord::isCurrentActive)
            .filter(student -> student.getStudentNumber() != null &&
                bound.getStudentNumberKey().equals(student.getStudentNumber().trim().toLowerCase(Locale.ROOT)))
            .toList();
        if (roster.size() != 1 || roster.get(0).getStudentName() == null
                || roster.get(0).getStudentName().isBlank()) return Optional.empty();
        return Optional.of(new Student(roster.get(0).getStudentName(), bound.getGoogleEmail()));
    }
}
