package com.capvault.backend.auth;

@FunctionalInterface
interface GoogleCredentialVerifier {
    GoogleIdentity verify(String credential);
}
