package com.capvault.backend.aireview;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class GeminiRequestFingerprintTest {
    private final ObjectMapper json = new ObjectMapper();
    private final byte[] pdf = "private PDF text".getBytes(StandardCharsets.UTF_8);

    @Test
    void ignoresObjectOrderIncludingNestedSchemaAndRequirements() throws Exception {
        var left = json.readTree("{\"schema\":{\"b\":2,\"a\":1},\"level\":\"MINIMAL\"}");
        var right = json.readTree("{\"level\":\"MINIMAL\",\"schema\":{\"a\":1,\"b\":2}}");
        assertEquals(describe(Map.of("b", 2, "a", 1), left), describe(Map.of("a", 1, "b", 2), right));
    }

    @Test
    void detectsChangedPdfSystemRequirementsAndSettings() throws Exception {
        String before = describe("requirements", "MINIMAL");
        assertNotEquals(before, GeminiRequestFingerprint.describe(json, new byte[]{1}, "system", "requirements", "MINIMAL"));
        assertNotEquals(before, GeminiRequestFingerprint.describe(json, pdf, "changed", "requirements", "MINIMAL"));
        assertNotEquals(before, describe("changed", "MINIMAL"));
        assertNotEquals(before, describe("requirements", "MEDIUM"));
    }

    @Test
    void retainsArrayOrderAndLiteralInstructionText() throws Exception {
        assertNotEquals(describe(List.of(1, 2), "settings"), describe(List.of(2, 1), "settings"));
        assertNotEquals(describe("{\"a\":1,\"b\":2}", "settings"), describe("{\"b\":2,\"a\":1}", "settings"));
    }

    @Test
    void emitsOnlyFixedLabelsSizesAndHashes() throws Exception {
        String result = describe("private requirements café", Map.of("secret-like", "private settings"));
        assertTrue(result.matches("pdfBytes=16 pdfSha256=[0-9a-f]{64} systemSha256=[0-9a-f]{64} requirementsSha256=[0-9a-f]{64} generationConfigSha256=[0-9a-f]{64}"));
        assertFalse(result.contains("private"));
        assertFalse(result.contains("café"));
    }

    private String describe(Object requirements, Object settings) throws Exception {
        return GeminiRequestFingerprint.describe(json, pdf, "system", requirements, settings);
    }
}
