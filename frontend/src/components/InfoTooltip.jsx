import { ActionIcon, Tooltip } from '@mantine/core';
import { Info } from '@phosphor-icons/react';

export function InfoTooltip({ label, ariaLabel }) {
  return (
    <Tooltip label={label} multiline w={320} withArrow events={{ hover: true, focus: true, touch: true }}>
      <ActionIcon type="button" variant="subtle" size={24} radius="sm" color="gray" aria-label={ariaLabel}>
        <Info size={16} aria-hidden="true" />
      </ActionIcon>
    </Tooltip>
  );
}
