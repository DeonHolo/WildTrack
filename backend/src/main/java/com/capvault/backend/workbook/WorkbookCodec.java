package com.capvault.backend.workbook;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

/** Bounded, non-evaluating codec for the manual workspace import format. */
@Component
public class WorkbookCodec {
    public record Row(String sheet, int rowNumber, String key, Map<String, String> values) { }
    public record Issue(String sheet, int rowNumber, String message) { }
    public record Parsed(List<Row> rows, List<Issue> errors, List<String> sheets) { }
    private record Field(String label, String key, boolean required, int max) { }
    private static Field f(String label, String key, boolean required, int max) { return new Field(label, key, required, max); }
    private static final Map<String, List<Field>> SCHEMA = new LinkedHashMap<>();
    static {
        SCHEMA.put("Students", List.of(f("Student Number", "studentNumber", true, 80), f("Student Name", "studentName", true, 240), f("Team Code", "teamCode", true, 160), f("Member #", "memberNumber", false, 40), f("Section", "sectionName", false, 120), f("Adviser", "adviserName", false, 200), f("Institutional Email", "institutionalEmail", false, 240)));
        SCHEMA.put("Teams and Projects", List.of(f("Team Code", "groupCode", true, 160), f("Project Title", "projectTitle", false, 1000), f("Software Name", "softwareName", false, 500), f("Description", "description", false, 32767), f("Proposal Remarks", "proposalRemarks", false, 32767), f("Demo Comments", "demoComments", false, 32767), f("Adviser", "adviserName", false, 240), f("Status", "projectStatus", false, 240), f("Category", "category", false, 240)));
        SCHEMA.put("Deliverables", List.of(f("Column Key", "trackerColumnKey", true, 160), f("Title", "title", true, 240), f("Deadline", "dueAt", false, 40)));
    }
    private static final int MAX_BYTES = 5 * 1024 * 1024, MAX_ROWS = 5000, MAX_CELLS = 60000;
    private static String norm(String s) { return s.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT); }

    public byte[] template() {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            CellStyle required = wb.createCellStyle(); Font bold = wb.createFont(); bold.setBold(true); required.setFont(bold);
            required.setFillForegroundColor(IndexedColors.LIGHT_YELLOW.getIndex()); required.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            CellStyle optional = wb.createCellStyle(); optional.setFont(bold);
            for (var entry : SCHEMA.entrySet()) {
                Sheet sheet = wb.createSheet(entry.getKey()); org.apache.poi.ss.usermodel.Row header = sheet.createRow(0);
                for (int i = 0; i < entry.getValue().size(); i++) {
                    Field field = entry.getValue().get(i); Cell c = header.createCell(i); c.setCellValue(field.label()); c.setCellStyle(field.required() ? required : optional);
                    CreationHelper helper = wb.getCreationHelper(); Drawing<?> drawing = sheet.createDrawingPatriarch(); ClientAnchor anchor = helper.createClientAnchor(); anchor.setCol1(i); anchor.setCol2(i + 3); anchor.setRow1(1); anchor.setRow2(4);
                    Comment comment = drawing.createCellComment(anchor); comment.setString(helper.createRichTextString(field.required() ? "Required" : "Optional; leave blank to preserve existing value.")); c.setCellComment(comment);
                    sheet.setColumnWidth(i, 22 * 256);
                }
                sheet.createFreezePane(0, 1);
            }
            Sheet instructions = wb.createSheet("Instructions");
            String[] lines = {"For initial setup, fill the Students tab. Student Number, Student Name and Team Code are required.",
                "Teams and Projects and Deliverables are optional tabs. You may leave them empty or remove them.",
                "Fill one record per row under the existing headers. Yellow headers are required within a tab.",
                "To update a record, reuse its Student Number, Team Code or Column Key. Omitted rows are kept.",
                "Blank optional cells keep saved values. Do not use formulas.",
                "Use a short, unique Column Key for each deliverable, such as SRS. Reuse it for later updates.",
                "New deliverables need a Deadline: yyyy-MM-ddTHH:mm in Philippine time, or an Excel date and time.",
                "New deliverables start unpublished. Existing forms keep their publication status and settings."};
            for (int i = 0; i < lines.length; i++) instructions.createRow(i).createCell(0).setCellValue(lines[i]);
            instructions.setColumnWidth(0, 100 * 256); wb.setActiveSheet(0); wb.setSelectedTab(0); wb.write(out); return out.toByteArray();
        } catch (Exception e) { throw new IllegalStateException("Could not create workbook template", e); }
    }

    public Parsed parse(byte[] bytes) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) throw new IllegalArgumentException("Workbook must be a nonempty XLSX file no larger than 5 MiB");
        checkArchive(bytes);
        List<Row> rows = new ArrayList<>(); List<Issue> errors = new ArrayList<>(); List<String> sheets = new ArrayList<>();
        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            DataFormatter formatter = new DataFormatter(Locale.ROOT); int count = 0, cells = 0;
            for (Sheet sheet : wb) {
                String name = sheet.getSheetName();
                if (norm(name).equals("instructions")) continue;
                String canonical = SCHEMA.keySet().stream().filter(k -> norm(k).equals(norm(name))).findFirst().orElse(null);
                if (canonical == null) {
                    boolean nonempty = false;
                    for (org.apache.poi.ss.usermodel.Row r : sheet) for (Cell c : r) { if (++cells > MAX_CELLS) throw new IllegalArgumentException("Workbook exceeds the cell limit"); if (c.getCellType() != CellType.BLANK && (c.getCellType() != CellType.STRING || !c.getStringCellValue().isBlank())) nonempty = true; }
                    if (nonempty) errors.add(new Issue(name, 1, "Unknown nonempty sheet"));
                    continue;
                }
                sheets.add(canonical); List<Field> fields = SCHEMA.get(canonical); Map<Integer, Field> columns = new LinkedHashMap<>(); Set<String> headers = new HashSet<>();
                org.apache.poi.ss.usermodel.Row header = sheet.getRow(0);
                if (header == null) { errors.add(new Issue(name, 1, "Missing header row")); continue; }
                for (Cell cell : header) {
                    if (++cells > MAX_CELLS) throw new IllegalArgumentException("Workbook exceeds the cell limit");
                    if (cell.getCellType() == CellType.FORMULA || cell.getCellType() == CellType.ERROR) { errors.add(new Issue(name, 1, "Formula or error cells are not allowed")); continue; }
                    String text = formatter.formatCellValue(cell).trim(); if (text.isEmpty()) continue;
                    String normalized = norm(text); if (!headers.add(normalized)) { errors.add(new Issue(name, 1, "Duplicate header: " + text)); continue; }
                    Field field = fields.stream().filter(f -> norm(f.label()).equals(normalized)).findFirst().orElse(null);
                    if (field == null) errors.add(new Issue(name, 1, "Unknown header: " + text)); else columns.put(cell.getColumnIndex(), field);
                }
                for (Field f : fields) if (f.required() && !columns.containsValue(f)) errors.add(new Issue(name, 1, "Missing required header: " + f.label()));
                Set<String> keys = new HashSet<>();
                for (org.apache.poi.ss.usermodel.Row r : sheet) {
                    if (r.getRowNum() == 0) continue;
                    boolean nonempty = false; Map<String, String> values = new LinkedHashMap<>(); int rowNumber = r.getRowNum() + 1;
                    for (Cell c : r) {
                        if (++cells > MAX_CELLS) throw new IllegalArgumentException("Workbook exceeds the cell limit");
                        if (c.getCellType() == CellType.BLANK) continue;
                        if (c.getCellType() == CellType.FORMULA || c.getCellType() == CellType.ERROR) { nonempty = true; errors.add(new Issue(name, rowNumber, "Formula or error cells are not allowed")); continue; }
                        String value = formatter.formatCellValue(c).trim(); if (value.isEmpty()) continue; nonempty = true;
                        Field f = columns.get(c.getColumnIndex()); if (f == null) { errors.add(new Issue(name, rowNumber, "Value under an unknown or blank header")); continue; }
                        if (f.key().equals("dueAt")) {
                            try {
                                LocalDateTime date;
                                if (c.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(c) && DateUtil.isValidExcelDate(c.getNumericCellValue())) date = c.getLocalDateTimeCellValue();
                                else { if (!value.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}")) throw new DateTimeParseException("Invalid", value, 0); date = LocalDateTime.parse(value, DateTimeFormatter.ISO_LOCAL_DATE_TIME); }
                                value = date.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                            } catch (RuntimeException ex) { errors.add(new Issue(name, rowNumber, "Deadline must be a valid date and time")); continue; }
                        }
                        if (value.length() > f.max()) { errors.add(new Issue(name, rowNumber, f.label() + " exceeds " + f.max() + " characters")); continue; }
                        if (f.key().equals("institutionalEmail") && !value.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) { errors.add(new Issue(name, rowNumber, "Invalid institutional email")); continue; }
                        values.put(f.key(), value);
                    }
                    if (!nonempty) continue;
                    if (++count > MAX_ROWS) throw new IllegalArgumentException("Workbook exceeds 5000 data rows");
                    for (Field f : fields) if (f.required() && !values.containsKey(f.key())) errors.add(new Issue(name, rowNumber, "Missing required value: " + f.label()));
                    String key = values.get(fields.get(0).key());
                    if (key != null) { key = norm(key); if (!keys.add(key)) errors.add(new Issue(name, rowNumber, "Duplicate identity: " + key)); }
                    rows.add(new Row(canonical, rowNumber, key, Collections.unmodifiableMap(values)));
                }
            }
            return new Parsed(List.copyOf(rows), List.copyOf(errors), List.copyOf(sheets));
        } catch (IllegalArgumentException e) { throw e; } catch (Exception e) { throw new IllegalArgumentException("Invalid or unsupported XLSX workbook", e); }
    }

    private void checkArchive(byte[] bytes) {
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            int entries = 0; long expanded = 0; byte[] buffer = new byte[8192]; ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (++entries > 1000) throw new IllegalArgumentException("Workbook has too many archive entries");
                int n; while ((n = zip.read(buffer)) != -1) {
                    expanded += n; if (expanded > 40L * 1024 * 1024) throw new IllegalArgumentException("Workbook is too large when expanded");
                }
            }
            if (entries == 0) throw new IllegalArgumentException("Invalid or unsupported XLSX workbook");
        } catch (java.io.IOException e) { throw new IllegalArgumentException("Invalid or unsupported XLSX workbook", e); }
    }
}
