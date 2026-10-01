// English source copy is the lookup key. Locale affects presentation only.
const UI_LANGUAGE_KEY = 'side_picker_language_v1';
let uiLanguage = 'en';
const uiBindings = new Map();
let uiCleanupPending = false;
const uiAttributes = ['aria-label', 'title', 'placeholder', 'alt'];
const uiUserSelectors = '[data-user-copy], .player-name, .faction-name, .tag .name, .sc-name, .session-name, .rs-name, .gr-chip';
const uiCatalog = typeof SIDE_PICKER_FR !== 'undefined' ? SIDE_PICKER_FR
    : typeof module !== 'undefined' ? require('./translations-fr.js') : {};
const uiPatterns = Object.entries(uiCatalog).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => {
    const order = [];
    const pattern = key.split(/(\{\d+\})/).map(part => {
        if (/^\{\d+\}$/.test(part)) { order.push(Number(part.slice(1, -1))); return '([\\s\\S]*?)'; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    return {key, value, order, regex: new RegExp('^' + pattern + '$')};
}).sort((a, b) => b.key.replace(/\{\d+\}/g, '').length - a.key.replace(/\{\d+\}/g, '').length);

function uiLocale() { return uiLanguage === 'fr' ? 'fr-CA' : 'en-CA'; }
function t(key, ...values) {
    const copy = uiLanguage === 'fr' && Object.hasOwn(uiCatalog, key) ? uiCatalog[key] : key;
    return copy.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match);
}
function translateUI(source) {
    const text = String(source ?? '');
    if (uiLanguage !== 'fr') return text;
    // Normalize layout whitespace, while retaining the spaces around inline emphasis.
    const core = text.trim().replace(/\s+/g, ' ');
    let translated = Object.hasOwn(uiCatalog, core) ? uiCatalog[core] : undefined;
    if (translated === undefined) {
        for (const pattern of uiPatterns) {
            // Match dynamic copy before whitespace normalization so names and
            // other supplied placeholder values retain their exact spelling.
            const match = text.trim().match(pattern.regex);
            if (!match) continue;
            const values = [];
            pattern.order.forEach((index, i) => { values[index] = match[i + 1]; });
            if (pattern.key.startsWith('Moved in ') || pattern.key.startsWith('This browser has ')) values[0] = localizeGameCounts(values[0]);
            if (pattern.key === '{0} on {1}') { values[0] = translateUI(values[0]); values[1] = translateUI(values[1]); }
            if (pattern.key.startsWith('Saved to your account.') || pattern.key.startsWith('Your sessions are now')) values[0] = translateUI(values[0]);
            translated = pattern.value.replace(/\{(\d+)\}/g, (_, index) => values[index]);
            break;
        }
    }
    if (translated === undefined) return text;
    return (/^\s/.test(text) ? ' ' : '') + translated + (/\s$/.test(text) ? ' ' : '');
}
function bindUI(element, slot, source) {
    let bindings = uiBindings.get(element);
    if (!bindings) { bindings = new Map(); uiBindings.set(element, bindings); }
    bindings.set(slot, source);
    renderUIBinding(element, slot, source);
    // Polling and picker refreshes replace nodes. Drop detached bindings after
    // their synchronous render has finished, so repeated updates stay lightweight.
    if (typeof document !== 'undefined' && !uiCleanupPending) {
        uiCleanupPending = true;
        queueMicrotask(() => {
            uiCleanupPending = false;
            for (const node of uiBindings.keys()) if (node.isConnected === false) uiBindings.delete(node);
        });
    }
}
function renderUIBinding(element, slot, source) {
    const value = typeof source === 'function' ? source() : translateUI(source);
    if (slot === 'text') element.textContent = value;
    else if (slot === 'value') element.value = value;
    else element.setAttribute(slot, value);
}
function uiText(element, source) { if (element) bindUI(element, 'text', source); }
function uiAttr(element, name, source) { if (element) bindUI(element, name, source); }
function uiValue(element, source) { if (element) bindUI(element, 'value', source); }
function userText(element, source) {
    if (!element) return;
    uiBindings.get(element)?.delete('text');
    element.setAttribute?.('data-user-copy', '');
    element.textContent = source;
}
function uiTree(root) {
    if (!root) return;
    if (root.nodeType === 3) {
        if (root.textContent.trim() && !root.parentElement?.closest(uiUserSelectors)) uiText(root, root.textContent);
        return;
    }
    // Template contents stay in English. Each clone is localized when it is created.
    if (['SCRIPT', 'STYLE', 'SVG', 'TEMPLATE'].includes(root.tagName) || root.matches?.(uiUserSelectors)) return;
    for (const name of uiAttributes) if (root.hasAttribute?.(name)) uiAttr(root, name, root.getAttribute(name));
    for (const child of [...(root.childNodes || [])]) uiTree(child);
}
function uiHTML(element, html) { element.innerHTML = html; uiTree(element); }
function uiNumber(number) { return new Intl.NumberFormat(uiLocale()).format(number); }
function uiDate(value, dateOnly = false) {
    if (!Number.isFinite(new Date(value).getTime())) return t('Date unavailable');
    return new Intl.DateTimeFormat(uiLocale(), dateOnly
        ? {day:'numeric', month:'long', year:'numeric'}
        : {day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).format(new Date(value));
}
function localizeGameCounts(source) {
    return source.split(' and ').map(translateUI).join(uiLanguage === 'fr' ? ' et ' : ' and ');
}
function formatResultSubtitle(session, game, goal) {
    return [session, game, goal ? t('Goal: {0}', t(goal)) : ''].filter(Boolean).join(' · ') || t('Final assignments');
}
function setUILanguage(language, persist = true) {
    uiLanguage = language === 'fr' ? 'fr' : 'en';
    if (persist) { try { localStorage.setItem(UI_LANGUAGE_KEY, uiLanguage); } catch { /* Switching still works without storage. */ } }
    if (typeof document === 'undefined') return;
    document.documentElement.lang = uiLocale();
    for (const [element, bindings] of uiBindings) {
        if (element.isConnected === false) { uiBindings.delete(element); continue; }
        for (const [slot, source] of bindings) renderUIBinding(element, slot, source);
    }
    for (const button of document.querySelectorAll('[data-language]')) button.setAttribute('aria-pressed', String(button.dataset.language === uiLanguage));
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
    try { uiLanguage = localStorage.getItem(UI_LANGUAGE_KEY) === 'fr' ? 'fr' : 'en'; } catch { /* Default English. */ }
    uiTree(document.documentElement);
    for (const button of document.querySelectorAll('[data-language]')) button.addEventListener('click', () => setUILanguage(button.dataset.language));
    setUILanguage(uiLanguage, false);
});
if (typeof module !== 'undefined') module.exports = {t, translateUI, uiText, uiAttr, uiValue, userText, uiTree, uiHTML, uiLocale, uiNumber, uiDate, formatResultSubtitle, setUILanguage};
