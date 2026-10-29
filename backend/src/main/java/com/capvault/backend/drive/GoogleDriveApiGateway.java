package com.capvault.backend.drive;

import java.time.OffsetDateTime;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import com.capvault.backend.filecheck.DriveFailureDetails;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriUtils;

final class GoogleDriveApiGateway implements GoogleDriveGateway {

    private static final Logger LOG = LoggerFactory.getLogger(GoogleDriveApiGateway.class);
    private static final String METADATA_FIELDS = "id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress),capabilities(canDownload),webViewLink";

    private final GoogleDriveProperties properties;
    private final RestClient restClient;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    GoogleDriveApiGateway(GoogleDriveProperties properties, RestClient restClient) {
        this.properties = properties;
        this.restClient = restClient;
    }

    @Override
    public DriveFileMetadata getMetadata(DriveFileReference reference) {
        long started = System.nanoTime();
        try {
            DriveApiFile response = restClient.get()
                .uri(metadataPath(reference.fileId()))
                .headers(headers -> addResourceKey(headers, reference))
                .retrieve()
                .body(DriveApiFile.class);
            if (response == null) {
                throw new GoogleDriveUnavailableException("Google Drive returned an empty metadata response.");
            }
            return new DriveFileMetadata(
                response.id(),
                response.name(),
                response.mimeType(),
                parseSize(response.size()),
                response.md5Checksum(),
                parseTime(response.modifiedTime()),
                response.lastModifyingUser() == null ? null : response.lastModifyingUser().emailAddress(),
                response.lastModifyingUser() == null ? null : response.lastModifyingUser().displayName(),
                response.capabilities() != null && response.capabilities().canDownload(),
                response.webViewLink(),
                parseTime(response.createdTime()),
                driveOwner(response.owners()),
                soleOwnerEmail(response.owners())
            );
        } catch (RestClientResponseException exception) {
            logFailure("metadata", started, exception);
            throw translate(exception, "metadata", started);
        } catch (RestClientException exception) {
            logFailure("metadata", started, exception);
            throw unavailable(GoogleDriveUnavailableException.Kind.PROVIDER_UNAVAILABLE, "metadata", started, exception);
        }
    }

    @Override
    public byte[] download(DriveFileReference reference) {
        long started = System.nanoTime();
        try {
            byte[] bytes = restClient.get()
                .uri(downloadPath(reference.fileId()))
                .headers(headers -> addResourceKey(headers, reference))
                .exchange((request, response) -> {
                    try (InputStream body = response.getBody()) {
                        if (response.getStatusCode().isError()) {
                            byte[] error = body.readNBytes(64 * 1024);
                            throw new RestClientResponseException("Google Drive HTTP error", response.getStatusCode(),
                                response.getStatusText(), response.getHeaders(), error, StandardCharsets.UTF_8);
                        }
                        long limit = properties.maximumFileSizeBytes();
                        if (limit < 0 || limit >= Integer.MAX_VALUE) {
                            throw new IllegalStateException("Invalid Drive file size limit");
                        }
                        return body.readNBytes((int) limit + 1);
                    }
                });
            if (bytes == null || bytes.length == 0) {
                String reason = "The submitted Drive file is empty or could not be downloaded.";
                throw new GoogleDriveUnavailableException(reason, null, GoogleDriveUnavailableException.Kind.UNKNOWN,
                    new DriveFailureDetails("download", "INTEGRITY", "EMPTY_FILE", null, reason, null,
                        elapsedMs(started), null, bytes == null ? null : 0L));
            }
            if (bytes.length > properties.maximumFileSizeBytes()) {
                String reason = "The submitted PDF exceeds the 25 MB file-check limit.";
                throw new GoogleDriveUnavailableException(reason, null, GoogleDriveUnavailableException.Kind.UNKNOWN,
                    new DriveFailureDetails("download", "INTEGRITY", "FILE_TOO_LARGE", null, reason, null,
                        elapsedMs(started), (long) properties.maximumFileSizeBytes(), (long) bytes.length));
            }
            return bytes;
        } catch (RestClientResponseException exception) {
            logFailure("download", started, exception);
            throw translate(exception, "download", started);
        } catch (RestClientException exception) {
            logFailure("download", started, exception);
            throw unavailable(GoogleDriveUnavailableException.Kind.PROVIDER_UNAVAILABLE, "download", started, exception);
        }
    }

    @Override
    public boolean isConfigured() {
        return true;
    }

    private String metadataPath(String fileId) {
        return "/drive/v3/files/" + encode(fileId)
            + "?fields=" + encode(METADATA_FIELDS)
            + "&supportsAllDrives=true&key=" + encode(properties.apiKey());
    }

    private String downloadPath(String fileId) {
        return "/drive/v3/files/" + encode(fileId)
            + "?alt=media&supportsAllDrives=true&key=" + encode(properties.apiKey());
    }

    private static void addResourceKey(HttpHeaders headers, DriveFileReference reference) {
        if (reference.resourceKey() != null && !reference.resourceKey().isBlank()) {
            headers.set("X-Goog-Drive-Resource-Keys", reference.fileId() + "/" + reference.resourceKey());
        }
    }

