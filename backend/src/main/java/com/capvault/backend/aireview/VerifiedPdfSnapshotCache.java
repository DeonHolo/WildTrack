package com.capvault.backend.aireview;

import java.io.*;
import java.nio.file.*;
import java.nio.file.attribute.*;
import java.security.*;
import java.time.*;
import java.util.*;

import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.filecheck.PdfInspection;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Process-local snapshots with one global LRU and independently bounded RAM and private disk. */
final class VerifiedPdfSnapshotCache implements AutoCloseable {
    static final long MAX_WEIGHT_BYTES = 32L * 1024 * 1024;
    static final long MAX_DISK_WEIGHT_BYTES = 256L * 1024 * 1024;
    static final int MAX_ENTRIES = 256;
    static final Duration TTL = Duration.ofMinutes(15);
    static final int MAX_INSPECTION_BYTES = 16 * 1024 * 1024;
    private static final int MAGIC = 0x57545031; // WTP1: magic, PDF length/bytes, inspection length/JSON

    record Key(UUID workspaceId, String fileId, String resourceKey, String md5Checksum,
            Long size, OffsetDateTime modifiedTime) {
        static Key of(UUID workspaceId, DriveFileReference reference, DriveFileMetadata metadata) {
            if (workspaceId == null || reference == null || metadata == null || reference.fileId() == null
                    || reference.fileId().isBlank() || metadata.md5Checksum() == null || metadata.md5Checksum().isBlank()
                    || metadata.size() == null || metadata.size() < 0 || metadata.modifiedTime() == null) return null;
            return new Key(workspaceId, reference.fileId(), reference.resourceKey(), metadata.md5Checksum(),
                metadata.size(), metadata.modifiedTime());
        }
    }
    record Snapshot(byte[] bytes, PdfInspection inspection, Instant capturedAt) {
        Snapshot { bytes = bytes.clone(); inspection = copyInspection(inspection); }
        @Override public byte[] bytes() { return bytes.clone(); }
        byte[] bytesCopy() { return bytes.clone(); }
        PdfInspection inspectionCopy() { return copyInspection(inspection); }
    }
    private static final class Entry {
        Snapshot ram;
        final long ramWeight;
        final Instant capturedAt;
        Path path;
        long diskWeight;
        byte[] digest;
        Entry(Snapshot snapshot) {
            ram = snapshot;
            ramWeight = snapshot.bytes.length + textWeight(snapshot.inspection);
            capturedAt = snapshot.capturedAt;
        }
    }

    private final Clock clock;
    private final long maxWeight, maxDiskWeight, maxPdfBytes;
    private final int maxEntries;
    private final ObjectMapper json;
    private final Path directory;
    private final LinkedHashMap<Key, Entry> entries = new LinkedHashMap<>(16, .75f, true);
    // Track temporary and final paths; never sweep the caller's parent directory.
    private final Set<Path> ownedFiles = new HashSet<>();
    private long weight, diskWeight;
    private boolean closed, diskWritable = true;

    VerifiedPdfSnapshotCache() { this(Clock.systemUTC(), MAX_WEIGHT_BYTES, MAX_ENTRIES); }
    VerifiedPdfSnapshotCache(Clock clock, long maxWeight) { this(clock, maxWeight, MAX_ENTRIES); }
    VerifiedPdfSnapshotCache(Clock clock, long maxWeight, int maxEntries) {
        this(clock, maxWeight, maxEntries, MAX_DISK_WEIGHT_BYTES, new ObjectMapper(), null);
    }
    VerifiedPdfSnapshotCache(Clock clock, long maxWeight, int maxEntries, Path parent) {
        this(clock, maxWeight, maxEntries, MAX_DISK_WEIGHT_BYTES, new ObjectMapper(), parent);
    }
    VerifiedPdfSnapshotCache(Clock clock, long maxWeight, int maxEntries, long maxDiskWeight,
            ObjectMapper json, Path parent) {
        this(clock, maxWeight, maxEntries, maxDiskWeight, json, parent, MAX_DISK_WEIGHT_BYTES);
    }
    VerifiedPdfSnapshotCache(Clock clock, long maxWeight, int maxEntries, long maxDiskWeight,
            ObjectMapper json, Path parent, long maxPdfBytes) {
        if (clock == null || maxWeight <= 0 || maxEntries <= 0 || maxDiskWeight <= 0
                || json == null || maxPdfBytes <= 0) throw new IllegalArgumentException("Invalid cache bounds");
        this.clock = clock;
        this.maxWeight = maxWeight;
        this.maxEntries = maxEntries;
        this.maxDiskWeight = maxDiskWeight;
        this.maxPdfBytes = Math.min(maxPdfBytes, Integer.MAX_VALUE);
        this.json = json;
        this.directory = privateDirectory(parent);
    }

