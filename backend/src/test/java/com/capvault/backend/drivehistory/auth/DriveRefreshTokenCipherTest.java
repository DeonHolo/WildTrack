package com.capvault.backend.drivehistory.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class DriveRefreshTokenCipherTest {
    @Test
    void encryptsWithIndependentNonceAndBindsCiphertextToGoogleSubject() {
        var properties = new DriveOAuthProperties(true, "mock-id", "mock-secret",
            "http://localhost:8080/api/drive-history/auth/callback", "http://localhost:5173",
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", false);
        var cipher = new DriveRefreshTokenCipher(properties);
        String first = cipher.encrypt("subject-one", "refresh-secret");
        String second = cipher.encrypt("subject-one", "refresh-secret");
        assertThat(first).startsWith("v1.").doesNotContain("refresh-secret").isNotEqualTo(second);
        assertThat(cipher.decrypt("subject-one", first)).isEqualTo("refresh-secret");
        assertThatThrownBy(() -> cipher.decrypt("subject-two", first))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Drive authorization storage unavailable.");
    }
}
