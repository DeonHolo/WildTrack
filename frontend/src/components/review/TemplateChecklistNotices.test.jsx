import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { TemplateChecklistNotices } from './TemplateChecklistNotices.jsx';

it('groups submissions by template and links to approval without calling them inaccessible PDFs', () => {
  const url = '/templates/11111111-1111-1111-1111-111111111111/preview?workspaceId=22222222-2222-2222-2222-222222222222';
  const entry = { resultStatus: 'TEMPLATE_APPROVAL_REQUIRED', templateChecklistUrl: url, identity: { deliverableTitle: 'Refactored SRS' } };
  render(<MantineProvider><TemplateChecklistNotices entries={[entry, entry,
    { ...entry, templateChecklistUrl: 'javascript:alert(1)' }]} /></MantineProvider>);
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Refactored SRS' })).toHaveAttribute('href', url);
  expect(screen.getByText(/2 submissions/)).toBeVisible();
  expect(screen.getByText(/No AI reviews started/)).toBeVisible();
  expect(screen.queryByText(/could not be opened/)).not.toBeInTheDocument();
});
