import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelAiReviewBatchPreparation, getAiReviewBatch, getLatestAiReviewBatch, prepareAiReviewBatch,
  resumeAiReviewBatch, startAiReviewBatch } from '../lib/api.js';

export function useAiReviewBatch(workspaceId, onFinished) {
  const [batch, setBatch] = useState(null);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scope = useRef(0);
  const operation = useRef(0);
  const finished = useRef(new Set());
  const callback = useRef(onFinished);
  callback.current = onFinished;
  useEffect(() => {
    const current = ++scope.current;
    const sequence = ++operation.current;
    setBatch(null); setOpened(false); setError(''); setBusy(false);
    if (workspaceId) getLatestAiReviewBatch(workspaceId).then(saved => {
      if (scope.current === current && operation.current === sequence) setBatch(saved);
    }).catch(() => {}); // Legacy deployments/no saved batch must not manufacture a new request.
    return () => { scope.current += 1; operation.current += 1; };
  }, [workspaceId]);
  useEffect(() => {
    if (!batch?.id || !['PLANNING', 'RUNNING'].includes(batch.state)) return;
    const current = scope.current;
    let stopped = false;
    let timer;
    async function poll() {
      try {
        const saved = await getAiReviewBatch(workspaceId, batch.id);
        if (stopped || scope.current !== current) return;
        setBatch(saved); setError('');
        if (['COMPLETED', 'PAUSED'].includes(saved.state) && !finished.current.has(`${workspaceId}:${saved.id}:${saved.version}`)) {
          finished.current.add(`${workspaceId}:${saved.id}:${saved.version}`);
          callback.current?.();
        }
        if (['PLANNING', 'RUNNING'].includes(saved.state)) timer = setTimeout(poll, 2500);
      } catch (failure) {
        if (stopped || scope.current !== current) return;
        setError(failure?.message || 'Progress could not be read. The server batch may still be running; no additional AI request was sent.');
        timer = setTimeout(poll, 10000);
      }
    }
    timer = setTimeout(poll, 1000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [workspaceId, batch?.id, batch?.state]);

  const prepare = useCallback(async targets => {
    const current = scope.current;
    const sequence = ++operation.current;
    setOpened(true); setBusy(true); setError('');
    try {
      const saved = await prepareAiReviewBatch(workspaceId, targets.map(({ responseId, fieldId }) => ({ responseId, fieldId })));
      if (scope.current !== current || operation.current !== sequence) return;
      setBatch(saved);
      if (saved.state === 'RUNNING') setOpened(false);
    } catch (failure) {
      if (scope.current === current && operation.current === sequence) setError(failure?.message || 'The PDFs could not be prepared. No AI review was started.');
    } finally {
      if (scope.current === current && operation.current === sequence) setBusy(false);
    }
  }, [workspaceId]);
  async function start(options) {
    const current = scope.current;
    setBusy(true); setError('');
    try {
      const saved = await startAiReviewBatch(workspaceId, batch.id, options);
      if (scope.current === current) { setBatch(saved); setOpened(false); }
    } catch (failure) { if (scope.current === current) setError(failure?.message || 'The batch could not start. Check saved progress before trying again.'); }
    finally { if (scope.current === current) setBusy(false); }
  }
  async function resume() {
    const current = scope.current;
    setBusy(true); setError('');
    try {
      const saved = await resumeAiReviewBatch(workspaceId, batch.id);
      if (scope.current === current) setBatch(saved);
    } catch (failure) { if (scope.current === current) setError(failure?.message || 'The batch could not continue.'); }
    finally { if (scope.current === current) setBusy(false); }
  }
  function cancel() {
    operation.current += 1;
    setOpened(false); setBusy(false);
    if (batch?.id && ['PLANNING', 'READY'].includes(batch.state)) {
      const current = scope.current;
      cancelAiReviewBatchPreparation(workspaceId, batch.id).then(saved => {
        if (scope.current === current) setBatch(saved);
      }).catch(() => {});
    }
  }
  return { batch, opened, busy, error, prepare, start, resume, cancel, open: () => setOpened(true), running: batch?.state === 'RUNNING' };
}
