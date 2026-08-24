package com.capvault.backend.health;

import java.sql.SQLException;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class HealthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void livenessReturnsOnlySafeStableFields() throws Exception {
        mockMvc.perform(get("/api/health/live"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UP"))
            .andExpect(jsonPath("$.service").value("wildtrack-backend"))
            .andExpect(jsonPath("$.checkedAt", containsString("T")))
            .andExpect(jsonPath("$.profiles").doesNotExist())
            .andExpect(jsonPath("$.database").doesNotExist());

        mockMvc.perform(get("/api/health"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UP"))
            .andExpect(jsonPath("$.service").value("wildtrack-backend"))
            .andExpect(jsonPath("$.profiles").doesNotExist());
    }

    @Test
    void readinessConfirmsTheDatabaseIsReachableWithoutDisclosingDetails() throws Exception {
        mockMvc.perform(get("/api/health/ready"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UP"))
            .andExpect(jsonPath("$.service").value("wildtrack-backend"))
            .andExpect(jsonPath("$.database").value("UP"))
            .andExpect(jsonPath("$.checkedAt", containsString("T")))
            .andExpect(jsonPath("$.profiles").doesNotExist())
            .andExpect(jsonPath("$.url").doesNotExist())
            .andExpect(jsonPath("$.error").doesNotExist());
    }

    @Test
    void readinessReturnsUnavailableWithoutLeakingDatabaseErrors() throws Exception {
        DataSource unavailable = mock(DataSource.class);
        when(unavailable.getConnection()).thenThrow(new SQLException("jdbc:postgresql://secret-host/private"));

        var response = new HealthController(unavailable).ready();

        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().status()).isEqualTo("DOWN");
        assertThat(response.getBody().service()).isEqualTo("wildtrack-backend");
        assertThat(response.getBody().database()).isEqualTo("DOWN");
        assertThat(response.getBody().toString()).doesNotContain("secret-host", "private");
    }

}
