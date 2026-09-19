import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { wildTrackTheme } from '../app/theme.js';
import { ResponseTimingSummary } from './ResponseTimingSummary.jsx';

function renderSummary(timing) {
  return render(
    <MantineProvider theme={wildTrackTheme} forceColorScheme="light">
      <ResponseTimingSummary timing={timing} />
    </MantineProvider>
  );
}

describe('ResponseTimingSummary', () => {
  it('shows the backend effective time/reason and explicit unavailable content evidence', () => {
    renderSummary({
      effectiveSubmittedAt: '2026-09-21T00:01:00+08:00',
      effectiveReason: 'Material artifact save',
      late: true,
      daysLate: 2,
      contributors: [
        { type: 'INITIAL_SUBMISSION', timestamp: '2026-09-19T20:00:00+08:00' },
        { type: 'MATERIAL_ARTIFACT_SAVE', timestamp: '2026-09-21T00:01:00+08:00' }
      ],
      artifactEvidence: [{
        fieldId: 'pdf-field',
        fieldKey: 'documentPdf',
        fieldLabel: 'SRS PDF',
        contentEvidenceStatus: 'UNAVAILABLE',
        message: 'No Document Check observation exists for the current PDF link; Drive/content evidence is unavailable.'
      }]
    });

    expect(screen.getByText(/Effective submission/)).toHaveTextContent('Material artifact save');
    expect(screen.getByText('2 days late')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Timing evidence'));
    expect(screen.getByText(/Initial submission:/)).toBeInTheDocument();
    expect(screen.getByText(/Material artifact save:/)).toBeInTheDocument();
    expect(screen.getByText(/Drive\/content evidence is unavailable/)).toBeInTheDocument();
  });
});
