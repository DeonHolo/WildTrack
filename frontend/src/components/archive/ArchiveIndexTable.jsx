import { ActionIcon, Button, Pagination, ScrollArea, Table, Text, Tooltip } from '@mantine/core';
import { CaretRight, FolderOpen } from '@phosphor-icons/react';
import { formatDateTime } from '../../lib/workflow.js';
import { getArchiveStatus, getArchiveVersion } from '../../lib/archive.js';

export function ArchiveIndexTable({
  archives,
  total,
  allArchiveCount,
  page,
  pageCount,
  pageSize,
  onPageChange,
  onOpen,
  onClearFilters
}) {
  if (!archives.length) {
    return (
      <div className="wt-archive-empty">
        <FolderOpen size={28} />
        <Text fw={750}>{allArchiveCount ? 'No archive records match' : 'No final archive records yet'}</Text>
        <Text size="sm" c="dimmed">
          {allArchiveCount ? 'Clear the filters or search for another record.' : 'Accepted final submissions will appear here after they are archived.'}
        </Text>
        {allArchiveCount ? <Button variant="default" onClick={onClearFilters}>Clear filters</Button> : null}
      </div>
    );
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <>
      <ScrollArea type="auto" scrollbarSize={10} className="wt-archive-table-scroll">
        <Table aria-label="Archive records" className="wt-archive-table" verticalSpacing="xs" horizontalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Project</Table.Th>
              <Table.Th>Team</Table.Th>
              <Table.Th>Deliverable</Table.Th>
              <Table.Th>Student</Table.Th>
              <Table.Th>Version</Table.Th>
              <Table.Th>Archived</Table.Th>
              <Table.Th>Integrity</Table.Th>
              <Table.Th><span className="sr-only">Open details</span></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {archives.map((archive) => {
              const label = archive.softwareName || archive.projectTitle || archive.teamCode || 'Archive';
              return (
                <Table.Tr key={archive.id}>
                  <Table.Td className="wt-archive-project-cell">
                    <Tooltip label={archive.projectTitle || label} openDelay={500}>
                      <Text fw={700} lineClamp={1}>{label}</Text>
                    </Tooltip>
                    <Text size="xs" c="dimmed" lineClamp={1}>{archive.projectTitle || 'Project metadata not loaded'}</Text>
                  </Table.Td>
                  <Table.Td><Text size="sm" className="wt-mono wt-nowrap">{archive.teamCode || 'Not recorded'}</Text></Table.Td>
                  <Table.Td><Text size="sm" lineClamp={2}>{archive.deliverableTitle || 'Not recorded'}</Text></Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={650} lineClamp={1}>{archive.studentName || 'Not recorded'}</Text>
                    <Text size="xs" c="dimmed" className="wt-mono">{archive.studentNumber || ''}</Text>
                  </Table.Td>
                  <Table.Td><Text size="sm" className="wt-nowrap">{getArchiveVersion(archive)}</Text></Table.Td>
                  <Table.Td><Text size="sm" className="wt-nowrap wt-tabular">{formatDateTime(archive.archivedAt)}</Text></Table.Td>
                  <Table.Td><ArchiveStatus status={getArchiveStatus(archive)} /></Table.Td>
                  <Table.Td>
                    <Tooltip label={`Open ${label} archive details`}>
                      <ActionIcon
                        variant="subtle"
                        color="wildtrackMaroon"
                        size="lg"
                        aria-label={`Open ${label} archive details`}
                        onClick={() => onOpen(archive)}
                      >
                        <CaretRight size={18} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <div className="wt-archive-pagination">
        <Text size="sm" c="dimmed" className="wt-tabular">Showing {first}-{last} of {total}</Text>
        <Text size="sm" fw={650} className="wt-tabular">Page {page} of {pageCount}</Text>
        {pageCount > 1 ? (
          <Pagination total={pageCount} value={page} onChange={onPageChange} color="wildtrackMaroon" size="sm" withEdges />
        ) : null}
      </div>
    </>
  );
}

function ArchiveStatus({ status }) {
  const tone = status === 'Verified'
    ? 'success'
    : status === 'Verification failed' || status === 'Storage failed'
      ? 'danger'
      : status === 'Retrying'
        ? 'warning'
        : 'neutral';
  return <span className={`wt-archive-status is-${tone}`}><span aria-hidden="true" />{status}</span>;
}
