package com.capvault.backend.template;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class TemplateChecklistPreparationTest {
    @Test void failedProviderOutcomeIsRecordedAndNeverAutomaticallyRequeued() {
        var store=mock(TemplateChecklistStore.class);
        var preparation=mock(TemplateInstructionPreparation.class);
        UUID version=UUID.randomUUID(), claim=UUID.randomUUID(), workspace=UUID.randomUUID(), template=UUID.randomUUID(), retry=UUID.randomUUID();
        var job=new TemplateChecklistStore.Job(version,claim,workspace,template,"source",retry);
        when(store.claim()).thenReturn(Optional.of(job),Optional.empty());
        when(preparation.prepare(eq(workspace),eq(template),eq("source"),eq(retry),any())).thenThrow(new TemplateInstructionPreparation.Failure("OUTCOME_UNKNOWN"));
        var worker=new TemplateChecklistPreparation(store,preparation,false);
        assertThat(worker.prepareNext()).isTrue();
        assertThat(worker.prepareNext()).isFalse();
        verify(store).fail(job,"OUTCOME_UNKNOWN");
        verify(preparation,times(1)).prepare(eq(workspace),eq(template),eq("source"),eq(retry),any());
        verify(store,never()).finish(any(),any());
    }
    @Test void successfulGenerationWritesDraftItems() {
        var store=mock(TemplateChecklistStore.class);
        var preparation=mock(TemplateInstructionPreparation.class);
        UUID version=UUID.randomUUID(), claim=UUID.randomUUID(), workspace=UUID.randomUUID(), template=UUID.randomUUID();
        var job=new TemplateChecklistStore.Job(version,claim,workspace,template,"source",null);
        var draft=new TemplateInstructionProtocol.Draft("Title","Instruction","Quote","",1,TemplateInstructionProtocol.Applicability.REQUIRED,"");
        when(store.claim()).thenReturn(Optional.of(job));
        when(preparation.prepare(eq(workspace),eq(template),eq("source"),isNull(),any())).thenReturn(new TemplateInstructionPreparation.Prepared(version,"pdf",new byte[0],List.of(new TemplateInstructionPreparation.Instruction("T1",draft))));
        assertThat(new TemplateChecklistPreparation(store,preparation,false).prepareNext()).isTrue();
        verify(store).finish(job,List.of(draft));
    }
}
