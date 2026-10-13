import { WildTrackMark } from '../layout/WildTrackMark.jsx';
import './SessionLoadingScreen.css';

export function SessionLoadingScreen() {
  return (
    <main className="wt-session-loading" aria-label="Loading WildTrack" aria-busy="true">
      <div className="wt-session-loading-content">
        <div className="wt-session-loading-spinner" aria-hidden="true">
          <svg className="wt-session-loading-rings" viewBox="0 0 120 120" fill="none">
            <circle className="wt-session-loading-track" cx="60" cy="60" r="55" />
            <circle className="wt-session-loading-ring" cx="60" cy="60" r="55" pathLength="100" />
            <circle className="wt-session-loading-ring wt-session-loading-ring--inner" cx="60" cy="60" r="44" pathLength="100" />
          </svg>
          <WildTrackMark className="wt-session-loading-mark" size={64} />
        </div>
        <p className="wt-session-loading-status" role="status">Loading…</p>
      </div>
    </main>
  );
}
