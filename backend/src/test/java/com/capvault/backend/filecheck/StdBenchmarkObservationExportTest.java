package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.drive.GoogleDriveProperties;
import com.capvault.backend.drive.GoogleDriveUnavailableException;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.template.DocumentTemplateService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

/**
 * Opt-in, OFFLINE Goal 1 export. Reads every registered manifest fixture, checks the exact
 * fixture/template hashes and uses the real production PdfInspector and TemplateComparator.
 *
 * STD-16, STD-17-oversized and STD-15-non-pdf have explicitly identified simulated
 * GoogleDriveGateway inputs through the real FileCheckService; these observations establish
 * ONLY deterministic mock-path behavior, not permission/size/MIME of any actual Drive file.
 * No live Google Drive request is ever issued by this exporter.
 */
class StdBenchmarkObservationExportTest {
    static final String HEADER = String.join(",",
        "fixture_id", "readable", "pages", "extracted_characters", "template_coverage",
        "added_content_ratio", "template_only", "missing_template_headings",
        "observation_status", "fixture_sha256", "template_sha256", "app_commit", "measured_at",
        "template_available", "check_error", "code_state",
        "measurement_scope", "filecheck_status", "technical_flag", "inspection_message",
        "valid_pdf", "invalid_pdf_data", "corrupt_pdf", "password_protected", "too_short",
        "file_too_large", "gateway_inaccessible", "access_denied", "not_pdf",
        "download_disabled", "template_mapped", "file_size_bytes", "file_limit_bytes",
        "source_mime_type", "gateway_mock_evidence", "error_category", "mock_metadata_size_bytes",
        "filename_ignored", "benchmark_run_mode", "reference_freeze_sha256");

    private static final Path BENCHMARK = Path.of("docs/capstone-2-build/benchmarks/std");
    static final long FILE_LIMIT = 26_214_400L; // application.yml Drive gateway default: 25 MiB
    static final int MIN_READABLE_CHARACTERS = 300; // benchmark config; record it in the exported scope
    private static final Set<String> REQUIRED_VARIANTS = Set.of(
        "STD-15-corrupt", "STD-15-non-pdf", "STD-17-password", "STD-17-oversized",
        "STD-19-with-requirement", "STD-19-without-requirement",
        "STD-25-unexplained", "STD-25-resolved");
    private static final Set<String> MOCK_CASES =
        Set.of("STD-11", "STD-16", "STD-17-oversized", "STD-15-non-pdf");
    private static final String COMMIT_STATE = "TRACKED_FILECHECK_CLEAN";

    private final PdfInspector inspector = new PdfInspector();
    private final TemplateComparator comparator =
        new TemplateComparator(new FileCheckProperties(MIN_READABLE_CHARACTERS, 0.75, 0.25));

