import { recordedIsoTime } from './recordedTime.js';

export const DOCUMENT_CHANGE_ACK_PREFIX = 'document-change:';

export function documentChangeAcknowledgementKey(target, observation) {
  if (!target?.workspaceId || !target?.responseId || !target?.fieldId || !observation?.firstObservedAt) return '';
  return DOCUMENT_CHANGE_ACK_PREFIX + [target.responseId, target.fieldId, observation.fileId || 'linked-file',
    observation.contentIdentifier || 'unidentified', recordedIsoTime(observation.firstObservedAt)].join(':');
}
