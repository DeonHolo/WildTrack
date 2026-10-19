package com.capvault.backend.aireview;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.TreeMap;

/** Content fingerprints for comparing requests without recording their private contents or API key. */
final class GeminiRequestFingerprint {
    private GeminiRequestFingerprint() { }

    static String describe(ObjectMapper json, byte[] document, String systemInstruction,
            Object requirements, Object generationConfig) throws JsonProcessingException {
        return "pdfBytes=" + document.length + " pdfSha256=" + hash(document)
            + " systemSha256=" + hash(systemInstruction.getBytes(StandardCharsets.UTF_8))
            + " requirementsSha256=" + hash(json.writeValueAsBytes(canonical(json, json.valueToTree(requirements))))
            + " generationConfigSha256=" + hash(json.writeValueAsBytes(canonical(json, json.valueToTree(generationConfig))));
    }

    private static JsonNode canonical(ObjectMapper json, JsonNode node) {
        if (node.isObject()) {
            var result = json.createObjectNode();
            var sorted = new TreeMap<String, JsonNode>();
            node.fields().forEachRemaining(entry -> sorted.put(entry.getKey(), entry.getValue()));
            sorted.forEach((key, value) -> result.set(key, canonical(json, value)));
            return result;
        }
        if (node.isArray()) {
            var result = json.createArrayNode();
            node.forEach(value -> result.add(canonical(json, value)));
            return result;
        }
        return node;
    }

    private static String hash(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
