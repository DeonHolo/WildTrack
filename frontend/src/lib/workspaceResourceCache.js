// Per WorkspaceSession provider; disposable server results, never browser persistence.
export function createWorkspaceResourceCache() {
  const entries = new Map();
  const ttl = 60_000;
  const limit = 20;

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
    },
    remove(key) { entries.delete(key); },
    clear() { entries.clear(); }
  };
}
