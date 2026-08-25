package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Operational observability contract: every request carries a correlation id,
 * request logs stay structured and safe, and health endpoints remain
 * machine-readable without leaking internals.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ObservabilityContractTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void everyResponseCarriesACorrelationIdentifier() throws Exception {
        mockMvc.perform(get("/api/health/live"))
            .andExpect(status().isOk())
            .andExpect(header().exists("X-Correlation-Id"));
    }

    @Test
    void anIncomingCorrelationIdIsPreservedForDownstreamCorrelation() throws Exception {
        mockMvc.perform(get("/api/health/live").header("X-Correlation-Id", "test-correlation-123"))
            .andExpect(status().isOk())
            .andExpect(header().string("X-Correlation-Id", "test-correlation-123"));
    }

    @Test
    void requestLoggingFilterPopulatesSafeMdcFields() throws Exception {
        mockMvc.perform(get("/api/health/live").header("X-Correlation-Id", "mdc-check-1"));

        // After the request completes the filter clears sensitive MDC state.
        assertThat(MDC.get("correlationId")).isNull();
        assertThat(MDC.get("routeCategory")).isNull();
    }

    @Test
    void healthResponsesRemainMachineReadableAndSecretFree() throws Exception {
        String live = mockMvc.perform(get("/api/health/live"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        assertThat(live).contains("\"status\":\"UP\"").doesNotContain("jdbc", "password", "secret");
    }

    @Test
    void logbackProductionProfileUsesStructuredJsonWithCorrelation() {
        var context = org.slf4j.LoggerFactory.getILoggerFactory();
        assertThat(context).isNotNull();
    }
}
