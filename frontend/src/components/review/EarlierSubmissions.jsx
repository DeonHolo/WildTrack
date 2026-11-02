import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Paper, Stack, Text } from '@mantine/core';
import { getEarlierSubmissions } from '../../lib/api.js';
import { formatDateTime } from '../../lib/workflow.js';
import './FileHistory.css';

export function EarlierSubmissions({ workspaceId, responseId, fields = [] }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const target = useRef(null);
  useEffect(() => {
    const scope = {};
    target.current = scope;
    setRows(null); setError(''); setLoading(false);
    return () => { if (target.current === scope) target.current = null; };
  }, [workspaceId, responseId]);
  async function load() {
    if (rows || loading || !workspaceId || !responseId) return;
    const scope = target.current;
    setLoading(true); setError('');
    try {
      const result = await getEarlierSubmissions(workspaceId, responseId);
      if (target.current === scope) setRows(result || []);
    } catch { if (target.current === scope) setError('Earlier submissions could not be loaded.'); }
    finally { if (target.current === scope) setLoading(false); }
  }
  return <details className="wt-file-history-older" onToggle={event => { if (event.currentTarget.open) load(); }}>
    <summary>Earlier submissions{rows?.length ? ` (${rows.length})` : ''}</summary>
    <Stack gap="sm" mt="sm">
      <Text size="sm" c="dimmed">Only the latest submission for this Student Number and deliverable is current. Earlier account submissions are kept here.</Text>
      {loading ? <Text size="sm" role="status">Loading earlier submissions…</Text> : null}
      {error ? <Alert color="orange"><Text size="sm">{error}</Text><Button variant="subtle" size="xs" onClick={load}>Try again</Button></Alert> : null}
      {rows?.length === 0 ? <Text size="sm">No earlier account submissions.</Text> : null}
      {rows?.map(row => {
        let values = {};
        try { values = JSON.parse(row.valuesJson || '{}'); } catch { /* Keep the historical record visible. */ }
        return <Paper key={row.id} withBorder p="sm">
          <Stack gap="xs">
            <Text fw={600} size="sm">Saved {formatDateTime(row.updatedAt || row.submittedAt)}</Text>
            <Text size="sm" c="dimmed">{row.googleEmail}</Text>
            {Object.entries(values).map(([key, value]) => {
              const field = fields.find(item => (item.id === key || item.definitionId === key || item.fieldKey === key));
              const displayValue = answer => field?.options?.find(option => option.id === answer)?.label || String(answer ?? '');
              const text = Array.isArray(value) ? value.map(displayValue).join(', ') : displayValue(value);
              return <Text key={key} size="sm" style={{ overflowWrap: 'anywhere' }}>
                <Text component="span" fw={600}>{field?.label || (/^(?:field-)?[0-9a-f]{8}-[0-9a-f-]+$/i.test(key) ? 'Earlier field' : key)}: </Text>
                {/^https?:\/\//i.test(text) ? <a href={text} target="_blank" rel="noreferrer">Open submitted file or link</a> : text}
              </Text>;
            })}
          </Stack>
        </Paper>;
      })}
    </Stack>
  </details>;
}
