package com.capvault.backend.aireview;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.filecheck.PdfInspection;

/** A bounded, process-local cache of already verified PDF snapshots. */
final class VerifiedPdfSnapshotCache {
    static final long MAX_WEIGHT_BYTES = 32L * 1024L * 1024L;
    static final Duration TTL = Duration.ofMinutes(15);

    record Key(UUID workspaceId, String fileId, String resourceKey, String md5Checksum,
               Long size, OffsetDateTime modifiedTime) {
        static Key of(UUID workspaceId, DriveFileReference reference, DriveFileMetadata metadata) {
            if (workspaceId == null || reference == null || metadata == null || reference.fileId() == null
                    || reference.fileId().isBlank() || metadata.md5Checksum() == null || metadata.md5Checksum().isBlank()
                    || metadata.size() == null || metadata.modifiedTime() == null) return null;
            return new Key(workspaceId, reference.fileId(), reference.resourceKey(), metadata.md5Checksum(),
                metadata.size(), metadata.modifiedTime());
        }
    }

    record Snapshot(byte[] bytes, PdfInspection inspection, Instant capturedAt) {
        Snapshot {
            bytes = bytes.clone();
            inspection = copyInspection(inspection);
        }

        @Override public byte[] bytes() { return bytes.clone(); }
        byte[] bytesCopy() { return bytes.clone(); }
        PdfInspection inspectionCopy() { return copyInspection(inspection); }
    }

    private record Entry(Snapshot snapshot, long weight) { }

    private final Clock clock;
    private final long maxWeight;
    private final int maxEntries;
    private long weight;
    private final LinkedHashMap<Key, Entry> entries = new LinkedHashMap<>(16, .75f, true);

    VerifiedPdfSnapshotCache() { this(Clock.systemUTC(), MAX_WEIGHT_BYTES, 256); }

    VerifiedPdfSnapshotCache(Clock clock, long maxWeight, int maxEntries) {
        if (clock == null || maxWeight <= 0 || maxEntries <= 0) throw new IllegalArgumentException("Invalid cache bounds");
        this.clock = clock;
        this.maxWeight = maxWeight;
        this.maxEntries = maxEntries;
    }

    VerifiedPdfSnapshotCache(Clock clock, long maxWeight) { this(clock, maxWeight, 256); }

    synchronized Snapshot get(Key key) {
        Entry entry = entries.get(key);
        if (entry == null) return null;
        if (!entry.snapshot.capturedAt().plus(TTL).isAfter(clock.instant())) {
            remove(key, entry);
            return null;
        }
        return entry.snapshot;
    }

    synchronized void put(Key key, Snapshot snapshot) {
        if (snapshot == null) return;
        put(key, snapshot.bytes(), snapshot.inspection(), snapshot.capturedAt());
    }

    static boolean metadataMatches(DriveFileMetadata before, DriveFileMetadata after) {
        return before != null && after != null && before.canDownload() && after.canDownload()
            && "application/pdf".equalsIgnoreCase(before.mimeType())
            && "application/pdf".equalsIgnoreCase(after.mimeType())
            && java.util.Objects.equals(before.md5Checksum(), after.md5Checksum())
            && java.util.Objects.equals(before.size(), after.size())
            && java.util.Objects.equals(before.modifiedTime(), after.modifiedTime());
    }

    static boolean actualMd5AndSizeMatch(byte[] bytes, DriveFileMetadata metadata) {
        if (bytes == null || metadata == null || metadata.md5Checksum() == null || metadata.md5Checksum().isBlank()
                || metadata.size() == null || metadata.size() != bytes.length) return false;
        try {
            byte[] digest = java.security.MessageDigest.getInstance("MD5").digest(bytes);
            String expected = metadata.md5Checksum().trim();
            return expected.equalsIgnoreCase(java.util.HexFormat.of().formatHex(digest));
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    synchronized void put(Key key, byte[] bytes, PdfInspection inspection, Instant capturedAt) {
        if (key == null || bytes == null || inspection == null || capturedAt == null) return;
        long entryWeight = bytes.length + textWeight(inspection);
        if (entryWeight > maxWeight) return;
        Entry previous = entries.remove(key);
        if (previous != null) weight -= previous.weight;
        Entry entry = new Entry(new Snapshot(bytes, inspection, capturedAt), entryWeight);
        entries.put(key, entry);
        weight += entryWeight;
        while (weight > maxWeight || entries.size() > maxEntries) {
            Map.Entry<Key, Entry> eldest = entries.entrySet().iterator().next();
            remove(eldest.getKey(), eldest.getValue());
        }
    }

    synchronized int size() { return entries.size(); }
    synchronized long weight() { return weight; }

    private static long textWeight(PdfInspection inspection) {
        long total = chars(inspection.extractedText());
        for (PdfInspection.PageText page : inspection.pages()) total += chars(page.text());
        return total * 2L;
    }

    private static int chars(String value) { return value == null ? 0 : value.length(); }

    private static PdfInspection copyInspection(PdfInspection value) {
        if (value == null) return null;
        var pages = value.pages().stream().map(page -> new PdfInspection.PageText(page.pageNumber(), page.text(), page.hasVisualContent())).toList();
        return new PdfInspection(value.readable(), value.encrypted(), value.pageCount(), value.textBearingPageCount(),
            value.extractedCharacterCount(), value.extractedText(), value.error(), pages);
    }

    private void remove(Key key, Entry entry) {
        entries.remove(key);
        weight -= entry.weight;
    }
}
