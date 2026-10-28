package com.capvault.backend.archive.storage;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.FileAlreadyExistsException;
import java.io.IOException;
import java.util.UUID;

public final class LocalArchiveStorageProvider implements ArchiveStorageProvider {
    private final Path root;
    private final String id;
    private final Object[] locks = new Object[64];
    public LocalArchiveStorageProvider(Path directory) {
        if (directory == null || !directory.isAbsolute()) throw new ArchiveStorageException("An absolute archive directory is required.");
        root = directory.normalize();
        id = "local:" + StorageSupport.hash(root.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        java.util.Arrays.setAll(locks, ignored -> new Object());
    }
    public String id() { return id; }
    public Readiness probe() {
        return Files.isDirectory(root) && Files.isWritable(root) && Files.isReadable(root)
            ? new Readiness(true, "") : new Readiness(false, "Archive directory is unavailable or not writable.");
    }
    public String reserve(String captureKey) { return StorageSupport.key(captureKey); }
    public StoredObject put(String objectId, String captureKey, byte[] bytes) {
        StorageSupport.checkBytes(bytes);
        if (!reserve(captureKey).equals(objectId)) throw new ArchiveStorageException("Capture identity does not match reservation.");
        String sha = StorageSupport.hash(bytes);
        synchronized (locks[Math.floorMod(objectId.hashCode(), locks.length)]) {
            if (!probe().ready()) throw new ArchiveStorageException("Archive directory is unavailable or not writable.");
            Path target = path(objectId), temp = root.resolve("." + UUID.randomUUID() + ".pending");
            try {
                if (!Files.exists(target)) {
                    Files.write(temp, bytes, java.nio.file.StandardOpenOption.CREATE_NEW);
                    try { Files.move(temp, target); } catch (FileAlreadyExistsException ignored) { }
                }
                StorageSupport.verify(read(objectId), sha, bytes.length);
                return new StoredObject(id, objectId, sha, bytes.length);
            } catch (IOException e) { throw new ArchiveStorageException("Archive directory operation failed."); }
            finally { try { Files.deleteIfExists(temp); } catch (IOException ignored) { } }
        }
    }
    public byte[] read(String objectId) {
        Path path = path(objectId);
        try {
            if (Files.isSymbolicLink(path) || !Files.isRegularFile(path) || Files.size(path) > MAX_BYTES)
                throw new ArchiveStorageException("Archive file is unavailable or exceeds the size limit.");
            try (var input = Files.newInputStream(path, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
                byte[] bytes = input.readNBytes(MAX_BYTES + 1); StorageSupport.checkBytes(bytes); return bytes;
            }
        } catch (IOException e) { throw new ArchiveStorageException("Archive file could not be read."); }
    }
    private Path path(String objectId) {
        if (objectId == null || !objectId.matches("[0-9a-f]{64}")) throw new ArchiveStorageException("Invalid archive object identity.");
        return root.resolve(objectId);
    }
}