    synchronized Snapshot get(Key key) {
        if (closed || key == null) return null;
        cleanupExpired();
        Entry entry = entries.get(key); // RAM and disk hits share the same recency.
        if (entry == null) return null;
        if (entry.ram != null) return entry.ram;
        Snapshot restored = readDisk(key, entry);
        if (restored == null) { remove(key); return null; }
        if (entry.ramWeight <= maxWeight) {
            entry.ram = restored;
            weight += entry.ramWeight;
            trimRam();
        }
        return restored;
    }
    synchronized void put(Key key, Snapshot snapshot) {
        if (snapshot != null) put(key, snapshot.bytes, snapshot.inspection, snapshot.capturedAt);
    }
    synchronized void put(Key key, byte[] bytes, PdfInspection inspection, Instant capturedAt) {
        if (closed || key == null || bytes == null || inspection == null || capturedAt == null
                || key.size == null || key.size != bytes.length || bytes.length > maxPdfBytes
                || key.md5Checksum == null || !key.md5Checksum.equalsIgnoreCase(hexDigest("MD5", bytes))
                || !fresh(capturedAt, clock.instant())) return;
        cleanupExpired();
        remove(key);
        Entry entry = new Entry(new Snapshot(bytes, inspection, capturedAt));
        writeDisk(entry);
        if (entry.ramWeight > maxWeight) entry.ram = null;
        if (entry.ram == null && entry.path == null) return;
        entries.put(key, entry);
        if (entry.ram != null) weight += entry.ramWeight;
        while (entries.size() > maxEntries) remove(entries.keySet().iterator().next());
        trimRam();
    }

