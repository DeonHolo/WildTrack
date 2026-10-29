package com.capvault.backend.drive;

import static org.assertj.core.api.Assertions.*;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import java.util.ArrayList;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class DriveQuotaBackoffTest {
    final RestClient.Builder builder = RestClient.builder().baseUrl("https://www.googleapis.com");
    final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    final ArrayList<Long> waits = new ArrayList<>();
    final GoogleDriveApiGateway gateway = new GoogleDriveApiGateway(
        new GoogleDriveProperties(true, "private-key", 25_000_000), builder.build(), waits::add);
    final DriveFileReference file = new DriveFileReference("private-file", null);

    @Test void successfulRegularUsageAddsNoWaitsOrExtraRequests() {
        metadataSuccess();
        server.expect(requestTo(containsString("alt=media"))).andRespond(withSuccess(new byte[]{1, 2, 3}, MediaType.APPLICATION_PDF));
        assertThat(gateway.getMetadata(file).id()).isEqualTo("private-file");
        assertThat(gateway.download(file)).containsExactly(1, 2, 3);
        assertThat(waits).isEmpty();
        server.verify();
    }

    @Test void retriesMetadataWithIncreasingDelaysAndStopsAsSoonAsItSucceeds() {
        server.expect(requestTo(containsString("/drive/v3/files/private-file")))
            .andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON)
                .body("{\"error\":{\"errors\":[{\"reason\":\"userRateLimitExceeded\"}]}}"));
        server.expect(requestTo(containsString("/drive/v3/files/private-file")))
            .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        metadataSuccess();
        assertThat(gateway.getMetadata(file).id()).isEqualTo("private-file");
        assertThat(waits).hasSize(2);
        assertThat(waits.get(0)).isBetween(1000L, 2000L);
        assertThat(waits.get(1)).isBetween(2000L, 3000L);
        server.verify();
    }

    @Test void retriesReadOnlyDownloadAndReturnsTheSuccessfulBytes() {
        server.expect(requestTo(containsString("alt=media"))).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        server.expect(requestTo(containsString("alt=media"))).andRespond(withSuccess(new byte[]{1, 2, 3}, MediaType.APPLICATION_PDF));
        assertThat(gateway.download(file)).containsExactly(1, 2, 3);
        assertThat(waits).hasSize(1);
        server.verify();
    }

    @Test void stopsAfterThreeRetriesAndRetainsTheFinalQuotaStatus() {
        server.expect(org.springframework.test.web.client.ExpectedCount.times(4), requestTo(containsString("alt=media")))
            .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        assertThatThrownBy(() -> gateway.download(file)).isInstanceOfSatisfying(GoogleDriveUnavailableException.class, failure -> {
            assertThat(failure.kind()).isEqualTo(GoogleDriveUnavailableException.Kind.RATE_LIMIT);
            assertThat(failure.failureDetails().upstreamStatus()).isEqualTo(429);
        });
        assertThat(waits).hasSize(3);
        assertThat(waits.get(2)).isBetween(4000L, 5000L);
        assertThat(waits.stream().mapToLong(Long::longValue).sum()).isLessThanOrEqualTo(10000L);
        server.verify();
    }

    @ParameterizedTest @ValueSource(strings = {"forbidden", "insufficientFilePermissions", "API_KEY_INVALID",
        "dailyLimitExceeded", "downloadQuotaExceeded", "quotaExceeded"})
    void doesNotRetryUnexplainedSharingConfigurationOrLongerQuotaFailures(String reason) {
        server.expect(requestTo(containsString("alt=media")))
            .andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON)
                .body("{\"error\":{\"errors\":[{\"reason\":\"" + reason + "\"}]}}"));
        assertThatThrownBy(() -> gateway.download(file)).isInstanceOf(GoogleDriveUnavailableException.class);
        assertThat(waits).isEmpty();
        server.verify();
    }

    @Test void honorsShortRetryAfterAndLeavesLongProviderWaitsForALaterRetry() {
        server.expect(requestTo(containsString("/drive/v3/files/private-file")))
            .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "3"));
        metadataSuccess();
        gateway.getMetadata(file);
        assertThat(waits).containsExactly(3000L);
        server.verify();
        server.reset(); waits.clear();
        server.expect(requestTo(containsString("/drive/v3/files/private-file")))
            .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "120"));
        assertThatThrownBy(() -> gateway.getMetadata(file)).isInstanceOf(GoogleDriveUnavailableException.class);
        assertThat(waits).isEmpty();
        server.verify();
    }

    @Test void doesNotIgnoreAnOversizedNumericRetryAfter() {
        server.expect(requestTo(containsString("alt=media")))
            .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "99999999999999999999"));
        assertThatThrownBy(() -> gateway.download(file)).isInstanceOf(GoogleDriveUnavailableException.class);
        assertThat(waits).isEmpty();
        server.verify();
    }

    private void metadataSuccess() {
        server.expect(requestTo(containsString("/drive/v3/files/private-file")))
            .andRespond(withSuccess("{\"id\":\"private-file\",\"name\":\"test.pdf\",\"mimeType\":\"application/pdf\",\"capabilities\":{\"canDownload\":true}}", MediaType.APPLICATION_JSON));
    }
}
