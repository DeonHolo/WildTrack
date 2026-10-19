package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.filecheck.PdfInspection;

class VerifiedPdfSnapshotCacheTest {
    private static final UUID WORKSPACE = UUID.randomUUID();
    private static final DriveFileReference REFERENCE = new DriveFileReference("file-1", "rk-1");
    private static final byte[] BYTES = "%PDF-cache".getBytes(StandardCharsets.UTF_8);

    @Test void verifiedSnapshotIsReusableOnlyForTheSameWorkspaceAndMetadataVersion() {
        var metadata = metadata(BYTES);
        var cache = new VerifiedPdfSnapshotCache();
        var key = VerifiedPdfSnapshotCache.Key.of(WORKSPACE, REFERENCE, metadata);
        cache.put(key, snapshotAt(Instant.now()));
        assertThat(cache.get(key)).isNotNull();
        assertThat(cache.get(VerifiedPdfSnapshotCache.Key.of(UUID.randomUUID(), REFERENCE, metadata))).isNull();
        assertThat(cache.get(VerifiedPdfSnapshotCache.Key.of(WORKSPACE, REFERENCE,
            metadata("changed", BYTES.length, metadata.modifiedTime())))).isNull();
        assertThat(cache.get(VerifiedPdfSnapshotCache.Key.of(WORKSPACE, REFERENCE,
            metadata(metadata.md5Checksum(), BYTES.length + 1, metadata.modifiedTime())))).isNull();
        assertThat(cache.get(VerifiedPdfSnapshotCache.Key.of(WORKSPACE, REFERENCE,
            metadata(metadata.md5Checksum(), BYTES.length, metadata.modifiedTime().plusSeconds(1))))).isNull();
        assertThat(cache.get(VerifiedPdfSnapshotCache.Key.of(WORKSPACE,
            new DriveFileReference("file-1", "other-resource"), metadata))).isNull();
    }

    @Test void ttlEvictionAndOversizeAreBounded() {
        var now = new AtomicReference<>(Instant.parse("2026-10-19T00:00:00Z"));
        var cache = new VerifiedPdfSnapshotCache(new AdvancingClock(now), 4);
        var metadata = metadata(BYTES);
        var key = VerifiedPdfSnapshotCache.Key.of(WORKSPACE, REFERENCE, metadata);
        cache.put(key, snapshotAt(now.get()));
        assertThat(cache.size()).isZero();
        var expiring = new VerifiedPdfSnapshotCache(new AdvancingClock(now), VerifiedPdfSnapshotCache.MAX_WEIGHT_BYTES);
        expiring.put(key, snapshotAt(now.get()));
        now.set(now.get().plusSeconds(15 * 60));
        assertThat(expiring.get(key)).isNull();
    }

    @Test void cacheRequiresPdfDownloadAccessAndActualMd5AndSize() {
        var metadata = metadata(BYTES);
        assertThat(VerifiedPdfSnapshotCache.actualMd5AndSizeMatch(BYTES, metadata)).isTrue();
        assertThat(VerifiedPdfSnapshotCache.actualMd5AndSizeMatch("different".getBytes(StandardCharsets.UTF_8), metadata)).isFalse();
        assertThat(VerifiedPdfSnapshotCache.Key.of(WORKSPACE, REFERENCE,
            metadata("", BYTES.length, metadata.modifiedTime()))).isNull();
        assertThat(VerifiedPdfSnapshotCache.metadataMatches(metadata,
            new DriveFileMetadata("file-1", "x", "text/plain", (long) BYTES.length,
                metadata.md5Checksum(), metadata.modifiedTime(), false, null))).isFalse();
        assertThat(VerifiedPdfSnapshotCache.metadataMatches(metadata, metadata(BYTES))).isTrue();
    }

    @Test void snapshotsDefensivelyCopyMutableBytes() {
        var original = BYTES.clone();
        var snapshot = snapshot();
        snapshot.bytes()[0] = 'X';
        assertThat(snapshot.bytes()).containsExactly(original);
    }

    @Test void aggregateWeightEvictsTheEldestEligibleEntry() {
        var metadataOne = metadata(BYTES);
        var metadataTwo = metadata("different-md5", BYTES.length, metadataOne.modifiedTime().plusSeconds(1));
        var cache = new VerifiedPdfSnapshotCache(java.time.Clock.systemUTC(), 60, 10);
        var keyOne = VerifiedPdfSnapshotCache.Key.of(WORKSPACE, REFERENCE, metadataOne);
        var keyTwo = VerifiedPdfSnapshotCache.Key.of(WORKSPACE,
            new DriveFileReference("file-2", "rk-1"), metadataTwo);
        cache.put(keyOne, snapshotAt(Instant.now()));
        cache.put(keyTwo, snapshotAt(Instant.now()));
        assertThat(cache.get(keyOne)).isNull();
        assertThat(cache.get(keyTwo)).isNotNull();
    }

    private static VerifiedPdfSnapshotCache.Snapshot snapshot() {
        return snapshotAt(Instant.now());
    }

    private static VerifiedPdfSnapshotCache.Snapshot snapshotAt(Instant capturedAt) {
        return new VerifiedPdfSnapshotCache.Snapshot(BYTES,
            new PdfInspection(true, false, 1, 1, 10, "captured text", null,
                java.util.List.of(new PdfInspection.PageText(1, "page text", false))),
            capturedAt);
    }

    private static DriveFileMetadata metadata(byte[] bytes) {
        try {
            String md5 = java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("MD5").digest(bytes));
            return metadata(md5, bytes.length, Instant.parse("2026-10-19T00:00:00Z").atOffset(ZoneOffset.UTC));
        } catch (Exception exception) { throw new AssertionError(exception); }
    }

    private static DriveFileMetadata metadata(String md5, long size, java.time.OffsetDateTime modified) {
        return new DriveFileMetadata("file-1", "document.pdf", "application/pdf", size, md5, modified,
            true, "https://drive.google.com/file/d/file-1/view");
    }

    private static final class AdvancingClock extends Clock {
        private final AtomicReference<Instant> now;
        private AdvancingClock(AtomicReference<Instant> now) { this.now = now; }
        public ZoneOffset getZone() { return ZoneOffset.UTC; }
        public Clock withZone(java.time.ZoneId zone) { return this; }
        public Instant instant() { return now.get(); }
    }
}
