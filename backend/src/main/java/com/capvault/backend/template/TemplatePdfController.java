package com.capvault.backend.template;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/templates/{id}")
public class TemplatePdfController {
    private final TemplatePdfStore store;

    public TemplatePdfController(TemplatePdfStore store) {
        this.store = store;
    }

    @GetMapping("/pdf-state")
    public TemplatePdfStore.Status state(@PathVariable UUID id, @RequestParam UUID workspaceId) {
        return store.current(workspaceId, id);
    }

    @GetMapping("/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable UUID id, @RequestParam UUID workspaceId,
                                     @RequestParam UUID versionId) {
        var pdf = store.readPdf(workspaceId, id, versionId);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
            .cacheControl(CacheControl.noStore())
            .header("X-Frame-Options", "SAMEORIGIN")
            .header("Content-Security-Policy", "frame-ancestors 'self'")
            .header(HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.inline().filename(pdf.filename(), StandardCharsets.UTF_8).build().toString())
            .body(pdf.bytes());
    }

    @PostMapping("/pdf/retry")
    public TemplatePdfStore.Status retry(@PathVariable UUID id, @RequestParam UUID workspaceId,
                                       @RequestParam UUID versionId) {
        if (!store.retry(workspaceId, id, versionId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Only the current failed PDF template can be retried. Upload a PDF to replace an older non-PDF template.");
        }
        return store.current(workspaceId, id);
    }
}
