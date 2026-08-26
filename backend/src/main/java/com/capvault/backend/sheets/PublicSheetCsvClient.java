package com.capvault.backend.sheets;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;

import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class PublicSheetCsvClient implements SheetCsvClient {

    private static final String DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WildTrack/1.0";
    private static final Pattern GID_PATTERN = Pattern.compile("[?&#]gid=([0-9]+)");

    private final RestClient restClient;

    public PublicSheetCsvClient(RestClient.Builder restClientBuilder) {
        this.restClient = restClientBuilder
            .defaultHeader("User-Agent", DEFAULT_USER_AGENT)
            .requestFactory(ClientHttpRequestFactories.get(ClientHttpRequestFactorySettings.DEFAULTS
                .withConnectTimeout(Duration.ofSeconds(5))
                .withReadTimeout(Duration.ofSeconds(20))))
            .build();
    }

    @Override
    public String fetchCsv(String sheetUrl) {
        List<String> candidateUrls = buildCandidateUrls(sheetUrl);
        if (candidateUrls.isEmpty()) {
            throw new IllegalArgumentException("Use a valid Google Sheet link or published Sheet URL.");
        }

        RestClientException lastException = null;
        for (String url : candidateUrls) {
            try {
                String body = restClient.get()
                    .uri(URI.create(url))
                    .retrieve()
                    .body(String.class);
                if (body != null && !body.isBlank() && !body.trim().startsWith("<!DOCTYPE html") && !body.trim().startsWith("<html")) {
                    return body;
                }
            } catch (RestClientException ex) {
                lastException = ex;
            }
        }

        if (lastException instanceof HttpClientErrorException.Unauthorized) {
            throw new IllegalArgumentException("Google Sheet returned 401 Unauthorized. Ensure the sheet is published to the web (File > Share > Publish to web) or shared with 'Anyone with the link'.", lastException);
        } else if (lastException instanceof HttpClientErrorException.Forbidden) {
            throw new IllegalArgumentException("Google Sheet returned 403 Forbidden. Ensure the sheet is published to the web (File > Share > Publish to web) or shared with 'Anyone with the link'.", lastException);
        } else if (lastException instanceof HttpClientErrorException.NotFound) {
            throw new IllegalArgumentException("Google Sheet was not found (404). Check the sheet URL.", lastException);
        } else if (lastException != null) {
            throw new IllegalArgumentException("Failed to fetch Google Sheet: " + lastException.getMessage(), lastException);
        }
        throw new IllegalArgumentException("Google Sheet did not return valid CSV data. Check that the link is accessible.");
    }

    public static List<String> buildCandidateUrls(String sheetUrl) {
        String text = sheetUrl == null ? "" : sheetUrl.trim();
        if (text.isBlank()) {
            return List.of();
        }

        List<String> urls = new ArrayList<>();
        try {
            URI uri = URI.create(text);
            String path = uri.getPath() == null ? "" : uri.getPath();
            String gid = extractGid(text);

            if (path.contains("/pubhtml")) {
                urls.add(UriComponentsBuilder.fromUri(uri)
                    .replacePath(path.replace("/pubhtml", "/pub"))
                    .replaceQueryParam("gid", gid)
                    .replaceQueryParam("single", "true")
                    .replaceQueryParam("output", "csv")
                    .build(true)
                    .toUriString());
            }
            if (path.contains("/pub")) {
                urls.add(UriComponentsBuilder.fromUri(uri)
                    .replaceQueryParam("output", "csv")
                    .build(true)
                    .toUriString());
            }

            String normalId = extractNormalSheetId(path);
            if (!normalId.isBlank()) {
                // 1. Google Visualization CSV export endpoint (works for "Anyone with the link")
                urls.add("https://docs.google.com/spreadsheets/d/"
                    + URLEncoder.encode(normalId, StandardCharsets.UTF_8)
                    + "/gviz/tq?tqx=out:csv&gid="
                    + URLEncoder.encode(gid, StandardCharsets.UTF_8));

                // 2. Direct export endpoint
                urls.add("https://docs.google.com/spreadsheets/d/"
                    + URLEncoder.encode(normalId, StandardCharsets.UTF_8)
                    + "/export?format=csv&gid="
                    + URLEncoder.encode(gid, StandardCharsets.UTF_8));

                // 3. Published endpoint
                urls.add("https://docs.google.com/spreadsheets/d/"
                    + URLEncoder.encode(normalId, StandardCharsets.UTF_8)
                    + "/pub?output=csv&gid="
                    + URLEncoder.encode(gid, StandardCharsets.UTF_8));
            }
        } catch (IllegalArgumentException ignored) {
            return List.of();
        }

        return urls;
    }

    public static String buildPublishedSheetCsvUrl(String sheetUrl) {
        List<String> urls = buildCandidateUrls(sheetUrl);
        return urls.isEmpty() ? "" : urls.get(0);
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

    private static String extractGid(String url) {
        Matcher matcher = GID_PATTERN.matcher(url);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return "0";
    }
}
