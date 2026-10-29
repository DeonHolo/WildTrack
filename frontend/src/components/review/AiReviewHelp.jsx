import { ActionIcon, Tooltip } from '@mantine/core';
import { Info } from '@phosphor-icons/react';

export function AiReviewHelp() {
  return <Tooltip label="AI Review can miss issues or misread a document. Check important findings and cited PDF pages before making your review decision. AI Review does not accept or grade submissions."
    multiline w={320} withArrow events={{ hover: true, focus: true, touch: true }}>
    <ActionIcon variant="subtle" size={24} radius="sm" color="gray" aria-label="About AI Review">
      <Info size={16} aria-hidden="true" />
    </ActionIcon>
  </Tooltip>;
}
