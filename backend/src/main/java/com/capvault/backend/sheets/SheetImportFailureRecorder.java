package com.capvault.backend.sheets;

import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.WorkspaceSource;
import com.capvault.backend.workspace.WorkspaceSourceRepository;
import com.capvault.backend.workspace.WorkspaceSourceStatus;
import com.capvault.backend.workspace.WorkspaceSourceType;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SheetImportFailureRecorder {
    private final WorkspaceSourceRepository sources;
    private final SheetImportRunRepository runs;
    private final EntityManager em;
    private final ObjectMapper json;

    public SheetImportFailureRecorder(WorkspaceSourceRepository sources, SheetImportRunRepository runs,
                                     EntityManager em, ObjectMapper json) {
        this.sources = sources; this.runs = runs; this.em = em; this.json = json;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID workspace, WorkspaceSourceType type, String url, String sheetId,
                       String displayName, String message) {
        // Resolve only committed rows, after the failed import's academic changes have rolled back.
        if (em.find(AcademicWorkspace.class, workspace, LockModeType.PESSIMISTIC_WRITE) == null) return;
        WorkspaceSource source = sources.findByWorkspaceIdAndSourceType(workspace, type).orElseGet(() ->
            new WorkspaceSource(workspace, type, url, sheetId, displayName, WorkspaceSourceStatus.ERROR,
                LocalDateTime.now()));
        // A newer successful import must not be downgraded by delayed failure bookkeeping.
        if (source.getLastImportedAt() == null) source.setStatus(WorkspaceSourceStatus.ERROR);
        source = sources.saveAndFlush(source);
        SheetImportRun run = new SheetImportRun(workspace, type, source);
        String detail = message == null ? "Sheet import failed." : message;
        try { run.complete(SheetImportStatus.ERROR, 0, 0, detail, json.writeValueAsString(Map.of("error", detail))); }
        catch (com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException(e); }
        runs.saveAndFlush(run);
    }
}
