// Isolated browser fixture. No production requests. Restart resets all sample data.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const workspaces = new Map();
const rotatedWorkspaces = new Map();
const make = () => ({owner_key:crypto.randomUUID(),sessions:[],presets:[]});
workspaces.set('a'.repeat(64), {...make(),sessions:[{id:'sample',save_version:crypto.randomUUID(),name:'Ban conflict fixture',session_name:'Ban conflict fixture',game_title:'Example Game',factions:['A','B'],room_code:null,results:null,updated_at:new Date().toISOString(),players:['Alex','Jordan'].map((name,i)=>({id:'p'+i,name,preferences:['A'],bans:['B'],expanded:true,noPreference:false}))}]});
const rooms = new Map(), picks = new Map(), receipts = new Map();
let offline=false, loseNext=false, delay=0;
const fixture = `window.SUPABASE_CONFIG={url:'https://fixture.invalid',publishableKey:'fixture'};
localStorage.removeItem('side_picker_workspace_key');
if(!localStorage.getItem('side_picker_private_workspace_v1'))localStorage.setItem('side_picker_private_workspace_v1',JSON.stringify({credential:'${'a'.repeat(64)}',ownerKey:'fixture'}));
window.supabase={createClient:()=>({rpc:async(fn,args)=>{const r=await fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn,args})});return r.json()}})};`;
const files = new Set(['/index.html','/style.css','/script.js','/rooms.js','/results.js','/optimizer.js','/access.js','/save-journal.js','/persistence.js']);
function fail(message='Invalid link',code='42501'){throw {message,code};}
function invitation(seed,player){return crypto.createHmac('sha256',seed).update(player).digest('hex');}
function rpc(fn,args){
    const {action,credential,payload={}}=args;
    if(fn==='sp_workspace' && ['save_session','delete_session','save_preset','delete_preset','rename_preset'].includes(action)){
        if(offline) fail('Fixture disconnected','FETCH_ERROR');
        const w=workspaces.get(credential)||rotatedWorkspaces.get(crypto.createHash('sha256').update(credential).digest('hex')); if(!w)fail();
        const source=payload.original_name||payload.name, items=action.includes('session')?w.sessions:w.presets;
        const prior=receipts.get(w.owner_key+payload.operation_id), fingerprint=JSON.stringify(args);
        if(prior){if(prior.fingerprint!==fingerprint)fail('Changed retry','22023');return prior.result;}
        if(!payload.operation_id||!Object.hasOwn(payload,'expected_version'))fail('Refresh the app','22023');
        const row=items.find(x=>x.name===source);
        if((row?.save_version||null)!==payload.expected_version)fail('Changed elsewhere','40001');
        if(action==='rename_preset'){
            const target=w.presets.find(p=>p.name===payload.name);
            if((target?.save_version||null)!==payload.target_version)fail('Target changed','40001');
            w.presets=w.presets.filter(p=>p.name!==source&&p.name!==payload.name);
            w.presets.push({name:payload.name,factions:payload.factions,save_version:crypto.randomUUID()});
        }else rpc('fixture_legacy',args);
        const updated=(action.includes('session')?w.sessions:w.presets).find(x=>x.name===payload.name);
        if(updated)updated.save_version=crypto.randomUUID();
        const result=updated?JSON.parse(JSON.stringify(updated)):{save_version:null};
        receipts.set(w.owner_key+payload.operation_id,{fingerprint,result});return result;
    }
    if(fn==='sp_workspace'||fn==='fixture_legacy'){
        if(!/^[a-f0-9]{64}$/.test(credential||''))fail();
        if(action==='create'&&!workspaces.has(credential))workspaces.set(credential,make());
        const digest=crypto.createHash('sha256').update(credential).digest('hex');
        const w=workspaces.get(credential)||rotatedWorkspaces.get(digest);if(!w)fail();
        if(action==='create')return {owner_key:w.owner_key};
        if(action==='load')return w;
        if(action==='rotate'){
            for(const map of [workspaces,rotatedWorkspaces])for(const [key,value]of map)if(value===w)map.delete(key);
            rotatedWorkspaces.set(payload.token_hash,w);return {owner_key:w.owner_key};
        }
        const i=w.sessions.findIndex(s=>s.name===payload.name);let s=w.sessions[i];
        if(action==='save_session'){
            const row={...s,...payload,id:s?.id||crypto.randomUUID(),owner_key:w.owner_key,room_code:s?.room_code||null,updated_at:new Date().toISOString()};
            if(i<0)w.sessions.push(row);else w.sessions[i]=row;return row;
        }
        if(action==='delete_session'){w.sessions=w.sessions.filter(s=>s.name!==payload.name);return {};}
        if(action==='save_preset'){w.presets=w.presets.filter(p=>p.name!==payload.name);w.presets.push(payload);return {};}
        if(action==='delete_preset'){w.presets=w.presets.filter(p=>p.name!==payload.name);return {};}
        if(!s)fail();
        if(action==='open_room'){s.room_code ||= crypto.randomBytes(12).toString('hex').toUpperCase();if(!rooms.has(s.id))rooms.set(s.id,crypto.randomBytes(32));return s;}
        if(action==='reset_room_links'){rooms.set(s.id,crypto.randomBytes(32));return {};}
        if(action==='submissions')return [...picks.values()].filter(p=>p.session_id===s.id);
        if(action==='invite'){const player=payload.player_id||'';if(player&&!s.players.some(p=>p.id===player))fail();return {room_code:s.room_code,player_id:player,token:invitation(rooms.get(s.id),player)};}
    }
    if(fn==='sp_room'){
        const s=[...workspaces.values(),...rotatedWorkspaces.values()].flatMap(w=>w.sessions).find(s=>s.room_code===args.room), player=args.player||'';
        if(!s||!rooms.has(s.id)||invitation(rooms.get(s.id),player)!==credential)fail();
        const chosen=s.players.find(p=>p.id===player);if(player&&!chosen)fail();
        if(action==='submit'){
            if(!player||s.results)fail();
            picks.set(s.id+':'+player,{...payload,player_id:player,session_id:s.id,updated_at:new Date().toISOString()});
        }
        return {session_name:s.session_name,game_title:s.game_title,factions:s.factions,results:s.results||null,
            players:s.players.map(p=>({id:p.id,name:p.name,submitted:picks.has(s.id+':'+p.id)})),mine:picks.get(s.id+':'+player)||null,player_name:chosen?.name||null};
    }
    fail('Unknown operation','22023');
}
http.createServer(async(req,res)=>{
    const file=new URL(req.url,'http://localhost').pathname;
    if(file==='/controls'){
        if(req.method==='POST'){
            const chunks=[];for await(const chunk of req)chunks.push(chunk);const mode=Buffer.concat(chunks).toString();
            offline=mode==='offline';loseNext=mode==='lost';delay=mode==='slow'?1500:0;
        }
        res.setHeader('Content-Type','text/html');return res.end(`<h1>Isolated save test controls</h1><p>${offline?'Offline':loseNext?'Lose next save response':delay?'Slow saves':'Online'}</p><form method="post"><button name="mode" value="offline">Offline</button></form><button onclick="fetch('/controls',{method:'POST',body:'offline'}).then(()=>location.reload())">Disconnect saves</button><button onclick="fetch('/controls',{method:'POST',body:'online'}).then(()=>location.reload())">Reconnect saves</button><button onclick="fetch('/controls',{method:'POST',body:'lost'}).then(()=>location.reload())">Lose next response</button><button onclick="fetch('/controls',{method:'POST',body:'slow'}).then(()=>location.reload())">Slow saves</button>`);
    }
    if(file==='/phone.html'){
        const width=new URL(req.url,'http://localhost').searchParams.get('width')==='360'?360:390;
        const requested=new URL(req.url,'http://localhost').searchParams.get('src')||'/';
        const target=(requested.startsWith('/?')?requested:'/').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
        res.setHeader('Content-Type','text/html');return res.end(`<meta name="viewport" content="width=device-width"><title>Phone fixture</title><iframe title="Side Picker phone preview" src="${target}" style="width:${width}px;height:844px;border:0"></iframe>`);
    }
    if(file==='/fixture-api'&&req.method==='POST'){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        res.setHeader('Content-Type','application/json');
        try {
            const {fn,args}=JSON.parse(Buffer.concat(chunks));
            const isSave=args.action?.includes('session')||args.action?.includes('preset');
            if(isSave&&delay)await new Promise(resolve=>setTimeout(resolve,delay));
            const data=rpc(fn,args);
            if(isSave&&loseNext){loseNext=false;fail('Response lost','FETCH_ERROR');}
            res.end(JSON.stringify({data,error:null}));
        }
        catch(e){res.end(JSON.stringify({data:null,error:{code:e.code||'22023',message:e.message||'Fixture error'}}));}return;
    }
    if(file==='/config.js'){res.setHeader('Content-Type','application/javascript');return res.end(fixture);}
    const target=file==='/'?'/index.html':file;
    if(!files.has(target)){res.writeHead(404);return res.end();}
    let content=fs.readFileSync(path.join(root,target.slice(1)),'utf8');
    if(target==='/index.html')content=content.replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^>]+><\/script>/,'');
    res.setHeader('Content-Type',target.endsWith('.css')?'text/css':target.endsWith('.js')?'application/javascript':'text/html');res.end(content);
}).listen(8754,'127.0.0.1',()=>console.log('Isolated browser fixture: http://127.0.0.1:8754/ (no production connection)'));
