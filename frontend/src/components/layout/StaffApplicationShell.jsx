import {
  AppShell as MantineAppShell,
  Avatar,
  Box,
  Burger,
  Divider,
  Group,
  NavLink as MantineNavLink,
  ScrollArea,
  Select,
  Stack,
  Text
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  Archive,
  ClipboardText,
  Gauge,
  GoogleLogo,
  ListChecks,
  Table,
  UsersThree
} from '@phosphor-icons/react';
import { NavLink, useLocation } from 'react-router-dom';
import { useWorkflow } from '../../app/WorkflowContext.jsx';
import { APPLICATION_ROLES, useApplicationRole } from '../../hooks/useApplicationRole.js';
import { getStoredPreviewAdviser } from '../../hooks/usePreviewRole.js';
import { WildTrackBrand } from './WildTrackBrand.jsx';

const ADMIN_GROUPS = [
  {
    label: 'Overview',
    items: [{ to: '/', label: "Today's work", icon: Gauge, end: true }]
  },
  {
    label: 'Submissions',
    items: [
      { to: '/forms', label: 'Forms', icon: ClipboardText },
      { to: '/review', label: 'Review', icon: ListChecks }
    ]
  },
  {
    label: 'Advising',
    items: [{ to: '/adviser', label: 'My advised teams', icon: UsersThree }]
  },
  {
    label: 'Records',
    items: [
      { to: '/tracker', label: 'Tracker', icon: Table },
      { to: '/archive', label: 'Archive', icon: Archive }
    ]
  },
  {
    label: 'Administration',
    items: [{ to: '/workspace', label: 'Workspace', icon: GoogleLogo }]
  }
];

const ADVISER_GROUPS = [
  {
    label: 'Assigned work',
    items: [
      { to: '/adviser', label: 'My teams', icon: UsersThree },
      { to: '/tracker', label: 'Tracker', icon: Table }
    ]
  }
];

export function StaffApplicationShell({ children }) {
  const [mobileOpened, { toggle, close }] = useDisclosure(false);
  const role = useApplicationRole();
  const location = useLocation();
  const { workspaces, activeWorkspace, activeWorkspaceId, switchWorkspace } = useWorkflow();
  const isAdviser = role === APPLICATION_ROLES.ADVISER;
  const navigationGroups = isAdviser ? ADVISER_GROUPS : ADMIN_GROUPS;
  const accountName = isAdviser ? getStoredPreviewAdviser() || 'Adviser account' : 'Ralph Laviste';
  const accountRole = isAdviser ? 'Adviser' : 'Administrator';

  return (
    <MantineAppShell
      className="wt-staff-shell"
      header={{ height: 68 }}
      navbar={{ width: 252, breakpoint: 'md', collapsed: { mobile: !mobileOpened } }}
      padding={0}
    >
      <a className="wt-skip-link" href="#wildtrack-main">Skip to content</a>
      <MantineAppShell.Header className="wt-staff-header">
        <Group h="100%" px={{ base: 'sm', sm: 'md' }} gap="sm" wrap="nowrap">
          <Burger opened={mobileOpened} onClick={toggle} hiddenFrom="md" size="sm" aria-label="Toggle navigation" />
          <Box hiddenFrom="md" className="wt-mobile-brand">
            <WildTrackBrand compact to={isAdviser ? '/adviser' : '/'} />
          </Box>
          <Group className="wt-workspace-control" gap="xs" wrap="nowrap">
            <Select
              aria-label="Academic workspace"
              value={activeWorkspaceId}
              onChange={(value) => value && switchWorkspace(value)}
              data={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
              allowDeselect={false}
              searchable={workspaces.length > 5}
              size="sm"
            />
            <div className="wt-workspace-period">
              <Text component="strong" size="xs" fw={800}>{activeWorkspace?.program} | {activeWorkspace?.courseCode}</Text>
              <Text size="xs" c="dimmed">{activeWorkspace?.semester} {activeWorkspace?.academicYear}</Text>
            </div>
          </Group>
          <Group className="wt-staff-account" gap="xs" wrap="nowrap" ml="auto">
            <Avatar color="wildtrackMaroon" size={34}>{initials(accountName)}</Avatar>
            <div className="wt-account-copy">
              <Text component="strong" size="sm" fw={750}>{accountName}</Text>
              <Text size="xs" c="dimmed">{accountRole}</Text>
            </div>
          </Group>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar className="wt-staff-navbar" aria-label="Staff navigation">
        <Box className="wt-navbar-brand">
          <WildTrackBrand
            to={isAdviser ? '/adviser' : '/'}
            subtitle={isAdviser ? 'Adviser workspace' : 'Capstone operations'}
          />
        </Box>
        <Box className="wt-navbar-context" aria-label="Active workspace">
          <Text component="span" size="xs">Active workspace</Text>
          <Text component="strong" size="sm" fw={750}>{activeWorkspace?.name}</Text>
        </Box>
        <Divider />
        <ScrollArea className="wt-navbar-scroll" type="auto" offsetScrollbars>
          <Stack gap="md" py="sm">
            {navigationGroups.map((group) => (
              <Box key={group.label}>
                <Text className="wt-nav-group-label" component="h2" size="xs">{group.label}</Text>
                <Stack gap={2} mt={4}>
                  {group.items.map((item) => {
                    const active = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
                    return (
                      <MantineNavLink
                        key={item.to}
                        component={NavLink}
                        to={item.to}
                        label={item.label}
                        leftSection={<item.icon size={19} weight={active ? 'fill' : 'regular'} aria-hidden="true" />}
                        active={active}
                        aria-current={active ? 'page' : undefined}
                        onClick={close}
                      />
                    );
                  })}
                </Stack>
              </Box>
            ))}
          </Stack>
        </ScrollArea>
        <Box className="wt-navbar-footer">
          <Text size="xs" c="dimmed">{accountRole} access</Text>
          <Text size="xs">{isAdviser ? 'Assigned teams only' : 'Institution-wide workspace'}</Text>
        </Box>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main id="wildtrack-main">
        <div className="wt-staff-main">{children}</div>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}

function initials(name) {
  return String(name || 'WT')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}