    synchronized int size() { cleanupExpired(); return entries.size(); }
    synchronized int ramSize() { cleanupExpired(); return (int) entries.values().stream().filter(e -> e.ram != null).count(); }
    synchronized long weight() { cleanupExpired(); return weight; }
    synchronized int diskSize() { cleanupExpired(); return (int) entries.values().stream().filter(e -> e.path != null).count(); }
    synchronized long diskWeight() { cleanupExpired(); return diskWeight; }
    Path diskDirectory() { return directory; }
    @Override public synchronized void close() {
        if (closed) return;
        closed = true;
        for (Key key : new ArrayList<>(entries.keySet())) remove(key);
        for (Path path : new ArrayList<>(ownedFiles)) deleteOwned(path);
        if (ownedFiles.isEmpty()) diskWeight = 0;
        deleteEmptyDirectory(directory);
    }
    private void trimRam() {
        for (var iterator = entries.entrySet().iterator(); weight > maxWeight && iterator.hasNext();) {
            Entry entry = iterator.next().getValue();
            if (entry.ram == null) continue;
            entry.ram = null;
            weight -= entry.ramWeight;
            if (entry.path == null) iterator.remove();
        }
    }
    private void writeDisk(Entry entry) {
        if (directory == null || !diskWritable) return;
        Path temporary = null, target = null;
        boolean committed = false;
        try {
            // Only bounded inspection JSON is buffered; PDF bytes never become Base64.
            var buffer = new ByteArrayOutputStream();
            try (var limited = new LimitedOutputStream(buffer, MAX_INSPECTION_BYTES)) {
                json.writeValue(limited, entry.ram.inspection);
            }
            byte[] inspection = buffer.toByteArray();
            long physicalSize = 12L + entry.ram.bytes.length + inspection.length;
            if (physicalSize > maxDiskWeight) return;
            // Reserve capacity before writing, so the temporary file also fits the physical cap.
            while (diskWritable && diskWeight + physicalSize > maxDiskWeight && !entries.isEmpty())
                remove(entries.keySet().iterator().next());
            if (!diskWritable) return;
            temporary = Files.createTempFile(directory, "snapshot-", ".part");
            ownedFiles.add(temporary);
            target = directory.resolve(UUID.randomUUID() + ".bin");
            var digest = digest("SHA-256");
            try (var output = new DataOutputStream(new BufferedOutputStream(
                    new DigestOutputStream(Files.newOutputStream(temporary), digest)))) {
                output.writeInt(MAGIC);
                output.writeInt(entry.ram.bytes.length);
                output.write(entry.ram.bytes);
                output.writeInt(inspection.length);
                output.write(inspection);
            }
            if (Files.size(temporary) != physicalSize) throw new IOException("Snapshot length mismatch");
            ownedFiles.add(target);
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
            ownedFiles.remove(temporary);
            entry.path = target;
            entry.diskWeight = physicalSize;
            entry.digest = digest.digest();
            diskWeight += physicalSize;
            committed = true;
        } catch (IOException | RuntimeException unavailable) {
            // A disk failure leaves verified RAM reuse available within its independent bound.
        } finally {
            if (temporary != null) deleteOwned(temporary);
            if (!committed && target != null) deleteOwned(target);
        }
    }
    private Snapshot readDisk(Key key, Entry entry) {
        if (entry.path == null) return null;
        try {
            if (Files.size(entry.path) != entry.diskWeight) return null;
            byte[] pdfBytes, inspection;
            var digest = digest("SHA-256");
            try (var input = new DataInputStream(new BufferedInputStream(
                    new DigestInputStream(Files.newInputStream(entry.path), digest)))) {
                if (input.readInt() != MAGIC) return null;
                int pdfLength = input.readInt();
                if (pdfLength < 0 || pdfLength > maxPdfBytes || key.size == null
                        || pdfLength != key.size || 12L + pdfLength > entry.diskWeight) return null;
                pdfBytes = new byte[pdfLength];
                input.readFully(pdfBytes);
                int inspectionLength = input.readInt();
                if (inspectionLength < 0 || inspectionLength > MAX_INSPECTION_BYTES
                        || 12L + pdfLength + inspectionLength != entry.diskWeight) return null;
                inspection = new byte[inspectionLength];
                input.readFully(inspection);
                if (input.read() != -1) return null;
            }
            // Verify all bytes before parsing inspection JSON, including equal-length corruption.
            if (!MessageDigest.isEqual(entry.digest, digest.digest())
                    || !key.md5Checksum.equalsIgnoreCase(hexDigest("MD5", pdfBytes))) return null;
            PdfInspection parsed = json.readValue(inspection, PdfInspection.class);
            if (parsed == null || pdfBytes.length + textWeight(parsed) != entry.ramWeight) return null;
            return new Snapshot(pdfBytes, parsed, entry.capturedAt);
        } catch (IOException | RuntimeException corrupt) { return null; }
    }
    private void cleanupExpired() {
        Instant now = clock.instant();
        for (var item : new ArrayList<>(entries.entrySet()))
            if (!fresh(item.getValue().capturedAt, now)) remove(item.getKey());
    }
    private void remove(Key key) {
        Entry entry = entries.remove(key);
        if (entry == null) return;
        if (entry.ram != null) weight -= entry.ramWeight;
        if (entry.path != null && deleteOwned(entry.path)) diskWeight -= entry.diskWeight;
    }
    private boolean deleteOwned(Path path) {
        try { Files.deleteIfExists(path); ownedFiles.remove(path); return true; }
        catch (IOException | RuntimeException unavailable) { diskWritable = false; return false; }
    }
    private static Path privateDirectory(Path parent) {
        Path created = null;
        try {
            Path base = parent == null ? Path.of(System.getProperty("java.io.tmpdir")) : parent;
            if (Files.getFileStore(base).supportsFileAttributeView(PosixFileAttributeView.class)) {
                created = Files.createTempDirectory(base, "wildtrack-verified-pdf-",
                    PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
            } else {
                created = Files.createTempDirectory(base, "wildtrack-verified-pdf-");
                AclFileAttributeView acl = Files.getFileAttributeView(created, AclFileAttributeView.class);
                if (acl == null) throw new IOException("Private directory permissions unavailable");
                AclEntry ownerOnly = AclEntry.newBuilder().setType(AclEntryType.ALLOW)
                    .setPrincipal(acl.getOwner()).setPermissions(EnumSet.allOf(AclEntryPermission.class))
                    .setFlags(AclEntryFlag.DIRECTORY_INHERIT, AclEntryFlag.FILE_INHERIT).build();
                acl.setAcl(List.of(ownerOnly));
                if (!acl.getAcl().equals(List.of(ownerOnly))) throw new IOException("Private directory permissions failed");
            }
            return created;
        } catch (IOException | RuntimeException unavailable) { deleteEmptyDirectory(created); return null; }
    }
    private static void deleteEmptyDirectory(Path path) {
        try { if (path != null) Files.deleteIfExists(path); } catch (IOException | RuntimeException ignored) { }
    }
    private static boolean fresh(Instant captured, Instant now) { return captured.plus(TTL).isAfter(now); }
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
    static boolean metadataMatches(DriveFileMetadata before, DriveFileMetadata after) {
        return before != null && after != null && before.canDownload() && after.canDownload()
            && "application/pdf".equalsIgnoreCase(before.mimeType()) && "application/pdf".equalsIgnoreCase(after.mimeType())
            && Objects.equals(before.md5Checksum(), after.md5Checksum()) && Objects.equals(before.size(), after.size())
            && Objects.equals(before.modifiedTime(), after.modifiedTime());
    }
    static boolean actualMd5AndSizeMatch(byte[] bytes, DriveFileMetadata metadata) {
        return bytes != null && metadata != null && metadata.md5Checksum() != null && metadata.size() != null
            && metadata.size() == bytes.length && metadata.md5Checksum().trim().equalsIgnoreCase(hexDigest("MD5", bytes));
    }
    private static MessageDigest digest(String algorithm) {
        try { return MessageDigest.getInstance(algorithm); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private static String hexDigest(String algorithm, byte[] bytes) { return HexFormat.of().formatHex(digest(algorithm).digest(bytes)); }
    private static final class LimitedOutputStream extends FilterOutputStream {
        private final long limit;
        private long count;
        LimitedOutputStream(OutputStream output, long limit) { super(output); this.limit = limit; }
        @Override public void write(int value) throws IOException { ensure(1); out.write(value); count++; }
        @Override public void write(byte[] bytes, int offset, int length) throws IOException {
            ensure(length); out.write(bytes, offset, length); count += length;
        }
        private void ensure(long length) throws IOException {
            if (length > limit - count) throw new IOException("Inspection exceeds cache limit");
        }
    }
}
