package com.capvault.backend.student;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RegisteredDriveStudentResolverTest {
    private final CanonicalStudentAccountBindingRepository bindings = mock(CanonicalStudentAccountBindingRepository.class);
    private final StudentRecordRepository students = mock(StudentRecordRepository.class);
    private final RegisteredDriveStudentResolver resolver = new RegisteredDriveStudentResolver(bindings, students);
    private final UUID workspaceId = UUID.randomUUID();

    @BeforeEach void setup() {
        StudentRecord current = record("1234", "LAST, FIRST", true);
        when(bindings.findAllByGoogleEmailIgnoreCase("owner@example.edu"))
            .thenReturn(List.of(binding("1234", "subject-1", "owner@example.edu")));
        when(students.findAllByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "1234"))
            .thenReturn(List.of(current));
    }

    @Test void verifiedProviderEmailMatchesUniqueCurrentBindingAndWorkspaceRoster() {
        assertThat(resolver.resolve(workspaceId, " OWNER@EXAMPLE.EDU "))
            .contains(new RegisteredDriveStudentResolver.Student("LAST, FIRST", "owner@example.edu"));
        verify(students).findAllByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "1234");
        assertThat(resolver.resolve(UUID.randomUUID(), "owner@example.edu")).isEmpty();
    }

    @Test void noIdentityWithoutProviderEmailOrBoundAccount() {
        assertThat(resolver.resolve(workspaceId, null)).isEmpty();
        assertThat(resolver.resolve(workspaceId, "LAST, FIRST")).isEmpty();
        assertThat(resolver.resolve(workspaceId, "unknown@example.edu")).isEmpty();
        verify(students, never()).findAllByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "unknown");
    }

    @Test void disconnectedOrAmbiguousOrInactiveOrDuplicateRosterReturnsNoName() {
        var disconnected = binding("1234", "subject-1", "owner@example.edu");
        disconnected.disconnect("subject-1", "owner@example.edu", Instant.now());
        when(bindings.findAllByGoogleEmailIgnoreCase("owner@example.edu")).thenReturn(List.of(disconnected));
        assertThat(resolver.resolve(workspaceId, "owner@example.edu")).isEmpty();

        when(bindings.findAllByGoogleEmailIgnoreCase("owner@example.edu")).thenReturn(List.of(
            binding("1234", "subject-1", "owner@example.edu"),
            binding("9999", "subject-2", "owner@example.edu")));
        assertThat(resolver.resolve(workspaceId, "owner@example.edu")).isEmpty();

        when(bindings.findAllByGoogleEmailIgnoreCase("owner@example.edu")).thenReturn(List.of(
            binding("1234", "subject-1", "owner@example.edu")));
        StudentRecord inactive = record("1234", "LAST, FIRST", false);
        when(students.findAllByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "1234"))
            .thenReturn(List.of(inactive));
        assertThat(resolver.resolve(workspaceId, "owner@example.edu")).isEmpty();
        StudentRecord current = record("1234", "LAST, FIRST", true);
        StudentRecord duplicate = record("1234", "OTHER", true);
        when(students.findAllByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "1234"))
            .thenReturn(List.of(current, duplicate));
        assertThat(resolver.resolve(workspaceId, "owner@example.edu")).isEmpty();
    }

    private static CanonicalStudentAccountBinding binding(String number, String subject, String email) {
        var binding = new CanonicalStudentAccountBinding(number, Instant.now());
        binding.bind(subject, email, Instant.now());
        return binding;
    }

    private static StudentRecord record(String number, String name, boolean active) {
        StudentRecord record = mock(StudentRecord.class);
        when(record.getStudentNumber()).thenReturn(number);
        when(record.getStudentName()).thenReturn(name);
        when(record.isCurrentActive()).thenReturn(active);
        return record;
    }
}
