import { ActionIcon, Box, Popover, Stack, Text, UnstyledButton } from '@mantine/core';
import { Eye, FilePdf, Gauge, Student, UsersThree, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkflow } from '../../app/WorkflowContext.jsx';
import { getWorkspacePublicKey } from '../../lib/workflow.js';
import { browserStorageKeys, readStorageWithMigration } from '../../lib/browserStorage.js';
import { setStoredPreviewRole, usePreviewRole } from '../../hooks/usePreviewRole.js';

const OPEN_KEY = browserStorageKeys.developmentPreviewOpen;

export function DevelopmentRolePreview({ enabled = import.meta.env.DEV }) {
  const navigate = useNavigate();
  const role = usePreviewRole();
  const { activeWorkspace } = useWorkflow();
  const [open, setOpen] = useState(() => enabled && readStorageWithMigration(OPEN_KEY, '.v2.dev-preview-open') === 'true');

  useEffect(() => {
    if (enabled) localStorage.setItem(OPEN_KEY, String(open));
  }, [enabled, open]);

  if (!enabled) return null;

  function switchView(nextRole, destination) {
    setStoredPreviewRole(nextRole);
    setOpen(false);
    navigate(destination);
  }

  return (
    <aside className="wt-role-preview" aria-label="Development role preview">
      <Popover opened={open} onChange={setOpen} position="right-end" withArrow shadow="md" width={248}>
        <Popover.Target>
          <ActionIcon
            size={46}
            radius="sm"
            color="wildtrackMaroon"
            aria-label={open ? 'Close role preview' : 'Open role preview'}
            aria-expanded={open}
            title={open ? 'Close role preview' : 'Open role preview'}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <X size={20} weight="bold" aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown className="wt-role-preview-panel">
          <Box className="wt-role-preview-heading">
            <Text size="xs" c="dimmed">Development tools</Text>
            <Text component="strong" size="sm" fw={750}>Preview application role</Text>
          </Box>
          <Stack gap={4} mt="xs">
            <PreviewOption active={role === 'admin'} icon={Gauge} label="Sir / Admin" onClick={() => switchView('admin', '/')} />
            <PreviewOption active={role === 'adviser'} icon={UsersThree} label="Adviser" onClick={() => switchView('adviser', '/adviser')} />
            <PreviewOption active={role === 'student'} icon={Student} label="Student" onClick={() => switchView('student', '/student')} />
            <PreviewOption
              icon={FilePdf}
              label="Sample public form"
              onClick={() => {
                setOpen(false);
                navigate(`/w/${getWorkspacePublicKey(activeWorkspace)}/submit/week-9-srs`);
              }}
            />
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </aside>
  );
}

function PreviewOption({ active = false, icon: Icon, label, onClick }) {
  return (
    <UnstyledButton className={`wt-role-preview-option ${active ? 'is-active' : ''}`} onClick={onClick}>
      <Icon size={18} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
      <span>{label}</span>
    </UnstyledButton>
  );
}
