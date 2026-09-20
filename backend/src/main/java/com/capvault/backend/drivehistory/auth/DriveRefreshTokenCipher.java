package com.capvault.backend.drivehistory.auth;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

/** AES-256-GCM with an independent nonce and subject-bound authenticated data per stored grant. */
@Component
public class DriveRefreshTokenCipher {
    private final DriveOAuthProperties properties;
    private final SecureRandom random = new SecureRandom();

    public DriveRefreshTokenCipher(DriveOAuthProperties properties) { this.properties = properties; }

    public String encrypt(String googleSubject, String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) throw new IllegalArgumentException("Missing refresh token.");
        byte[] nonce = new byte[12];
        random.nextBytes(nonce);
        try {
            Cipher cipher = initialized(Cipher.ENCRYPT_MODE, googleSubject, nonce);
            byte[] encrypted = cipher.doFinal(refreshToken.getBytes(StandardCharsets.UTF_8));
            byte[] envelope = Arrays.copyOf(nonce, nonce.length + encrypted.length);
            System.arraycopy(encrypted, 0, envelope, nonce.length, encrypted.length);
            return "v1." + Base64.getEncoder().encodeToString(envelope);
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("Drive authorization storage unavailable.");
        }
    }

    public String decrypt(String googleSubject, String encoded) {
        if (encoded == null || !encoded.startsWith("v1.")) {
            throw new IllegalStateException("Drive authorization storage unavailable.");
        }
        try {
            byte[] envelope = Base64.getDecoder().decode(encoded.substring(3));
            if (envelope.length < 29) throw new IllegalArgumentException("Invalid envelope");
            byte[] nonce = Arrays.copyOfRange(envelope, 0, 12);
            Cipher cipher = initialized(Cipher.DECRYPT_MODE, googleSubject, nonce);
            return new String(cipher.doFinal(envelope, 12, envelope.length - 12), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException error) {
            throw new IllegalStateException("Drive authorization storage unavailable.");
        }
    }

    private Cipher initialized(int mode, String subject, byte[] nonce) throws GeneralSecurityException {
        if (!properties.configured()) throw new IllegalStateException("Drive history consent is not configured.");
        byte[] key = Base64.getDecoder().decode(properties.encryptionKeyBase64());
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
        cipher.updateAAD(subject.getBytes(StandardCharsets.UTF_8));
        return cipher;
    }
}
