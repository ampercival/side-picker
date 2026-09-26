// Shared result snapshots are untrusted, whether received from a link or the DB.
const RESULT_LIMITS = Object.freeze({ encodedLength: 65536, rows: 100, textLength: 500 });

function validateResultsPayload(value) {
    const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const text = v => typeof v === 'string' && v.length <= RESULT_LIMITS.textLength;
    const optionalText = v => v === undefined || text(v);
    if (!record(value) || value.v !== 1 || !Array.isArray(value.r) ||
        value.r.length === 0 || value.r.length > RESULT_LIMITS.rows ||
        !optionalText(value.t) || !optionalText(value.gm) || !optionalText(value.g) ||
        !Number.isFinite(value.pct) || value.pct < -10000 || value.pct > 100) return null;

    // Keep negative scores/percentages readable for previously published forced-ban results.
    const rows = [];
    for (const row of value.r) {
        if (!record(row) || !text(row.n) || !row.n.trim() || !text(row.f) || !row.f.trim() ||
            !text(row.note) || !Number.isFinite(row.s) || row.s < -1000 || row.s > 10) return null;
        rows.push({ n: row.n, f: row.f, note: row.note, s: row.s });
    }
    return { v: 1, t: value.t || '', gm: value.gm || '', g: value.g || '', pct: value.pct, r: rows };
}

// UTF-8 safe, URL-safe Base64. Bound input before allocating decoded data.
function encodeData(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeData(str) {
    if (typeof str !== 'string' || !str.length || str.length > RESULT_LIMITS.encodedLength ||
        !/^[A-Za-z0-9_-]+$/.test(str)) throw new Error('Invalid results link');
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

// Use text nodes even when called directly with an invalid value. Validation is
// not a substitute for safe rendering, including the previously unsafe score.
function buildResultCard({ name, faction, note, score, index }) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = `${Number.isFinite(index) ? index * 0.1 : 0}s`;
    const numericScore = Number.isFinite(score) ? score : null;
    const scoreLabel = numericScore === null ? 'Unavailable' : numericScore >= 0 ? `+${numericScore}` : `${numericScore}`;
    const fields = [
        ['player', name],
        ['assigned-faction', faction],
        [numericScore !== null && numericScore < 0 ? 'score-badge negative' : 'score-badge', `${note} (${scoreLabel})`]
    ];
    fields.forEach(([className, label]) => {
        const el = document.createElement('div');
        el.className = className;
        el.textContent = label;
        card.appendChild(el);
    });
    return card;
}

function describeResultRows(rows) {
    const first = rows.filter(r => r.note === 'Choice #1').length;
    const topThree = rows.filter(r => /^Choice #[123]$/.test(r.note)).length;
    const unranked = rows.filter(r => r.note === 'Choice').length;
    const neutral = rows.filter(r => r.note === 'Neutral').length;
    const forced = rows.filter(r => r.s < 0).length;
    const parts = [`First choices: ${first}`, `Top-three choices (including first): ${topThree}`,
        `Unranked preferences: ${unranked}`, `Neutral: ${neutral}`];
    if (forced) parts.push(`Legacy forced bans: ${forced}`);
    return parts.join(' · ');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RESULT_LIMITS, validateResultsPayload, encodeData, decodeData, buildResultCard, describeResultRows };
}
