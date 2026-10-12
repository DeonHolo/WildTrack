package com.capvault.backend.drivehistory.auth;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = {
    "wildtrack.drive-history.required-for-login=true",
    "wildtrack.drive-history.oauth.enabled=false"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(DriveHistoryRequiredLoginIntegrationTest.ProbeConfiguration.class)
@Transactional
class DriveHistoryUnconfiguredLoginIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired WildTrackSessionService sessions;
    @MockBean GoogleDriveOAuthTokenEndpoint tokens;

    @Test
    void missingSetupFailsClosedWhileSessionSetupStatusAndLogoutRemainRecoverable() throws Exception {
        var created = sessions.create(new GoogleIdentity("unconfigured-" + UUID.randomUUID(),
            "student@example.invalid", "Student", ""));
        Cookie session = new Cookie("WILDTRACK_SESSION", created.rawToken());
        mvc.perform(get("/api/auth/session").cookie(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(true))
            .andExpect(jsonPath("$.driveHistoryRequired").value(true))
            .andExpect(jsonPath("$.driveHistoryConnected").value(false))
            .andExpect(jsonPath("$.driveHistoryConfigured").value(false));
        mvc.perform(get("/api/drive-history/auth/status").cookie(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.required").value(true))
            .andExpect(jsonPath("$.configured").value(false))
            .andExpect(jsonPath("$.message", containsString("setup is unavailable")));
        mvc.perform(get("/api/drive-history/auth/start").cookie(session))
            .andExpect(status().isServiceUnavailable());
        mvc.perform(get("/api/auth/google/start").param("returnTo", "/student"))
            .andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"))
            .andExpect(header().string("Location", "http://localhost:5173/login?driveHistory=unavailable&returnTo=%2Fstudent"));
        mvc.perform(get("/api/login-gate-test/read").cookie(session))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DRIVE_HISTORY_REQUIRED"));
        mvc.perform(get("/api/public/forms/login-gate-test").cookie(session)).andExpect(status().isOk());
        mvc.perform(post("/api/auth/logout").cookie(session).with(csrf()))
            .andExpect(status().isOk()).andExpect(cookie().maxAge("WILDTRACK_SESSION", 0));
        verifyNoInteractions(tokens);
    }

    @Test
    void anonymousSessionExposesRequiredSetupStateWithoutIdentity() throws Exception {
        mvc.perform(get("/api/auth/session"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(false))
            .andExpect(jsonPath("$.driveHistoryRequired").value(true))
            .andExpect(jsonPath("$.driveHistoryConfigured").value(false))
            .andExpect(jsonPath("$.driveHistoryConnected").value(false));
    }
}
