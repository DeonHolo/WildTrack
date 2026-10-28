package com.capvault.backend.archive.storage;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

final class StorageSupport {
    private StorageSupport() {}
    static String hash(byte[] data) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data)); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
    static String key(String value) {
        if (value == null || value.isBlank() || value.length() > 1024) throw new ArchiveStorageException("Invalid capture key.");
        return hash(value.getBytes(StandardCharsets.UTF_8));
    }
    static void checkBytes(byte[] bytes) {
        if (bytes == null || bytes.length == 0 || bytes.length > ArchiveStorageProvider.MAX_BYTES)
            throw new ArchiveStorageException("Archive file is empty or exceeds the size limit.");
    }
    static void verify(byte[] bytes, String hash, long size) {
        checkBytes(bytes);
        if (bytes.length != size || !hash(bytes).equals(hash)) throw new ArchiveStorageException("Archive file verification failed.");
    }
}
