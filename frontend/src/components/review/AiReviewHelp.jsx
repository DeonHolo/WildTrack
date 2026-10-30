import { ActionIcon, Tooltip } from '@mantine/core';
import { Info } from '@phosphor-icons/react';

export const AI_REVIEW_VERIFICATION_EXPLANATION = 'Gemini supplies a quotation from the submitted PDF to support its assessment. WildTrack looks for those words in the text extracted from that PDF, allowing differences in spacing, punctuation and capitalization. If it cannot locate the quotation, the observation stays unverified. A match confirms the quotation exists; it does not prove the assessment is correct.';

export function AiReviewVerificationHelp() {
  return <Tooltip label={AI_REVIEW_VERIFICATION_EXPLANATION}
    multiline w={320} withArrow events={{ hover: true, focus: true, touch: true }}>
    <ActionIcon variant="subtle" size={24} radius="sm" color="gray" aria-label="How WildTrack verifies AI evidence">
      <Info size={16} aria-hidden="true" />
    </ActionIcon>
  </Tooltip>;
}

export function AiReviewHelp() {
  return <Tooltip label="AI Review can miss issues or misread a document. Check important findings and cited PDF pages before making your review decision. AI Review does not accept or grade submissions."
    multiline w={320} withArrow events={{ hover: true, focus: true, touch: true }}>
    <ActionIcon variant="subtle" size={24} radius="sm" color="gray" aria-label="About AI Review">
      <Info size={16} aria-hidden="true" />
    </ActionIcon>
  </Tooltip>;
}
