package com.capvault.backend.archive.storage;

import static org.assertj.core.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ArchiveStorageProviderTest {
    @TempDir Path directory;

    @Test void localReservationSurvivesRetryAndRejectsMutationAndTraversal() throws Exception {
        var provider = new LocalArchiveStorageProvider(directory);
        byte[] bytes = "original pdf".getBytes(StandardCharsets.UTF_8);
        String id = provider.reserve("capture-1");
        var result = provider.put(id, "capture-1", bytes);
        assertThat(provider.put(id, "capture-1", bytes)).isEqualTo(result);
        assertThat(provider.read(id)).isEqualTo(bytes);
        assertThatThrownBy(() -> provider.put(id, "capture-1", "changed".getBytes(StandardCharsets.UTF_8))).isInstanceOf(ArchiveStorageException.class);
        assertThatThrownBy(() -> provider.read("../outside")).isInstanceOf(ArchiveStorageException.class);
        assertThatThrownBy(() -> provider.put(id, "another-key", bytes)).isInstanceOf(ArchiveStorageException.class);
        try (var files = Files.list(directory)) { assertThat(files.count()).isEqualTo(1); }
    }

    @Test void oldDestinationRemainsResolvableAfterDefaultChanges() throws Exception {
        Path other = Files.createDirectory(directory.resolve("other"));
        var properties = new ArchiveStorageProperties();
        var first = new ArchiveStorageProperties.Destination(); first.setType("local"); first.setDirectory(directory.toString());
        var second = new ArchiveStorageProperties.Destination(); second.setType("local"); second.setDirectory(other.toString());
        properties.getDestinations().put("first", first); properties.getDestinations().put("second", second);
        properties.setDefaultDestination("first");
        var registry = new ArchiveStorageRegistry(properties);
        var old = registry.defaultProvider(); String id = old.reserve("key"); old.put(id, "key", new byte[] {1, 2});
        properties.setDefaultDestination("second");
        var changed = new ArchiveStorageRegistry(properties);
        assertThat(changed.defaultProvider().id()).isNotEqualTo(old.id());
        assertThat(changed.provider(old.id()).read(id)).containsExactly(1, 2);
    }

    @Test void driveUsesReservedIdAndReconcilesSuccessfulUpload() throws Exception {
        var uploads = new AtomicInteger(); var exists = new java.util.concurrent.atomic.AtomicBoolean();
        byte[] content = "PDF bytes".getBytes(StandardCharsets.UTF_8);
        String key = StorageSupport.key("capture-7");
        DriveArchiveStorageProvider.Transport transport = (method, url, type, requestBody, max, token) -> {
            int status = 200; byte[] body;
            if (url.endsWith("/token")) body = "{\"access_token\":\"mock-token\"}".getBytes(StandardCharsets.UTF_8);
            else if (url.contains("generateIds")) body = "{\"ids\":[\"reserved-123\"]}".getBytes(StandardCharsets.UTF_8);
            else if (url.contains("/upload/")) {
                String multipart = new String(requestBody, StandardCharsets.UTF_8);
                assertThat(multipart).contains("reserved-123", key, "PDF bytes");
                uploads.incrementAndGet(); exists.set(true); body = "{}".getBytes(StandardCharsets.UTF_8);
            } else if (url.contains("reserved-123") && url.contains("alt=media")) body = content;
            else if (url.contains("reserved-123")) {
                if (!exists.get()) { status = 404; body = new byte[0]; }
                else body = ("{\"id\":\"reserved-123\",\"parents\":[\"folder-1\"],\"appProperties\":{\"captureKey\":\"" + key + "\"}}").getBytes(StandardCharsets.UTF_8);
            } else { status = 404; body = new byte[0]; }
            return new DriveArchiveStorageProvider.Response(status, body);
        };
            var provider = new DriveArchiveStorageProvider("folder-1", "client", "secret", "refresh", "https://mock", "https://mock/token", transport);
            String id = provider.reserve("capture-7");
            var first = provider.put(id, "capture-7", content);
            assertThat(provider.put(id, "capture-7", content)).isEqualTo(first);
            assertThat(uploads.get()).isEqualTo(1);
            assertThatThrownBy(() -> provider.put(id, "capture-7", "wrong".getBytes(StandardCharsets.UTF_8))).isInstanceOf(ArchiveStorageException.class);
            assertThatThrownBy(() -> provider.put(id, "other-key", content)).isInstanceOf(ArchiveStorageException.class);
    }

    @Test void missingDriveCredentialsReportNotReady() {
        var provider = new DriveArchiveStorageProvider("folder", "", "", "", Duration.ofSeconds(1), Duration.ofSeconds(1));
        assertThat(provider.probe().ready()).isFalse();
        assertThatThrownBy(() -> provider.reserve("key")).isInstanceOf(ArchiveStorageException.class);
    }

    @Test void malformedDriveResponseReportsUnavailableWithoutAnUnhandledException() {
        for (String invalid : new String[]{"", "null", "[]", "{broken"}) {
            DriveArchiveStorageProvider.Transport transport=(method,url,type,body,max,token) ->
                new DriveArchiveStorageProvider.Response(200,invalid.getBytes(StandardCharsets.UTF_8));
            var provider=new DriveArchiveStorageProvider("folder","client","secret","refresh","https://mock","https://mock/token",transport);
            assertThat(provider.probe().ready()).isFalse();
            assertThatThrownBy(() -> provider.reserve("capture")).isInstanceOf(ArchiveStorageException.class);
        }
    }

    @Test void uploadConflictReconcilesReservedObject() {
        String key = StorageSupport.key("capture");
        var metadataReads = new AtomicInteger();
        DriveArchiveStorageProvider.Transport transport = (method, url, type, requestBody, max, token) -> {
            if (url.endsWith("/token")) return new DriveArchiveStorageProvider.Response(200, "{\"access_token\":\"token\"}".getBytes(StandardCharsets.UTF_8));
            if (url.contains("/upload/")) return new DriveArchiveStorageProvider.Response(409, new byte[0]);
            if (url.contains("alt=media")) return new DriveArchiveStorageProvider.Response(200, new byte[] {1, 2});
            if (metadataReads.getAndIncrement() == 0) return new DriveArchiveStorageProvider.Response(404, new byte[0]);
            String metadata = "{\"id\":\"reserved\",\"parents\":[\"folder\"],\"appProperties\":{\"captureKey\":\"" + key + "\"}}";
            return new DriveArchiveStorageProvider.Response(200, metadata.getBytes(StandardCharsets.UTF_8));
        };
        var provider = new DriveArchiveStorageProvider("folder", "client", "secret", "refresh", "https://mock", "https://mock/token", transport);
        assertThat(provider.put("reserved", "capture", new byte[] {1, 2}).size()).isEqualTo(2);
    }

    @Test void largeFileUsesResumableUploadAndRejectsUntrustedLocation() {
        byte[] bytes = new byte[6 * 1024 * 1024];
        String key = StorageSupport.key("large");
        var exists = new java.util.concurrent.atomic.AtomicBoolean();
        var location = new java.util.concurrent.atomic.AtomicReference<>("https://evil.invalid/upload/drive/v3/files?upload_id=x");
        var uploads = new AtomicInteger();
        DriveArchiveStorageProvider.Transport transport = (method, url, type, body, max, token) -> {
            if (url.endsWith("/token")) return new DriveArchiveStorageProvider.Response(200, "{\"access_token\":\"token\"}".getBytes(StandardCharsets.UTF_8));
            if (url.contains("uploadType=resumable")) return new DriveArchiveStorageProvider.Response(200, new byte[0], location.get());
            if (method.equals("PUT")) { assertThat(url).startsWith("https://www.googleapis.com/"); assertThat(body).hasSize(bytes.length); uploads.incrementAndGet(); exists.set(true); return new DriveArchiveStorageProvider.Response(200, new byte[0]); }
            if (url.contains("alt=media")) return new DriveArchiveStorageProvider.Response(200, bytes);
            if (!exists.get()) return new DriveArchiveStorageProvider.Response(404, new byte[0]);
            String metadata = "{\"id\":\"reserved\",\"parents\":[\"folder\"],\"appProperties\":{\"captureKey\":\"" + key + "\"}}";
            return new DriveArchiveStorageProvider.Response(200, metadata.getBytes(StandardCharsets.UTF_8));
        };
        var provider = new DriveArchiveStorageProvider("folder", "client", "secret", "refresh", "https://mock", "https://mock/token", transport);
        assertThatThrownBy(() -> provider.put("reserved", "large", bytes)).isInstanceOf(ArchiveStorageException.class);
        assertThat(uploads).hasValue(0);
        location.set("https://www.googleapis.com/upload/drive/v3/files?upload_id=mock");
        assertThat(provider.put("reserved", "large", bytes).size()).isEqualTo(bytes.length);
        assertThat(provider.put("reserved", "large", bytes).size()).isEqualTo(bytes.length);
        assertThat(uploads).hasValue(1);
    }
}
