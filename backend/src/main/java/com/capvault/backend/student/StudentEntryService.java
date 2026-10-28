package com.capvault.backend.student;

import java.time.Clock;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.workspace.AcademicWorkspace;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StudentEntryService {
    private static final long WINDOW_MILLIS = 60_000;
    private static final int MAX_ACCOUNTS = 10_000;
    private final Map<String, Attempts> attempts = new LinkedHashMap<>();
    private final StudentRecordRepository records;
    private final StudentAssociationService associations;
    private final EntityManager entityManager;
    private final Clock clock;

    public StudentEntryService(StudentRecordRepository records, StudentAssociationService associations,
            EntityManager entityManager, Clock clock) {
        this.records = records;
        this.associations = associations;
        this.entityManager = entityManager;
        this.clock = clock;
    }

    public static class ThrottledException extends RuntimeException {}
    private record Attempts(long started, int count) {}

    @Transactional
    public StudentAssociationService.AssociationView connect(String subject, String email, String number, String name, String team) {
        reserveAttempt(subject);
        String normalizedNumber = normalize(number);
        for (StudentRecord candidate : records.findAllByStudentNumberIgnoreCase(normalizedNumber).stream()
                .sorted(Comparator.comparing((StudentRecord r) -> r.getWorkspaceId().toString())
                    .thenComparing(r -> r.getId().toString())).toList()) {
            AcademicWorkspace workspace = entityManager.find(AcademicWorkspace.class, candidate.getWorkspaceId(), LockModeType.PESSIMISTIC_WRITE);
            if (workspace == null) continue;
            entityManager.refresh(workspace, LockModeType.PESSIMISTIC_WRITE);
            StudentRecord record = records.lockById(candidate.getId()).orElse(null);
            if (record == null) continue;
            entityManager.refresh(record, LockModeType.PESSIMISTIC_WRITE);
            if (workspace.isActive() && record.isCurrentActive()
                    && normalize(record.getStudentNumber()).equals(normalizedNumber)
                    && normalize(record.getStudentName()).equals(normalize(name))
                    && normalize(record.getTeamCode()).equals(normalize(team))) {
                var result = associations.connectDirectly(workspace.getId(), subject, email, record.getStudentNumber());
                clearAttempts(subject);
                return result;
            }
        }
        throw new IllegalArgumentException("Student details do not match an active class record.");
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private synchronized void reserveAttempt(String subject) {
        long now = clock.millis();
        attempts.entrySet().removeIf(entry -> now - entry.getValue().started() >= WINDOW_MILLIS);
        Attempts current = attempts.get(subject);
        if (current != null && current.count() >= 5) throw new ThrottledException();
        if (current == null && attempts.size() >= MAX_ACCOUNTS) {
            throw new ThrottledException();
        }
        attempts.put(subject, current == null ? new Attempts(now, 1) : new Attempts(current.started(), current.count() + 1));
    }

    private synchronized void clearAttempts(String subject) {
        attempts.remove(subject);
    }
}
