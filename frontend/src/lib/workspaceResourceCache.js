// Disposable display snapshots, shared across tabs. Every mount revalidates with the server.
// Private keys include the verified account, roles and workspace; these never authorize actions.
export function createWorkspaceResourceCache({ storageKey = 'wildtrack.resource-snapshots.v2', ttl = 30 * 24 * 60 * 60 * 1000 } = {}) {
  const entries = new Map();
  const limit = 20;
  const maxBytes = 1_500_000;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) for (const entry of saved.slice(-limit)) {
      if (typeof entry.key === 'string' && entry.data !== undefined && Number.isFinite(entry.updatedAt)
          && entry.updatedAt <= Date.now() && Date.now() - entry.updatedAt < ttl) {
        entries.set(entry.key, { data: entry.data, updatedAt: entry.updatedAt, pending: null });
      }
    }
  } catch { /* Storage may be disabled or contain an expired format. */ }

  function persist() {
    try {
      const snapshots = [...entries].filter(([, entry]) => entry.data !== undefined && Date.now() - entry.updatedAt < ttl)
        .map(([key, entry]) => ({ key, data: entry.data, updatedAt: entry.updatedAt }));
      let serialized = JSON.stringify(snapshots);
      while (serialized.length > maxBytes && snapshots.length) {
        snapshots.shift(); serialized = JSON.stringify(snapshots);
      }
      if (snapshots.length) localStorage.setItem(storageKey, serialized);
      else localStorage.removeItem(storageKey);
    } catch {
      // Never leave an older persisted snapshot after a newer write fails.
      try { localStorage.removeItem(storageKey); } catch { /* Storage is disabled. */ }
    }
  }

  function entryFor(key) {
    let entry = entries.get(key);
    if (!entry) {
      entry = { data: undefined, updatedAt: 0, pending: null };
      entries.set(key, entry);
    }
    while (entries.size > limit) entries.delete(entries.keys().next().value);
    return entry;
  }

  return {
    retainAccount(accountKey) {
      for (const key of entries.keys()) {
        try { if (!accountKey || JSON.parse(key)[0] !== accountKey) entries.delete(key); }
        catch { entries.delete(key); }
      }
      persist();
    },
    read(key) {
      const entry = entries.get(key);
      return entry && Date.now() - entry.updatedAt < ttl ? entry.data : undefined;
    },
    async load(key, load) {
      const entry = entryFor(key);
      if (entry.pending) return entry.pending;
      const pending = Promise.resolve().then(load).then(data => {
        if (entries.get(key) === entry) {
          entry.data = data;
          entry.updatedAt = Date.now();
          persist();
        }
        return data;
      }).finally(() => { if (entry.pending === pending) entry.pending = null; });
      entry.pending = pending;
      return pending;
    },
    write(key, data) {
      // Replace the entry so an older read cannot overwrite a successful mutation.
      entries.delete(key);
      entries.set(key, { data, updatedAt: Date.now(), pending: null });
      while (entries.size > limit) entries.delete(entries.keys().next().value);
      persist();
    },
    remove(key) { entries.delete(key); persist(); },
    invalidate() {
      // Keep display data, but detach reads started before a server mutation.
      for (const [key, entry] of entries) entries.set(key, { ...entry, pending: null });
    },
    clear() { entries.clear(); persist(); }
  };
}
