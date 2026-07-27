package com.capvault.backend.drive;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class DriveLinkParser {

    private static final Pattern PATH_FILE_ID = Pattern.compile("/file/d/([a-zA-Z0-9_-]+)");

    private DriveLinkParser() {
    }

    public static DriveFileReference parse(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("A Google Drive PDF link is required.");
        }

        URI uri;
        try {
            uri = URI.create(value.trim());
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Use a complete Google Drive file link.");
        }

        String host = uri.getHost();
        if (host == null || !host.equalsIgnoreCase("drive.google.com")) {
            throw new IllegalArgumentException("Use a Google Drive file link.");
        }

        Matcher matcher = PATH_FILE_ID.matcher(uri.getPath() == null ? "" : uri.getPath());
        String fileId = matcher.find() ? matcher.group(1) : queryParameter(uri, "id");
        if (fileId == null || fileId.isBlank()) {
            throw new IllegalArgumentException("The Google Drive file ID could not be read from this link.");
        }
        return new DriveFileReference(fileId, queryParameter(uri, "resourcekey"));
    }

    private static String queryParameter(URI uri, String name) {
        String query = uri.getRawQuery();
        if (query == null || query.isBlank()) {
            return null;
        }
        for (String pair : query.split("&")) {
            String[] parts = pair.split("=", 2);
            String key = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
            if (name.equalsIgnoreCase(key)) {
                return parts.length > 1
                    ? URLDecoder.decode(parts[1], StandardCharsets.UTF_8)
                    : "";
            }
        }
        return null;
    }
}
