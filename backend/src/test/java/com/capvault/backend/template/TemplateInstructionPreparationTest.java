package com.capvault.backend.template;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.IntStream;

import com.capvault.backend.aireview.AiReviewProvider;
import com.capvault.backend.template.TemplateInstructionProtocol.Applicability;
import com.capvault.backend.template.TemplateInstructionProtocol.Draft;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;

class TemplateInstructionPreparationTest {
    @Test void outputLimitSplitsTheActualPageGroupAndRetainsEveryPageBeforeReusingTheSavedList() throws Exception {
        var fixture = new Fixture(20);
        var groups = new ArrayList<List<Integer>>();
        when(fixture.provider.prepareInstructions(any())).thenAnswer(call -> {
            TemplateInstructionGateway.Input input = call.getArgument(0);
            groups.add(List.of(input.firstPage(), input.lastPage()));
            if (groups.size() == 1) throw new TemplateInstructionGateway.OutputLimit();
            return drafts(input);
        });

        var result = fixture.prepare(null);
        assertThat(groups).containsExactly(List.of(1, 16), List.of(1, 8), List.of(9, 16), List.of(17, 20));
        assertThat(result.instructions()).hasSize(20);
        assertThat(result.instructions()).extracting(TemplateInstructionPreparation.Instruction::id)
            .containsExactlyElementsOf(IntStream.rangeClosed(1, 20).mapToObj(i -> "T" + i).toList());
        assertThat(fixture.state.get().state()).isEqualTo("READY");
        assertThat(fixture.requests).hasValue(4);
        assertThat(fixture.prepare(null)).isEqualTo(result);
        assertThat(groups).hasSize(4);
    }

    @Test void ambiguousRequestIsNotReplayedAndConfirmedRetryResumesAfterTheCompletedPages() throws Exception {
        var fixture = new Fixture(20);
        var groups = new ArrayList<List<Integer>>();
        when(fixture.provider.prepareInstructions(any())).thenAnswer(call -> {
            TemplateInstructionGateway.Input input = call.getArgument(0);
            groups.add(List.of(input.firstPage(), input.lastPage()));
            if (groups.size() == 2) throw new IllegalStateException("Provider timeout after dispatch");
            return drafts(input);
        });

        assertThatThrownBy(() -> fixture.prepare(null)).hasMessage("Provider timeout after dispatch");
        assertThat(fixture.state.get().state()).isEqualTo("FAILED");
        assertThat(fixture.state.get().completedPage()).isEqualTo(16);
        UUID retryToken = fixture.state.get().token();
        assertThatThrownBy(() -> fixture.prepare(null)).isInstanceOf(TemplateInstructionPreparation.Failure.class)
            .hasMessageContaining("TEMPLATE_PREPARATION_FAILED");
        assertThat(groups).hasSize(2);

        var result = fixture.prepare(retryToken);
        assertThat(groups).containsExactly(List.of(1, 16), List.of(17, 20), List.of(17, 20));
        assertThat(result.instructions()).hasSize(20);
        assertThat(fixture.state.get().state()).isEqualTo("READY");
        assertThat(fixture.requests).hasValue(3);
    }

    @Test void revokedAccessStopsBeforeAnotherPaidGroupAndKeepsCompletedWork() throws Exception {
        var fixture = new Fixture(20);
        var authorised = new java.util.concurrent.atomic.AtomicBoolean(true);
        when(fixture.provider.prepareInstructions(any())).thenAnswer(call -> {
            authorised.set(false);
            return drafts(call.getArgument(0));
        });
        assertThatThrownBy(() -> fixture.preparation.prepare(fixture.workspace, fixture.template, fixture.hash, null, () -> {
            if (!authorised.get()) throw new IllegalStateException("Administrator access changed.");
        })).hasMessage("Administrator access changed.");
        assertThat(fixture.requests).hasValue(1);
        assertThat(fixture.state.get().completedPage()).isEqualTo(16);
        assertThat(fixture.state.get().state()).isEqualTo("FAILED");
    }

    @Test void aShortFinalPageGroupSplitsItsActualSpanInsteadOfRepeatingTheSameFivePages() throws Exception {
        var fixture = new Fixture(5);
        var groups = new ArrayList<List<Integer>>();
        when(fixture.provider.prepareInstructions(any())).thenAnswer(call -> {
            TemplateInstructionGateway.Input input = call.getArgument(0);
            groups.add(List.of(input.firstPage(), input.lastPage()));
            if (groups.size() == 1) throw new TemplateInstructionGateway.OutputLimit();
            return drafts(input);
        });
        assertThat(fixture.prepare(null).instructions()).hasSize(5);
        assertThat(groups).containsExactly(List.of(1, 5), List.of(1, 2), List.of(3, 4), List.of(5, 5));
        assertThat(fixture.requests).hasValue(4);
    }

