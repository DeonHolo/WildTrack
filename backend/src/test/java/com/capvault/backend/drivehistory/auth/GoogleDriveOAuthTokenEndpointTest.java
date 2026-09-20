package com.capvault.backend.drivehistory.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GoogleDriveOAuthTokenEndpointTest {
    private static final DriveOAuthProperties SETTINGS = new DriveOAuthProperties(
        true, "web-client", "client-secret",
        "http://localhost:8080/api/drive-history/auth/callback", "http://localhost:5173",
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", false);

    @Test
    void exchangesCallbackCodeWithPkceAndParsesOnlyNeededOAuthFields() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://oauth2.googleapis.com");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://oauth2.googleapis.com/token"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().string(allOf(
                containsString("grant_type=authorization_code"),
                containsString("code=callback-code"),
                containsString("code_verifier=pkce-verifier"),
                containsString("client_secret=client-secret"))))
            .andRespond(withSuccess("""
                {"access_token":"access-secret","refresh_token":"refresh-secret",
                 "id_token":"signed-id-token","scope":"openid https://www.googleapis.com/auth/drive.metadata.readonly",
                 "expires_in":3600,"token_type":"Bearer"}
                """, MediaType.APPLICATION_JSON));
        var endpoint = new GoogleDriveOAuthTokenEndpoint(builder.build(), SETTINGS, new ObjectMapper());
        var result = endpoint.exchange("callback-code", "pkce-verifier");
        assertThat(result.accessToken()).isEqualTo("access-secret");
        assertThat(result.refreshToken()).isEqualTo("refresh-secret");
        assertThat(result.idToken()).isEqualTo("signed-id-token");
        assertThat(result.expiresIn()).isEqualTo(3600);
        assertThat(result.toString()).doesNotContain("access-secret", "refresh-secret", "signed-id-token");
        server.verify();
    }

    @Test
    void invalidGrantFromRefreshIsTypedAndNeverReflectsProviderResponse() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://oauth2.googleapis.com");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://oauth2.googleapis.com/token"))
            .andExpect(content().string(containsString("grant_type=refresh_token")))
            .andRespond(withStatus(HttpStatus.BAD_REQUEST)
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"error\":\"invalid_grant\",\"error_description\":\"refresh-secret must remain private\"}"));
        var endpoint = new GoogleDriveOAuthTokenEndpoint(builder.build(), SETTINGS, new ObjectMapper());
        assertThatThrownBy(() -> endpoint.refresh("refresh-secret"))
            .isInstanceOfSatisfying(GoogleDriveOAuthTokenEndpoint.DriveOAuthTokenException.class, error -> {
                assertThat(error.revoked()).isTrue();
                assertThat(error.getMessage()).doesNotContain("refresh-secret");
            });
        server.verify();
    }
}
