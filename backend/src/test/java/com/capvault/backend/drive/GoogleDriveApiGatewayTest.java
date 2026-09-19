package com.capvault.backend.drive;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GoogleDriveApiGatewayTest {

    @Test
    void requestsAndReturnsAvailableLastModifyingUserMetadata() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://www.googleapis.com");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(containsString("lastModifyingUser")))
            .andRespond(withSuccess("""
                {
                  "id":"file-1",
                  "name":"framework.pdf",
                  "mimeType":"application/pdf",
                  "size":"1200",
                  "md5Checksum":"abc123",
                  "createdTime":"2026-09-01T05:06:07Z",
                  "modifiedTime":"2026-09-18T01:02:03Z",
                  "owners":[{"displayName":"Drive Owner","emailAddress":"owner@example.com"}],
                  "lastModifyingUser":{"displayName":"Drive Name","emailAddress":"editor@example.com"},
                  "capabilities":{"canDownload":true},
                  "webViewLink":"https://drive.google.com/file/d/file-1/view"
                }
                """, MediaType.APPLICATION_JSON));

        GoogleDriveApiGateway gateway = new GoogleDriveApiGateway(
            new GoogleDriveProperties(true, "test-key", 25_000_000), builder.build());
        DriveFileMetadata metadata = gateway.getMetadata(new DriveFileReference("file-1", null));

        assertThat(metadata.lastModifyingUserEmail()).isEqualTo("editor@example.com");
        assertThat(metadata.lastModifyingUserDisplayName()).isEqualTo("Drive Name");
        assertThat(metadata.createdTime()).isEqualTo(java.time.OffsetDateTime.parse("2026-09-01T05:06:07Z"));
        assertThat(metadata.driveOwner()).isEqualTo("Drive Owner");
        assertThat(metadata.md5Checksum()).isEqualTo("abc123");
        server.verify();
    }

    @Test
    void acceptsMetadataWhenDriveOmitsEditorIdentity() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://www.googleapis.com");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(containsString("/drive/v3/files/file-2")))
            .andRespond(withSuccess("""
                {
                  "id":"file-2",
                  "name":"report.pdf",
                  "mimeType":"application/pdf",
                  "md5Checksum":"def456",
                  "modifiedTime":"2026-09-18T02:02:03Z",
                  "capabilities":{"canDownload":true}
                }
                """, MediaType.APPLICATION_JSON));

        GoogleDriveApiGateway gateway = new GoogleDriveApiGateway(
            new GoogleDriveProperties(true, "test-key", 25_000_000), builder.build());
        DriveFileMetadata metadata = gateway.getMetadata(new DriveFileReference("file-2", null));

        assertThat(metadata.lastModifyingUserEmail()).isNull();
        assertThat(metadata.lastModifyingUserDisplayName()).isNull();
        assertThat(metadata.createdTime()).isNull();
        assertThat(metadata.driveOwner()).isNull();
        server.verify();
    }
}
