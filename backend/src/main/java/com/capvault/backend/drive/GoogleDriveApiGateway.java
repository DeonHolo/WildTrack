package com.capvault.backend.drive;

import java.time.OffsetDateTime;

import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriUtils;

final class GoogleDriveApiGateway implements GoogleDriveGateway {

    private static final String METADATA_FIELDS =
        "id,name,mimeType,size,md5Checksum,modifiedTime,capabilities(canDownload),webViewLink";

    private final GoogleDriveProperties properties;
    private final RestClient restClient;

    GoogleDriveApiGateway(GoogleDriveProperties properties, RestClient restClient) {
        this.properties = properties;
        this.restClient = restClient;
    }

    @Override
    public DriveFileMetadata getMetadata(DriveFileReference reference) {
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
                response.capabilities() != null && response.capabilities().canDownload(),
                response.webViewLink()
            );
        } catch (RestClientResponseException exception) {
            throw translate(exception);
        }
    }

    @Override
    public byte[] download(DriveFileReference reference) {
        try {
            byte[] bytes = restClient.get()
                .uri(downloadPath(reference.fileId()))
                .headers(headers -> addResourceKey(headers, reference))
                .retrieve()
                .body(byte[].class);
            if (bytes == null || bytes.length == 0) {
                throw new GoogleDriveUnavailableException("The submitted Drive file is empty or could not be downloaded.");
            }
            if (bytes.length > properties.maximumFileSizeBytes()) {
                throw new IllegalArgumentException("The submitted PDF exceeds the 25 MB file-check limit.");
            }
            return bytes;
        } catch (RestClientResponseException exception) {
            throw translate(exception);
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

    private static GoogleDriveUnavailableException translate(RestClientResponseException exception) {
        int status = exception.getStatusCode().value();
        if (status == 403 || status == 404) {
            return new GoogleDriveUnavailableException(
                "The Drive file is inaccessible. Set it to Anyone with the link - Viewer and allow downloads.",
                exception
            );
        }
        if (status == 400) {
            return new GoogleDriveUnavailableException(
                "Google Drive rejected this file link or resource key.",
                exception
            );
        }
        return new GoogleDriveUnavailableException(
            "Google Drive could not be reached for Document Check.",
            exception
        );
    }

    private record DriveApiFile(
        String id,
        String name,
        String mimeType,
        String size,
        String md5Checksum,
        String modifiedTime,
        Capabilities capabilities,
        String webViewLink
    ) {
    }

    private record Capabilities(boolean canDownload) {
    }
}
