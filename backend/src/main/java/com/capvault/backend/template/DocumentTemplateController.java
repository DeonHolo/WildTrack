package com.capvault.backend.template;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/templates")
public class DocumentTemplateController {

    private final DocumentTemplateService service;

    public DocumentTemplateController(DocumentTemplateService service) {
        this.service = service;
    }

    @GetMapping
    public List<DocumentTemplateResponse> list(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId
    ) {
        return service.list(workspaceId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentTemplateResponse save(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        @RequestParam String deliverableKey,
        @RequestParam String displayName,
        @RequestParam MultipartFile file
    ) {
        return service.save(workspaceId, deliverableKey, displayName, file);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
        @PathVariable UUID id,
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId
    ) {
        service.delete(workspaceId, id);
    }
}
