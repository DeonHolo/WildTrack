package com.capvault.backend.response;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.HashSet;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.drive.DriveLinkParser;
import com.capvault.backend.filecheck.FileCheckReport;
import com.capvault.backend.filecheck.FileCheckReportRepository;
import com.capvault.backend.filecheck.FileCheckResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

@Service
public class AcceptedPdfSnapshotService {
    private static final String INCOMPLETE = "Run Document Check for each submitted PDF, then accept again before archiving.";
    private final DeliverableFieldRepository fields;
    private final FileCheckReportRepository reports;
    private final ObjectMapper json;
    public record Manifest(boolean complete, String error, List<Pdf> artifacts) {}
    public record Pdf(String fieldKey, String label, String sourceUrl, String fileId, String resourceKey,
                      String md5, long size, String modifiedTime, String checkedAt) {}

    public AcceptedPdfSnapshotService(DeliverableFieldRepository fields, FileCheckReportRepository reports, ObjectMapper json) {
        this.fields = fields; this.reports = reports; this.json = json;
    }

    public String capture(FormResponse response) {
        Manifest manifest;
        try { manifest = build(response); }
        catch (RuntimeException e) { manifest = incomplete(List.of()); }
        try { return json.writeValueAsString(manifest); }
        catch (com.fasterxml.jackson.core.JsonProcessingException e) { return "{\"complete\":false,\"error\":\"Document Check evidence could not be recorded.\",\"artifacts\":[]}"; }
    }

    private Manifest build(FormResponse response) {
        JsonNode values;
        try { values = json.readTree(response.getValuesJson()); }
        catch (Exception e) { return incomplete(List.of()); }
        if (values == null || !values.isObject() || response.getUpdatedAt() == null) return incomplete(List.of());
        List<DeliverableField> pdfFields = fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(response.getDeliverableId()).stream()
            .filter(f -> f.isActive() && f.getFieldType() == DeliverableFieldType.DRIVE_PDF).toList();
        if (pdfFields.isEmpty()) return incomplete(List.of());
        List<Pdf> artifacts = new ArrayList<>();
        boolean complete = true;
        for (DeliverableField field : pdfFields) {
            JsonNode node = values.get(field.getFieldKey());
            String source = node != null && node.isTextual() ? node.asText().trim() : "";
            if (source.isEmpty()) { if (field.isRequired()) complete = false; continue; }
            var report = reports.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(
                response.getWorkspaceId(), response.getId().toString(), field.getId());
            boolean legacy = report.isEmpty() && pdfFields.size() == 1;
            if (legacy) {
                report = reports.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdIsNullOrderByCheckedAtDesc(
                    response.getWorkspaceId(), response.getId().toString());
            }
            Pdf proof = report.map(r -> proof(response, field, source, r, legacy)).orElse(null);
            if (proof == null) complete = false; else artifacts.add(proof);
        }
        if (artifacts.isEmpty()) complete = false;
        return complete ? new Manifest(true, null, List.copyOf(artifacts)) : incomplete(artifacts);
    }

    private Pdf proof(FormResponse response, DeliverableField field, String source, FileCheckReport report, boolean legacy) {
        try {
            FileCheckResponse check = json.readValue(report.getReportJson(), FileCheckResponse.class);
            var reference = DriveLinkParser.parse(source);
            var metadata = check.metadata();
            if (!"COMPLETED".equals(check.status()) || check.failureDetails() != null || check.document() == null
                    || !check.document().readable() || metadata == null || !metadata.canDownload()
                    || !"application/pdf".equalsIgnoreCase(metadata.mimeType())
                    || !response.getId().toString().equals(check.responseId())
                    || (legacy ? check.fieldId() != null : !field.getId().equals(check.fieldId()))
                    || !source.equals(check.sourceUrl()) || !source.equals(report.getSourceUrl())
                    || !response.getUpdatedAt().equals(Instant.parse(check.sourceResponseUpdatedAt()))
                    || !reference.fileId().equals(metadata.fileId())
                    || metadata.md5Checksum() == null || !metadata.md5Checksum().matches("(?i)[0-9a-f]{32}")
                    || metadata.size() == null || metadata.size() <= 0 || metadata.size() > 25L * 1024 * 1024
                    || metadata.modifiedTime() == null || check.checkedAt() == null) return null;
            return new Pdf(field.getFieldKey(), field.getLabel(), source, reference.fileId(), reference.resourceKey(),
                metadata.md5Checksum().toLowerCase(java.util.Locale.ROOT), metadata.size(), metadata.modifiedTime().toString(), check.checkedAt().toString());
        } catch (Exception e) { return null; }
    }

    public Manifest read(String value) {
        if (value == null || value.isBlank()) return incomplete(List.of());
        try {
            Manifest manifest = json.readValue(value, Manifest.class);
            if (manifest == null || manifest.artifacts() == null) return incomplete(List.of());
            if (!manifest.complete()) return incomplete(List.of());
            if (manifest.artifacts().isEmpty()) return incomplete(List.of());
            var keys = new HashSet<String>();
            for (Pdf pdf : manifest.artifacts()) {
                if (pdf == null || pdf.fieldKey() == null || pdf.fieldKey().isBlank() || !keys.add(pdf.fieldKey())
                        || pdf.label() == null || pdf.label().isBlank() || pdf.size() <= 0 || pdf.size() > 25L * 1024 * 1024
                        || pdf.md5() == null || !pdf.md5().matches("(?i)[0-9a-f]{32}")
                        || !DriveLinkParser.parse(pdf.sourceUrl()).fileId().equals(pdf.fileId())
                        || !java.util.Objects.equals(DriveLinkParser.parse(pdf.sourceUrl()).resourceKey(), pdf.resourceKey())) return incomplete(List.of());
                OffsetDateTime.parse(pdf.modifiedTime()); java.time.LocalDateTime.parse(pdf.checkedAt());
            }
            return manifest;
        } catch (Exception e) { return incomplete(List.of()); }
    }
    private static Manifest incomplete(List<Pdf> artifacts) { return new Manifest(false, INCOMPLETE, List.copyOf(artifacts)); }
}
