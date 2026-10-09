import { useState } from 'react';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ReviewResponseDrawer } from './ReviewResponseDrawer.jsx';
import { AiReviewReportDialog } from './AiReviewReportDialog.jsx';

it('Escape closes AI Review first, preserves the submission drawer, then closes the drawer on the next Escape', async () => {
  const closeDrawer = vi.fn();
  const closeReport = vi.fn();
  function ReviewOverlays() {
    const [drawerOpened, setDrawerOpened] = useState(true);
    const [reportOpened, setReportOpened] = useState(true);
    return <MantineProvider>
      <ReviewResponseDrawer opened={drawerOpened} detailDialogOpened={reportOpened}
        response={{ id: 'response-1', values: {} }}
        student={{ name: 'DOE, JANE' }} state={{ projectMetadata: [] }}
        deliverable={{ shortTitle: 'SRS', fields: [] }}
        onClose={() => { closeDrawer(); setDrawerOpened(false); }} />
      <AiReviewReportDialog opened={reportOpened} fieldLabel="SRS PDF"
        report={{ summary: 'Saved review', findings: [] }}
        onClose={() => { closeReport(); setReportOpened(false); }} />
    </MantineProvider>;
  }
  render(<ReviewOverlays />);
  const review = await screen.findByRole('dialog', { name: 'AI Review: SRS PDF' });
  fireEvent.keyDown(review, { key: 'Escape' });
  expect(closeReport).toHaveBeenCalledTimes(1);
  expect(closeDrawer).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'AI Review: SRS PDF' })).not.toBeInTheDocument());
  const drawer = screen.getByRole('dialog', { name: 'Review DOE, JANE' });
  fireEvent.keyDown(drawer, { key: 'Escape' });
  expect(closeDrawer).toHaveBeenCalledTimes(1);
});
