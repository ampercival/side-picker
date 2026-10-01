const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const catalog=require('../translations-fr.js');
function app(stored='en', storageFails=false) {
    const writes=[],buttons=['en','fr'].map(language=>({dataset:{language},attributes:{},setAttribute(name,value){this.attributes[name]=value;}}));
    const doc={documentElement:{lang:'en'},querySelectorAll:()=>buttons,addEventListener(){}};
    const ctx=vm.createContext({Intl,console,queueMicrotask,document:doc,
        localStorage:{getItem:()=>stored,setItem(key,value){if(storageFails)throw Error('blocked');writes.push([key,value]);}}});
    vm.runInContext(fs.readFileSync('translations-fr.js','utf8')+'\n'+fs.readFileSync('i18n.js','utf8'),ctx);
    return {ctx,doc,buttons,writes,run:code=>vm.runInContext(code,ctx)};
}
test('all static app and privacy copy, hints and accessibility labels have Quebec French translations',()=>{
    const known=new Set(['EN','FR']);
    const decode=s=>s.replace(/&(?:amp|lt|gt|quot|#39|nbsp|copy);/g,c=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&nbsp;':' ','&copy;':'©'})[c]);
    for(const file of ['index.html','privacy.html']) {
        const source=fs.readFileSync(file,'utf8').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/g,'');
        const copy=[...source.matchAll(/(?:aria-label|title|placeholder|alt)="([^"]+)"/g)].map(m=>m[1]);
        copy.push(...source.split(/<[^>]*>/).filter(s=>/[a-z]/i.test(s)));
        for(const value of copy){const key=decode(value).trim().replace(/\s+/g,' ');if(!/[a-z]/i.test(key.replace(/&[a-z]+;/gi,'')))continue;assert.ok(known.has(key)||Object.hasOwn(catalog,key),`${file}: missing ${key}`);}
    }
});
test('switching updates copy and accessibility in place, preserves input, callbacks and private data, and remembers the choice',()=>{
    const {ctx,run,doc,buttons,writes}=app();
    ctx.el={textContent:'',isConnected:true,value:'Unsaved user edits',selectionStart:4,onclick:()=>42,attributes:{},setAttribute(k,v){this.attributes[k]=v;}};
    ctx.name={isConnected:true,setAttribute(){}};
    run("uiText(el,'All changes saved');uiAttr(el,'aria-label','Rank for Neutral');userText(name,'Neutral');setUILanguage('fr')");
    assert.equal(ctx.el.textContent,catalog['All changes saved']);assert.equal(ctx.el.attributes['aria-label'],'Rang de Neutral');
    assert.equal(ctx.el.value,'Unsaved user edits');assert.equal(ctx.el.selectionStart,4);assert.equal(ctx.el.onclick(),42);assert.equal(ctx.name.textContent,'Neutral');
    assert.equal(doc.documentElement.lang,'fr-CA');assert.equal(buttons[1].attributes['aria-pressed'],'true');assert.equal(writes[0][1],'fr');
    run("setUILanguage('en')");assert.equal(ctx.el.textContent,'All changes saved');assert.equal(ctx.el.attributes['aria-label'],'Rank for Neutral');assert.equal(ctx.name.textContent,'Neutral');
});
test('French works when browser storage is blocked; dynamic updates and detached-node cleanup remain safe',()=>{
    const {ctx,run,doc}=app('en',true);ctx.el={isConnected:true};
    run("setUILanguage('fr');uiText(el,'Submitted');setUILanguage('fr')");assert.equal(ctx.el.textContent,'Choix soumis');assert.equal(doc.documentElement.lang,'fr-CA');
    ctx.el.isConnected=false;run("setUILanguage('en')");assert.equal(ctx.el.textContent,'Choix soumis');
});
test('templates and user content are preserved while cloned UI and dynamic messages translate completely',()=>{
    const {ctx,run}=app();
    ctx.copy={nodeType:3,textContent:'Available',isConnected:true,parentElement:{closest:()=>null}};
    ctx.name={nodeType:3,textContent:'Available',isConnected:true,parentElement:{closest:()=>({})}};
    run("uiTree(copy);uiTree(name);setUILanguage('fr')");assert.equal(ctx.copy.textContent,'Sans préférence');assert.equal(ctx.name.textContent,'Available');
    for(const source of ['2/3 submitted','Rank 3','Use at most 100 entries in one session. Nothing was added.',
        '2 of 5 seats taken; at least 3 needed. Seats can\'t exceed the number of factions.',
        '1 of 5 seats taken; the organizer needs at least 3. Enter your name to take a seat.',
        'Only 1 player has joined','Added 2 players','Added 2 factions','Choice #3','Saved choices changed elsewhere. Your edits are still here; choose which version to use.',
        'Someone named Alex has already joined. Add an initial or a nickname.']){
        ctx.source=source;assert.notEqual(run('translateUI(source)'),source,source);
    }
    ctx.source='Moved in 2 sessions and 1 saved game.';assert.equal(run('translateUI(source)'),'Éléments transférés : 2 séances et 1 jeu enregistré.');
    for(const value of ['constructor','__proto__','toString']){ctx.source=value;assert.equal(run('translateUI(source)'),value);}
    assert.equal(run("t('Signed in as {0} with {1}.','Alex with Morgan','Google')"),'Connecté sous le nom de Alex with Morgan avec Google.');
    assert.equal(run("t('{0}: {1} ({2} points)','Alex: Jr','Neutral',10)"),'Alex: Jr : Neutral (10 points)');
    assert.equal(run("translateUI('Personal invitation for Alex  Morgan')"),'Invitation personnelle de Alex  Morgan');
});
test('shared results localize for the reader while canonical labels and encoded links stay unchanged',()=>{
    const {ctx,run}=app();
    vm.runInContext(fs.readFileSync('results.js','utf8')+'\n'+fs.readFileSync('sharing.js','utf8'),ctx);
    ctx.payload={v:1,t:'Neutral',gm:'Available',g:'Fairest for Everyone',pct:70,r:[{n:'Choice #1',f:'Open',note:'Choice #3',s:5},{n:'<img>',f:'Neutral',note:'Neutral',s:0}]};
    const before=JSON.stringify(ctx.payload);
    run("setUILanguage('fr')");const summary=run('formatResultsSummary(payload)');
    assert.match(summary,/Neutral · Available/);assert.match(summary,/Objectif : Le plus équitable pour tous/);assert.match(summary,/Choice #1 : Open — Choix nº 3 \(\+5 points\)/);assert.match(summary,/<img> : Neutral — Sans préférence/);
    assert.equal(JSON.stringify(ctx.payload),before);
    assert.match(run('describeResultRows(payload.r)'),/Neutral: 1/); // Stored semantics stay in English.
    run("setUILanguage('en')");assert.match(run('formatResultsSummary(payload)'),/Goal: Fairest for Everyone/);
});
test('French punctuation, dates and numbers follow Quebec conventions',()=>{
    const {run}=app();run("setUILanguage('fr')");
    assert.equal(run("t('Delete your account?')"),'Supprimer votre compte ?');
    assert.equal(run('uiNumber(1234.5)'),new Intl.NumberFormat('fr-CA').format(1234.5));
    assert.match(run("uiDate('2026-09-27T18:30:00Z')"),/27 septembre 2026/);
    assert.equal(run("t('{0}%', uiNumber(70))"),'70 %');
    for(const [key,value]of Object.entries(catalog)){
        assert.ok(!/(?:[^\s]| )[:;!?]/.test(value),`${key}: French nonbreaking punctuation spacing`);
        const placeholders=s=>[...s.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort();
        assert.deepEqual(placeholders(value),placeholders(key),`${key}: placeholder preservation`);
    }
});
