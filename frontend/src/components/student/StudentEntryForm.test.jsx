import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentEntryForm } from './StudentEntryForm.jsx';
import { connectStudentAccount } from '../../lib/api.js';
const scope = vi.hoisted(() => ({ current: true }));
vi.mock('../../lib/api.js', () => ({ connectStudentAccount: vi.fn() }));
vi.mock('../../hooks/useWorkspaceScope.js', () => ({ useWorkspaceScope: () => () => scope.current }));
function setup(onConnected = vi.fn()) {
  render(<MantineProvider><MemoryRouter><StudentEntryForm email="student@example.test" onConnected={onConnected} /></MemoryRouter></MantineProvider>);
  return onConnected;
}
function fill() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Student Number' }), { target: { value: ' 20-0649-750 ' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Student Name' }), { target: { value: ' FULL STUDENT NAME ' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Team Code' }), { target: { value: ' Team-7 ' } });
}
describe('Student entry form', () => {
  beforeEach(() => { vi.clearAllMocks(); scope.current = true; });
  it('reuses the form banner and welcome asset without roster hints or deadline details', () => {
    setup();
    expect(screen.getByText('Keep your capstone on track')).toBeInTheDocument();
    const mascot = screen.getByRole('img', { name: 'WildTrack mascot welcoming students' });
    expect(mascot).toHaveClass('wt-artwork-mascot');
    expect(mascot).toHaveStyle('background-image: url("/assets/WELCOME%20TO%20WILDMAPS.webp")');
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
    for (const input of screen.getAllByRole('textbox')) {
      expect(input).toHaveValue(''); expect(input).toHaveAttribute('autocomplete', 'off');
    }
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Due /)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect account' })).toBeDisabled();
    expect(connectStudentAccount).not.toHaveBeenCalled();
  });
  it('connects the exact manually entered identity and opens the returned workspace', async () => {
    connectStudentAccount.mockResolvedValue({ workspaceId: 'workspace-matched' });
    const connected = setup(); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Connect account' }));
    await waitFor(() => expect(connected).toHaveBeenCalledWith({ workspaceId: 'workspace-matched' }));
    expect(connectStudentAccount).toHaveBeenCalledWith('20-0649-750', 'FULL STUDENT NAME', 'Team-7');
  });
  it('keeps typed values when the roster details do not match', async () => {
    connectStudentAccount.mockRejectedValue(new Error('Student details do not match an active class record.'));
    const connected = setup(); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Connect account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Student details do not match an active class record.');
    expect(screen.getByRole('textbox', { name: 'Team Code' })).toHaveValue(' Team-7 ');
    expect(connected).not.toHaveBeenCalled();
  });
  it('ignores an old result after the account changes', async () => {
    let resolve; connectStudentAccount.mockReturnValue(new Promise(done => { resolve = done; }));
    const connected = setup(); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Connect account' }));
    scope.current = false; resolve({ workspaceId: 'old-account' });
    await waitFor(() => expect(connectStudentAccount).toHaveBeenCalledTimes(1));
    expect(connected).not.toHaveBeenCalled();
  });
  it('shows an active connection conflict without clearing the typed identity', async () => {
    connectStudentAccount.mockRejectedValue(Object.assign(new Error('This Student Number is already associated with another Google account. Ask an administrator to review the account binding.'), { status: 409 }));
    const connected=setup();fill();
    fireEvent.click(screen.getByRole('button', { name: 'Connect account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ask an administrator to review the account binding.');
    expect(screen.getByRole('textbox', { name: 'Student Number' })).toHaveValue(' 20-0649-750 ');
    expect(screen.getByRole('textbox', { name: 'Team Code' })).toHaveValue(' Team-7 ');
    expect(connected).not.toHaveBeenCalled();
  });
});
