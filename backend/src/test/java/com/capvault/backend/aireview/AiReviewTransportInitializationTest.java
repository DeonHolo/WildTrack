package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.net.URI;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.ClientHttpRequestFactory;

class AiReviewTransportInitializationTest {
    @Test void transportIsUnusedUntilAnActualProviderRequestAndIsThenReused() throws Exception {
        var delegate = mock(ClientHttpRequestFactory.class);
        var builds = new AtomicInteger();
        var lazy = AiReviewConfiguration.lazyRequestFactory(() -> { builds.incrementAndGet(); return delegate; });
        assertThat(builds.get()).isZero();
        lazy.createRequest(URI.create("https://example.test/one"), HttpMethod.GET);
        lazy.createRequest(URI.create("https://example.test/two"), HttpMethod.POST);
        assertThat(builds.get()).isEqualTo(1);
        verify(delegate, times(2)).createRequest(any(), any());
    }

    @Test void simultaneousFirstRequestsInitializeTransportOnlyOnce() throws Exception {
        var delegate = mock(ClientHttpRequestFactory.class);
        var builds = new AtomicInteger();
        var lazy = AiReviewConfiguration.lazyRequestFactory(() -> { builds.incrementAndGet(); return delegate; });
        try (var executor = Executors.newFixedThreadPool(4)) {
            var tasks = new java.util.ArrayList<Callable<Void>>();
            for (int index=0; index<12; index++) tasks.add(() -> {
                lazy.createRequest(URI.create("https://example.test/unused"), HttpMethod.GET);
                return null;
            });
            for (var task : executor.invokeAll(tasks)) task.get();
        }
        assertThat(builds.get()).isEqualTo(1);
        verify(delegate, times(12)).createRequest(any(), any());
    }
}
