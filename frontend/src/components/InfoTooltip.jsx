import { ActionIcon, Tooltip } from '@mantine/core';
import { Info } from '@phosphor-icons/react';

export function InfoTooltip({ label, ariaLabel, size = 24 }) {
  return (
    <Tooltip label={label} multiline w={320} withArrow events={{ hover: true, focus: true, touch: true }}
      styles={{ tooltip: { maxWidth: 'calc(100vw - 24px)' } }}>
      <ActionIcon type="button" variant="subtle" size={size} radius="sm" color="gray" aria-label={ariaLabel}>
        <Info size={16} aria-hidden="true" />
      </ActionIcon>
    </Tooltip>
  );
}
