import { Alert, Button, Group, Progress, Stack, Text } from '@mantine/core';

export function AiBatchSelectionSummary({ summary, detail }) {
  return <div aria-live="polite"><Text fw={700} size="lg">{summary}</Text><Text size="sm">{detail}</Text></div>;
}

export function AiBatchActions({ onCancel, onConfirm, busy, disabled, confirmLabel, cancelLabel = 'Close' }) {
  return <Group justify="flex-end" gap="sm">
    <Button variant="default" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
    <Button loading={busy} disabled={disabled} onClick={onConfirm}>{confirmLabel}</Button>
  </Group>;
}

export function AiBatchProgress({ title, color, summary, value, animated, message, children, actions, onDismiss, closeButtonLabel }) {
  return <Alert role="status" color={color} title={title} withCloseButton={Boolean(onDismiss)} onClose={onDismiss} closeButtonLabel={closeButtonLabel}>
    <Stack gap="sm">
      <Text size="sm" fw={600}>{summary}</Text>
      <Progress color={color} value={value} animated={animated} />
      <Text size="sm">{message}</Text>
      {children}
      {actions && <Group gap="sm">{actions}</Group>}
    </Stack>
  </Alert>;
}
