// Private links are bearer credentials: possession grants their stated scope.
const PRIVATE_WORKSPACE_KEY = 'side_picker_private_workspace_v1';
const PRIVATE_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
function newPrivateToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
function parseOrganizerLink(value, base = location.href) {
    const url = new URL(value, base);
    const expected = new URL(base);
    if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.search) throw new Error('Use an organizer link for this app.');
    const token = new URLSearchParams(url.hash.slice(1)).get('organizer');
    if (!PRIVATE_TOKEN_PATTERN.test(token || '')) throw new Error('This organizer link is incomplete or invalid.');
    return token;
}
function makePrivateLink(type, token, { room = '', player = '' } = {}, base = location.href) {
    if (!PRIVATE_TOKEN_PATTERN.test(token)) throw new Error('Invalid private link');
    const url = new URL(base); url.search = ''; url.hash = '';
    if (type === 'organizer') url.hash = new URLSearchParams({ organizer: token }).toString();
    else {
        url.search = new URLSearchParams({ room }).toString();
        url.hash = new URLSearchParams({ player, token }).toString();
    }
    return url.href;
}
function parsePlayerLink(hash) {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const token = params.get('token'), player = params.get('player') || '';
    if (!PRIVATE_TOKEN_PATTERN.test(token || '') || player.length > 100) return null;
    return { token, player };
}
async function privateTokenHash(token) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { newPrivateToken, parseOrganizerLink, makePrivateLink, parsePlayerLink, privateTokenHash };
}