    @Test
    void exportFrozenFixtureObservationsWhenExplicitlyRequested() throws Exception {
        String requested = System.getProperty("benchmark.observations.output", "");
        Assumptions.assumeTrue(!requested.isBlank(), "No benchmark output path: skip all official fixture observations");
        String commit = System.getProperty("benchmark.app.commit", "");
        assertThat(commit).matches("[0-9a-fA-F]{40}");
        Path root = repositoryRoot();
        assertThat(git(root, "rev-parse", "HEAD")).isEqualToIgnoringCase(commit);
        assertThat(git(root, "status", "--porcelain", "--untracked-files=no", "--",
            "backend/src/main/java/com/capvault/backend/filecheck", "backend/pom.xml"))
            .as("Production Document Check files must be committed before provenance-bound export").isBlank();
        Path output = Path.of(requested).toAbsolutePath().normalize();
        assertThat(Files.exists(output)).as("Never overwrite previous observations").isFalse();

        List<Fixture> fixtures = frozenFixtures(root);
        var ids = fixtures.stream().map(Fixture::id).collect(java.util.stream.Collectors.toSet());
        // A prepared *partial* catalog can be inspected, but it must never masquerade as
        // a completed 25-family research benchmark.
        String expected = System.getProperty("benchmark.require.full.catalog", "true");
        if (Boolean.parseBoolean(expected)) {
            Set<String> missing = new HashSet<>(REQUIRED_VARIANTS);
            missing.removeAll(ids);
            assertThat(missing).as("Incomplete split/paired variant fixture catalog").isEmpty();
            for (int family = 1; family <= 25; family++) {
                String prefix = String.format("STD-%02d", family);
                assertThat(ids.stream().anyMatch(id -> id.equals(prefix) || id.startsWith(prefix + "-")))
                    .as("Missing planned fixture family " + prefix).isTrue();
            }
        }
        byte[] templateBytes = Files.readAllBytes(root.resolve("docs/STD TEMPLATE.pdf"));
        PdfInspection template = inspector.inspect(templateBytes);
        assertThat(template.readable()).as("Actual official template must be a readable PDF").isTrue();
        String templateHash = sha256(templateBytes);
        String runMode = System.getProperty("benchmark.run.mode", "DEVELOPMENT");
        assertThat(runMode).as("Run mode must be DEVELOPMENT or explicitly OFFICIAL")
            .isIn("DEVELOPMENT", "OFFICIAL");
        String referenceFreezeSha = "OFFICIAL".equals(runMode)
            ? validateOfficialPreRunFreeze(root, fixtures, templateHash, commit) : "";
        List<String> lines = new ArrayList<>();
        lines.add(HEADER);
        for (Fixture fixture : fixtures) {
            Map<String, String> observed = observe(fixture, template, templateHash, commit);
            observed.put("benchmark_run_mode", runMode);
            observed.put("reference_freeze_sha256", referenceFreezeSha);
            lines.add(encodeCsv(observed));
        }
        assertThat(lines).hasSize(fixtures.size() + 1);
        if (output.getParent() != null) Files.createDirectories(output.getParent());
        Files.writeString(output, String.join("\n", lines) + "\n", StandardCharsets.UTF_8,
            StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
    }

    record Fixture(String id, Path file, String sha256, boolean withTemplate, String declaredFile) { }

    /** Read and validate manifest -> hash-list -> actual bytes BEFORE a benchmark run. */
    static List<Fixture> frozenFixtures(Path root) throws Exception {
        Path base = root.resolve(BENCHMARK);
        Path hashList = base.resolve("fixture-hashes.sha256");
        Map<String, String> frozen = new LinkedHashMap<>();
        for (String line : Files.readAllLines(hashList, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            var match = java.util.regex.Pattern.compile("^([0-9a-fA-F]{64})\\s{2}(.+)$").matcher(line);
            assertThat(match.matches()).as("Malformed hash-list line").isTrue();
            assertThat(frozen.putIfAbsent(match.group(2).replace('\\', '/'),
                match.group(1).toLowerCase(java.util.Locale.ROOT)))
                .as("Duplicate hash-list path " + match.group(2)).isNull();
        }
        String rootCanonical = root.toRealPath().toString();
        var fixtures = new ArrayList<Fixture>();
        var seen = new HashSet<String>();
        for (Map<String, String> entry : parseCsv(Files.readString(base.resolve("manifest.csv")))) {
            String id = entry.get("fixture_id");
            assertThat(id).matches("STD-\\d{2}(?:-[a-z0-9-]+)?");
            assertThat(seen.add(id)).as("Duplicate manifest fixture " + id).isTrue();
            String declared = entry.get("file");
            assertThat(declared).isNotBlank();
            Path file = base.resolve(declared).normalize();
            assertThat(file.toRealPath().toString().startsWith(rootCanonical + java.io.File.separator))
                .as("Fixture outside repository " + id).isTrue();
            String relative = root.relativize(file).toString().replace('\\', '/');
            String frozenHash = frozen.get(relative);
            assertThat(frozenHash).as("Missing frozen fixture SHA for " + id).isNotBlank();
            assertThat(sha256(Files.readAllBytes(file))).as("Fixture bytes have drifted for " + id)
                .isEqualTo(frozenHash);
            // Both STD-19 paired conditions deliberately omit a mapped template; their
            // difference is supplied assignment instructions, not template comparison.
            boolean withTemplate = !"STD-18".equals(id);
            JsonNode condition = plannedCondition(root, id);
            if (condition != null && condition.has("template_mapped"))
                withTemplate = condition.get("template_mapped").asBoolean();
            if (entry.containsKey("template_mapped") && !entry.get("template_mapped").isBlank())
                assertThat(Boolean.parseBoolean(entry.get("template_mapped"))).as(
                    "Manifest/source planned template mapping mismatch for " + id).isEqualTo(withTemplate);
            fixtures.add(new Fixture(id, file, frozenHash, withTemplate, relative));
        }
        assertThat(fixtures).isNotEmpty();
        String templatePath = "docs/STD TEMPLATE.pdf";
        assertThat(frozen).containsKey(templatePath);
        assertThat(sha256(Files.readAllBytes(root.resolve(templatePath))))
            .as("Official template SHA drift").isEqualTo(frozen.get(templatePath));
        return fixtures;
    }

    /**
     * In OFFICIAL mode, refuse to create observations unless the *actual* review freeze
     * and every authorized source byte were locked BEFORE this run. This verifies provenance
     * and declared reviewer records, not the real-world independence of a named reviewer.
     * A DEVELOPMENT mode export remains possible without masquerading as a frozen research run.
     */
    private static String validateOfficialPreRunFreeze(Path root, List<Fixture> fixtures,
            String templateHash, String commit) throws Exception {
        String requested = System.getProperty("benchmark.goal1.freeze.path", "");
        assertThat(requested).as("OFFICIAL exporter requires -Dbenchmark.goal1.freeze.path=<real-frozen-key.json>")
            .isNotBlank();
        Path file = Path.of(requested).toAbsolutePath().normalize();
        assertThat(file.startsWith(root) && Files.isRegularFile(file))
            .as("Goal 1 freeze key must be an existing repository file").isTrue();
        JsonNode freeze = new ObjectMapper().readTree(Files.readAllBytes(file));
        assertThat(freeze.path("type").asText()).isEqualTo("GOAL1_PRE_RUN_PROJECT_REFERENCE_FREEZE");
        assertThat(freeze.path("status").asText()).isEqualTo("FROZEN_GOAL_1");
        assertThat(freeze.path("app_commit").asText()).isEqualToIgnoringCase(commit);
        Instant frozenAt = Instant.parse(freeze.path("frozen_at").asText());
        assertThat(frozenAt).as("Freeze must precede every measurement").isBefore(Instant.now());
        Path base = root.resolve(BENCHMARK);
        Map<String, String> files = Map.of(
            "manifest_sha256", "manifest.csv",
            "atomic_assertions_sha256", "atomic-assertions.csv",
            "fixture_hashes_sha256", "fixture-hashes.sha256",
            "condition_authority_sha256", "goal1-condition-authority.json",
            "deterministic_scorer_sha256", "score-deterministic.cjs");
        for (var entry : files.entrySet()) {
            assertThat(freeze.path(entry.getKey()).asText()).as(
                "Source/score/labels drifted since Goal 1 freeze: " + entry.getValue())
                .isEqualTo(sha256(Files.readAllBytes(base.resolve(entry.getValue()))));
        }
        assertThat(freeze.path("template_sha256").asText()).isEqualTo(templateHash);
        assertThat(freeze.path("planned_case_families").asInt()).isEqualTo(25);
        assertThat(freeze.path("planned_fixture_conditions").asInt()).isEqualTo(fixtures.size());
        JsonNode fixtureHashes = freeze.path("fixture_sha256");
        assertThat(fixtureHashes.size()).isEqualTo(fixtures.size());
        for (Fixture fixture : fixtures) {
            assertThat(fixtureHashes.path(fixture.id()).asText()).isEqualTo(fixture.sha256());
        }
        Path attestation = root.resolve(freeze.path("review_attestation_path").asText()).normalize();
        assertThat(attestation.startsWith(root) && Files.isRegularFile(attestation))
            .as("Actual independent reviewer attestation must exist before OFFICIAL run").isTrue();
        assertThat(freeze.path("independent_review_attestation_sha256").asText())
            .isEqualTo(sha256(Files.readAllBytes(attestation)));
        for (Map<String, String> row : parseCsv(Files.readString(base.resolve("manifest.csv")))) {
            assertThat(row.get("human_label_review")).isEqualTo("VERIFIED");
            assertThat(row.get("human_label_reviewer")).isNotBlank();
            assertThat(Instant.parse(row.get("human_label_reviewed_at"))).isBeforeOrEqualTo(frozenAt);
        }
        var assertions = parseCsv(Files.readString(base.resolve("atomic-assertions.csv")));
        assertThat(freeze.path("planned_atomic_assertions").asInt()).isEqualTo(assertions.size());
        for (Map<String, String> row : assertions) {
            assertThat(row.get("review_status")).isEqualTo("VERIFIED");
            assertThat(row.get("reviewer")).isNotBlank();
            assertThat(Instant.parse(row.get("reviewed_at"))).isBeforeOrEqualTo(frozenAt);
        }
        String changed = git(root, "status", "--porcelain", "--untracked-files=no", "--",
            "docs/capstone-2-build/benchmarks/std/manifest.csv",
            "docs/capstone-2-build/benchmarks/std/atomic-assertions.csv",
            "docs/capstone-2-build/benchmarks/std/fixture-hashes.sha256",
            "docs/capstone-2-build/benchmarks/std/goal1-condition-authority.json",
            "docs/capstone-2-build/benchmarks/std/score-deterministic.cjs");
        assertThat(changed).as("Official Goal 1 references must be committed and unchanged").isBlank();
        return sha256(Files.readAllBytes(file));
    }

    /** Small RFC4180-compatible parser: quotes, commas, embedded newlines and blank trailing fields. */
    static List<Map<String, String>> parseCsv(String content) {
        var rows = new ArrayList<List<String>>();
        var current = new ArrayList<String>();
        var buffer = new StringBuilder();
        boolean quoted = false;
        for (int index = 0; index < content.length(); index++) {
            char c = content.charAt(index);
            if (c == '"') {
                if (quoted && index + 1 < content.length() && content.charAt(index + 1) == '"') {
                    buffer.append('"');
                    index++;
                } else quoted = !quoted;
            } else if (c == ',' && !quoted) {
                current.add(buffer.toString());
                buffer.setLength(0);
            } else if (c == '\n' && !quoted) {
                current.add(buffer.toString());
                buffer.setLength(0);
                if (current.stream().anyMatch(value -> !value.isBlank())) rows.add(List.copyOf(current));
                current.clear();
            } else if (c != '\r' || quoted) buffer.append(c);
        }
        assertThat(quoted).as("Unterminated manifest CSV quote").isFalse();
        if (buffer.length() > 0 || !current.isEmpty()) {
            current.add(buffer.toString());
            rows.add(List.copyOf(current));
        }
        assertThat(rows).isNotEmpty();
        List<String> header = rows.remove(0);
        assertThat(new HashSet<>(header)).hasSize(header.size());
        assertThat(header).contains("fixture_id", "file", "human_label_review");
        var result = new ArrayList<Map<String, String>>();
        for (List<String> values : rows) {
            assertThat(values).as("Malformed manifest row").hasSize(header.size());
            var item = new HashMap<String, String>();
            for (int i = 0; i < values.size(); i++) item.put(header.get(i), values.get(i));
            result.add(item);
        }
        return result;
    }

    /** Planned mock input authority is separate from run observations; never change it here. */
    private static JsonNode plannedCondition(Path root, String id) throws IOException {
        Path authority = root.resolve(BENCHMARK).resolve("goal1-condition-authority.json");
        if (!Files.exists(authority)) return null;
        JsonNode conditions = new ObjectMapper().readTree(Files.readAllBytes(authority)).path("conditions");
        for (JsonNode entry : conditions) {
            if (id.equals(entry.path("fixture_id").asText())) return entry;
        }
        return null;
    }

    /** One row = one frozen fixture, never invents a provider response for a local PDF. */
    Map<String, String> observe(Fixture fixture, PdfInspection template, String templateHash, String commit)
            throws IOException {
        var row = new LinkedHashMap<String, String>();
        for (String column : HEADER.split(",")) row.put(column, "");
        row.put("fixture_id", fixture.id());
        row.put("fixture_sha256", fixture.sha256());
        row.put("template_sha256", templateHash);
        row.put("app_commit", commit);
        row.put("measured_at", Instant.now().toString());
        row.put("code_state", COMMIT_STATE);
        row.put("file_limit_bytes", String.valueOf(FILE_LIMIT));
        row.put("file_size_bytes", String.valueOf(Files.size(fixture.file())));
        row.put("template_mapped", String.valueOf(fixture.withTemplate()));
        row.put("measurement_scope", "PDF_TEMPLATE_ISOLATED");
        row.put("observation_status", "ERROR"); // overwritten ONLY after a completed classification
        row.put("benchmark_run_mode", "DEVELOPMENT");
        try {
            byte[] bytes = Files.readAllBytes(fixture.file());
            assertThat(sha256(bytes)).as("Fixture changed between manifest validation and observation")
                .isEqualTo(fixture.sha256());
            // An access/size denial happens BEFORE PDF download in production. Do not claim
            // readability, PDF type or other PDF content was observed through that mocked gateway.
            if ("STD-16".equals(fixture.id()) || "STD-17-oversized".equals(fixture.id())) {
                recordGatewayMock(row, fixture.id(), bytes);
                return row;
            }
            PdfInspection inspected = inspector.inspect(bytes);
            row.put("readable", String.valueOf(inspected.readable()));
            row.put("pages", String.valueOf(inspected.pageCount()));
            row.put("extracted_characters", String.valueOf(inspected.extractedCharacterCount()));
            row.put("password_protected", String.valueOf(inspected.encrypted()));
            row.put("inspection_message", inspected.error() == null ? "" : inspected.error());
            row.put("observation_status", "SUCCESS"); // false/readability is a valid *negative* measurement
            if (inspected.readable()) {
                row.put("valid_pdf", "true");
                row.put("invalid_pdf_data", "false");
                row.put("corrupt_pdf", "false");
                row.put("too_short", String.valueOf(inspected.extractedCharacterCount() < MIN_READABLE_CHARACTERS));
                if (fixture.withTemplate()) {
                    TemplateComparison compared = comparator.compare(template.extractedText(), inspected.extractedText());
                    row.put("template_available", String.valueOf(compared.available()));
                    if (compared.available()) {
                        row.put("template_coverage", String.valueOf(compared.templateCoverage()));
                        row.put("added_content_ratio", String.valueOf(compared.addedContentRatio()));
                        row.put("template_only", String.valueOf(compared.appearsTemplateOnly()));
                        row.put("missing_template_headings", String.join("; ", compared.missingTemplateHeadings()));
                    }
                } else {
                    // A missing template is an independently measurable negative mapping state;
                    // template_only and missing_heading are NOT false classifications.
                    row.put("template_available", "false");
                }
            } else if (inspected.encrypted()) {
                row.put("error_category", "PASSWORD_PROTECTED");
                row.put("corrupt_pdf", "false");
                // A password rejection is not proof of corrupt content or a successful parse.
            } else if (inspected.error() != null && inspected.error().contains("not valid PDF data")) {
                row.put("valid_pdf", "false");
                row.put("invalid_pdf_data", "true");
                row.put("corrupt_pdf", "false");
                row.put("error_category", "INVALID_PDF_DATA");
            } else {
                row.put("valid_pdf", "false");
                row.put("invalid_pdf_data", "false");
                row.put("corrupt_pdf", "true");
                row.put("error_category", "CORRUPT_PDF");
            }
            if ("STD-15-non-pdf".equals(fixture.id())) {
                recordGatewayMock(row, fixture.id(), bytes);
                row.put("measurement_scope", "PDF_TEMPLATE_ISOLATED+FILECHECK_GATEWAY_MOCK");
            }
            if ("STD-11".equals(fixture.id())) {
                recordGatewayMock(row, fixture.id(), bytes);
                row.put("measurement_scope", "PDF_TEMPLATE_ISOLATED+FILECHECK_GATEWAY_MOCK");
            }
        } catch (Exception unexpected) {
            // Do not treat thrown infrastructure/test errors as the expected PDF rejection.
            row.put("observation_status", "ERROR");
            row.put("check_error", unexpected.getClass().getSimpleName() + ": "
                + String.valueOf(unexpected.getMessage()).replaceAll("[\\r\\n]+", " "));
            row.put("error_category", "EXPORT_EXECUTION_ERROR");
        }
        return row;
    }

    /**
     * Execute real FileCheckService branching against an explicit in-memory Drive mock.
     * Simulated metadata/refusal is not evidence of a real Google Drive file's permissions,
     * provider-returned MIME type or 25 MB length. Persisting the real response flags still
     * gives reproducible evidence that the production service handles that gateway state.
     */
    private static void recordGatewayMock(Map<String, String> row, String id, byte[] localBytes) throws IOException {
        if (!MOCK_CASES.contains(id)) throw new IllegalArgumentException("Unregistered gateway simulation");
        JsonNode planned = plannedCondition(repositoryRoot(), id);
        if (Set.of("STD-11", "STD-16", "STD-17-oversized").contains(id))
            assertThat(planned).as("Gateway mock condition must be authored BEFORE observation: " + id).isNotNull();
        String plannedFilename = "STD-11".equals(id)
            ? planned.path("mock_filename").asText("") : id + ".pdf";
        if ("STD-11".equals(id)) {
            assertThat(plannedFilename).as("Source-planned misleading filename").isNotBlank();
            assertThat(planned.path("mock_mime_type").asText()).isEqualTo("application/pdf");
        }
        if ("STD-17-oversized".equals(id)) {
            assertThat(planned.path("mock_metadata_size_expression").asText())
                .isEqualTo("GoogleDriveProperties.maximumFileSizeBytes() + 1");
            assertThat(planned.path("expected_flag").asText()).isEqualTo("File Too Large");
        }
        GoogleDriveGateway gateway = mock(GoogleDriveGateway.class);
        FileCheckReportRepository reports = mock(FileCheckReportRepository.class);
        when(reports.save(any(FileCheckReport.class))).thenAnswer(call -> call.getArgument(0));
        when(gateway.isConfigured()).thenReturn(true);
        String simulatedFileId = "goal1-benchmark-" + id.toLowerCase(java.util.Locale.ROOT);
        DriveFileReference reference = new DriveFileReference(simulatedFileId, null);
        String link = "https://drive.google.com/file/d/" + simulatedFileId + "/view";
        String mimeType = "STD-15-non-pdf".equals(id) ? "application/octet-stream" : "application/pdf";
        long simulatedSize = "STD-17-oversized".equals(id) ? FILE_LIMIT + 1 : localBytes.length;
        if ("STD-16".equals(id)) {
            when(gateway.getMetadata(reference)).thenThrow(
                new GoogleDriveUnavailableException("SIMULATED gateway rejection (no live Drive 403 evidence)"));
        } else {
            when(gateway.getMetadata(reference)).thenReturn(new DriveFileMetadata(
                simulatedFileId, plannedFilename,
                mimeType, simulatedSize, "", OffsetDateTime.now(),
                true, link));
        }
        when(gateway.download(reference)).thenReturn(localBytes);
        FileCheckService service = new FileCheckService(
            gateway, new GoogleDriveProperties(true, "mock-only-not-a-google-credential", FILE_LIMIT),
            new PdfInspector(), new TemplateComparator(new FileCheckProperties(
                MIN_READABLE_CHARACTERS, 0.75, 0.25)),
            mock(DocumentTemplateService.class), reports,
            mock(FormResponseRepository.class), mock(DeliverableRepository.class),
            mock(DeliverableFieldRepository.class), new ObjectMapper().findAndRegisterModules(),
            new FileCheckProperties(MIN_READABLE_CHARACTERS, 0.75, 0.25));
        FileCheckResponse output = service.check(UUID.randomUUID(),
            new FileCheckRequest("synthetic-" + id, "STD", link, "2026-09-21T00:00:00Z"));
        if ("STD-11".equals(id)) {
            assertThat(output.status()).as("Actual service must accept PDF MIME/bytes despite misleading filename")
                .isEqualTo("COMPLETED");
            assertThat(output.flags()).contains("PDF Verified");
            row.put("filecheck_status", output.status());
            row.put("technical_flag", "PDF Verified");
            row.put("filename_ignored", "true");
            row.put("gateway_mock_evidence", "FileCheckService.check; SIMULATED metadata.name=" + plannedFilename + "; "
                + "metadata.mimeType=application/pdf; real local PDF bytes");
            row.put("source_mime_type", "MOCK:" + mimeType);
            row.put("mock_metadata_size_bytes", String.valueOf(simulatedSize));
            row.put("observation_status", "SUCCESS");
            return;
        }
        assertThat(output.status()).as("Mock must prove an actual blocked production response").isEqualTo("BLOCKED");
        String expectedFlag = switch (id) {
            case "STD-16" -> "Inaccessible";
            case "STD-17-oversized" -> "File Too Large";
            case "STD-15-non-pdf" -> "Not PDF";
            default -> throw new IllegalArgumentException("Unexpected gateway simulation");
        };
        assertThat(output.flags()).containsExactly(expectedFlag);
        row.put("filecheck_status", output.status());
        row.put("technical_flag", expectedFlag);
        row.put("gateway_mock_evidence", "FileCheckService.check; SIMULATED "
            + ("STD-16".equals(id) ? "GoogleDriveUnavailableException (no real permission proof)" :
                "STD-17-oversized".equals(id) ? "metadata.size=limit+1 (local file not 25 MiB)" :
                    "metadata.mimeType=application/octet-stream (not actual Drive MIME)"));
        row.put("source_mime_type", "MOCK:" + ("STD-16".equals(id) ? "NOT_RETURNED" : mimeType));
        row.put("mock_metadata_size_bytes", "STD-16".equals(id) ? "" : String.valueOf(simulatedSize));
        row.put("observation_status", "SUCCESS");
        row.put("measurement_scope", "FILECHECK_GATEWAY_MOCK");
        if ("STD-16".equals(id)) {
            row.put("gateway_inaccessible", "true");
            // GoogleDriveUnavailableException conflates connection/permission errors, so this
            // must NOT be scored as confirmed provider access_denied.
            row.put("error_category", "SIMULATED_GATEWAY_UNAVAILABLE");
        } else if ("STD-17-oversized".equals(id)) {
            row.put("file_too_large", "true");
            row.put("error_category", "SIMULATED_METADATA_OVERSIZED");
        } else {
            row.put("not_pdf", "true");
            row.put("error_category", "SIMULATED_METADATA_NON_PDF_MIME");
        }
    }

    private static String encodeCsv(Map<String, String> fields) {
        var columns = new ArrayList<String>();
        for (String header : HEADER.split(",")) {
            String field = fields.getOrDefault(header, "");
            columns.add("\"" + field.replace("\"", "\"\"") + "\"");
        }
        return String.join(",", columns);
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception failure) { throw new IllegalStateException(failure); }
    }

    private static String git(Path root, String... arguments) throws Exception {
        var command = new ArrayList<>(List.of("git"));
        command.addAll(List.of(arguments));
        Process process = new ProcessBuilder(command).directory(root.toFile()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
        assertThat(process.waitFor()).as("Git command failed").isZero();
        return output;
    }

    private static Path repositoryRoot() {
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        return Files.exists(cwd.resolve("backend/pom.xml")) ? cwd : cwd.getParent();
    }
}
