package com.capvault.backend.academic;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.workbook.WorkbookCodec;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/workbook")
public class WorkbookController {
    private final WorkbookImportService imports;
    private final WorkbookCodec codec;
    private final StudentAssociationSecurity security;
    public WorkbookController(WorkbookImportService imports, WorkbookCodec codec, StudentAssociationSecurity security) {
        this.imports = imports; this.codec = codec; this.security = security;
    }
    private String admin(HttpServletRequest request) {
        if (!security.isAdmin(request)) throw new AccessDeniedException("Admin authorization required.");
        return security.requireSession(request).googleSubject();
    }
    @GetMapping("/template")
    public ResponseEntity<byte[]> template(@RequestParam UUID workspaceId, HttpServletRequest request) {
        admin(request); imports.requireWorkspace(workspaceId);
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=wildtrack-workbook.xlsx")
            .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .body(codec.template());
    }
    @PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public WorkbookImportService.Preview preview(@RequestParam UUID workspaceId, @RequestParam("file") MultipartFile file, HttpServletRequest request) throws IOException {
        String actor = admin(request);
        if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024) throw new IllegalArgumentException("Choose a workbook no larger than 5 MiB.");
        return imports.preview(workspaceId, actor, file.getOriginalFilename(), file.getBytes());
    }
    public record ApplyRequest(UUID previewId, Map<String,String> resolutions) {}
    @PostMapping("/apply")
    public WorkbookImportService.Result apply(@RequestParam UUID workspaceId, @RequestBody ApplyRequest body, HttpServletRequest request) {
        return imports.apply(workspaceId, admin(request), body.previewId(), body.resolutions());
    }
}
