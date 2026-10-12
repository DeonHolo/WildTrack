package com.capvault.backend.drivehistory.auth;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = {
    "wildtrack.drive-history.required-for-login=false",
    "wildtrack.drive-history.oauth.enabled=false"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(DriveHistoryRequiredLoginIntegrationTest.ProbeConfiguration.class)
@Transactional
class DriveHistoryOptionalLoginIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired WildTrackSessionService sessions;

    @Test
    void disabledRequirementPreservesApplicationAccessWithoutDriveGrant() throws Exception {
        var created = sessions.create(new GoogleIdentity("optional-" + UUID.randomUUID(),
            "student@example.invalid", "Student", ""));
        Cookie session = new Cookie("WILDTRACK_SESSION", created.rawToken());
        mvc.perform(get("/api/auth/session").cookie(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(true))
            .andExpect(jsonPath("$.driveHistoryRequired").value(false))
            .andExpect(jsonPath("$.driveHistoryConnected").value(false))
            .andExpect(jsonPath("$.driveHistoryConfigured").value(false));
        mvc.perform(get("/api/workspaces").cookie(session)).andExpect(status().isOk());
        mvc.perform(post("/api/login-gate-test/write").cookie(session).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/drive-history/auth/status").cookie(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.required").value(false));
        mvc.perform(post("/api/public/forms/login-gate-test").with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/auth/google/start")).andExpect(status().isNotFound());
    }
}
