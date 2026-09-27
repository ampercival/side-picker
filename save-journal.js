// Durable, workspace-scoped drafts. No credentials are stored in draft records.
const SAVE_DRAFT_PREFIX = 'side_picker_draft_v1:';
const saveClone = value => JSON.parse(JSON.stringify(value));
class SaveJournal {
    constructor({ storage, workspace, send, changed = () => {}, acknowledged = () => {}, uuid = () => crypto.randomUUID() }) {
        Object.assign(this, { storage, workspace, send, changed, acknowledged, uuid });
        this.entries = new Map(); this.running = new Map(); this.bases = new Map(); this.unsafe = new Set();
    }
    get storageError() { return this.unsafe.size > 0; }
    key(id) { return SAVE_DRAFT_PREFIX + this.workspace + ':' + id; }
    remember(key, version, payload) { this.bases.set(key, { version, payload: saveClone(payload) }); }
    persist(entry) {
        try { this.storage.setItem(this.key(entry.id), JSON.stringify(entry)); this.unsafe.delete(entry.id); }
        catch { this.unsafe.add(entry.id); }
        this.changed();
    }
    stage(key, action, payload, version = null) {
        const latest = { action, payload: saveClone(payload) };
        let entry = this.entries.get(key);
        if (!entry && JSON.stringify(this.bases.get(key)?.payload) === JSON.stringify(payload)) return null;
        if (!entry) {
            entry = { id: this.uuid(), workspace: this.workspace, key, version, latest, request: null, status: 'pending' };
            this.entries.set(key, entry);
        } else {
            if (entry.status === 'blocked' && entry.errorCode === '22023' && JSON.stringify(entry.latest) !== JSON.stringify(latest)) {
                entry.request = null; entry.status = 'pending';
            }
            entry.latest = latest;
        }
        entry.updatedAt = new Date().toISOString();
        // A new local edit must not silently resolve a concurrent edit or invalid link.
        if (!['conflict', 'blocked'].includes(entry.status)) entry.status = 'pending';
        this.persist(entry); return entry;
    }
    async flush(key) {
        if (this.running.has(key)) return this.running.get(key);
        const work = this.run(key); this.running.set(key, work);
        try { return await work; } finally { this.running.delete(key); }
    }
    async run(key) {
        const entry = this.entries.get(key);
        if (!entry) return true;
        if (['conflict', 'blocked'].includes(entry.status)) return false;
        while (this.entries.get(key) === entry) {
            // Freeze the entire request until acknowledged. A lost response must
            // retry the same operation id, even if newer local edits have arrived.
            entry.request ||= { ...saveClone(entry.latest), operation_id: this.uuid(), expected_version: entry.version };
            entry.status = 'saving'; this.persist(entry);
            try {
                const req = entry.request;
                const result = await this.send(req.action, { ...req.payload, operation_id: req.operation_id, expected_version: req.expected_version });
                entry.version = result.save_version;
                this.bases.set(key, { version: entry.version, payload: saveClone(req.payload) });
                this.acknowledged(key, result, req);
                if (JSON.stringify(entry.latest) === JSON.stringify({ action: req.action, payload: req.payload })) {
                    try { this.storage.removeItem(this.key(entry.id)); this.unsafe.delete(entry.id); } catch { this.unsafe.add(entry.id); }
                    this.entries.delete(key); this.changed(); return true;
                }
                entry.request = null; entry.status = 'pending'; this.persist(entry);
            } catch (error) {
                entry.errorCode = error?.code || 'NETWORK';
                entry.status = error?.code === '40001' ? 'conflict' : ['42501','22023'].includes(error?.code) ? 'blocked' : 'failed';
                this.persist(entry); return false;
            }
        }
        return true;
    }
    async flushAll() {
        const results = await Promise.all([...this.entries.keys()].map(key => this.flush(key)));
        return results.every(Boolean);
    }
    drafts() {
        const found = new Map();
        try {
            for (let i = 0; i < this.storage.length; i++) {
                const key = this.storage.key(i);
                if (!key?.startsWith(this.key(''))) continue;
                try {
                    const e = JSON.parse(this.storage.getItem(key));
                    const p = e.latest?.payload;
                    if (e.workspace === this.workspace && e.id && typeof e.key === 'string' && typeof p?.name === 'string'
                        && Array.isArray(p.factions) && (e.key.startsWith('preset:') || (e.key.startsWith('session:') && Array.isArray(p.players)))) found.set(e.id, e);
                } catch { /* Leave corrupt records untouched, never upload them. */ }
            }
        } catch { this.unsafe.add('read'); }
        for (const e of this.entries.values()) found.set(e.id, saveClone(e));
        return [...found.values()];
    }
    discard(id) {
        if ([...this.entries].some(([key,e]) => e.id === id && this.running.has(key))) return false;
        try { this.storage.removeItem(this.key(id)); this.unsafe.delete(id); } catch { this.unsafe.add(id); return false; }
        for (const [key,e] of this.entries) if (e.id === id) this.entries.delete(key);
        this.changed(); return true;
    }
}
if (typeof module !== 'undefined') module.exports = { SaveJournal, SAVE_DRAFT_PREFIX };
