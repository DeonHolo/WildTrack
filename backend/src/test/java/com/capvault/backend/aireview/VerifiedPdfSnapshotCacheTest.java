package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.filecheck.PdfInspection;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class VerifiedPdfSnapshotCacheTest {
    @TempDir Path parent;
    private static final UUID WORKSPACE = UUID.randomUUID();
    private static final byte[] BYTES = "%PDF-cache".getBytes(StandardCharsets.UTF_8);
    private static final Instant NOW = Instant.parse("2026-10-19T00:00:00Z");
    private static final PdfInspection INSPECTION = new PdfInspection(true, false, 1, 1, 13,
        "captured text", null, List.of(new PdfInspection.PageText(1, "page text", false)));
    private static final long RAM_WEIGHT = BYTES.length + 2L * ("captured text".length() + "page text".length());

    private VerifiedPdfSnapshotCache cache(long ram, int count, long disk) {
        return new VerifiedPdfSnapshotCache(Clock.fixed(NOW, ZoneOffset.UTC), ram, count, disk, new ObjectMapper(), parent);
    }
    private static VerifiedPdfSnapshotCache.Key key(String id) { return key(id, BYTES); }
    private static VerifiedPdfSnapshotCache.Key key(String id, byte[] bytes) {
        return VerifiedPdfSnapshotCache.Key.of(WORKSPACE, new DriveFileReference(id, "resource"), metadata(bytes));
    }
    private static DriveFileMetadata metadata(byte[] bytes) {
        try {
            return new DriveFileMetadata("file", "file.pdf", "application/pdf", (long) bytes.length,
                HexFormat.of().formatHex(java.security.MessageDigest.getInstance("MD5").digest(bytes)),
                NOW.atOffset(ZoneOffset.UTC), true, "");
        } catch (Exception e) { throw new AssertionError(e); }
    }
    private static VerifiedPdfSnapshotCache.Snapshot snapshot() {
        return new VerifiedPdfSnapshotCache.Snapshot(BYTES, INSPECTION, NOW);
    }
    private static Path onlyFile(VerifiedPdfSnapshotCache cache) throws IOException {
        try (var paths = Files.list(cache.diskDirectory())) { return paths.findFirst().orElseThrow(); }
    }
    private static long physicalBytes(VerifiedPdfSnapshotCache cache) throws IOException {
        try (var paths = Files.list(cache.diskDirectory())) {
            return paths.mapToLong(path -> { try { return Files.size(path); } catch (IOException e) { throw new AssertionError(e); } }).sum();
        }
    }

    @Test void illustratedArtifactsSurviveRamSnapshotsAndDefensiveCopies() {
        assertIllustratedArtifactsSurvive(1_000_000);
    }

    @Test void illustratedArtifactsSurviveDiskOnlySnapshotsAndDefensiveCopies() {
        assertIllustratedArtifactsSurvive(1);
    }

    private void assertIllustratedArtifactsSurvive(long ram) {
        var artifacts = List.of(new PdfInspection.IllustratedArtifact("use case diagram", 2));
        var inspection = new PdfInspection(true, false, 1, 1, 13, "captured text", null,
            List.of(new PdfInspection.PageText(1, "Use Case Diagram", true, artifacts)));
        try (var cache = cache(ram, 256, 10000)) {
            cache.put(key("illustrated"), new VerifiedPdfSnapshotCache.Snapshot(BYTES, inspection, NOW));
            assertThat(cache.ramSize()).isEqualTo(ram == 1 ? 0 : 1);
            assertThat(cache.get(key("illustrated")).inspectionCopy()).isEqualTo(inspection);
            assertThat(cache.get(key("illustrated")).inspection().pages().getFirst().illustratedArtifacts())
                .containsExactlyElementsOf(artifacts);
        }
    }

    @Test void ramEvictionRestoresBytesInspectionAndOriginalCaptureTime() {
        try (var cache = cache(RAM_WEIGHT, 256, 10000)) {
            cache.put(key("one"), snapshot());
            cache.put(key("two"), snapshot());
            assertThat(cache.size()).isEqualTo(2);
            assertThat(cache.ramSize()).isEqualTo(1);
            assertThat(cache.diskSize()).isEqualTo(2);
            var restored = cache.get(key("one"));
            assertThat(restored.bytes()).containsExactly(BYTES);
            assertThat(restored.inspection()).isEqualTo(INSPECTION);
            assertThat(restored.capturedAt()).isEqualTo(NOW);
            assertThat(cache.weight()).isEqualTo(RAM_WEIGHT);
        }
    }

    @Test void workspaceResourceAndEverySourceVersionComponentAreIsolatedOnDisk() {
        try (var cache = cache(1, 256, 10000)) {
            var key = key("one");
            cache.put(key, snapshot());
            var variations = List.of(
                new VerifiedPdfSnapshotCache.Key(UUID.randomUUID(), key.fileId(), key.resourceKey(), key.md5Checksum(), key.size(), key.modifiedTime()),
                new VerifiedPdfSnapshotCache.Key(WORKSPACE, "other", key.resourceKey(), key.md5Checksum(), key.size(), key.modifiedTime()),
                new VerifiedPdfSnapshotCache.Key(WORKSPACE, key.fileId(), "other", key.md5Checksum(), key.size(), key.modifiedTime()),
                new VerifiedPdfSnapshotCache.Key(WORKSPACE, key.fileId(), key.resourceKey(), "other", key.size(), key.modifiedTime()),
                new VerifiedPdfSnapshotCache.Key(WORKSPACE, key.fileId(), key.resourceKey(), key.md5Checksum(), key.size() + 1, key.modifiedTime()),
                new VerifiedPdfSnapshotCache.Key(WORKSPACE, key.fileId(), key.resourceKey(), key.md5Checksum(), key.size(), key.modifiedTime().plusSeconds(1)));
            variations.forEach(changed -> assertThat(cache.get(changed)).isNull());
            assertThat(cache.get(key)).isNotNull();
        }
    }

    @Test void physicalDiskCapIncludesMetadataAndEvictsWholeEntryEvenWhenInRam() throws Exception {
        long fileSize;
        try (var measure = cache(1000, 256, 10000)) {
            measure.put(key("measure"), snapshot());
            fileSize = physicalBytes(measure);
            assertThat(fileSize).isGreaterThan(RAM_WEIGHT);
            assertThat(measure.diskWeight()).isEqualTo(fileSize);
        }
        try (var cache = cache(1000, 256, fileSize * 2)) {
            cache.put(key("one"), snapshot());
            cache.put(key("two"), snapshot());
            cache.get(key("one")); // RAM hit must update the same LRU used for disk eviction.
            cache.put(key("three"), snapshot());
            assertThat(cache.get(key("two"))).isNull();
            assertThat(cache.get(key("one"))).isNotNull();
            assertThat(cache.get(key("three"))).isNotNull();
            assertThat(cache.size()).isEqualTo(2);
            assertThat(cache.diskWeight()).isEqualTo(fileSize * 2);
            assertThat(physicalBytes(cache)).isEqualTo(cache.diskWeight());
        }
    }

    @Test void globalEntryLimitCountsRamAndDiskTogetherAndHonorsDiskHitRecency() {
        try (var cache = cache(RAM_WEIGHT, 256, 1_000_000)) {
            for (int i = 0; i < 256; i++) cache.put(key("file-" + i), snapshot());
            assertThat(cache.size()).isEqualTo(256);
            assertThat(cache.get(key("file-0"))).isNotNull(); // disk hit
            cache.put(key("file-256"), snapshot());
            assertThat(cache.size()).isEqualTo(256);
            assertThat(cache.get(key("file-1"))).isNull();
            assertThat(cache.get(key("file-0"))).isNotNull();
            assertThat(cache.diskSize()).isEqualTo(256);
        }
    }

    @Test void ttlRemovesDiskFilesWithoutRenewingCaptureTimeOnRestoration() throws Exception {
        var now = new AtomicReference<>(NOW);
        Clock clock = new Clock() {
            public ZoneId getZone() { return ZoneOffset.UTC; }
            public Clock withZone(ZoneId zone) { return this; }
            public Instant instant() { return now.get(); }
        };
        try (var cache = new VerifiedPdfSnapshotCache(clock, 1, 256, 10000, new ObjectMapper(), parent)) {
            cache.put(key("one"), snapshot());
            now.set(NOW.plusSeconds(899));
            assertThat(cache.get(key("one")).capturedAt()).isEqualTo(NOW);
            now.set(NOW.plusSeconds(900));
            assertThat(cache.get(key("one"))).isNull();
            assertThat(cache.size()).isZero();
            assertThat(cache.diskWeight()).isZero();
            assertThat(physicalBytes(cache)).isZero();
        }
    }

    @Test void privateChildAndClosePreserveUnrelatedParentAndSiblingCache() throws Exception {
        Path unrelated = Files.writeString(parent.resolve("unrelated.txt"), "keep");
        var first = cache(1000, 256, 10000);
        try (var second = cache(1000, 256, 10000)) {
            assertThat(first.diskDirectory()).isNotNull().isNotEqualTo(parent).isNotEqualTo(second.diskDirectory());
            assertThat(first.diskDirectory().getParent()).isEqualTo(parent);
            first.put(key("one"), snapshot());
            second.put(key("two"), snapshot());
            Path owned = first.diskDirectory();
            first.close();
            first.close();
            assertThat(Files.exists(owned)).isFalse();
            assertThat(Files.readString(unrelated)).isEqualTo("keep");
            assertThat(second.get(key("two"))).isNotNull();
            assertThat(first.get(key("one"))).isNull();
        } finally { first.close(); }
    }

    @Test void directoryPermissionsAreOwnerOnlyAndInheritedByFiles() throws Exception {
        try (var cache = cache(1, 256, 10000)) {
            cache.put(key("one"), snapshot());
            Path dir = cache.diskDirectory(), file = onlyFile(cache);
            if (Files.getFileStore(dir).supportsFileAttributeView(PosixFileAttributeView.class)) {
                assertThat(Files.getPosixFilePermissions(dir)).isEqualTo(PosixFilePermissions.fromString("rwx------"));
                // The containing directory is private; file mode cannot grant traversal to other users.
            } else {
                var acl = Files.getFileAttributeView(dir, AclFileAttributeView.class);
                assertThat(acl.getAcl()).hasSize(1);
                assertThat(acl.getAcl().getFirst().principal()).isEqualTo(acl.getOwner());
                assertThat(acl.getAcl().getFirst().flags()).contains(AclEntryFlag.DIRECTORY_INHERIT, AclEntryFlag.FILE_INHERIT);
                assertThat(Files.getFileAttributeView(file, AclFileAttributeView.class).getAcl())
                    .allSatisfy(entry -> assertThat(entry.principal()).isEqualTo(acl.getOwner()));
            }
        }
    }

    @Test void equalLengthPdfCorruptionIsRejectedAndDeleted() throws Exception { assertCorruptRejected(8); }
    @Test void equalLengthInspectionCorruptionIsRejectedAndDeleted() throws Exception { assertCorruptRejected(-1); }
    private void assertCorruptRejected(int offset) throws Exception {
        try (var cache = cache(1, 256, 10000)) {
            cache.put(key("one"), snapshot());
            Path file = onlyFile(cache);
            byte[] serialized = Files.readAllBytes(file);
            if (offset < 0) {
                offset = new String(serialized, StandardCharsets.UTF_8).indexOf("captured text");
                assertThat(offset).isGreaterThan(12 + BYTES.length);
            }
            serialized[offset] ^= 1;
            Files.write(file, serialized);
            assertThat(cache.get(key("one"))).isNull();
            assertThat(Files.exists(file)).isFalse();
            assertThat(cache.diskWeight()).isZero();
        }
    }

    @Test void truncationAndAppendedBytesAreRejected() throws Exception {
        for (boolean append : List.of(false, true)) {
            try (var cache = cache(1, 256, 10000)) {
                cache.put(key("one"), snapshot());
                Path file = onlyFile(cache);
                byte[] bytes = Files.readAllBytes(file);
                Files.write(file, Arrays.copyOf(bytes, bytes.length + (append ? 1 : -1)));
                assertThat(cache.get(key("one"))).isNull();
                assertThat(Files.exists(file)).isFalse();
            }
        }
    }

    @Test void atomicMoveFailureCleansTemporaryAndUntrackedFinalAndKeepsRam() throws Exception {
        try (var cache = cache(1000, 256, 10000);
                var files = mockStatic(Files.class, CALLS_REAL_METHODS)) {
            files.when(() -> Files.move(any(Path.class), any(Path.class), eq(StandardCopyOption.ATOMIC_MOVE)))
                .thenAnswer(invocation -> {
                    // Simulate a provider which creates its target before reporting a move failure.
                    Files.copy((Path) invocation.getArgument(0), (Path) invocation.getArgument(1));
                    throw new IOException("simulated move failure");
                });
            cache.put(key("one"), snapshot());
            assertThat(cache.get(key("one"))).isNotNull();
            assertThat(cache.diskSize()).isZero();
            assertThat(physicalBytes(cache)).isZero();
        }
    }

    @Test void unavailableDiskFallsBackToBoundedRam() throws Exception {
        Path notDirectory = Files.writeString(parent.resolve("file"), "keep");
        try (var cache = new VerifiedPdfSnapshotCache(Clock.fixed(NOW, ZoneOffset.UTC), RAM_WEIGHT, 256,
                10000, new ObjectMapper(), notDirectory)) {
            assertThat(cache.diskDirectory()).isNull();
            cache.put(key("one"), snapshot());
            cache.put(key("two"), snapshot());
            assertThat(cache.get(key("one"))).isNull();
            assertThat(cache.get(key("two"))).isNotNull();
            assertThat(cache.weight()).isEqualTo(RAM_WEIGHT);
            assertThat(Files.readString(notDirectory)).isEqualTo("keep");
        }
    }

    @Test void failedEvictionDeleteStopsFurtherEvictionAndPreservesOtherSnapshots() throws Exception {
        long fileSize;
        try (var measure = cache(1000, 256, 10000)) {
            measure.put(key("measure"), snapshot());
            fileSize = physicalBytes(measure);
        }
        try (var cache = cache(1000, 256, fileSize * 2)) {
            cache.put(key("one"), snapshot());
            Path lockedFile = onlyFile(cache);
            cache.put(key("two"), snapshot());
            try (var files = mockStatic(Files.class, invocation -> {
                if (invocation.getMethod().getName().equals("deleteIfExists")
                        && lockedFile.equals(invocation.getArgument(0))) throw new IOException("locked");
                return invocation.callRealMethod();
            })) {
                cache.put(key("three"), snapshot());
                assertThat(cache.get(key("two"))).isNotNull();
                assertThat(cache.get(key("three"))).isNotNull();
                assertThat(cache.diskSize()).isEqualTo(1);
                assertThat(cache.diskWeight()).isEqualTo(fileSize * 2);
                assertThat(physicalBytes(cache)).isEqualTo(fileSize * 2);
            }
            Path directory = cache.diskDirectory();
            cache.close(); // Retry deletion of the owned orphan after the transient failure ends.
            assertThat(Files.exists(directory)).isFalse();
            assertThat(cache.diskWeight()).isZero();
        }
    }

    @Test void largePdfOverBase64StringLimitRestoresWithoutStringEncoding() {
        byte[] large = new byte[16 * 1024 * 1024];
        new Random(7).nextBytes(large);
        try (var cache = cache(1, 256, 32L * 1024 * 1024)) {
            cache.put(key("large", large), new VerifiedPdfSnapshotCache.Snapshot(large, INSPECTION, NOW));
            assertThat(cache.ramSize()).isZero();
            assertThat(cache.get(key("large", large)).bytes()).containsExactly(large);
        }
    }

    @Test void configuredPdfLimitRejectsOversizeEvenIfDiskAndRamAllowIt() {
        try (var cache = new VerifiedPdfSnapshotCache(Clock.fixed(NOW, ZoneOffset.UTC), 1000, 256, 10000,
                new ObjectMapper(), parent, BYTES.length - 1)) {
            cache.put(key("one"), snapshot());
            assertThat(cache.size()).isZero();
            assertThat(cache.diskWeight()).isZero();
        }
    }

    @Test void oversizedInspectionNeverWritesAnUnboundedSpillFile() throws Exception {
        var huge = new PdfInspection(true, false, 1, 1, 0, "x".repeat(VerifiedPdfSnapshotCache.MAX_INSPECTION_BYTES), null);
        try (var cache = cache(1, 256, 100_000_000)) {
            cache.put(key("one"), BYTES, huge, NOW);
            assertThat(cache.size()).isZero();
            assertThat(physicalBytes(cache)).isZero();
        }
    }

    @Test void defensiveCopiesAndMd5SizeEligibilityArePreserved() {
        var source = BYTES.clone();
        var snapshot = new VerifiedPdfSnapshotCache.Snapshot(source, INSPECTION, NOW);
        source[0] = 0;
        snapshot.bytes()[0] = 0;
        assertThat(snapshot.bytes()).containsExactly(BYTES);
        assertThat(VerifiedPdfSnapshotCache.actualMd5AndSizeMatch(BYTES, metadata(BYTES))).isTrue();
        assertThat(VerifiedPdfSnapshotCache.actualMd5AndSizeMatch(source, metadata(BYTES))).isFalse();
        var denied = new DriveFileMetadata("file", "file.pdf", "application/pdf", (long) BYTES.length,
            metadata(BYTES).md5Checksum(), NOW.atOffset(ZoneOffset.UTC), false, "");
        assertThat(VerifiedPdfSnapshotCache.metadataMatches(metadata(BYTES), denied)).isFalse();
        try (var cache = cache(1000, 256, 10000)) {
            cache.put(key("one"), source, INSPECTION, NOW);
            assertThat(cache.size()).isZero();
        }
    }
}
