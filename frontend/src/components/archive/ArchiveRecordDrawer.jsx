import { Button, Code, Divider, Drawer, Group, Stack, Text, Title, Tooltip } from '@mantine/core';
import { ArrowSquareOut, CheckCircle, Copy, DownloadSimple, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { notifications } from '@mantine/notifications';
import { formatDateTime, makeDriveViewUrl } from '../../lib/workflow.js';
import { getArchiveStatus, getArchiveVersion } from '../../lib/archive.js';

export function ArchiveRecordDrawer({ archive, opened, storageReady, action, onClose, onVerify, onRetry, onUnarchive }) {
  if (!archive) return null;
  const stored = archive.storageStatus === 'Stored' && Boolean(archive.downloadUrl || archive.fileSha256);
  const status = getArchiveStatus(archive);
  const canDownload = stored && Boolean(archive.downloadUrl);
  const files = Array.isArray(archive.files) ? archive.files : [];
  const canVerify = files.length > 0 && files.every((file) => file.downloadUrl && String(file.status).toUpperCase() === 'STORED') && typeof onVerify === 'function';
  const canRetry = storageReady && (archive.captureState === 'FAILED' || archive.storageStatus === 'Storage failed') && typeof onRetry === 'function';
  const artifacts = Array.isArray(archive.artifacts) ? archive.artifacts : [];

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
            <Text fw={750}>{archive.captureState ? `${archive.storageStatus || status} · ${archive.lifecycleState || 'Archived'}` : stored ? status : 'Independent PDF copy not stored'}</Text>
            <Text size="sm" c="dimmed">
              {archive.captureState === 'LEGACY' || (!archive.captureState && !stored) ? 'This record contains metadata and source references. No independent copy was captured.' : archive.captureState === 'QUEUED' || archive.captureState === 'COPYING' ? 'Copies are being prepared.' : 'See each file below for its preservation state.'}
            </Text>
          </div>
          {!archive.captureState || archive.metadataSha256 ? <DetailCode
            label={stored ? 'Archived file SHA-256' : 'Metadata checksum'}
            value={stored ? archive.fileSha256 : (archive.metadataSha256 || archive.sha256)}
            onCopy={copyValue}
          /> : null}
          {archive.error || archive.failureReason ? <Text size="sm" c="red.7"><strong>Failure:</strong> {archive.error || archive.failureReason}</Text> : null}
        </section>

        {files.length ? <section className="wt-archive-drawer-section">
          <Title order={3}>Preserved files</Title>
          <Stack gap="sm">{files.map((file) => <PaperFile key={file.id} file={file} onCopy={copyValue} />)}</Stack>
        </section> : null}

        {archive.history?.length ? <section className="wt-archive-drawer-section">
          <Title order={3}>History</Title>
          <Stack gap="xs">{archive.history.map((event, index) => <Text size="sm" key={`${event.action}-${event.occurredAt}-${index}`}>{historyLabel(event.action)} · {formatDateTime(event.occurredAt)}{event.actor ? ` · ${event.actor === 'archive-worker' ? 'WildTrack' : event.actor}` : ''}</Text>)}</Stack>
        </section> : null}

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
            {!files.length ? <Detail label="Archived filename" value={stored ? archive.filename : 'Not created'} wide /> : null}
          </dl>
          {stored ? <DetailCode label="Archive storage key" value={archive.storageKey} onCopy={copyValue} /> : null}
        </section>

        {artifacts.length ? (
          <>
            <Divider />
            <section className="wt-archive-drawer-section">
              <Title order={3}>Archived submission artifacts</Title>
              <Text size="sm" c="dimmed" mb="sm">These values were captured with this immutable response version.</Text>
              <Stack gap="sm">
                {artifacts.map((artifact, index) => (
                  <div key={`${artifact.fieldKey || 'artifact'}-${index}`}>
                    <Text size="sm" fw={750}>{artifact.label || artifact.fieldKey || `Artifact ${index + 1}`}</Text>
                    <Text size="xs" c="dimmed">{archiveArtifactTypeLabel(artifact.fieldType)}</Text>
                    {isWebLink(artifact.value) ? (
                      <Button
                        component="a"
                        href={makeDriveViewUrl(artifact.value)}
                        target="_blank"
                        rel="noreferrer"
                        variant="default"
                        size="xs"
                        mt={6}
                        leftSection={<ArrowSquareOut size={15} />}
                      >
                        Open archived source
                      </Button>
                    ) : (
                      <Text size="sm" mt={4}>{artifact.value}</Text>
                    )}
                  </div>
                ))}
              </Stack>
            </section>
          </>
        ) : null}

        <Divider />

        <section className="wt-archive-drawer-section">
          <Title order={3}>Actions</Title>
          <Group gap="sm" className="wt-archive-drawer-actions">
            {!artifacts.length && archive.sourceLink ? (
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
            {!files.length && !archive.captureState ? <DisabledActionTooltip disabled={!canDownload} label="No independently stored PDF is available to download.">
              <Button
                component={canDownload ? 'a' : 'button'}
                href={canDownload ? archive.downloadUrl : undefined}
                disabled={!canDownload}
                variant="default"
                leftSection={<DownloadSimple size={17} />}
              >
                Download archived PDF
              </Button>
            </DisabledActionTooltip> : null}
            <DisabledActionTooltip disabled={!canVerify} label="No preserved file is available to verify.">
              <Button
                disabled={!canVerify || Boolean(action)}
                loading={action === 'verify'}
                variant="default"
                leftSection={<ShieldCheck size={17} />}
                onClick={() => onVerify?.(archive)}
              >
                Verify integrity
              </Button>
            </DisabledActionTooltip>
            <DisabledActionTooltip disabled={!canRetry} label="Retry is available only for a failed independent archive copy.">
              <Button
                disabled={!canRetry || Boolean(action)}
                loading={action === 'retry'}
                variant="default"
                leftSection={<WarningCircle size={17} />}
                onClick={() => onRetry?.(archive)}
              >
                Retry archive
              </Button>
            </DisabledActionTooltip>
            {archive.lifecycleState === 'Archived' ? <Button variant="default" disabled={Boolean(action)} loading={action === 'unarchive'} onClick={() => onUnarchive?.(archive)}>Unarchive</Button> : null}
          </Group>
          {archive.lifecycleState === 'Active' ? <Text size="sm" c="dimmed">This inactive record remains in archive history.</Text> : null}
        </section>
      </Stack>
    </Drawer>
  );
}

function PaperFile({ file, onCopy }) {
  return <div>
    <Text fw={700} size="sm">{file.label || file.filename || 'File'}</Text>
    <Text size="sm" c="dimmed">{file.filename || 'Filename unavailable'} · {({ STORED: 'Preserved', QUEUED: 'Queued', COPYING: 'Copying', FAILED: 'Copy failed' })[file.status] || file.status || 'Unavailable'}{file.size != null ? ` · ${file.size.toLocaleString()} bytes` : ''}</Text>
    {file.capturedAt ? <Text size="xs" c="dimmed">Captured {formatDateTime(file.capturedAt)}</Text> : null}
    {file.error ? <Text size="sm" c="red.7">{file.error}</Text> : null}
    {file.sha256 ? <DetailCode label="SHA-256" value={file.sha256} onCopy={onCopy} /> : null}
    {file.downloadUrl && String(file.status).toUpperCase() === 'STORED' ? <Button component="a" href={file.downloadUrl} variant="default" size="xs" mt="xs" leftSection={<DownloadSimple size={15} />}>Download {file.label || file.filename || 'file'}</Button> : null}
  </div>;
}

function isWebLink(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function historyLabel(action) {
  return ({ ARCHIVE_QUEUED: 'Copying requested', ARCHIVE_COMPLETED: 'PDFs preserved', ARCHIVE_COPY_FAILED: 'Copy failed', ARCHIVE_UNARCHIVED: 'Unarchived', ARCHIVE_REACTIVATED: 'Archived again', ARCHIVE_VERIFIED: 'Copies verified', ARCHIVE_RETRY_REQUESTED: 'Copy retry requested' })[action] || action;
}

function archiveArtifactTypeLabel(type) {
  return ({
    DRIVE_PDF: 'Google Drive PDF',
    GOOGLE_FORM: 'Google Form',
    GOOGLE_SHEET: 'Google Sheet',
    DRIVE_FOLDER: 'Google Drive folder',
    GENERAL_URL: 'Link',
    TEXTAREA: 'Text response',
    LEGACY: 'Legacy response field'
  })[type] || 'Submission artifact';
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
