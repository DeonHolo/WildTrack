package com.capvault.backend.drivehistory.auth;

import java.net.URI;
import java.util.List;
import java.util.regex.Pattern;

import org.springframework.http.HttpHeaders;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

final class GoogleDelegatedDriveGateway implements DelegatedDriveGateway {
    private static final Pattern FILE_ID = Pattern.compile("[A-Za-z0-9_-]{3,200}");
    private static final String FIELDS =
        "nextPageToken,revisions(id,modifiedTime,mimeType,size,keepForever,lastModifyingUser(displayName,emailAddress))";
    private static final String FILE_FIELDS =
        "id,createdTime,modifiedTime,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress)";
    private final RestClient restClient;

    GoogleDelegatedDriveGateway(RestClient restClient) { this.restClient = restClient; }

    @Override
    public FileDetails fileMetadata(String bearerAccessToken, String fileId) {
        validateAccess(bearerAccessToken, fileId);
        URI uri = UriComponentsBuilder.fromPath("/drive/v3/files/{id}")
            .queryParam("fields", FILE_FIELDS)
            .queryParam("supportsAllDrives", true)
            .buildAndExpand(fileId).encode().toUri();
        try {
            DriveFile file = restClient.get().uri("https://www.googleapis.com" + uri.toASCIIString())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerAccessToken)
                .retrieve().body(DriveFile.class);
            if (file == null) throw new DelegatedDriveException(DelegatedDriveException.Reason.PROVIDER_UNAVAILABLE);
            String owner = file.owners() == null ? null : file.owners().stream()
                .filter(java.util.Objects::nonNull)
                .map(GoogleDelegatedDriveGateway::displayName)
                .filter(value -> value != null && !value.isBlank())
                .distinct().limit(3)
                .collect(java.util.stream.Collectors.joining(", "));
            return new FileDetails(file.createdTime(), owner == null || owner.isBlank() ? null : owner,
                file.modifiedTime(), displayName(file.lastModifyingUser()));
        } catch (RestClientResponseException error) {
            throw classified(error.getStatusCode().value());
        } catch (ResourceAccessException error) {
            throw new DelegatedDriveException(DelegatedDriveException.Reason.PROVIDER_UNAVAILABLE);
        }
    }

    @Override
    public Page revisions(String bearerAccessToken, String fileId, String pageToken, int pageSize) {
        validateAccess(bearerAccessToken, fileId);
        if (pageToken != null && pageToken.length() > 2048) {
            throw new IllegalArgumentException("Invalid Google Drive page token.");
        }
        URI uri = UriComponentsBuilder.fromPath("/drive/v3/files/{id}/revisions")
            .queryParam("fields", FIELDS)
            .queryParam("pageSize", Math.max(1, Math.min(200, pageSize)))
            .queryParamIfPresent("pageToken", java.util.Optional.ofNullable(pageToken).filter(value -> !value.isBlank()))
            .buildAndExpand(fileId).encode().toUri();
        try {
            RevisionsResponse response = restClient.get().uri("https://www.googleapis.com" + uri.toASCIIString())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerAccessToken)
                .retrieve().body(RevisionsResponse.class);
            if (response == null) throw new DelegatedDriveException(DelegatedDriveException.Reason.PROVIDER_UNAVAILABLE);
            List<DriveRevisionMetadata> metadata = response.revisions() == null ? List.of()
                : response.revisions().stream().map(revision -> new DriveRevisionMetadata(
                    revision.id(), revision.modifiedTime(), revision.mimeType(), revision.size(),
                    revision.keepForever(),
                    revision.lastModifyingUser() == null ? null : revision.lastModifyingUser().displayName(),
                    revision.lastModifyingUser() == null ? null : revision.lastModifyingUser().emailAddress()
                )).toList();
            return new Page(metadata, response.nextPageToken());
        } catch (RestClientResponseException error) {
            throw classified(error.getStatusCode().value());
        } catch (ResourceAccessException error) {
            throw new DelegatedDriveException(DelegatedDriveException.Reason.PROVIDER_UNAVAILABLE);
        }
    }

    private static void validateAccess(String bearerAccessToken, String fileId) {
        if (bearerAccessToken == null || bearerAccessToken.isBlank()) {
            throw new DelegatedDriveException(DelegatedDriveException.Reason.AUTH_REVOKED);
        }
        if (fileId == null || !FILE_ID.matcher(fileId).matches()) {
            throw new IllegalArgumentException("Invalid Google Drive file identifier.");
        }
    }

    private static DelegatedDriveException classified(int status) {
        return new DelegatedDriveException(
            status == 401 ? DelegatedDriveException.Reason.AUTH_REVOKED
                : status == 403 || status == 404 ? DelegatedDriveException.Reason.PERMISSION_DENIED
                : DelegatedDriveException.Reason.PROVIDER_UNAVAILABLE);
    }

    private static String displayName(DriveUser user) {
        if (user == null) return null;
        if (user.displayName() != null && !user.displayName().isBlank()) return user.displayName();
        return user.emailAddress();
    }

    private record RevisionsResponse(List<Revision> revisions, String nextPageToken) { }
    private record Revision(String id, String modifiedTime, String mimeType, String size,
                            Boolean keepForever, DriveUser lastModifyingUser) { }
    private record DriveFile(String id, String createdTime, String modifiedTime,
                             List<DriveUser> owners, DriveUser lastModifyingUser) { }
    private record DriveUser(String displayName, String emailAddress) { }
}