    @Test void anActualSinglePageLimitFailsWithoutPayingForTheIdenticalPageAgain() throws Exception {
        var fixture = new Fixture(1);
        var calls = new AtomicInteger();
        when(fixture.provider.prepareInstructions(any())).thenAnswer(call -> {
            calls.incrementAndGet();
            throw new TemplateInstructionGateway.OutputLimit();
        });
        assertThatThrownBy(() -> fixture.prepare(null)).isInstanceOf(TemplateInstructionPreparation.Failure.class)
            .hasMessageContaining("TEMPLATE_INSTRUCTION_PAGE_TOO_LARGE");
        assertThat(calls).hasValue(1);
        assertThat(fixture.state.get().state()).isEqualTo("FAILED");
        assertThat(fixture.state.get().completedPage()).isZero();
    }

    private static List<Draft> drafts(TemplateInstructionGateway.Input input) {
        return IntStream.rangeClosed(input.firstPage(), input.lastPage()).mapToObj(page ->
            new Draft("Requirement " + page, "Describe requirement " + page + ".", "Describe requirement " + page + ".",
                "Section " + page, page, Applicability.REQUIRED, "")).toList();
    }

    private static final class Fixture {
        final UUID workspace = UUID.randomUUID(), template = UUID.randomUUID(), version = UUID.randomUUID();
        final String hash = "a".repeat(64);
        final TemplatePdfStore pdfs = mock(TemplatePdfStore.class);
        final TemplateInstructionStore store = mock(TemplateInstructionStore.class);
        final AiReviewProvider provider = mock(AiReviewProvider.class);
        final AtomicReference<TemplateInstructionStore.State> state = new AtomicReference<>();
        final AtomicInteger requests = new AtomicInteger();
        final TemplateInstructionPreparation preparation = new TemplateInstructionPreparation(pdfs, store, provider);

        Fixture(int pages) throws Exception {
            byte[] bytes;
            try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
                for (int i = 0; i < pages; i++) document.addPage(new PDPage());
                document.save(output);
                bytes = output.toByteArray();
            }
            when(pdfs.current(workspace, template)).thenReturn(new TemplatePdfStore.Status(version, template, hash,
                "official.pdf", "READY", pages, null, true));
            when(pdfs.readPdf(workspace, template, version)).thenReturn(new TemplatePdfStore.Pdf(bytes, hash, "official.pdf"));
            when(provider.isConfigured()).thenReturn(true);
            when(provider.supportsTemplateInstructions()).thenReturn(true);
            when(provider.cacheVersion()).thenReturn("preparation-test-v1");
            when(store.find(version)).thenAnswer(call -> Optional.ofNullable(state.get()));
            when(store.claim(eq(version), eq("preparation-test-v1"), any())).thenAnswer(call -> {
                var old = state.get();
                UUID retry = call.getArgument(2);
                if (old != null && !("FAILED".equals(old.state()) && old.token().equals(retry))) return Optional.empty();
                var next = new TemplateInstructionStore.State(version, "PROCESSING", UUID.randomUUID(),
                    old == null ? 0 : old.completedPage(), old == null ? List.of() : old.items(), requests.get(), null);
                state.set(next);
                return Optional.of(next);
            });
            when(store.startRequest(any())).thenAnswer(call -> { requests.incrementAndGet(); return true; });
            when(store.checkpoint(any(), anyInt(), anyList(), anyBoolean())).thenAnswer(call -> {
                TemplateInstructionStore.State previous = call.getArgument(0);
                state.set(new TemplateInstructionStore.State(version, call.getArgument(3) ? "READY" : "PROCESSING",
                    previous.token(), call.getArgument(1), List.copyOf(call.getArgument(2)), requests.get(), null));
                return true;
            });
            doAnswer(call -> {
                var previous = state.get();
                state.set(new TemplateInstructionStore.State(version, "FAILED", previous.token(), previous.completedPage(),
                    previous.items(), requests.get(), call.getArgument(1)));
                return null;
            }).when(store).fail(any(), any());
        }
        TemplateInstructionPreparation.Prepared prepare(UUID retry) { return preparation.prepare(workspace, template, hash, retry); }
    }
}
