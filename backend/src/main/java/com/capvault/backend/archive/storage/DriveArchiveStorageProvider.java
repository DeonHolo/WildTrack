package com.capvault.backend.archive.storage;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

public final class DriveArchiveStorageProvider implements ArchiveStorageProvider {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final String folder, clientId, clientSecret, refreshToken, apiBase, tokenUrl;
    private final Transport transport;
    private final Object[] locks = new Object[64];

    public DriveArchiveStorageProvider(String folder, String clientId, String clientSecret, String refreshToken,
            Duration connectTimeout, Duration requestTimeout) {
        this(folder, clientId, clientSecret, refreshToken, connectTimeout, requestTimeout,
            "https://www.googleapis.com", "https://oauth2.googleapis.com/token");
    }
    DriveArchiveStorageProvider(String folder, String clientId, String clientSecret, String refreshToken,
            Duration connectTimeout, Duration requestTimeout, String apiBase, String tokenUrl) {
        this(folder, clientId, clientSecret, refreshToken, apiBase, tokenUrl, new UrlTransport(connectTimeout, requestTimeout));
    }
    DriveArchiveStorageProvider(String folder, String clientId, String clientSecret, String refreshToken,
            String apiBase, String tokenUrl, Transport transport) {
        this.folder = folder; this.clientId = clientId; this.clientSecret = clientSecret; this.refreshToken = refreshToken;
        this.apiBase = apiBase; this.tokenUrl = tokenUrl; this.transport = transport;
        java.util.Arrays.setAll(locks, ignored -> new Object());
    }
    public String id() { return "drive:" + (folder == null ? "" : folder); }
    public Readiness probe() {
        if (!configured()) return new Readiness(false, "Archive Drive destination or application authorization is missing.");
        try {
            JsonNode metadata = json(get("/drive/v3/files/" + enc(folder) + "?fields=id,mimeType,capabilities(canAddChildren)&supportsAllDrives=true", 65536));
            boolean ready = folder.equals(metadata.path("id").asText())
                && "application/vnd.google-apps.folder".equals(metadata.path("mimeType").asText())
                && metadata.path("capabilities").path("canAddChildren").asBoolean(false);
            return ready ? new Readiness(true, "") : new Readiness(false, "Archive Drive folder is unavailable or not writable.");
        } catch (ArchiveStorageException e) { return new Readiness(false, "Archive Drive authorization or destination is unavailable."); }
    }
    public String reserve(String captureKey) {
        StorageSupport.key(captureKey);
        ensureConfigured();
        JsonNode result = json(get("/drive/v3/files/generateIds?count=1&space=drive&type=files", 65536));
        String id = result.path("ids").path(0).asText();
        requireObjectId(id);
        return id;
    }
    public StoredObject put(String objectId, String captureKey, byte[] bytes) {
        ensureConfigured(); requireObjectId(objectId); StorageSupport.checkBytes(bytes);
        String key = StorageSupport.key(captureKey), hash = StorageSupport.hash(bytes);
        synchronized (locks[Math.floorMod(objectId.hashCode(), locks.length)]) {
            if (!existsAndMatches(objectId, key)) {
                try {
                    byte[] metadata = JSON.writeValueAsBytes(Map.of("id", objectId, "name", "archive-" + key + ".pdf",
                        "parents", java.util.List.of(folder), "mimeType", "application/pdf", "appProperties", Map.of("captureKey", key)));
                    Response response;
                    if (bytes.length > 5 * 1024 * 1024) {
                        Response init = request("POST", apiBase + "/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
                            "application/json; charset=UTF-8", metadata, 65536, token());
                        if (init.status == 409) response = init;
                        else {
                            if (init.status != 200 && init.status != 201) throw new ArchiveStorageException("Archive Drive upload initiation failed.");
                            String location = verifiedUploadLocation(init.location);
                            response = request("PUT", location, "application/pdf", bytes, 65536, token());
                        }
                    } else {
                        String boundary = "wildtrack_" + UUID.randomUUID().toString().replace("-", "");
                        ByteArrayOutputStream body = new ByteArrayOutputStream();
                        body.write(("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                        body.write(metadata);
                        body.write(("\r\n--" + boundary + "\r\nContent-Type: application/pdf\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                        body.write(bytes); body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
                        response = request("POST", apiBase + "/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
                            "multipart/related; boundary=" + boundary, body.toByteArray(), 65536, token());
                    }
                    if (response.status != 200 && response.status != 201 && response.status != 409)
                        throw new ArchiveStorageException("Archive Drive upload failed.");
                } catch (java.io.IOException e) { throw new ArchiveStorageException("Archive upload preparation failed."); }
            }
            if (!existsAndMatches(objectId, key)) throw new ArchiveStorageException("Archive Drive object was not found after upload.");
            StorageSupport.verify(read(objectId), hash, bytes.length);
            return new StoredObject(id(), objectId, hash, bytes.length);
        }
    }
    public byte[] read(String objectId) {
        ensureConfigured(); requireObjectId(objectId);
        if (!existsAndMatches(objectId, null)) throw new ArchiveStorageException("Archive Drive object was not found.");
        return get("/drive/v3/files/" + enc(objectId) + "?alt=media&supportsAllDrives=true", MAX_BYTES);
    }
    private boolean existsAndMatches(String objectId, String key) {
        Response response = request("GET", apiBase + "/drive/v3/files/" + enc(objectId)
            + "?fields=id,parents,appProperties,trashed&supportsAllDrives=true", null, null, 65536, token());
        if (response.status == 404) return false;
        if (response.status != 200) throw new ArchiveStorageException("Archive Drive object could not be inspected.");
        JsonNode item = json(response.bytes);
        boolean parent = false;
        for (JsonNode candidate : item.path("parents")) if (folder.equals(candidate.asText())) parent = true;
        if (!objectId.equals(item.path("id").asText()) || !parent || item.path("trashed").asBoolean(false)
                || (key != null && !key.equals(item.path("appProperties").path("captureKey").asText())))
            throw new ArchiveStorageException("Archive Drive object identity does not match reservation.");
        return true;
    }
    private byte[] get(String path, int max) {
        ensureConfigured(); Response response = request("GET", apiBase + path, null, null, max, token());
        if (response.status != 200) throw new ArchiveStorageException("Archive Drive request failed.");
        return response.bytes;
    }
    private String token() {
        String form = "grant_type=refresh_token&client_id=" + enc(clientId) + "&client_secret=" + enc(clientSecret)
            + "&refresh_token=" + enc(refreshToken);
        Response response = request("POST", tokenUrl, "application/x-www-form-urlencoded", form.getBytes(StandardCharsets.UTF_8), 65536, null);
        if (response.status != 200) throw new ArchiveStorageException("Archive Drive authorization failed.");
        String token = json(response.bytes).path("access_token").asText();
        if (token.isBlank()) throw new ArchiveStorageException("Archive Drive authorization failed.");
        return token;
    }
    private Response request(String method, String url, String type, byte[] body, int max, String token) {
        return transport.request(method, url, type, body, max, token);
    }
    interface Transport { Response request(String method, String url, String type, byte[] body, int max, String token); }
    static final class UrlTransport implements Transport {
        private final int connectTimeout, requestTimeout;
        UrlTransport(Duration connectTimeout, Duration requestTimeout) {
            this.connectTimeout = Math.toIntExact(connectTimeout.toMillis());
            this.requestTimeout = Math.toIntExact(requestTimeout.toMillis());
            if (this.connectTimeout <= 0 || this.requestTimeout <= 0) throw new IllegalArgumentException("Archive timeouts must be positive.");
        }
        public Response request(String method, String url, String type, byte[] body, int max, String token) {
        java.net.HttpURLConnection connection = null;
        try {
            connection = (java.net.HttpURLConnection) URI.create(url).toURL().openConnection();
            connection.setConnectTimeout(connectTimeout); connection.setReadTimeout(requestTimeout);
            connection.setInstanceFollowRedirects(false); connection.setRequestMethod(method);
            if (type != null) connection.setRequestProperty("Content-Type", type);
            if (url.contains("uploadType=resumable")) connection.setRequestProperty("X-Upload-Content-Type", "application/pdf");
            if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) { connection.setDoOutput(true); connection.setFixedLengthStreamingMode(body.length);
                try (var output = connection.getOutputStream()) { output.write(body); } }
            int status = connection.getResponseCode();
            InputStream response = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (response == null) return new Response(status, new byte[0], connection.getHeaderField("Location"));
            try (InputStream stream = response) {
                byte[] result = stream.readNBytes(max + 1);
                if (result.length > max) throw new ArchiveStorageException("Archive Drive response exceeded the size limit.");
                return new Response(status, result, connection.getHeaderField("Location"));
            }
        } catch (java.io.IOException | IllegalArgumentException e) { throw new ArchiveStorageException("Archive Drive request could not complete."); }
        finally { if (connection != null) connection.disconnect(); }
        }
    }
    record Response(int status, byte[] bytes, String location) {
        Response(int status, byte[] bytes) { this(status, bytes, null); }
    }
    private static String verifiedUploadLocation(String location) {
        try {
            URI uri = URI.create(location);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !"www.googleapis.com".equalsIgnoreCase(uri.getHost())
                    || uri.getUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)
                    || uri.getFragment() != null || uri.getPath() == null
                    || !uri.getRawPath().equals("/upload/drive/v3/files")) throw new IllegalArgumentException();
            return uri.toString();
        } catch (Exception e) { throw new ArchiveStorageException("Archive Drive returned an invalid upload destination."); }
    }
    private boolean configured() { return validId(folder) && nonblank(clientId) && nonblank(clientSecret) && nonblank(refreshToken); }
    private void ensureConfigured() { if (!configured()) throw new ArchiveStorageException("Archive Drive destination or application authorization is missing."); }
    private static boolean nonblank(String value) { return value != null && !value.isBlank(); }
    private static boolean validId(String value) { return value != null && value.matches("[A-Za-z0-9_-]{1,200}"); }
    private static void requireObjectId(String value) { if (!validId(value)) throw new ArchiveStorageException("Invalid archive object identity."); }
    private static String enc(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private static JsonNode json(byte[] bytes) {
        try {
            JsonNode value=JSON.readTree(bytes);
            if (value == null || !value.isObject()) throw new ArchiveStorageException("Archive Drive returned an invalid response.");
            return value;
        } catch (java.io.IOException e) { throw new ArchiveStorageException("Archive Drive returned an invalid response."); }
    }
}
