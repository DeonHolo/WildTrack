import { Stack, Text } from '@mantine/core';
import { InfoTooltip } from '../InfoTooltip.jsx';

export const AI_REVIEW_VERIFICATION_EXPLANATION = 'Gemini judges each instruction and supplies a supporting quotation where available. WildTrack locates those words in the submitted PDF, allowing layout differences while preserving words, numbers and comparison signs. Separate passages stay separate. If matching text cannot be located, the supporting reference stays unconfirmed; Gemini’s assessment does not change. A located quotation does not prove the assessment is correct.';

export function AiReviewVerificationHelp() {
  return <InfoTooltip label={AI_REVIEW_VERIFICATION_EXPLANATION} ariaLabel="How WildTrack verifies AI evidence" />;
}

export function AiReviewHelp() {
  return <InfoTooltip ariaLabel="About AI Review" label={<Stack gap="xs">
    <Text size="sm"><strong>No issues:</strong> The AI did not identify concerns in the checked areas.</Text>
    <Text size="sm"><strong>Needs attention:</strong> The AI flagged a concern or left something for you to check.</Text>
    <Text size="sm">Review notes explain supporting text WildTrack could not confirm. They do not establish a document problem.</Text>
    <Text size="sm">AI Review can make mistakes. Check important findings and cited PDF pages. It does not accept or grade submissions.</Text>
  </Stack>} />;
}
