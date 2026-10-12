import { FilePdf } from '@phosphor-icons/react';
import './SessionLoadingScreen.css';

export function SessionLoadingScreen() {
  return (
    <main className="wt-session-loading" aria-label="Loading WildTrack" aria-busy="true">
      <div className="wt-session-loading-content">
        <div className="wt-session-loading-spinner" aria-hidden="true">
          <span className="wt-session-loading-track" />
          <span className="wt-session-loading-orbit"><span /></span>
          <span className="wt-session-loading-mark"><FilePdf size={30} weight="duotone" /></span>
        </div>
        <p className="wt-session-loading-brand">WildTrack</p>
        <h1>Getting things ready</h1>
        <p className="wt-session-loading-status" role="status">Checking Google sign-in…</p>
      </div>
    </main>
  );
}
