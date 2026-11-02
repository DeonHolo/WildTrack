import { Stack, Text } from '@mantine/core';
import { InfoTooltip } from '../InfoTooltip.jsx';

export const AI_REVIEW_VERIFICATION_EXPLANATION = 'Gemini judges each instruction. WildTrack looks for its supporting quotation in the submitted PDF text. Exact excerpts, separate excerpts and closest matching text have different labels. A close match shows the original PDF wording, which may differ from Gemini’s quotation. Diagram descriptions are labelled AI visual observations and need a visual check. Missing references stay in Review notes. Reference matching never changes Gemini’s assessment or proves it correct.';

export function AiReviewVerificationHelp() {
  return <InfoTooltip label={AI_REVIEW_VERIFICATION_EXPLANATION} ariaLabel="How WildTrack verifies AI evidence" />;
}

export function AiReviewHelp() {
  return <InfoTooltip ariaLabel="About AI Review" label={<Stack gap="xs">
    <Text size="sm"><strong>No issues:</strong> The AI did not identify concerns in the checked areas.</Text>
    <Text size="sm"><strong>Needs attention:</strong> The AI flagged a concern or left something for you to check.</Text>
    <Text size="sm">Review notes explain unmatched or missing supporting quotations. They do not establish a document problem.</Text>
    <Text size="sm">AI Review can make mistakes. Check important findings and cited PDF pages. It does not accept or grade submissions.</Text>
  </Stack>} />;
}
