import {
  Badge,
  Button as MantineButton,
  Group,
  Input,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title
} from '@mantine/core';
import { MagnifyingGlass, WarningCircle } from '@phosphor-icons/react';
import { useId } from 'react';
import { statusTone } from '../lib/workflow.js';

export { DevelopmentRolePreview as GlobalDevPreview } from './layout/DevelopmentRolePreview.jsx';

const BUTTON_VARIANTS = {
  primary: { variant: 'filled', color: 'wildtrackMaroon' },
  secondary: { variant: 'default', color: 'wildtrackMaroon' },
  danger: { variant: 'filled', color: 'red' }
};

export function Button({ children, variant = 'primary', size = 'md', icon: Icon, loading = false, className = '', type = 'submit', ...props }) {
  const appearance = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary;
  return (
    <MantineButton
      {...appearance}
      size={size === 'sm' ? 'sm' : 'md'}
      leftSection={Icon ? <Icon size={18} weight="regular" aria-hidden="true" /> : undefined}
      loading={loading}
      className={className}
      type={type}
      {...props}
    >
      {children}
    </MantineButton>
  );
}

export function Field({ label, helper, error, children, required = false }) {
  return (
    <Input.Wrapper className="wt-field" label={label} description={helper} error={error} required={required}>
      {children}
    </Input.Wrapper>
  );
}

export function StatusBadge({ status }) {
  const tone = statusTone(status);
  const colors = { success: 'green', warning: 'orange', danger: 'red', info: 'wildtrackMaroon' };
  return <Badge className="wt-status-badge" color={colors[tone] || 'gray'} variant="light" radius="sm">{status}</Badge>;
}

export function PageHeader({ title, description, actions }) {
  return (
    <Group component="header" className="wt-page-header" justify="space-between" align="flex-end" gap="lg" wrap="wrap">
      <div>
        <Title order={1}>{title}</Title>
        {description ? <Text c="dimmed" mt={4}>{description}</Text> : null}
      </div>
      {actions ? <Group gap="sm">{actions}</Group> : null}
    </Group>
  );
}

export function EmptyState({ title, description, icon: Icon = WarningCircle }) {
  return (
    <Group className="wt-empty-state" gap="md" align="flex-start" p="lg">
      <ThemeIcon variant="light" color="wildtrackMaroon" size={40}><Icon size={22} aria-hidden="true" /></ThemeIcon>
      <div>
        <Title order={3}>{title}</Title>
        <Text c="dimmed" mt={4}>{description}</Text>
      </div>
    </Group>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmText = '',
  confirmationValue = '',
  onConfirmationValueChange,
  onConfirm,
  onClose,
  intent = 'primary',
  loading = false,
  children
}) {
  const descriptionId = useId();
  const requiresText = Boolean(confirmText);
  const canConfirm = !requiresText || confirmationValue === confirmText;

  return (
    <Modal
      opened={open}
      onClose={onClose}
      title={title}
      centered
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      withCloseButton={!loading}
      transitionProps={{ duration: 0 }}
      aria-describedby={description ? descriptionId : undefined}
    >
      <Stack gap="md">
        {description ? <Text id={descriptionId} size="sm" c="dimmed">{description}</Text> : null}
        {children ? <Paper withBorder p="sm" radius="sm">{children}</Paper> : null}
        {requiresText ? (
          <TextInput
            autoFocus
            label="Confirmation"
            description={<>Type <Text component="strong" inherit>{confirmText}</Text> to continue.</>}
            value={confirmationValue}
            onChange={(event) => onConfirmationValueChange?.(event.currentTarget.value)}
            autoComplete="off"
            placeholder={`Type ${confirmText}`}
            aria-label={`Type ${confirmText} to continue`}
          />
        ) : null}
        <Group justify="flex-end" gap="sm">
          <MantineButton variant="default" onClick={onClose} disabled={loading}>{cancelLabel}</MantineButton>
          <MantineButton
            color={intent === 'danger' ? 'red' : 'wildtrackMaroon'}
            loading={loading}
            disabled={!canConfirm || loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </MantineButton>
        </Group>
      </Stack>
    </Modal>
  );
}

export function DataTable({ columns, children, minWidth = 780, className = '' }) {
  return (
    <div className={`table-wrap ${className}`}>
      <Table miw={minWidth}>
        <Table.Thead><Table.Tr>{columns.map((column) => <Table.Th key={column}>{column}</Table.Th>)}</Table.Tr></Table.Thead>
        <Table.Tbody>{children}</Table.Tbody>
      </Table>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search' }) {
  return (
    <TextInput
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      leftSection={<MagnifyingGlass size={18} aria-hidden="true" />}
    />
  );
}
