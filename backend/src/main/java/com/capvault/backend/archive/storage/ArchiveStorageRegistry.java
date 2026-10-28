package com.capvault.backend.archive.storage;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@EnableConfigurationProperties(ArchiveStorageProperties.class)
public class ArchiveStorageRegistry {
    private final Map<String, ArchiveStorageProvider> byId = new HashMap<>();
    private final Map<String, ArchiveStorageProvider> byName = new HashMap<>();
    private final String defaultName;
    public ArchiveStorageRegistry(ArchiveStorageProperties properties) {
        defaultName = properties.getDefaultDestination();
        properties.getDestinations().forEach((name, destination) -> {
            ArchiveStorageProvider provider;
            if ("drive".equalsIgnoreCase(destination.getType())) {
                provider = new DriveArchiveStorageProvider(destination.getFolderId(), destination.getClientId(),
                    destination.getClientSecret(), destination.getRefreshToken(), destination.getConnectTimeout(), destination.getRequestTimeout());
            } else if ("local".equalsIgnoreCase(destination.getType())) {
                if (destination.getDirectory() == null || destination.getDirectory().isBlank()) return;
                provider = new LocalArchiveStorageProvider(Path.of(destination.getDirectory()));
            } else return;
            if (byId.putIfAbsent(provider.id(), provider) != null) throw new IllegalArgumentException("Duplicate archive storage destination.");
            byName.put(name, provider);
        });
    }
    public ArchiveStorageProvider defaultProvider() {
        ArchiveStorageProvider provider = byName.get(defaultName);
        if (provider == null) throw new ArchiveStorageException("Archive storage is not configured.");
        return provider;
    }
    public ArchiveStorageProvider provider(String providerId) {
        ArchiveStorageProvider provider = byId.get(providerId);
        if (provider == null) throw new ArchiveStorageException("The recorded archive storage destination is not configured.");
        return provider;
    }
}
