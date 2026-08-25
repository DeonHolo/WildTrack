package com.capvault.backend.sheets;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class PublicSheetCsvClient implements SheetCsvClient {

    private final RestClient restClient;

    public PublicSheetCsvClient(RestClient.Builder restClientBuilder) {
        this.restClient = restClientBuilder
            .requestFactory(ClientHttpRequestFactories.get(ClientHttpRequestFactorySettings.DEFAULTS
                .withConnectTimeout(Duration.ofSeconds(5))
                .withReadTimeout(Duration.ofSeconds(20))))
            .build();
    }

    @Override
    public String fetchCsv(String sheetUrl) {
        String csvUrl = buildPublishedSheetCsvUrl(sheetUrl);
        if (csvUrl.isBlank()) {
            throw new IllegalArgumentException("Use a valid Google Sheet link or published Sheet URL.");
        }
        return restClient.get()
            .uri(URI.create(csvUrl))
            .retrieve()
            .body(String.class);
    }

    public static String buildPublishedSheetCsvUrl(String sheetUrl) {
        String text = sheetUrl == null ? "" : sheetUrl.trim();
        if (text.isBlank()) {
            return "";
        }

        try {
            URI uri = URI.create(text);
            String path = uri.getPath();
            String gid = queryParam(text, "gid", "0");
            if (path.contains("/pubhtml")) {
                return UriComponentsBuilder.fromUri(uri)
                    .replacePath(path.replace("/pubhtml", "/pub"))
                    .replaceQueryParam("gid", gid)
                    .replaceQueryParam("single", "true")
                    .replaceQueryParam("output", "csv")
                    .build(true)
                    .toUriString();
            }
            if (path.contains("/pub")) {
                return UriComponentsBuilder.fromUri(uri)
                    .replaceQueryParam("output", "csv")
                    .build(true)
                    .toUriString();
            }

            String normalId = extractNormalSheetId(path);
            if (!normalId.isBlank()) {
                return "https://docs.google.com/spreadsheets/d/"
                    + URLEncoder.encode(normalId, StandardCharsets.UTF_8)
                    + "/export?format=csv&gid="
                    + URLEncoder.encode(gid, StandardCharsets.UTF_8);
            }
        } catch (IllegalArgumentException ignored) {
            return "";
        }

        return "";
    }

    private static String extractNormalSheetId(String path) {
        String marker = "/spreadsheets/d/";
        int start = path.indexOf(marker);
        if (start < 0) {
            return "";
        }
        String after = path.substring(start + marker.length());
        int slash = after.indexOf('/');
        return slash >= 0 ? after.substring(0, slash) : after;
    }

    private static String queryParam(String url, String key, String fallback) {
        String marker = key + "=";
        int start = url.indexOf(marker);
        if (start < 0) {
            return fallback;
        }
        int valueStart = start + marker.length();
        int end = url.indexOf('&', valueStart);
        return end >= 0 ? url.substring(valueStart, end) : url.substring(valueStart);
    }
}
