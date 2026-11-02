package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.*;
import java.time.*;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.embedded.*;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

class GeminiRequestBudgetTest {
    private EmbeddedDatabase db;
    private JdbcTemplate jdbc;
    private final TestClock clock = new TestClock();
    private GeminiRequestBudget budget;
    @BeforeEach void setup() {
        db = new EmbeddedDatabaseBuilder().generateUniqueName(true).setType(EmbeddedDatabaseType.H2).build();
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V50__gemini_request_budget.sql")).execute(db);
        jdbc = new JdbcTemplate(db);
        budget = new GeminiRequestBudget(jdbc, new DataSourceTransactionManager(db), clock, 200000, 12, "test");
    }
    @AfterEach void close() { db.shutdown(); }

    @Test void capacityIsSharedAcrossInstancesAndSurvivesTheirReplacement() {
        var first = budget.reserve(130000);
        budget.complete(first.id(), 140000, 200);
        var afterRestart = new GeminiRequestBudget(jdbc, new DataSourceTransactionManager(db), clock, 200000, 12, "test");
        assertThat(afterRestart.reserve(70000).acquired()).isFalse();
        assertThat(afterRestart.reserve(10000).acquired()).isTrue();
        clock.advance(66000);
        assertThat(afterRestart.reserve(130000).acquired()).isTrue();
    }
    @Test void countsAreReusedOnlyForIdenticalInputAndExpire() {
        var calls = new AtomicInteger();
        assertThat(budget.count("request-a", () -> { calls.incrementAndGet(); return 12000; })).isEqualTo(12000);
        assertThat(budget.count("request-a", () -> { calls.incrementAndGet(); return 50000; })).isEqualTo(12000);
        budget.count("request-b", () -> { calls.incrementAndGet(); return 12000; });
        assertThat(calls).hasValue(2);
        clock.advance(Duration.ofDays(2).toMillis());
        budget.count("request-a", () -> { calls.incrementAndGet(); return 13000; });
        assertThat(calls).hasValue(3);
    }
    @Test void aSingleOversizedRequestFailsImmediatelyRatherThanWaitingForever() {
        assertThatThrownBy(() -> budget.reserve(200001)).isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class,
            f -> assertThat(f.code).isEqualTo("INPUT_TOKEN_BUDGET_EXCEEDED"));
    }
    @Test void dailyQuotaBlocksFurtherGenerationsAndResetsAtPacificMidnightIncludingDst() {
        budget.reserve(1000);
        var reset = GeminiRequestBudget.dailyReset(clock.instant());
        budget.block(reset, "DAILY_LIMIT_REACHED");
        assertThatThrownBy(() -> budget.reserve(1000)).isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class,
            f -> assertThat(f.code).isEqualTo("DAILY_LIMIT_REACHED"));
        assertThat(GeminiRequestBudget.dailyReset(Instant.parse("2026-11-03T06:00:00Z"))).isEqualTo("2026-11-03T08:00:00Z");
        clock.advance(Duration.between(clock.instant(), reset).toMillis() + 1);
        assertThat(budget.reserve(1000).acquired()).isTrue();
    }
    @Test void theRollingWindowHonorsBothRequestsAndInputTokens() {
        var now = clock.instant();
        assertThat(GeminiRequestBudget.nextAvailable(now, List.of(new GeminiRequestBudget.Usage(now, 150000)), 60000, 200000, 12))
            .isEqualTo(now.plusSeconds(65).plusMillis(100));
        assertThat(GeminiRequestBudget.nextAvailable(now, List.of(new GeminiRequestBudget.Usage(now, 100)), 100, 200000, 1)).isAfter(now);
    }
    static class TestClock extends Clock {
        private Instant now = Instant.parse("2026-11-03T06:00:00Z");
        void advance(long ms) { now = now.plusMillis(ms); }
        @Override public Instant instant() { return now; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
    }
}
