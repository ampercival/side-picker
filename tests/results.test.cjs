const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { RESULT_LIMITS, validateResultsPayload, encodeData, decodeData, buildResultCard } = require('../results.js');

const sample = () => ({ v: 1, t: 'Friday 🎲', gm: 'Dune', g: 'Fairest for Everyone', pct: 85,
    r: [{ n: 'Élodie', f: 'Atreides', note: 'Choice #1', s: 10 }, { n: '李', f: 'Fremen', note: 'Choice #2', s: 7 }] });

test('existing v1 links round-trip Unicode and both positive and legacy negative scores', () => {
    assert.deepEqual(validateResultsPayload(decodeData(encodeData(sample()))), sample());
    const old = sample(); old.r[0].s = -1000; old.pct = -4965;
    assert.deepEqual(validateResultsPayload(decodeData(encodeData(old))), old);
});

test('rejects invalid version, rows, metadata, numeric coercions, and resource limits', () => {
    for (const bad of [null, [], {}, { ...sample(), v: 2 }, { ...sample(), pct: Infinity },
        { ...sample(), pct: '85' }, { ...sample(), pct: 101 }, { ...sample(), t: {} },
        { ...sample(), r: [] }, { ...sample(), r: Array(101).fill(sample().r[0]) },
        { ...sample(), t: 'a'.repeat(501) }]) assert.equal(validateResultsPayload(bad), null);
    for (const badRow of [null, [], { ...sample().r[0], n: '' }, { ...sample().r[0], f: {} },
        { ...sample().r[0], note: [] }, { ...sample().r[0], s: '10' },
        { ...sample().r[0], s: '<img src=x onerror=alert(1)>' },
        { ...sample().r[0], s: NaN }, { ...sample().r[0], s: 11 }]) {
        assert.equal(validateResultsPayload({ ...sample(), r: [badRow] }), null);
    }
    const extra = { ...sample(), unknown: '<script>bad</script>' };
    assert.deepEqual(validateResultsPayload(extra), sample());
});

test('decoding rejects malformed and oversized input before rendering', () => {
    for (const value of ['', '%bad', 'a', 'a'.repeat(RESULT_LIMITS.encodedLength + 1),
        Buffer.from('not JSON').toString('base64url'), '_w']) assert.throws(() => decodeData(value));
});

test('card rendering never parses supplied markup, including the former score injection', () => {
    const previous = global.document;
    const create = tag => ({ tag, children: [], style: {},
        set innerHTML(_) { assert.fail('Result cards must not parse HTML'); },
        appendChild(el) { this.children.push(el); } });
    global.document = { createElement: create };
    try {
        const markup = '<img src=x onerror=alert(1)>';
        const card = buildResultCard({ name: markup, faction: markup, note: markup, score: markup, index: 0 });
        assert.equal(card.children[0].textContent, markup);
        assert.equal(card.children[1].textContent, markup);
        assert.equal(card.children[2].textContent, `${markup} (Unavailable)`);
        assert.equal(card.children.length, 3);
    } finally { global.document = previous; }
});

test('invalid links get their own recoverable view and do not initialize a workspace', () => {
    for (const hash of ['#results=', '#results', '#results=broken', `#results=${encodeData({ ...sample(), v: 2 })}`]) {
        let startup, activeView, focused;
        const element = id => ({ style: {}, classList: { add() { if (id.startsWith('view-')) activeView = id; }, remove() {} }, focus() { focused = id; } });
        const context = vm.createContext({ console, TextEncoder, TextDecoder, atob, btoa,
            location: { hash }, localStorage: { getItem: () => null },
            window: { matchMedia: () => ({ matches: true }) },
            document: { documentElement: { removeAttribute() {} }, body: element('body'),
                getElementById: id => id === 'theme-toggle' ? null : element(id), querySelectorAll: () => [],
                addEventListener: (_, fn) => { startup = fn; } }, parseRoomFromUrl: () => null });
        vm.runInContext(fs.readFileSync('results.js', 'utf8') + '\n' + fs.readFileSync('script.js', 'utf8'), context);
        startup();
        assert.equal(activeView, 'view-invalid-results');
        assert.equal(focused, 'invalid-results-title');
    }
});
