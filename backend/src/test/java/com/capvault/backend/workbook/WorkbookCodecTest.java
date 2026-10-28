package com.capvault.backend.workbook;

import static org.junit.jupiter.api.Assertions.*;
import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

class WorkbookCodecTest {
    private final WorkbookCodec codec = new WorkbookCodec();

    private byte[] bytes(XSSFWorkbook workbook) throws Exception {
        try (workbook; ByteArrayOutputStream out = new ByteArrayOutputStream()) { workbook.write(out); return out.toByteArray(); }
    }
    private Sheet sheet(XSSFWorkbook wb, String name, String... headers) {
        Sheet s = wb.createSheet(name); Row r = s.createRow(0);
        for (int i = 0; i < headers.length; i++) r.createCell(i).setCellValue(headers[i]); return s;
    }
    private void row(Sheet s, int index, String... values) {
        Row row = s.createRow(index); for (int i = 0; i < values.length; i++) if (values[i] != null) row.createCell(i).setCellValue(values[i]);
    }
    @Test void templateHasSelectedStudentsAndNoSampleRows() throws Exception {
        byte[] template = codec.template();
        try (XSSFWorkbook wb = new XSSFWorkbook(new java.io.ByteArrayInputStream(template))) {
            assertEquals("Students", wb.getSheetAt(0).getSheetName()); assertEquals(0, wb.getActiveSheetIndex());
            assertNotNull(wb.getSheetAt(0).getRow(0).getCell(0).getCellComment());
        }
        var result = codec.parse(template); assertTrue(result.errors().isEmpty(), result.errors().toString()); assertTrue(result.rows().isEmpty());
    }
    @Test void studentsOnlySupportsReorderedHeadersAndBlankOptionals() throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook(); Sheet s = sheet(wb, "Students", " TEAM   CODE ", "Student Name", "Student Number", "Section");
        row(s, 1, "A", "Alex", "  ABC-1  ", " ");
        var parsed = codec.parse(bytes(wb)); assertTrue(parsed.errors().isEmpty(), parsed.errors().toString());
        assertEquals("abc-1", parsed.rows().get(0).key()); assertEquals("ABC-1", parsed.rows().get(0).values().get("studentNumber"));
        assertFalse(parsed.rows().get(0).values().containsKey("sectionName")); assertEquals(2, parsed.rows().get(0).rowNumber());
    }
    @Test void optionalTabsAndExcelDateRoundTrip() throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook(); Sheet teams = sheet(wb, "Teams and Projects", "Team Code", "Project Title"); row(teams, 1, "G1", "Title");
        Sheet d = sheet(wb, "Deliverables", "Column Key", "Title", "Deadline"); row(d, 1, "D1", "Draft", null);
        Cell cell = d.getRow(1).createCell(2); cell.setCellValue(LocalDateTime.of(2026, 11, 10, 17, 30));
        CellStyle style = wb.createCellStyle(); style.setDataFormat(wb.createDataFormat().getFormat("yyyy-mm-dd hh:mm")); cell.setCellStyle(style);
        var parsed = codec.parse(bytes(wb)); assertTrue(parsed.errors().isEmpty(), parsed.errors().toString());
        assertEquals("2026-11-10T17:30:00", parsed.rows().get(1).values().get("dueAt"));
    }
    @Test void reportsDuplicateInvalidFormulaAndUnknownSheet() throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook(); Sheet s = sheet(wb, "Students", "Student Number", "Student Name", "Team Code", "Institutional Email");
        row(s, 1, "X", "A", "T", "bad"); row(s, 2, "x", "B", "T", null); s.getRow(2).getCell(1).setCellFormula("1+1");
        sheet(wb, "Mystery", "data"); var parsed = codec.parse(bytes(wb));
        assertTrue(parsed.errors().stream().anyMatch(i -> i.message().contains("Duplicate identity")));
        assertTrue(parsed.errors().stream().anyMatch(i -> i.message().contains("Formula")));
        assertTrue(parsed.errors().stream().anyMatch(i -> i.message().contains("email")));
        assertTrue(parsed.errors().stream().anyMatch(i -> i.message().contains("Unknown nonempty")));
    }
    @Test void rejectsDuplicateHeadersMissingValuesAndInvalidDates() throws Exception {
        XSSFWorkbook wb = new XSSFWorkbook(); Sheet s = sheet(wb, "Deliverables", "Column Key", "Title", "Title", "Deadline"); row(s, 1, "D", "", "", "2026-02-30T12:00");
        var parsed = codec.parse(bytes(wb)); assertTrue(parsed.errors().stream().anyMatch(i -> i.message().contains("Duplicate header")));
        assertTrue(parsed.errors().stream().anyMatch(i -> i.message().contains("Missing required value")));
        assertTrue(parsed.errors().stream().anyMatch(i -> i.message().contains("Deadline")));
    }
    @Test void rejectsMalformedOversizeAndTooManyRows() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> codec.parse(new byte[] {1, 2, 3}));
        assertThrows(IllegalArgumentException.class, () -> codec.parse(new byte[5 * 1024 * 1024 + 1]));
        XSSFWorkbook wb = new XSSFWorkbook(); Sheet s = sheet(wb, "Students", "Student Number", "Student Name", "Team Code");
        for (int i = 1; i <= 5001; i++) row(s, i, "S" + i, "A", "T");
        byte[] data = bytes(wb); assertThrows(IllegalArgumentException.class, () -> codec.parse(data));
    }
}
