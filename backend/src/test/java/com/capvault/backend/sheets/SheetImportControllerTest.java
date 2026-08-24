package com.capvault.backend.sheets;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.capvault.backend.project.ProjectMetadataRepository;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.tracker.TrackerCellRepository;
import com.capvault.backend.tracker.TrackerColumnRepository;
import com.capvault.backend.tracker.TrackerRowRepository;
import com.capvault.backend.tracker.TrackerWritebackRepository;
import com.capvault.backend.workspace.WorkspaceSourceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

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

        mockMvc.perform(post("/api/sheets/import/TEAM_FORMATION").with(csrf())
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

        mockMvc.perform(get("/api/students"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.studentNumber == '20-0649-750')]").exists())
            .andExpect(jsonPath("$[?(@.institutionalEmail == 'ron.luigi@cit.edu')]").exists());
    }

    @Test
    void appliesSavedColumnMappingsForUnusualTeamFormationHeaders() throws Exception {
        when(sheetCsvClient.fetchCsv(anyString())).thenReturn("""
            Imported roster
            School Key,Learner,Group Key,Seat
            24-0001-111,"DOE, JANE A.",2526-sem2-it332-99,2
            """);

        mockMvc.perform(post("/api/sheets/import/TEAM_FORMATION").with(csrf())
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

        mockMvc.perform(get("/api/students"))
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

        mockMvc.perform(post("/api/sheets/import/TRACKER").with(csrf())
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

        mockMvc.perform(get("/api/tracker/rows"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.studentNumber == '20-0649-750')]").exists())
            .andExpect(jsonPath("$[?(@.studentName == 'TAGHOY, RON LUIGI F.')]").exists());

        mockMvc.perform(post("/api/tracker/writebacks").with(csrf())
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

        mockMvc.perform(post("/api/sheets/import/PROJECT_MONITOR").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sheetUrl": "https://docs.google.com/spreadsheets/d/project-monitor/edit",
                      "displayName": "SoftwareProjectMonitoring"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.groupsFound").value(1));

        mockMvc.perform(get("/api/projects"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].groupCode").value("2526-sem2-it332-41"))
            .andExpect(jsonPath("$[0].projectTitle").value("CapVault"))
            .andExpect(jsonPath("$[0].adviserName").value("Sir Ralph Laviste"));
    }

    private void importTeamFormation() throws Exception {
        mockMvc.perform(post("/api/sheets/import/TEAM_FORMATION").with(csrf())
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


