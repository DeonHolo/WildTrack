package com.capvault.backend.drive;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GoogleDriveApiGatewayTest {
    @org.junit.jupiter.api.Test
    @org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
    void transportDiagnosticsIdentifyDownloadStageWithoutExposingSecrets(org.springframework.boot.test.system.CapturedOutput output) {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://www.googleapis.com");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(containsString("alt=media"))).andRespond(request -> {
            throw new java.net.SocketTimeoutException("private-api-key private-file-id");
        });
        var gateway = new GoogleDriveApiGateway(new GoogleDriveProperties(true, "private-api-key", 25_000_000), builder.build());
        assertThatThrownBy(() -> gateway.download(new DriveFileReference("private-file-id", null)))
            .isInstanceOfSatisfying(GoogleDriveUnavailableException.class, failure -> {
                assertThat(failure.failureDetails()).satisfies(details -> {
                    assertThat(details.stage()).isEqualTo("download");
                    assertThat(details.category()).isEqualTo("TRANSPORT");
                    assertThat(details.code()).isEqualTo("TIMEOUT");
                    assertThat(details.reason()).doesNotContain("private-api-key", "private-file-id");
                });
            });
        assertThat(output.getOut()).contains("stage=download", "kind=TRANSPORT", "causeType=SocketTimeoutException")
            .doesNotContain("private-api-key", "private-file-id", "https://www.googleapis.com");
        server.verify();
    }



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

    @Test
    void classifiesDriveFailuresUsingStatusAndWhitelistedReasons() {
        assertFailureKind(403, "{\"error\":{\"errors\":[{\"reason\":\"insufficientFilePermissions\"}]}}",
            GoogleDriveUnavailableException.Kind.FILE_ACCESS);
        assertFailureKind(403, "{\"error\":{\"errors\":[{\"reason\":\"backendError\"}]}}",
            GoogleDriveUnavailableException.Kind.UNKNOWN);
        assertFailureKind(403, "{\"error\":{\"errors\":[{\"reason\":\"forbidden\"}]}}",
            GoogleDriveUnavailableException.Kind.UNKNOWN);
        assertFailureKind(403, "{\"error\":{\"details\":[{\"@type\":\"type.googleapis.com/google.rpc.ErrorInfo\",\"reason\":\"API_KEY_SERVICE_BLOCKED\"}]}}",
            GoogleDriveUnavailableException.Kind.CONFIGURATION);
        assertFailureKind(403, "{\"error\":{\"errors\":[{\"reason\":\"accessNotConfigured\"}]}}",
            GoogleDriveUnavailableException.Kind.CONFIGURATION);
        assertFailureKind(403, "{\"error\":{\"errors\":[{\"reason\":\"rateLimitExceeded\"}]}}",
            GoogleDriveUnavailableException.Kind.RATE_LIMIT);
        assertFailureKind(404, "{}", GoogleDriveUnavailableException.Kind.FILE_ACCESS);
        assertFailureKind(401, "{}", GoogleDriveUnavailableException.Kind.CONFIGURATION);
        assertFailureKind(429, "{}", GoogleDriveUnavailableException.Kind.RATE_LIMIT);
        assertFailureKind(503, "{}", GoogleDriveUnavailableException.Kind.PROVIDER_UNAVAILABLE);
    }

    @Test
    void sendsResourceKeyHeaderForMetadataAndDownload() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://www.googleapis.com");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(containsString("/drive/v3/files/file-key")))
            .andExpect(header("X-Goog-Drive-Resource-Keys", equalTo("file-key/resource-key")))
            .andRespond(withSuccess("{\"id\":\"file-key\",\"name\":\"f.pdf\",\"mimeType\":\"application/pdf\",\"capabilities\":{\"canDownload\":true}}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(containsString("/drive/v3/files/file-key")))
            .andExpect(header("X-Goog-Drive-Resource-Keys", equalTo("file-key/resource-key")))
            .andRespond(withSuccess(new byte[] {1}, MediaType.APPLICATION_PDF));

        GoogleDriveApiGateway gateway = new GoogleDriveApiGateway(
            new GoogleDriveProperties(true, "test-key", 25_000_000), builder.build());
        DriveFileReference reference = new DriveFileReference("file-key", "resource-key");
        gateway.getMetadata(reference);
        assertThat(gateway.download(reference)).containsExactly((byte) 1);
        server.verify();
    }

    @Test
    void boundsDownloadWhenContentLengthIsMissingOrWrong() {
        for (long declared : new long[] {-1, 2}) {
            var stream = new java.io.ByteArrayInputStream(new byte[100]);
            RestClient.Builder builder = RestClient.builder().baseUrl("https://www.googleapis.com");
            MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
            server.expect(requestTo(containsString("alt=media"))).andRespond(request -> {
                var response = new org.springframework.mock.http.client.MockClientHttpResponse(new byte[0], HttpStatus.OK) {
                    @Override public java.io.InputStream getBody() { return stream; }
                };
                if (declared >= 0) response.getHeaders().setContentLength(declared);
                return response;
            });
            var gateway = new GoogleDriveApiGateway(new GoogleDriveProperties(true, "key", 10), builder.build());
            assertThatThrownBy(() -> gateway.download(new DriveFileReference("file", null)))
                .isInstanceOfSatisfying(GoogleDriveUnavailableException.class,
                    failure -> assertThat(failure.failureDetails().code()).isEqualTo("FILE_TOO_LARGE"));
            assertThat(stream.available()).isEqualTo(89);
            server.verify();
        }
    }

    @Test
    void downloadPreservesAccessFailureClassification() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://www.googleapis.com");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(containsString("alt=media")))
            .andRespond(withStatus(HttpStatus.FORBIDDEN).body("{\"error\":{\"reason\":\"insufficientFilePermissions\"}}"));
        var gateway = new GoogleDriveApiGateway(new GoogleDriveProperties(true, "key", 10), builder.build());
        assertThatThrownBy(() -> gateway.download(new DriveFileReference("file", null)))
            .isInstanceOfSatisfying(GoogleDriveUnavailableException.class, failure -> {
                assertThat(failure.kind()).isEqualTo(GoogleDriveUnavailableException.Kind.FILE_ACCESS);
                assertThat(failure.failureDetails().code()).isEqualTo("ACCESS_DENIED");
            });
    }

    private static void assertFailureKind(int status, String body, GoogleDriveUnavailableException.Kind expected) {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://www.googleapis.com");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        int attempts = status == 429 || body.contains("rateLimitExceeded") ? 4 : 1;
        server.expect(org.springframework.test.web.client.ExpectedCount.times(attempts), requestTo(containsString("/drive/v3/files/file-failure")))
            .andRespond(withStatus(HttpStatus.valueOf(status)).contentType(MediaType.APPLICATION_JSON).body(body));
        GoogleDriveApiGateway gateway = new GoogleDriveApiGateway(
            new GoogleDriveProperties(true, "test-key", 25_000_000), builder.build(), millis -> { });

        assertThatThrownBy(() -> gateway.getMetadata(new DriveFileReference("file-failure", null)))
            .isInstanceOfSatisfying(GoogleDriveUnavailableException.class,
                exception -> {
                    assertThat(exception.kind()).isEqualTo(expected);
                    assertThat(exception.failureDetails()).isNotNull();
                    assertThat(exception.failureDetails().upstreamStatus()).isEqualTo(status);
                    assertThat(exception.failureDetails().reason()).doesNotContain("file-failure", "test-key");
                    if (status == 404) {
                        assertThat(exception.failureDetails().code()).isEqualTo("NOT_FOUND");
                        assertThat(exception.failureDetails().reason())
                            .isEqualTo("Google Drive could not find or access the submitted file.");
                    }
                });
        server.verify();
    }
}
