package com.capvault.backend.workspace;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.capvault.backend.sheets.SheetImportRunRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WorkspaceSourceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private WorkspaceSourceRepository repository;

    @Autowired
    private SheetImportRunRepository sheetImportRunRepository;

    @Test
    void upsertSourceStoresGoogleSheetMetadata() throws Exception {
        sheetImportRunRepository.deleteAll();
        repository.deleteAll();

        mockMvc.perform(put("/api/workspace/sources/TEAM_FORMATION").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sheetUrl": "https://docs.google.com/spreadsheets/d/1zret-lQpRtezO1v4fBPNyqw5nenhEIXV2BQXu2raGFk/edit?gid=1639014359",
                      "displayName": "Team Formation",
                      "status": "IMPORTED"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sourceType").value("TEAM_FORMATION"))
            .andExpect(jsonPath("$.sheetId").value("1zret-lQpRtezO1v4fBPNyqw5nenhEIXV2BQXu2raGFk"))
            .andExpect(jsonPath("$.displayName").value("Team Formation"))
            .andExpect(jsonPath("$.status").value("IMPORTED"));

        mockMvc.perform(get("/api/workspace/sources"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].sourceType").value("TEAM_FORMATION"));
    }

    @Test
    void upsertSourceRejectsBlankUrl() throws Exception {
        mockMvc.perform(put("/api/workspace/sources/TRACKER").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sheetUrl": ""
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fieldErrors.sheetUrl").value("Sheet URL is required"));
    }
}


