package com.capvault.backend.auth;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.capvault.backend.config.ApiExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(GoogleAuthController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(ApiExceptionHandler.class)
class GoogleAuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private GoogleIdentityService service;

    @Test
    void authenticatesGoogleCredential() throws Exception {
        when(service.authenticate("signed-google-credential")).thenReturn(new GoogleIdentity(
            "google-subject-123",
            "student@gmail.com",
            "Student Name",
            "https://example.com/photo.png"
        ));

        mockMvc.perform(post("/api/auth/google")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"credential":"signed-google-credential"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.subject").value("google-subject-123"))
            .andExpect(jsonPath("$.email").value("student@gmail.com"))
            .andExpect(jsonPath("$.name").value("Student Name"));
    }

    @Test
    void rejectsMissingCredential() throws Exception {
        mockMvc.perform(post("/api/auth/google")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fieldErrors.credential").exists());
    }
}
