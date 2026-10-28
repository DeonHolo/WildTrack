package com.capvault.backend.archive.storage;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wildtrack.archive.storage")
public class ArchiveStorageProperties {
    private String defaultDestination;
    private Map<String, Destination> destinations = new LinkedHashMap<>();
    public String getDefaultDestination() { return defaultDestination; }
    public void setDefaultDestination(String value) { defaultDestination = value; }
    public Map<String, Destination> getDestinations() { return destinations; }
    public void setDestinations(Map<String, Destination> value) { destinations = value; }
    public static class Destination {
        private String type, directory, folderId, clientId, clientSecret, refreshToken;
        private Duration connectTimeout = Duration.ofSeconds(5), requestTimeout = Duration.ofSeconds(30);
        public String getType() { return type; } public void setType(String v) { type = v; }
        public String getDirectory() { return directory; } public void setDirectory(String v) { directory = v; }
        public String getFolderId() { return folderId; } public void setFolderId(String v) { folderId = v; }
        public String getClientId() { return clientId; } public void setClientId(String v) { clientId = v; }
        public String getClientSecret() { return clientSecret; } public void setClientSecret(String v) { clientSecret = v; }
        public String getRefreshToken() { return refreshToken; } public void setRefreshToken(String v) { refreshToken = v; }
        public Duration getConnectTimeout() { return connectTimeout; } public void setConnectTimeout(Duration v) { connectTimeout = v; }
        public Duration getRequestTimeout() { return requestTimeout; } public void setRequestTimeout(Duration v) { requestTimeout = v; }
    }
}
