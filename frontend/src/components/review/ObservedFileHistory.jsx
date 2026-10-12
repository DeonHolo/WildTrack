import { historyDate, newestHistoryEntries, observationTime } from '../../lib/fileHistoryPresentation.js';
import { DriveIdentityValue } from './DriveIdentityValue.jsx';
import './FileHistory.css';

export function ObservedFileHistory({ history, audience = 'staff' }) {
  if (!history) return null;
  const studentView = audience === 'student';
  const observations = newestHistoryEntries(history.observations, observationTime);
  return (
    <section className="file-history-section" data-testid="observed-file-history" aria-label="WildTrack observations">
      <div className="file-history-section-heading">
        {observations.length ? <span className="file-history-count">{observations.length} {observations.length === 1 ? 'entry' : 'entries'}</span> : null}
      </div>
      {observations.length ? <ol className="file-history-timeline" aria-label="Recorded file checks">
        {observations.slice(0, 3).map((observation, index) => (
          <RecordedCheck key={observationKey(observation, index)} observation={observation} studentView={studentView} />
        ))}
      </ol> : <p className="file-history-empty">No recorded checks yet. A completed Document Check records the file state here.</p>}
      {observations.length > 3 ? <details className="file-history-technical">
        <summary>Earlier checks ({observations.length - 3})</summary>
        <ol className="file-history-timeline" aria-label="Earlier recorded file checks">
          {observations.slice(3).map((observation, index) => (
            <RecordedCheck key={observationKey(observation, index + 3)} observation={observation} studentView={studentView} />
          ))}
        </ol>
      </details> : null}
      {observations.length && !studentView ? <details className="file-history-technical">
        <summary>Technical record details</summary>
        <p className="file-history-caption">These identifiers distinguish recorded file contents; they are not downloadable copies.</p>
        {observations.map((observation, index) => <div className="file-history-record" key={observationKey(observation, index)}>
          <h4>{changeLabel(observation.changeType)} · {historyDate(observationTime(observation))}</h4>
          <dl>
            <dt>First recorded</dt><dd>{historyDate(observation.firstObservedAt)}</dd>
            <dt>Last recorded</dt><dd>{historyDate(observation.lastObservedAt || observation.firstObservedAt)}</dd>
            <dt>Drive edit time</dt><dd>{historyDate(observation.driveModifiedTime)}</dd>
            <dt>Content identifier</dt><dd className="file-history-identifier">{observation.contentIdentifier || 'Unavailable'}</dd>
            <dt>Metadata source</dt><dd>{observation.editorMetadataSource || 'Google Drive File metadata'}</dd>
            {observation.driveOwner || observation.driveOwnerStudent ? <><dt>Recorded owner</dt><dd>
              <DriveIdentityValue registeredStudent={observation.driveOwnerStudent} providerValue={observation.driveOwner} />
            </dd></> : null}
          </dl>
        </div>)}
        <p className="file-history-caption">{history.coverageMessage || 'This history contains only file states WildTrack observed when Document Check ran.'}</p>
      </details> : null}
    </section>
  );
}

function RecordedCheck({ observation, studentView = false }) {
  return <li className="file-history-entry">
    <div className="file-history-entry-heading">
      <h4>{changeLabel(observation.changeType)}</h4>
      <span className="file-history-date">Checked {historyDate(observationTime(observation))}</span>
    </div>
    {!studentView ? <div className="file-history-editor"><span>Modified by</span>
      <DriveIdentityValue registeredStudent={observation.modifiedByStudent}
        providerValue={observation.modifiedBy || observation.modifiedByEmail} />
    </div> : null}
    {observation.driveModifiedTime ? <p className="file-history-caption">Drive edit: {historyDate(observation.driveModifiedTime)}</p> : null}
  </li>;
}

function observationKey(observation, index) {
  return [observation.fileId, observation.contentIdentifier, observation.firstObservedAt, observation.changeType].filter(Boolean).join(':') || `unidentified-${index}`;
}

function changeLabel(type) {
  if (type === 'CONTENT_CHANGED') return 'Content changed';
  if (type === 'METADATA_CHANGED') return 'File details changed';
  if (type === 'SOURCE_CHANGED') return 'Submitted file changed';
  if (type === 'FIRST_OBSERVED') return 'First recorded';
  if (type === 'METADATA_OBSERVED') return 'File details recorded';
  return 'File checked';
}
