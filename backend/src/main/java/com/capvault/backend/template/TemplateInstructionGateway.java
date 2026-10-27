package com.capvault.backend.template;

import java.util.List;
import java.util.UUID;

/** No implicit generation retries: the caller checkpoints each paid page group. */
public interface TemplateInstructionGateway {
    default boolean supportsTemplateInstructions() { return false; }
    default List<TemplateInstructionProtocol.Draft> prepareInstructions(Input input) {
        throw new UnsupportedOperationException("Template instruction preparation is unavailable.");
    }
    record Input(UUID versionId, byte[] pdf, String pdfSha256, List<String> pageTexts,
                 int firstPage, int lastPage) { }
    class OutputLimit extends RuntimeException {
        public OutputLimit() { super("The completed provider response needs a smaller template page group."); }
    }
}
