package com.capvault.backend.staff;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:staff-concurrent-removal;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;DEFAULT_NULL_ORDERING=HIGH")
@ActiveProfiles("test")
class StaffConcurrentRemovalTest {

    @Autowired
    private StaffManagementService service;

    @Autowired
    private StaffRoleAssignmentRepository roleRepository;

    @Test
    void concurrentDisablesCannotRemoveTheFinalTwoAdministrators() throws Exception {
        String first = "concurrent-admin-a-" + UUID.randomUUID();
        String second = "concurrent-admin-b-" + UUID.randomUUID();
        Instant now = Instant.now();
        roleRepository.saveAllAndFlush(List.of(
            new StaffRoleAssignment(UUID.randomUUID(), first, first + "@example.test", StaffRole.ADMIN, true, now, now),
            new StaffRoleAssignment(UUID.randomUUID(), second, second + "@example.test", StaffRole.ADMIN, true, now, now)));

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            var firstDisable = executor.submit(() -> disableWhenReleased(first, ready, start));
            var secondDisable = executor.submit(() -> disableWhenReleased(second, ready, start));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            assertThat(List.of(firstDisable.get(15, TimeUnit.SECONDS), secondDisable.get(15, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(true, false);
            long remaining = roleRepository.findAll().stream()
                .filter(row -> (row.getGoogleSubject().equals(first) || row.getGoogleSubject().equals(second))
                    && row.isEnabled() && row.getRole() == StaffRole.ADMIN)
                .count();
            assertThat(remaining).isEqualTo(1);
        } finally {
            executor.shutdownNow();
            roleRepository.findAll().stream()
                .filter(row -> row.getGoogleSubject().equals(first) || row.getGoogleSubject().equals(second))
                .forEach(roleRepository::delete);
        }
    }

    private boolean disableWhenReleased(String subject, CountDownLatch ready, CountDownLatch start) {
        ready.countDown();
        try {
            if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent start timed out.");
            service.setStaffEnabled(subject, false);
            return true;
        } catch (org.springframework.web.server.ResponseStatusException exception) {
            assertThat(exception.getStatusCode().value()).isEqualTo(409);
            return false;
        } catch (InterruptedException exception) {
            if (exception instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }
}