    private static String encode(String value) {
        return UriUtils.encodeQueryParam(value, java.nio.charset.StandardCharsets.UTF_8);
    }

    private static Long parseSize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static OffsetDateTime parseTime(String value) {
        return value == null || value.isBlank() ? null : OffsetDateTime.parse(value);
    }

    private static String driveOwner(List<DriveUser> owners) {
        if (owners == null || owners.isEmpty()) return null;
        String display = owners.stream()
            .filter(java.util.Objects::nonNull)
            .map(owner -> owner.displayName() != null && !owner.displayName().isBlank()
                ? owner.displayName().trim() : owner.emailAddress())
            .filter(value -> value != null && !value.isBlank())
            .distinct()
            .limit(3)
            .collect(java.util.stream.Collectors.joining(", "));
        return display.isBlank() ? null : display;
    }

    private static String soleOwnerEmail(List<DriveUser> owners) {
        if (owners == null || owners.size() != 1 || owners.get(0) == null) return null;
        String email = owners.get(0).emailAddress();
        return email == null || email.isBlank() ? null : email.trim();
    }

    private static void logFailure(String stage, long started, RestClientException exception) {
        Throwable cause = exception;
        for (int depth = 0; depth < 8 && cause.getCause() != null; depth++) cause = cause.getCause();
        int status = exception instanceof RestClientResponseException upstream ? upstream.getStatusCode().value() : 0;
        String kind = exception instanceof RestClientResponseException upstream
            ? classify(status, upstreamReasons(upstream.getResponseBodyAsString())).name() : "TRANSPORT";
        // Never log request URIs, API keys, file IDs, response bodies or exception messages.
        LOG.warn("Drive request failed stage={} elapsedMs={} upstreamStatus={} kind={} causeType={}",
            stage, (System.nanoTime() - started) / 1_000_000, status, kind, cause.getClass().getSimpleName());
    }


    private static GoogleDriveUnavailableException translate(RestClientResponseException exception, String stage, long started) {
        int status = exception.getStatusCode().value();
        Set<String> reasons = upstreamReasons(exception.getResponseBodyAsString());
        GoogleDriveUnavailableException.Kind kind = classify(status, reasons);
        String code = status == 404 ? "NOT_FOUND" : switch (kind) {
            case FILE_ACCESS -> "ACCESS_DENIED";
            case CONFIGURATION -> "CONFIGURATION_ERROR";
            case RATE_LIMIT -> "RATE_LIMIT";
            case PROVIDER_UNAVAILABLE -> "PROVIDER_ERROR";
            case UNKNOWN -> "UPSTREAM_ERROR";
        };
        String reason = status == 404 ? "Google Drive could not find or access the submitted file." : switch (kind) {
            case FILE_ACCESS -> "Google Drive denied access to the submitted file.";
            case CONFIGURATION -> "Google Drive API configuration could not authorize this request.";
            case RATE_LIMIT -> "Google Drive temporarily rate limited this request.";
            case PROVIDER_UNAVAILABLE -> "Google Drive did not complete the request.";
            case UNKNOWN -> "Google Drive returned an unrecognized response.";
        };
        DriveFailureDetails details = new DriveFailureDetails(stage, "HTTP", code, status, reason,
            exception.getClass().getSimpleName(), elapsedMs(started), null, null);
        return new GoogleDriveUnavailableException(reason, exception, kind, details);
    }

    private static long elapsedMs(long started) {
        return (System.nanoTime() - started) / 1_000_000;
    }

    private static GoogleDriveUnavailableException.Kind classify(int status, Set<String> reasons) {
        if (status == 404) return GoogleDriveUnavailableException.Kind.FILE_ACCESS;
        if (status == 401 || containsAny(reasons, CONFIGURATION_REASONS)) {
            return GoogleDriveUnavailableException.Kind.CONFIGURATION;
        }
        if (status == 429 || containsAny(reasons, RATE_LIMIT_REASONS)) {
            return GoogleDriveUnavailableException.Kind.RATE_LIMIT;
        }
        if (status == 403 && containsAny(reasons, FILE_ACCESS_REASONS)) {
            return GoogleDriveUnavailableException.Kind.FILE_ACCESS;
        }
        if (status >= 500 && status <= 599) {
            return GoogleDriveUnavailableException.Kind.PROVIDER_UNAVAILABLE;
        }
        return GoogleDriveUnavailableException.Kind.UNKNOWN;
    }

    private static GoogleDriveUnavailableException unavailable(GoogleDriveUnavailableException.Kind kind) {
        return unavailable(kind, "unknown", 0L, null);
    }

