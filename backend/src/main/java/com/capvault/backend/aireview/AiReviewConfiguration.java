package com.capvault.backend.aireview;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.client.RestClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpClient;
import java.time.Duration;

@Configuration
public class AiReviewConfiguration {
    @Bean
    @ConditionalOnMissingBean(AiReviewProvider.class)
    AiReviewProvider geminiAiReviewProvider(ObjectMapper json,
            @Value("${wildtrack.gemini.api-key:}") String key,
            @Value("${wildtrack.gemini.minimum-interval-seconds:15}") int interval) {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(60));
        return new GeminiAiReviewProvider(key, RestClient.builder()
            .baseUrl("https://generativelanguage.googleapis.com").requestFactory(factory).build(), json, interval);
    }

    @Bean("aiReviewExecutor")
    ThreadPoolTaskExecutor aiReviewExecutor() {
        var executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setQueueCapacity(0);
        executor.setThreadNamePrefix("ai-review-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(20);
        return executor;
    }
}
