package com.capvault.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class GoogleIdentityServiceTest {

    @Test
    void returnsVerifiedGoogleIdentity() {
        GoogleIdentityService service = new GoogleIdentityService(credential -> new GoogleIdentity(
            "google-subject-123",
            "Student@Gmail.com",
            "Student Name",
            "https://example.com/photo.png"
        ));

        GoogleIdentity identity = service.authenticate("signed-google-credential");

        assertThat(identity.subject()).isEqualTo("google-subject-123");
        assertThat(identity.email()).isEqualTo("student@gmail.com");
        assertThat(identity.name()).isEqualTo("Student Name");
    }

    @Test
    void rejectsBlankCredentialsBeforeCallingGoogle() {
        GoogleIdentityService service = new GoogleIdentityService(credential -> {
            throw new AssertionError("Verifier should not be called");
        });

        assertThatThrownBy(() -> service.authenticate(" "))
            .isInstanceOf(InvalidGoogleCredentialException.class)
            .hasMessage("Google did not return a sign-in credential.");
    }
}
