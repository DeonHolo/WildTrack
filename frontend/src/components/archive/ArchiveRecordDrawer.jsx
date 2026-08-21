import { Button, Code, Divider, Drawer, Group, Stack, Text, Title, Tooltip } from '@mantine/core';
import { ArrowSquareOut, CheckCircle, Copy, DownloadSimple, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { notifications } from '@mantine/notifications';
import { formatDateTime, makeDriveViewUrl } from '../../lib/workflow.js';
import { getArchiveStatus, getArchiveVersion } from '../../lib/archive.js';

export function ArchiveRecordDrawer({ archive, opened, storageConfigured, onClose, onVerify, onRetry }) {
  if (!archive) return null;
  const stored = archive.storageStatus === 'Stored' && Boolean(archive.downloadUrl || archive.fileSha256);
  const status = getArchiveStatus(archive);
  const canDownload = stored && Boolean(archive.downloadUrl);
  const canVerify = storageConfigured && stored && typeof onVerify === 'function';
  const canRetry = storageConfigured && archive.storageStatus === 'Failed' && typeof onRetry === 'function';

  async function copyValue(value, label) {
    await navigator.clipboard?.writeText(value || '');
    notifications.show({ title: `${label} copied`, message: 'Copied to the clipboard.' });
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="min(680px, 96vw)"
      title="Archive record details"
      aria-label="Archive record details"
      classNames={{
        content: 'wt-archive-drawer',
        header: 'wt-archive-drawer-header',
        body: 'wt-archive-drawer-body'
      }}
    >
      <Stack gap="lg">
        <div>
          <Text className="wt-eyebrow">{archive.deliverableTitle || 'Final submission'}</Text>
          <Title order={2}>{archive.softwareName || archive.projectTitle || archive.teamCode}</Title>
          <Text c="dimmed" size="sm">{archive.teamCode} | {archive.studentName}</Text>
        </div>

        <section className="wt-archive-drawer-section">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={3}>Preservation</Title>
              <Text size="sm" c="dimmed">Storage and integrity state for this record.</Text>
            </div>
            <ArchiveIntegrityIcon status={status} />
          </Group>
          <div className="wt-archive-preservation-state">
            <Text fw={750}>{stored ? status : 'Independent PDF copy not stored'}</Text>
            <Text size="sm" c="dimmed">
              {stored ? 'An independent file is associated with this archive record.' : 'The submitted Drive link remains a source reference, not an independently preserved file.'}
            </Text>
          </div>
          <DetailCode
            label={stored ? 'Archived file SHA-256' : 'Metadata checksum'}
            value={stored ? archive.fileSha256 : (archive.metadataSha256 || archive.sha256)}
            onCopy={copyValue}
          />
          {archive.failureReason ? <Text size="sm" c="red.7"><strong>Failure:</strong> {archive.failureReason}</Text> : null}
        </section>

        <Divider />

        <section className="wt-archive-drawer-section">
          <Title order={3}>Record details</Title>
          <dl className="wt-archive-metadata-grid">
            <Detail label="Workspace" value={archive.workspaceName || archive.workspaceId} />
            <Detail label="Project title" value={archive.projectTitle} />
            <Detail label="Software name" value={archive.softwareName} />
            <Detail label="Team" value={archive.teamCode} mono />
            <Detail label="Student" value={archive.studentName} />
            <Detail label="Student Number" value={archive.studentNumber} mono />
            <Detail label="Adviser" value={archive.adviserName} />
            <Detail label="Deliverable" value={archive.deliverableTitle} />
            <Detail label="Version" value={getArchiveVersion(archive)} />
            <Detail label="Archive date" value={formatDateTime(archive.archivedAt)} />
            <Detail label="Archived filename" value={stored ? archive.filename : 'Not created'} wide />
          </dl>
          {stored ? <DetailCode label="Archive storage key" value={archive.storageKey} onCopy={copyValue} /> : null}
        </section>

        <Divider />

        <section className="wt-archive-drawer-section">
          <Title order={3}>Actions</Title>
          <Group gap="sm" className="wt-archive-drawer-actions">
            {archive.sourceLink ? (
              <Button
                component="a"
                href={makeDriveViewUrl(archive.sourceLink)}
                target="_blank"
                rel="noreferrer"
                variant="default"
                leftSection={<ArrowSquareOut size={17} />}
              >
                Open submitted source
              </Button>
            ) : null}
            <DisabledActionTooltip disabled={!canDownload} label="No independently stored PDF is available to download.">
              <Button
                component={canDownload ? 'a' : 'button'}
                href={canDownload ? archive.downloadUrl : undefined}
                disabled={!canDownload}
                variant="default"
                leftSection={<DownloadSimple size={17} />}
              >
                Download archived PDF
              </Button>
            </DisabledActionTooltip>
            <DisabledActionTooltip disabled={!canVerify} label="Integrity verification becomes available after independent archive storage is connected.">
              <Button
                disabled={!canVerify}
                variant="default"
                leftSection={<ShieldCheck size={17} />}
                onClick={() => onVerify?.(archive.id)}
              >
                Verify integrity
              </Button>
            </DisabledActionTooltip>
            <DisabledActionTooltip disabled={!canRetry} label="Retry is available only for a failed independent archive copy.">
              <Button
                disabled={!canRetry}
                variant="default"
                leftSection={<WarningCircle size={17} />}
                onClick={() => onRetry?.(archive.id)}
              >
                Retry archive
              </Button>
            </DisabledActionTooltip>
          </Group>
        </section>
      </Stack>
    </Drawer>
  );
}

function Detail({ label, value, mono = false, wide = false }) {
  return <div className={wide ? 'is-wide' : ''}><dt>{label}</dt><dd className={mono ? 'wt-mono' : ''}>{value || 'Not recorded'}</dd></div>;
}

function DetailCode({ label, value, onCopy }) {
  return (
    <div className="wt-archive-code-field">
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" fw={750} tt="uppercase" c="dimmed">{label}</Text>
        {value ? (
          <Tooltip label={`Copy ${label.toLowerCase()}`}>
            <Button
              variant="subtle"
              color="wildtrackMaroon"
              size="compact-xs"
              leftSection={<Copy size={14} />}
              onClick={() => onCopy(value, label)}
            >
              Copy
            </Button>
          </Tooltip>
        ) : null}
      </Group>
      <Code block>{value || 'Not recorded'}</Code>
    </div>
  );
}

function ArchiveIntegrityIcon({ status }) {
  if (status === 'Verified') {
    return <CheckCircle size={24} weight="fill" color="var(--mantine-color-green-7)" aria-label="File verified" />;
  }
  if (status === 'Verification failed' || status === 'Storage failed') {
    return <WarningCircle size={24} weight="fill" color="var(--mantine-color-red-7)" aria-label="Verification failed" />;
  }
  return <ShieldCheck size={24} color="var(--mantine-color-gray-6)" aria-label={status} />;
}

function DisabledActionTooltip({ disabled, label, children }) {
  if (!disabled) return children;
  return (
    <Tooltip label={label} multiline w={260}>
      <span className="wt-disabled-action" tabIndex={0} aria-label={label}>{children}</span>
    </Tooltip>
  );
}