    private static GoogleDriveUnavailableException unavailable(
        GoogleDriveUnavailableException.Kind kind, String stage, long started, Throwable cause
    ) {
        GoogleDriveUnavailableException.Kind effective = kind == null
            ? GoogleDriveUnavailableException.Kind.UNKNOWN : kind;
        String code = transportCode(cause, effective);
        String reason = switch (code) {
            case "TIMEOUT" -> "The Google Drive request timed out.";
            case "DNS_FAILURE" -> "The Google Drive host could not be resolved.";
            case "CONNECTION_FAILURE" -> "The Google Drive connection could not be established.";
            case "TLS_FAILURE" -> "The Google Drive connection could not be secured.";
            case "ACCESS_DENIED" -> "The submitted Drive file is inaccessible to the Document Check service.";
            case "CONFIGURATION_ERROR" -> "Google Drive API configuration is invalid or unavailable for Document Check.";
            case "RATE_LIMIT" -> "Google Drive is temporarily rate limited. Try Document Check again later.";
            case "PROVIDER_ERROR" -> "Google Drive could not be reached for Document Check.";
            default -> "Google Drive returned an unrecognized error for Document Check.";
        };
        DriveFailureDetails details = new DriveFailureDetails(stage, "TRANSPORT", code, null, reason,
            cause == null ? null : cause.getClass().getSimpleName(),
            started == 0L ? null : elapsedMs(started), null, null);
        return new GoogleDriveUnavailableException(reason, cause, effective, details);
    }

    private static String transportCode(Throwable cause, GoogleDriveUnavailableException.Kind kind) {
        if (cause == null) return switch (kind) {
            case FILE_ACCESS -> "ACCESS_DENIED";
            case CONFIGURATION -> "CONFIGURATION_ERROR";
            case RATE_LIMIT -> "RATE_LIMIT";
            case PROVIDER_UNAVAILABLE -> "PROVIDER_ERROR";
            default -> "TRANSPORT_ERROR";
        };
        Throwable current = cause;
        for (int depth = 0; current != null && depth < 8; depth++, current = current.getCause()) {
            String name = current.getClass().getName().toLowerCase(Locale.ROOT);
            if (name.contains("timeout")) return "TIMEOUT";
            if (name.contains("unknownhost") || name.contains("dns")) return "DNS_FAILURE";
            if (name.contains("ssl") || name.contains("tls")) return "TLS_FAILURE";
            if (name.contains("connect")) return "CONNECTION_FAILURE";
        }
        return "TRANSPORT_ERROR";
    }

    private static Set<String> upstreamReasons(String body) {
        Set<String> reasons = new HashSet<>();
        if (body == null || body.isBlank()) return reasons;
        try {
            collectReasons(OBJECT_MAPPER.readTree(body), reasons);
        } catch (Exception ignored) {
            // Upstream bodies are untrusted and are never returned or logged.
        }
        return reasons;
    }

    private static void collectReasons(JsonNode node, Set<String> reasons) {
        if (node == null) return;
        if (node.isObject()) {
            node.fields().forEachRemaining(entry -> {
                String field = normalize(entry.getKey());
                JsonNode value = entry.getValue();
                if (("reason".equals(field) || "status".equals(field)) && value.isTextual()) {
                    reasons.add(normalize(value.asText()));
                }
                if ("message".equals(field) && value.isTextual()) {
                    String message = normalize(value.asText());
                    if (message.contains("apikeynotvalid")) reasons.add("apikeynotvalid");
                    if (message.contains("apiisnotenabled") || message.contains("apihasnotbeenused")) {
                        reasons.add("apinotactivated");
                    }
                }
                collectReasons(value, reasons);
            });
        } else if (node.isArray()) {
            node.forEach(child -> collectReasons(child, reasons));
        }
    }

    private static boolean containsAny(Set<String> actual, Set<String> expected) {
        return actual.stream().anyMatch(expected::contains);
    }

    private static String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static final Set<String> FILE_ACCESS_REASONS = Set.of(
        "insufficientfilepermissions", "cannotdownloadfile", "filenotdownloadable", "appnotauthorizedtofile",
        "downloadrestricted", "resourcekeyinvalid", "resourcekeyrequired", "invalidresourcekey",
        "fileaccessdenied"
    );
    private static final Set<String> CONFIGURATION_REASONS = Set.of(
        "keyinvalid", "apikeyinvalid", "apikeynotvalid", "keyexpired", "accessnotconfigured",
        "apinotactivated", "iprefererblocked", "keyrestriction", "servicedisabled",
        "apikeyserviceblocked", "apikeyhttprefererblocked", "apikeyipaddressblocked", "apikeyexpired"
    );
    private static final Set<String> RATE_LIMIT_REASONS = Set.of(
        "ratelimitexceeded", "userratelimitexceeded", "dailylimitexceeded", "quotaexceeded",
        "quotaexceededperuser", "quotablocked", "downloadquotaexceeded", "resourceexhausted"
    );

    private record DriveApiFile(
        String id,
        String name,
        String mimeType,
        String size,
        String md5Checksum,
        String createdTime,
        String modifiedTime,
        List<DriveUser> owners,
        DriveUser lastModifyingUser,
        Capabilities capabilities,
        String webViewLink
    ) {
    }

    private record DriveUser(String displayName, String emailAddress) {
    }

    private record Capabilities(boolean canDownload) {
    }
}
