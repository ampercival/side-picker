// Recovery is deliberate: copies preserve local work without overwriting a
// newer cloud version or silently replaying a draft still open in another tab.
function renderSaveStatus() {
    const box = get('save-status'); if (!box || isGuestMode || isSharedMode) return;
    const j = journal; box.hidden = !j; if (!j) return;
    const current = [...j.entries.values()], drafts = j.drafts();
    let text = 'All changes saved';
    if (j.storageError) text = 'Browser backup unavailable. Keep this tab open until saving succeeds.';
    else if (current.some(e => e.status === 'conflict')) text = 'Changed elsewhere. Your edits are kept here; save a recovery copy.';
    else if (current.some(e => e.status === 'blocked')) text = 'Save needs attention. Your edits are kept here; check your organizer link or session setup.';
    else if (current.some(e => e.status === 'failed')) text = 'Waiting to save. Your edits are backed up in this browser.';
    else if (current.some(e => e.status === 'saving')) text = 'Saving…';
    else if (current.length) text = 'Changes backed up here. Waiting to save…';
    else if (drafts.length) text = 'Unsaved drafts found in this browser. Review them before continuing.';
    else if (workspaceLoadFailed) text = 'Cloud games could not be loaded. Check your connection and retry.';
    uiText(get('save-status-text'), text);
    get('retry-saves').hidden = !current.length && !workspaceLoadFailed;
    get('review-drafts').hidden = !drafts.length;
    uiText(get('review-drafts'), `Review drafts (${drafts.length})`);
}
async function retrySaves() {
    if (journal) {
        await journal.flushAll();
        if (workspaceLoadFailed && !activeSessionName) {
            await loadSessionsFromDb(); renderHomeSessions(); renderPresetOptions();
        }
        renderSaveStatus();
    }
}
function openDrafts() {
    const j = ensureJournal(), list = get('draft-list'); list.replaceChildren();
    for (const draft of j?.drafts() || []) {
        const row = document.createElement('div'); row.className = 'draft-row';
        const title = document.createElement('p'); uiText(title, () => `${draft.latest.payload.session_name || draft.latest.payload.name} · ${uiDate(draft.updatedAt)}`);
        const copy = document.createElement('button'); copy.className = 'btn secondary'; uiText(copy, 'Save as separate copy');
        copy.disabled = j.running.has(draft.key);
        copy.onclick = async () => {
            copy.disabled = true;
            const data = draft.latest.payload;
            const name = t('{0} (recovered {1})', (data.session_name || data.name).slice(0,430), crypto.randomUUID().slice(0,8));
            let ok;
            if (draft.key.startsWith('session:')) {
                const s = mapRowToSession(data); s.sessionName = name; s.roomCode = '';
                ok = await upsertSessionToDb(name, s);
            } else ok = await upsertPresetToDb(name, data.factions);
            if (ok) {
                j.discard(draft.id);
                // The old editor must never write the discarded draft back.
                activeSessionName = null; state.roomCode = ''; deactivateRoomSync();
                await loadSessionsFromDb(); closeModals(); renderHomeSessions(); renderPresetOptions(); switchView('view-home');
                showToast('success', 'Recovery copy saved', `Your saved original was left intact. Look for "${name}".`);
            } else { copy.disabled = false; renderSaveStatus(); }
        };
        const discard = document.createElement('button'); discard.className = 'btn secondary'; uiText(discard, 'Discard this draft');
        discard.disabled = j.running.has(draft.key);
        discard.onclick = () => showConfirm('Discard local draft?', 'This removes these unsaved edits from this browser. The cloud game stays unchanged.', async () => {
            if (!j.discard(draft.id)) return;
            activeSessionName = null; state.roomCode = ''; deactivateRoomSync();
            await loadSessionsFromDb(); renderHomeSessions(); renderPresetOptions(); switchView('view-home');
        }, 'Discard draft', 'danger');
        row.append(title, copy, discard); list.appendChild(row);
    }
    get('modal-overlay').classList.add('active'); get('draft-modal').classList.add('active');
}
window.addEventListener('online', retrySaves);
window.addEventListener('storage', event => { if (event.key?.startsWith(SAVE_DRAFT_PREFIX)) renderSaveStatus(); });
window.addEventListener('beforeunload', event => {
    if (journal?.storageError && journal.entries.size) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden && !isGuestMode) void flushSession();
});
setInterval(() => { if (!document.hidden && !isGuestMode) void retrySaves(); }, 15000);
