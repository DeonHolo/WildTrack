import { ObservedFileHistory } from './ObservedFileHistory.jsx';

export function SubmittedFileHistory({ observedHistory, audience = 'staff' }) {
  return (
    <div className="file-history" aria-label="Submitted file history">
      <ObservedFileHistory history={observedHistory || { observations: [] }} audience={audience} />
    </div>
  );
}
