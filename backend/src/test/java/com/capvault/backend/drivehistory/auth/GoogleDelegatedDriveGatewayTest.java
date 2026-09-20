package com.capvault.backend.drivehistory.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GoogleDelegatedDriveGatewayTest {
    @Test
    void readsPaginatedRevisionMetadataUsingBearerAuthorizationOnly() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://www.googleapis.com");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(allOf(
                containsString("/drive/v3/files/file123/revisions"),
                containsString("pageSize=2"),
                containsString("pageToken=next-one"),
                not(containsString("supportsAllDrives")),
                containsString("lastModifyingUser"))))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer sample-access-token"))
            .andRespond(withSuccess("""
                {"nextPageToken":"next-two","revisions":[
                  {"id":"rev1","modifiedTime":"2026-09-19T01:00:00Z","mimeType":"application/pdf",
                   "size":"1234","keepForever":false,
                   "lastModifyingUser":{"displayName":"Provider Name","emailAddress":"editor@example.com"}},
                  {"id":"rev2","modifiedTime":"2026-09-19T02:00:00Z"}
                ]}
                """, MediaType.APPLICATION_JSON));
        DelegatedDriveGateway gateway = new GoogleDelegatedDriveGateway(builder.build());
        var page = gateway.revisions("sample-access-token", "file123", "next-one", 2);
        assertThat(page.nextPageToken()).isEqualTo("next-two");
        assertThat(page.revisions()).hasSize(2);
        assertThat(page.revisions().get(0).modifiedBy()).isEqualTo("Provider Name");
        assertThat(page.revisions().get(0).modifiedByEmail()).isEqualTo("editor@example.com");
        assertThat(page.revisions().get(1).modifiedByEmail()).isNull();
        server.verify();
    }

    @Test
    void readsCurrentFileMetadataUsingDelegatedBearerWithoutDownloadingContents() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://www.googleapis.com");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(allOf(
                containsString("/drive/v3/files/file123"),
                containsString("createdTime"),
                containsString("lastModifyingUser"))))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer sample-access-token"))
            .andRespond(withSuccess("""
                {"id":"file123","createdTime":"2026-09-17T01:00:00Z","modifiedTime":"2026-09-19T02:00:00Z",
                 "owners":[{"displayName":"Drive Owner","emailAddress":"owner@example.com"}],
                 "lastModifyingUser":{"displayName":"Drive Editor","emailAddress":"editor@example.com"}}
                """, MediaType.APPLICATION_JSON));
        DelegatedDriveGateway gateway = new GoogleDelegatedDriveGateway(builder.build());
        var details = gateway.fileMetadata("sample-access-token", "file123");
        assertThat(details.createdTime()).isEqualTo("2026-09-17T01:00:00Z");
        assertThat(details.driveOwner()).isEqualTo("Drive Owner");
        assertThat(details.lastModifiedTime()).isEqualTo("2026-09-19T02:00:00Z");
        assertThat(details.lastModifiedBy()).isEqualTo("Drive Editor");
        server.verify();
    }

    @Test
    void classifiesDeniedAndRevokedWithoutLeakingProviderBodyOrToken() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://www.googleapis.com");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(containsString("/revisions")))
            .andRespond(withStatus(HttpStatus.FORBIDDEN).body("private-provider-body sample-access-token"));
        server.expect(requestTo(containsString("/revisions")))
            .andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("private-provider-body sample-access-token"));
        DelegatedDriveGateway gateway = new GoogleDelegatedDriveGateway(builder.build());
        assertThatThrownBy(() -> gateway.revisions("sample-access-token", "file123", null, 50))
            .isInstanceOfSatisfying(DelegatedDriveException.class, error -> {
                assertThat(error.reason()).isEqualTo(DelegatedDriveException.Reason.PERMISSION_DENIED);
                assertThat(error.getMessage()).doesNotContain("sample-access-token", "private-provider-body");
            });
        assertThatThrownBy(() -> gateway.revisions("sample-access-token", "file123", null, 50))
            .isInstanceOfSatisfying(DelegatedDriveException.class, error ->
                assertThat(error.reason()).isEqualTo(DelegatedDriveException.Reason.AUTH_REVOKED));
        server.verify();
    }
}
