package com.capvault.backend.archive.storage;

public interface ArchiveStorageProvider {
    int MAX_BYTES = 25 * 1024 * 1024;
    record Readiness(boolean ready, String reason) {}
    record StoredObject(String providerId, String objectId, String sha256, long size) {}
    String id();
    Readiness probe();
    String reserve(String captureKey);
    StoredObject put(String objectId, String captureKey, byte[] bytes);
    byte[] read(String objectId);
}
