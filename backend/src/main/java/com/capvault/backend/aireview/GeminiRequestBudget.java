package com.capvault.backend.aireview;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.function.IntSupplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Shared project/model accounting. Stores counts and timestamps, never prompts, PDFs or API keys. */
@Service
public class GeminiRequestBudget {
    static final Duration WINDOW = Duration.ofSeconds(65);
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final int tokenLimit, requestLimit;
    private final String scope;
    record Reservation(UUID id, Instant retryAt) { boolean acquired() { return id != null; } }
    record Usage(Instant startedAt, int tokens) { }

    public GeminiRequestBudget(JdbcTemplate jdbc, PlatformTransactionManager manager, Clock clock,
            @Value("${wildtrack.gemini.input-tokens-per-minute:200000}") int tokenLimit,
            @Value("${wildtrack.gemini.requests-per-minute:12}") int requestLimit,
            @Value("${wildtrack.gemini.quota-scope:primary}") String projectScope) {
        this.jdbc = jdbc; this.clock = clock;
        this.tokenLimit = Math.max(1000, tokenLimit); this.requestLimit = Math.max(1, requestLimit);
        this.scope = projectScope + ":" + GeminiAiReviewProvider.MODEL;
        if (scope.length() > 200) throw new IllegalArgumentException("Invalid Gemini quota scope.");
        tx = new TransactionTemplate(manager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    int count(String fingerprint, IntSupplier request) {
        var saved = jdbc.query("SELECT input_tokens FROM gemini_token_counts WHERE fingerprint = ? AND counted_at > ?",
            (r, n) -> r.getInt(1), fingerprint, stamp(clock.instant().minus(Duration.ofDays(1))));
        if (!saved.isEmpty()) return saved.getFirst();
        int count = request.getAsInt();
        if (count <= 0) throw new GeminiAiReviewProvider.Failure("TOKEN_COUNT_UNAVAILABLE");
        jdbc.update("DELETE FROM gemini_token_counts WHERE counted_at < ?", stamp(clock.instant().minus(Duration.ofDays(1))));
        try { jdbc.update("INSERT INTO gemini_token_counts(fingerprint,input_tokens,counted_at) VALUES(?,?,?)", fingerprint, count, stamp(clock.instant())); }
        catch (DuplicateKeyException duplicate) { /* A concurrent count of identical input is harmless. */ }
        return count;
    }

    Reservation reserve(int inputTokens) {
        if (inputTokens > tokenLimit) throw new GeminiAiReviewProvider.Failure("INPUT_TOKEN_BUDGET_EXCEEDED");
        try { tx.executeWithoutResult(s -> jdbc.update("INSERT INTO gemini_quota_state(scope) VALUES(?)", scope)); }
        catch (DuplicateKeyException exists) { /* Persistent row is the cross-worker lock. */ }
        return tx.execute(status -> {
            var blocked = jdbc.query("SELECT blocked_until, blocked_reason FROM gemini_quota_state WHERE scope = ? FOR UPDATE",
                (r, n) -> new Block(r.getTimestamp(1) == null ? null : r.getTimestamp(1).toInstant(), r.getString(2)), scope).getFirst();
            Instant now = clock.instant();
            if (blocked.until() != null && blocked.until().isAfter(now)) {
                if ("DAILY_LIMIT_REACHED".equals(blocked.reason())) throw new GeminiAiReviewProvider.Failure("DAILY_LIMIT_REACHED");
                return new Reservation(null, blocked.until());
            }
            jdbc.update("DELETE FROM gemini_request_usage WHERE started_at < ?", stamp(now.minus(Duration.ofDays(3))));
            var recent = jdbc.query("SELECT started_at, estimated_tokens, actual_tokens FROM gemini_request_usage WHERE scope = ? AND started_at > ? ORDER BY started_at",
                (r, n) -> new Usage(r.getTimestamp(1).toInstant(), Math.max(r.getInt(2), r.getInt(3))), scope, stamp(now.minus(WINDOW)));
            Instant retry = nextAvailable(now, recent, inputTokens, tokenLimit, requestLimit);
            if (retry.isAfter(now)) return new Reservation(null, retry);
            var id = UUID.randomUUID();
            jdbc.update("INSERT INTO gemini_request_usage(id,scope,started_at,estimated_tokens) VALUES(?,?,?,?)", id, scope, stamp(now), inputTokens);
            return new Reservation(id, null);
        });
    }

    static Instant nextAvailable(Instant now, List<Usage> recent, int input, int tokenLimit, int requestLimit) {
        long used = recent.stream().mapToLong(Usage::tokens).sum();
        int requests = recent.size();
        Instant retry = now;
        for (var row : recent) {
            if (used + input <= tokenLimit && requests < requestLimit) break;
            used -= row.tokens(); requests--;
            retry = row.startedAt().plus(WINDOW).plusMillis(100);
        }
        return retry.isAfter(now) ? retry : now;
    }

    void complete(UUID id, Integer actualTokens, int status) {
        jdbc.update("UPDATE gemini_request_usage SET actual_tokens = ?, http_status = ? WHERE id = ?", actualTokens, status, id);
    }
    void block(Instant until, String reason) {
        // Called only after reserve, so the scope row exists. Never shorten another worker's cooldown.
        jdbc.update("UPDATE gemini_quota_state SET blocked_until = ?, blocked_reason = ? WHERE scope = ? AND (blocked_until IS NULL OR blocked_until < ?)",
            stamp(until), reason, scope, stamp(until));
    }
    static Instant dailyReset(Instant now) {
        ZoneId pacific = ZoneId.of("America/Los_Angeles");
        return now.atZone(pacific).toLocalDate().plusDays(1).atStartOfDay(pacific).toInstant();
    }
    private record Block(Instant until, String reason) { }
    private static Timestamp stamp(Instant instant) { return Timestamp.from(instant); }
}
