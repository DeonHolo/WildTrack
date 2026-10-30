import { ActionIcon, Stack, Text, Tooltip } from '@mantine/core';
import { Info } from '@phosphor-icons/react';

export const AI_REVIEW_VERIFICATION_EXPLANATION = 'Gemini judges each instruction and supplies a supporting quotation where available. WildTrack locates those words in the submitted PDF, allowing layout differences while preserving words, numbers and comparison signs. Separate passages stay separate. If matching text cannot be located, the supporting reference stays unconfirmed; Gemini’s assessment does not change. A located quotation does not prove the assessment is correct.';

export function AiReviewVerificationHelp() {
  return <Tooltip label={AI_REVIEW_VERIFICATION_EXPLANATION}
    multiline w={320} withArrow events={{ hover: true, focus: true, touch: true }}>
    <ActionIcon variant="subtle" size={24} radius="sm" color="gray" aria-label="How WildTrack verifies AI evidence">
      <Info size={16} aria-hidden="true" />
    </ActionIcon>
  </Tooltip>;
}

export function AiReviewHelp() {
  return <Tooltip label={<Stack gap="xs">
    <Text size="sm"><strong>No issues:</strong> The AI did not identify concerns in the checked areas.</Text>
    <Text size="sm"><strong>Needs attention:</strong> The AI flagged a concern or left something for you to check.</Text>
    <Text size="sm">Review notes explain supporting text WildTrack could not confirm. They do not establish a document problem.</Text>
    <Text size="sm">AI Review can make mistakes. Check important findings and cited PDF pages. It does not accept or grade submissions.</Text>
  </Stack>}
    multiline w={320} withArrow events={{ hover: true, focus: true, touch: true }}>
    <ActionIcon variant="subtle" size={24} radius="sm" color="gray" aria-label="About AI Review">
      <Info size={16} aria-hidden="true" />
    </ActionIcon>
  </Tooltip>;
}
