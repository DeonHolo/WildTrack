package com.capvault.backend.sheets;

import static com.capvault.backend.support.AuthenticatedRequest.adminSession;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.project.ProjectMetadataRepository;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.staff.StaffRoleAssignment;
import com.capvault.backend.staff.StaffRoleAssignmentRepository;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.tracker.TrackerCellRepository;
import com.capvault.backend.tracker.TrackerColumnRepository;
import com.capvault.backend.tracker.TrackerRowRepository;
import com.capvault.backend.tracker.TrackerWritebackRepository;
import com.capvault.backend.workspace.WorkspaceSourceRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import jakarta.servlet.http.Cookie;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SheetImportControllerTest {

    private static final String TEAM_FORMATION_CSV = """
        Team Formation Sheet
        Student Number,Name of Student,Team Formation,Member #,Section,CIT Email
        20-0649-750,"TAGHOY, RON LUIGI F.",2526-sem2-it332-41,1,IT332,ron.luigi@cit.edu
        23-2250-144,"BARANGAN, MARK LORENZ L.",2526-sem2-it332-07,5,IT332,mark.lorenz@cit.edu
        """;

    private static final String TRACKER_CSV = """
        ClassRec SEM2 2025-26 : IT332 Tracker
        NAME OF STUDENT,TEAM FORMATION,MEMBER#,ProbExploration,SRS,SDD
        ,,,2/14/2026 23:59:59,4/18/2026 23:59:59,4/25/2026 23:59:59
        "TAGHOY, RON LUIGI F.",2526-sem2-it332-41,1,0,,21
        "BARANGAN, MARK LORENZ L.",2526-sem2-it332-07,5,1,51,51
        """;

    private static final String PROJECT_MONITOR_CSV = """
        SoftwareProjectMonitoring
        GROUP CODE,PROJECT TITLE,SOFTWARE NAME,DESCRIPTION,PROPOSAL REMARKS,DEMO COMMENTS,STATUS/ADVISER,CATEGORY
        2526-sem2-it332-41,CapVault,AcaVault,Google-first submission monitor,Approved pending revisions,Focus on review queue,Sir Ralph Laviste,Academic Capstone
        """;

    private static final String CURRENT_IT411_TRACKER_CSV = """
        2627 SEM1 CLASSREC : IT411 Tracker
        No.,NAME OF STUDENT,STUDENT NO.,SECTION,NEW TEAM CODE,MID,ADVISER,SOFTWARE TITLE,MVP Validation,Refactored SPMP,Refactored SRS,Refactored SDD,STD
        1,"TAGHOY, RON LUIGI F.",20-0649-750,G2,2627-sem1-it411-41,4,Ralph Laviste,WildTrack,,,,,
        ,,,,,,SUBMISSION DEADLINE,,9/12/2026,9/19/2026,9/19/2026,9/19/2026,9/26/2026
        """;

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private SheetCsvClient sheetCsvClient;

    @Autowired
    private WorkspaceSourceRepository workspaceSourceRepository;

    @Autowired
    private SheetImportRunRepository sheetImportRunRepository;

    @Autowired
    private StudentRecordRepository studentRecordRepository;

    @Autowired
    private ProjectMetadataRepository projectMetadataRepository;

    @Autowired
    private TrackerColumnRepository trackerColumnRepository;

    @Autowired
    private TrackerRowRepository trackerRowRepository;

    @Autowired
    private TrackerCellRepository trackerCellRepository;

    @Autowired
    private TrackerWritebackRepository trackerWritebackRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WildTrackSessionService sessions;

    @Autowired
    private StaffRoleAssignmentRepository staffRoles;

    @BeforeEach
    void clearImportedState() {
        trackerWritebackRepository.deleteAll();
        trackerCellRepository.deleteAll();
        trackerRowRepository.deleteAll();
        trackerColumnRepository.deleteAll();
        projectMetadataRepository.deleteAll();
        studentRecordRepository.deleteAll();
        sheetImportRunRepository.deleteAll();
        workspaceSourceRepository.deleteAll();
    }

    @Test
    void importsTeamFormationAndExposesStudentIds() throws Exception {
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(TEAM_FORMATION_CSV);

        mockMvc.perform(post("/api/sheets/import/TEAM_FORMATION").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sheetUrl": "https://docs.google.com/spreadsheets/d/team-formation/edit",
                      "displayName": "Team Formation"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.studentsFound").value(2))
            .andExpect(jsonPath("$.officialIdsFound").value(2))
            .andExpect(jsonPath("$.warnings", hasSize(0)));

        mockMvc.perform(get("/api/students").with(adminSession()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.studentNumber == '20-0649-750')]").exists())
            .andExpect(jsonPath("$[?(@.institutionalEmail == 'ron.luigi@cit.edu')]").exists());
    }

    @Test
    void importsRealTeamFormationHeaderWithoutCollapsingMembersIntoOneRecordPerTeam() throws Exception {
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn("""
            "For students enrolled in IT332 G1 - G7 ONLY NOTE: MEMBER #1 should be assigned as Team Lead TEAM CODE",TEAM DETAILS MEMBER #,STUDENT ID,LASTNAME,FIRSTNAME,EMAIL @cit.edu,PROPOSED PROJECT,ADVISER
            2526-sem2-it332-01,1,25-0001-001,Doe,Alex,alex.doe@cit.edu,,
            2526-sem2-it332-01,2,25-0001-002,Rivera,Sam,sam.rivera@cit.edu,,
            """);

        mockMvc.perform(post("/api/sheets/import/TEAM_FORMATION").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"sheetUrl":"https://docs.google.com/spreadsheets/d/team-formation/edit","displayName":"Team Formation"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.studentsFound").value(2))
            .andExpect(jsonPath("$.officialIdsFound").value(2));

        var records = studentRecordRepository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(
            java.util.UUID.fromString("11111111-1111-1111-1111-111111111111"));
        assertThat(records).hasSize(2);
        assertThat(records).extracting(record -> record.getStudentNumber()).containsExactly("25-0001-001", "25-0001-002");
        assertThat(records).extracting(record -> record.getMemberNumber()).containsExactly("1", "2");
    }

    @Test
    void appliesSavedColumnMappingsForUnusualTeamFormationHeaders() throws Exception {
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn("""
            Imported roster
            School Key,Learner,Group Key,Seat
            24-0001-111,"DOE, JANE A.",2526-sem2-it332-99,2
            """);

        mockMvc.perform(post("/api/sheets/import/TEAM_FORMATION").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sheetUrl": "https://docs.google.com/spreadsheets/d/custom-roster/edit",
                      "displayName": "Custom roster",
                      "mappingOverrides": {
                        "studentNumber": "School Key",
                        "studentName": "Learner",
                        "teamCode": "Group Key",
                        "memberNumber": "Seat"
                      }
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.studentsFound").value(1))
            .andExpect(jsonPath("$.officialIdsFound").value(1));

        mockMvc.perform(get("/api/students").with(adminSession()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].studentNumber").value("24-0001-111"))
            .andExpect(jsonPath("$[0].studentName").value("DOE, JANE A."))
            .andExpect(jsonPath("$[0].teamCode").value("2526-sem2-it332-99"))
            .andExpect(jsonPath("$[0].memberNumber").value("2"));
    }
    @Test
    void importsTrackerRowsDeadlineSuggestionsAndWritesLocalTrackerValue() throws Exception {
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(TEAM_FORMATION_CSV, TRACKER_CSV);

        importTeamFormation();

        mockMvc.perform(post("/api/sheets/import/TRACKER").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sheetUrl": "https://docs.google.com/spreadsheets/d/tracker/edit?gid=1971664293",
                      "displayName": "IT332 Tracker"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rowsFound").value(2))
            .andExpect(jsonPath("$.columnsFound").value(3))
            .andExpect(jsonPath("$.deadlineSuggestions", hasSize(3)))
            .andExpect(jsonPath("$.deadlineSuggestions[0].dueAt").value("2026-02-14T23:59"))
            .andExpect(jsonPath("$.details.deadlineRows").value(1))
            .andExpect(jsonPath("$.details.metrics.deadlineValues").value(3));

        mockMvc.perform(get("/api/tracker/rows").with(adminSession()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.studentNumber == '20-0649-750')]").exists())
            .andExpect(jsonPath("$[?(@.studentName == 'TAGHOY, RON LUIGI F.')]").exists());

        mockMvc.perform(post("/api/tracker/writebacks").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "studentNumber": "20-0649-750",
                      "teamCode": "2526-sem2-it332-41",
                      "memberNumber": "1",
                      "trackerColumnKey": "SRS",
                      "daysLate": 0,
                      "writeToGoogleSheet": true
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("PENDING_GOOGLE_CREDENTIALS"))
            .andExpect(jsonPath("$.targetA1Range").value("'IT332 Tracker'!E4"));
    }

    @Test
    void importsSoftwareProjectMonitorMetadata() throws Exception {
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(PROJECT_MONITOR_CSV);

        mockMvc.perform(post("/api/sheets/import/PROJECT_MONITOR").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sheetUrl": "https://docs.google.com/spreadsheets/d/project-monitor/edit",
                      "displayName": "SoftwareProjectMonitoring"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.groupsFound").value(1));

        mockMvc.perform(get("/api/projects").with(adminSession()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].groupCode").value("2526-sem2-it332-41"))
            .andExpect(jsonPath("$[0].projectTitle").value("CapVault"))
            .andExpect(jsonPath("$[0].adviserName").value("Sir Ralph Laviste"));
    }

    @Test
    void reconcilesCapstoneOneSourcesWithCurrentIt411TrackerWithoutTurningMetadataIntoDeliverables() throws Exception {
        var admin = productAdminSession("ticket05-current-mapping");
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(
            TEAM_FORMATION_CSV,
            PROJECT_MONITOR_CSV,
            CURRENT_IT411_TRACKER_CSV,
            CURRENT_IT411_TRACKER_CSV
        );

        importTeamFormation();

        mockMvc.perform(post("/api/sheets/import/PROJECT_MONITOR").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sheetUrl": "https://docs.google.com/spreadsheets/d/project-monitor/edit",
                      "displayName": "SoftwareProjectMonitoring"
                    }
                    """))
            .andExpect(status().isOk());

        var previewResult = mockMvc.perform(post("/api/sheets/preview/TRACKER").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sheetUrl": "https://docs.google.com/spreadsheets/d/current-it411/edit",
                      "displayName": "IT411 Tracker"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deadlineSuggestions", hasSize(5)))
            .andReturn();
        JsonNode preview = objectMapper.readTree(previewResult.getResponse().getContentAsString());
        java.util.Map<String, String> resolutions = new java.util.LinkedHashMap<>();
        for (JsonNode change : preview.path("changes")) {
            for (JsonNode field : change.path("fields")) {
                if (field.path("conflict").asBoolean()) resolutions.put(field.path("key").asText(), "SOURCE");
            }
        }
        mockMvc.perform(post("/api/sheets/apply/TRACKER").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of(
                    "previewId", preview.path("previewId").asText(),
                    "resolutions", resolutions
                ))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.rowsFound").value(1))
            .andExpect(jsonPath("$.columnsFound").value(5));

        mockMvc.perform(get("/api/students").with(adminSession()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].studentNumber").value("20-0649-750"))
            .andExpect(jsonPath("$[0].teamCode").value("2627-sem1-it411-41"))
            .andExpect(jsonPath("$[0].teamFormationCode").value("2526-sem2-it332-41"))
            .andExpect(jsonPath("$[0].memberNumber").value("4"))
            .andExpect(jsonPath("$[0].sectionName").value("G2"))
            .andExpect(jsonPath("$[0].adviserName").value("Ralph Laviste"))
            .andExpect(jsonPath("$[0].softwareTitle").value("WildTrack"))
            .andExpect(jsonPath("$[0].institutionalEmail").value("ron.luigi@cit.edu"));

        mockMvc.perform(get("/api/projects").with(adminSession()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].groupCode").value("2627-sem1-it411-41"))
            .andExpect(jsonPath("$[0].sourceGroupCode").value("2526-sem2-it332-41"))
            .andExpect(jsonPath("$[0].projectTitle").value("CapVault"))
            .andExpect(jsonPath("$[0].softwareName").value("WildTrack"))
            .andExpect(jsonPath("$[0].adviserName").value("Ralph Laviste"));

        var activeColumns = trackerColumnRepository.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(
                java.util.UUID.fromString("11111111-1111-1111-1111-111111111111"))
            .stream()
            .filter(column -> Boolean.TRUE.equals(column.getActive()))
            .map(column -> column.getColumnKey())
            .toList();
        assertThat(activeColumns).containsExactly(
            "MVP Validation",
            "Refactored SPMP",
            "Refactored SRS",
            "Refactored SDD",
            "STD"
        );
        assertThat(activeColumns).doesNotContain("No.", "MID", "SOFTWARE TITLE");
    }

    @Test
    void manualTrackerReimportAddsNewDeliverablesAndRetiresRemovedColumnsWithoutRenamingExistingOnes() throws Exception {
        var admin = productAdminSession("ticket05-legacy-reimport");
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(TRACKER_CSV);

        mockMvc.perform(post("/api/sheets/import/TRACKER").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"sheetUrl":"https://docs.google.com/spreadsheets/d/tracker/edit","displayName":"Tracker"}
                    """))
            .andExpect(status().isOk());

        String reimportCsv = """
            NAME OF STUDENT,TEAM FORMATION,MEMBER#,ProbExploration,SRS,Refactored SRS,Final Manuscript
            ,,,,4/18/2026,9/19/2026,12/12/2026
            "TAGHOY, RON LUIGI F.",2526-sem2-it332-41,1,0,,,0
            """;
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(reimportCsv, reimportCsv);

        mockMvc.perform(post("/api/sheets/import/TRACKER").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"sheetUrl":"https://docs.google.com/spreadsheets/d/tracker/edit","displayName":"Tracker"}
                    """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("Preview the re-import")));

        var previewResult = mockMvc.perform(post("/api/sheets/preview/TRACKER").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sheetUrl\":\"https://docs.google.com/spreadsheets/d/tracker/edit\",\"displayName\":\"Tracker\"}"))
            .andExpect(status().isOk())
            .andReturn();
        JsonNode preview = objectMapper.readTree(previewResult.getResponse().getContentAsString());
        java.util.Map<String, String> resolutions = new java.util.LinkedHashMap<>();
        for (JsonNode change : preview.path("changes")) {
            for (JsonNode field : change.path("fields")) {
                if (field.path("conflict").asBoolean()) resolutions.put(field.path("key").asText(), "SOURCE");
            }
        }
        mockMvc.perform(post("/api/sheets/apply/TRACKER").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of(
                    "previewId", preview.path("previewId").asText(),
                    "resolutions", resolutions
                ))))
            .andExpect(status().isOk());

        var columns = trackerColumnRepository.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(
            java.util.UUID.fromString("11111111-1111-1111-1111-111111111111"));
        assertThat(columns.stream().filter(column -> column.getColumnKey().equals("SDD")).findFirst())
            .isPresent()
            .get()
            .extracting(column -> column.getActive())
            .isEqualTo(false);
        assertThat(columns.stream().filter(column -> Boolean.TRUE.equals(column.getActive())).map(column -> column.getColumnKey()).toList())
            .contains("SRS", "Refactored SRS", "Final Manuscript")
            .doesNotContain("SDD");
    }

    @Test
    void ignoresUnknownTrackerHeadersWithoutDeadlineEvidence() throws Exception {
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn("""
            NAME OF STUDENT,TEAM FORMATION,MEMBER#,SRS,Coordinator Note,Future Deliverable
            ,,,4/18/2026,,10/1/2026
            "TAGHOY, RON LUIGI F.",2526-sem2-it332-41,1,0,Needs verification,0
            """);

        mockMvc.perform(post("/api/sheets/import/TRACKER").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"sheetUrl":"https://docs.google.com/spreadsheets/d/tracker/edit","displayName":"Tracker"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.columnsFound").value(2))
            .andExpect(jsonPath("$.deadlineSuggestions", hasSize(2)))
            .andExpect(jsonPath("$.warnings[0]").value(org.hamcrest.Matchers.containsString("Coordinator Note")));

        var activeColumns = trackerColumnRepository.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(
                java.util.UUID.fromString("11111111-1111-1111-1111-111111111111"))
            .stream()
            .filter(column -> Boolean.TRUE.equals(column.getActive()))
            .map(column -> column.getColumnKey())
            .toList();
        assertThat(activeColumns).containsExactly("SRS", "Future Deliverable");
    }

    @Test
    void returnsReadableBadRequestWhenGoogleSheetsReturnsUnauthorized() throws Exception {
        when(sheetCsvClient.fetchCsv(anyString())).thenThrow(
            new IllegalArgumentException("Google Sheet returned 401 Unauthorized. Ensure the sheet is published to the web (File > Share > Publish to web) or shared with public view access.")
        );

        mockMvc.perform(post("/api/sheets/import/TEAM_FORMATION").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sheetUrl": "https://docs.google.com/spreadsheets/d/private-sheet/edit",
                      "displayName": "Team Formation"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Google Sheet returned 401 Unauthorized. Ensure the sheet is published to the web (File > Share > Publish to web) or shared with public view access."));
    }

    @Test
    void previewsLocalConflictWithoutMutationAndAppliesExplicitLocalResolution() throws Exception {
        var admin = productAdminSession("ticket05-conflict");
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(TEAM_FORMATION_CSV);
        importTeamFormation();
        var workspaceId = java.util.UUID.fromString("11111111-1111-1111-1111-111111111111");
        var ron = studentRecordRepository.findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "20-0649-750").orElseThrow();
        ron.updateFrom(
            ron.getStudentNumber(),
            "LOCAL, RON",
            ron.getTeamCode(),
            ron.getMemberNumber(),
            ron.getSectionName(),
            ron.getAdviserName(),
            ron.getInstitutionalEmail(),
            ron.getSourceRowNumber()
        );
        studentRecordRepository.saveAndFlush(ron);
        long importRunsBeforePreview = sheetImportRunRepository.count();
        var updatedBeforePreview = studentRecordRepository
            .findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "20-0649-750").orElseThrow().getUpdatedAt();

        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(TEAM_FORMATION_CSV, TEAM_FORMATION_CSV, TEAM_FORMATION_CSV);
        var previewResult = mockMvc.perform(post("/api/sheets/preview/TEAM_FORMATION").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"sheetUrl":"https://docs.google.com/spreadsheets/d/team-formation/edit","displayName":"Team Formation"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.changedRows").value(1))
            .andExpect(jsonPath("$.changes[0].fields[?(@.field == 'studentName')].conflict").value(true))
            .andReturn();

        var afterPreview = studentRecordRepository.findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "20-0649-750").orElseThrow();
        assertThat(afterPreview.getStudentName()).isEqualTo("LOCAL, RON");
        assertThat(afterPreview.getUpdatedAt()).isEqualTo(updatedBeforePreview);
        assertThat(sheetImportRunRepository.count()).isEqualTo(importRunsBeforePreview);

        JsonNode preview = objectMapper.readTree(previewResult.getResponse().getContentAsString());
        String previewId = preview.path("previewId").asText();
        String studentNameConflictKey = null;
        for (JsonNode change : preview.path("changes")) {
            for (JsonNode field : change.path("fields")) {
                if ("studentName".equals(field.path("field").asText())) studentNameConflictKey = field.path("key").asText();
            }
        }
        assertThat(studentNameConflictKey).isNotBlank();

        mockMvc.perform(post("/api/sheets/apply/TEAM_FORMATION").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of(
                    "previewId", previewId,
                    "resolutions", java.util.Map.of()
                ))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("Choose Source or Local")));
        assertThat(studentRecordRepository.findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "20-0649-750").orElseThrow().getStudentName())
            .isEqualTo("LOCAL, RON");

        mockMvc.perform(post("/api/sheets/apply/TEAM_FORMATION").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of(
                    "previewId", previewId,
                    "resolutions", java.util.Map.of(studentNameConflictKey, "LOCAL")
                ))))
            .andExpect(status().isOk());

        assertThat(studentRecordRepository.findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "20-0649-750").orElseThrow().getStudentName())
            .isEqualTo("LOCAL, RON");

        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(TEAM_FORMATION_CSV, TEAM_FORMATION_CSV);
        var sourcePreviewResult = mockMvc.perform(post("/api/sheets/preview/TEAM_FORMATION").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sheetUrl\":\"https://docs.google.com/spreadsheets/d/team-formation/edit\"}"))
            .andExpect(status().isOk())
            .andReturn();
        JsonNode sourcePreview = objectMapper.readTree(sourcePreviewResult.getResponse().getContentAsString());
        String sourcePreviewId = sourcePreview.path("previewId").asText();
        String sourceConflictKey = null;
        for (JsonNode change : sourcePreview.path("changes")) {
            for (JsonNode field : change.path("fields")) {
                if ("studentName".equals(field.path("field").asText())) sourceConflictKey = field.path("key").asText();
            }
        }
        mockMvc.perform(post("/api/sheets/apply/TEAM_FORMATION").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(java.util.Map.of(
                    "previewId", sourcePreviewId,
                    "resolutions", java.util.Map.of(sourceConflictKey, "SOURCE")
                ))))
            .andExpect(status().isOk());
        assertThat(studentRecordRepository.findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "20-0649-750").orElseThrow().getStudentName())
            .isEqualTo("TAGHOY, RON LUIGI F.");
    }

    @Test
    void rejectsApplyWhenSheetContentChangedAfterPreview() throws Exception {
        var admin = productAdminSession("ticket05-source-stale");
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(TEAM_FORMATION_CSV, TEAM_FORMATION_CSV.replace("TAGHOY, RON LUIGI F.", "TAGHOY, CHANGED SOURCE"));
        var previewResult = mockMvc.perform(post("/api/sheets/preview/TEAM_FORMATION").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sheetUrl\":\"https://docs.google.com/spreadsheets/d/team-formation/edit\"}"))
            .andExpect(status().isOk())
            .andReturn();
        String previewId = objectMapper.readTree(previewResult.getResponse().getContentAsString()).path("previewId").asText();
        long runsBefore = sheetImportRunRepository.count();

        mockMvc.perform(post("/api/sheets/apply/TEAM_FORMATION").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"previewId\":\"%s\",\"resolutions\":{}}".formatted(previewId)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("Sheet changed after this preview")));
        assertThat(sheetImportRunRepository.count()).isEqualTo(runsBefore);
    }

    @Test
    void rejectsApplyWhenAcademicDataChangedAfterPreview() throws Exception {
        var admin = productAdminSession("ticket05-stale");
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(TEAM_FORMATION_CSV);
        importTeamFormation();
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(TEAM_FORMATION_CSV, TEAM_FORMATION_CSV);
        var previewResult = mockMvc.perform(post("/api/sheets/preview/TEAM_FORMATION").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sheetUrl\":\"https://docs.google.com/spreadsheets/d/team-formation/edit\"}"))
            .andExpect(status().isOk())
            .andReturn();
        String previewId = objectMapper.readTree(previewResult.getResponse().getContentAsString()).path("previewId").asText();

        var workspaceId = java.util.UUID.fromString("11111111-1111-1111-1111-111111111111");
        var ron = studentRecordRepository.findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "20-0649-750").orElseThrow();
        ron.updateFrom(ron.getStudentNumber(), "CONCURRENT LOCAL EDIT", ron.getTeamCode(), ron.getMemberNumber(), ron.getSectionName(), ron.getAdviserName(), ron.getInstitutionalEmail(), ron.getSourceRowNumber());
        studentRecordRepository.saveAndFlush(ron);

        mockMvc.perform(post("/api/sheets/apply/TEAM_FORMATION").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"previewId\":\"%s\",\"resolutions\":{}}".formatted(previewId)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("changed after this preview")));
        assertThat(studentRecordRepository.findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "20-0649-750").orElseThrow().getStudentName())
            .isEqualTo("CONCURRENT LOCAL EDIT");
    }

    @Test
    void reorderedTrackerHeadersProduceNoBogusDiffAndRepeatPreviewRemainsClean() throws Exception {
        var admin = productAdminSession("ticket05-reordered");
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(TRACKER_CSV);
        mockMvc.perform(post("/api/sheets/import/TRACKER").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sheetUrl\":\"https://docs.google.com/spreadsheets/d/tracker/edit\",\"displayName\":\"Tracker\"}"))
            .andExpect(status().isOk());

        String reordered = """
            TEAM FORMATION,SDD,NAME OF STUDENT,MEMBER#,SRS,ProbExploration
            ,4/25/2026 23:59:59,,,4/18/2026 23:59:59,2/14/2026 23:59:59
            2526-sem2-it332-41,21,"TAGHOY, RON LUIGI F.",1,,0
            2526-sem2-it332-07,51,"BARANGAN, MARK LORENZ L.",5,51,1
            """;
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(reordered, reordered, reordered);
        var previewResult = mockMvc.perform(post("/api/sheets/preview/TRACKER").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sheetUrl\":\"https://docs.google.com/spreadsheets/d/tracker/edit\",\"displayName\":\"Tracker\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.addedRows").value(0))
            .andExpect(jsonPath("$.changedRows").value(0))
            .andExpect(jsonPath("$.missingRows").value(0))
            .andReturn();
        String previewId = objectMapper.readTree(previewResult.getResponse().getContentAsString()).path("previewId").asText();
        mockMvc.perform(post("/api/sheets/apply/TRACKER").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"previewId\":\"%s\",\"resolutions\":{}}".formatted(previewId)))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/sheets/preview/TRACKER").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sheetUrl\":\"https://docs.google.com/spreadsheets/d/tracker/edit\",\"displayName\":\"Tracker\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.addedRows").value(0))
            .andExpect(jsonPath("$.changedRows").value(0))
            .andExpect(jsonPath("$.missingRows").value(0));
    }

    @Test
    void previewRejectsMalformedOrFailedSourceWithoutMutatingAcademicData() throws Exception {
        var admin = productAdminSession("ticket05-malformed");
        long sourceCount = workspaceSourceRepository.count();
        long studentCount = studentRecordRepository.count();
        long importRunCount = sheetImportRunRepository.count();
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn("Only one row");
        mockMvc.perform(post("/api/sheets/preview/TEAM_FORMATION").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sheetUrl\":\"https://docs.google.com/spreadsheets/d/malformed/edit\"}"))
            .andExpect(status().isBadRequest());
        assertThat(workspaceSourceRepository.count()).isEqualTo(sourceCount);
        assertThat(studentRecordRepository.count()).isEqualTo(studentCount);
        assertThat(sheetImportRunRepository.count()).isEqualTo(importRunCount);

        when(sheetCsvClient.fetchCsv(anyString())).thenThrow(new IllegalArgumentException("Sheet fetch failed before all source data was available."));
        mockMvc.perform(post("/api/sheets/preview/TEAM_FORMATION").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sheetUrl\":\"https://docs.google.com/spreadsheets/d/unavailable/edit\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("fetch failed")));
        assertThat(workspaceSourceRepository.count()).isEqualTo(sourceCount);
        assertThat(studentRecordRepository.count()).isEqualTo(studentCount);
        assertThat(sheetImportRunRepository.count()).isEqualTo(importRunCount);
    }

    @Test
    void trackerPreviewKeepsOriginalAndRefactoredHeadersDistinctAndIgnoresUnknownMetadata() throws Exception {
        var admin = productAdminSession("ticket05-headers");
        String tracker = """
            NAME OF STUDENT,TEAM FORMATION,MEMBER#,SRS,Refactored SRS,Coordinator Note
            ,,,9/19/2026,9/26/2026,
            "TAGHOY, RON LUIGI F.",2627-sem1-it411-41,1,0,0,Do not import me
            """;
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn(tracker, tracker);
        var previewResult = mockMvc.perform(post("/api/sheets/preview/TRACKER").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sheetUrl\":\"https://docs.google.com/spreadsheets/d/current/edit\",\"displayName\":\"Tracker\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.warnings[0]").value(org.hamcrest.Matchers.containsString("Coordinator Note")))
            .andReturn();
        String previewId = objectMapper.readTree(previewResult.getResponse().getContentAsString()).path("previewId").asText();
        mockMvc.perform(post("/api/sheets/apply/TRACKER").with(admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"previewId\":\"%s\",\"resolutions\":{}}".formatted(previewId)))
            .andExpect(status().isOk());

        var active = trackerColumnRepository.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(
                java.util.UUID.fromString("11111111-1111-1111-1111-111111111111"))
            .stream().filter(column -> Boolean.TRUE.equals(column.getActive())).map(column -> column.getColumnKey()).toList();
        assertThat(active).containsExactly("SRS", "Refactored SRS").doesNotContain("Coordinator Note");
    }

    private RequestPostProcessor productAdminSession(String subject) {
        String email = subject + "@example.test";
        var now = java.time.Instant.now();
        staffRoles.saveAndFlush(new StaffRoleAssignment(
            java.util.UUID.randomUUID(), subject, email, StaffRole.ADMIN, true, now, now));
        var session = sessions.create(new GoogleIdentity(subject, email, subject, ""));
        var authentication = new TestingAuthenticationToken(
            "wildtrack-test-principal", "n/a", "ROLE_USER", "ROLE_ADMIN");
        var authenticated = SecurityMockMvcRequestPostProcessors.authentication(authentication);
        var csrf = SecurityMockMvcRequestPostProcessors.csrf();
        return request -> {
            var processed = csrf.postProcessRequest(request);
            processed = authenticated.postProcessRequest(processed);
            processed.setCookies(new Cookie("WILDTRACK_SESSION", session.rawToken()));
            return processed;
        };
    }

    private void importTeamFormation() throws Exception {
        mockMvc.perform(post("/api/sheets/import/TEAM_FORMATION").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sheetUrl": "https://docs.google.com/spreadsheets/d/team-formation/edit",
                      "displayName": "Team Formation"
                    }
                    """))
            .andExpect(status().isOk());
    }
}
