// Isolated browser fixture. No production requests. Restart resets all sample data.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const workspaces = new Map();
const rotatedWorkspaces = new Map();
// Every workspace, even one whose keys were all revoked, plus key metadata and account links.
const registry = new Map(), keyMeta = new Map(), accountLinks = new Map();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const make = () => { const w = {owner_key:crypto.randomUUID(),sessions:[],presets:[]}; registry.set(w.owner_key,w); return w; };
workspaces.set('a'.repeat(64), Object.assign(make(),{sessions:[{id:'sample',save_version:crypto.randomUUID(),name:'Ban conflict fixture',session_name:'Ban conflict fixture',game_title:'Example Game',factions:['A','B'],room_code:null,results:null,updated_at:new Date().toISOString(),players:['Alex','Jordan'].map((name,i)=>({id:'p'+i,name,preferences:['A'],bans:['B'],expanded:true,noPreference:false}))}]}));
function keyEntries(){
    return [...[...workspaces].map(([raw,w])=>({hash:sha(raw),w,drop:()=>workspaces.delete(raw)})),
        ...[...rotatedWorkspaces].map(([hash,w])=>({hash,w,drop:()=>rotatedWorkspaces.delete(hash)}))];
}
function keyInfo(hash){
    if(!keyMeta.has(hash))keyMeta.set(hash,{id:crypto.randomUUID(),kind:'link',user:null,label:null,created_at:new Date().toISOString()});
    return keyMeta.get(hash);
}
const rooms = new Map(), roomStates = new Map(), picks = new Map(), receipts = new Map();
const choices=(p,f)=>({preferences:(p?.preferences||[]).filter(x=>f.includes(x)),bans:(p?.bans||[]).filter(x=>f.includes(x)),noPreference:!!(p?.noPreference??p?.no_preference)});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
let offline=false, loseNext=false, delay=0, roomsOffline=false;
const fixture = `window.SUPABASE_CONFIG={url:'https://fixture.invalid',publishableKey:'fixture'};
localStorage.removeItem('side_picker_workspace_key');
if(!localStorage.getItem('side_picker_private_workspace_v1'))localStorage.setItem('side_picker_private_workspace_v1',JSON.stringify({credential:'${'a'.repeat(64)}',ownerKey:'fixture'}));
window.SUPABASE_CONFIG.accountProviders=['google','discord'];
// Fake sign-in: the provider "redirect" returns straight here with a fixture code.
const fixtureSession=()=>{try{return JSON.parse(localStorage.getItem('fixture_auth'))}catch{return null}};
const fixtureAuth={listeners:[],
    onAuthStateChange(cb){this.listeners.push(cb);return {data:{subscription:{unsubscribe(){}}}}},
    async getSession(){return {data:{session:fixtureSession()},error:null}},
    async signInWithOAuth({provider,options}){location.assign(options.redirectTo+'?code=fixture-'+provider);return {data:{},error:null}},
    async exchangeCodeForSession(code){const provider=code.replace('fixture-','');
        const session={user:{id:'fixture-'+provider+'-user',email:provider+'-player@example.invalid',app_metadata:{provider},user_metadata:{full_name:'Fixture '+provider+' player'}}};
        localStorage.setItem('fixture_auth',JSON.stringify(session));this.listeners.forEach(cb=>cb('SIGNED_IN',session));return {data:{session},error:null}},
    async signOut(){localStorage.removeItem('fixture_auth');this.listeners.forEach(cb=>cb('SIGNED_OUT',null));return {error:null}}};
window.supabase={createClient:()=>({auth:fixtureAuth,rpc:async(fn,args)=>{const r=await fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn,args,user:fixtureSession()?.user?.id||null})});return r.json()}})};`;
const files = new Set(['/index.html','/privacy.html','/accounts.js','/style.css','/script.js','/rooms.js','/results.js','/optimizer.js','/access.js','/save-journal.js','/persistence.js','/accessibility.js','/repeat-games.js','/sharing.js','/vendor/qrcode-generator-1.4.4.js']);
function fail(message='Invalid link',code='42501'){throw {message,code};}
function invitation(seed,player){return crypto.createHmac('sha256',seed).update(player).digest('hex');}
function rpc(fn,args,user=null){
    const {action,credential,payload={}}=args;
    if(fn==='sp_account')return account(action,payload,user);
    if(roomsOffline&&(fn==='sp_room'||action==='room_status'))fail('Room offline','FETCH_ERROR');
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
            // The signed-in owner replaces only this key; anyone else resets all access.
            const info=keyInfo(digest);keyEntries().find(k=>k.hash===digest).drop();keyMeta.delete(digest);
            rotatedWorkspaces.set(payload.token_hash,w);keyMeta.set(payload.token_hash,info);
            if(!user||accountLinks.get(w.owner_key)!==user){
                for(const k of keyEntries())if(k.w===w&&k.hash!==payload.token_hash){k.drop();keyMeta.delete(k.hash);}
                accountLinks.delete(w.owner_key);Object.assign(info,{kind:'link',user:null,label:null});
            }
            return {owner_key:w.owner_key};
        }
        const i=w.sessions.findIndex(s=>s.name===payload.name);let s=w.sessions[i];
        if(action==='save_session'){
            const row={...s,...payload,id:s?.id||crypto.randomUUID(),owner_key:w.owner_key,room_code:s?.room_code||null,updated_at:new Date().toISOString()};
            row.players=row.players.map(p=>{
                let pick=picks.get(row.id+':'+p.id);if(!pick)return p;
                const incoming=choices(p,row.factions),saved=choices(pick,row.factions);
                let next=incoming;
                if(p.submittedAt!==pick.updated_at){
                    if(!same(incoming,saved)&&!same(incoming,choices(s?.players.find(x=>x.id===p.id),row.factions)))fail('Competing player update','40001');
                    next=saved;
                }
                if(!same(next,choices(pick,s.factions))){pick={...pick,preferences:next.preferences,bans:next.bans,no_preference:next.noPreference,source:'organizer',updated_at:new Date().toISOString()};picks.set(row.id+':'+p.id,pick);}
                return {...p,...next,submittedAt:pick.updated_at,submittedSource:pick.source,submittedChoices:[next.preferences,next.bans,next.noPreference]};
            });
            const roomState=roomStates.get(row.id);
            if(roomState&&(!same(s.factions,row.factions)||!same(s.players.map(p=>p.id),row.players.map(p=>p.id))||!same(s.results,row.results))){roomState.revision=crypto.randomUUID();if(s.results&&!row.results)roomState.locked=false;}
            for(const [key,pick] of picks)if(pick.session_id===row.id&&!row.players.some(p=>p.id===pick.player_id))picks.delete(key);
            if(i<0)w.sessions.push(row);else w.sessions[i]=row;return row;
        }
        if(action==='delete_session'){w.sessions=w.sessions.filter(s=>s.name!==payload.name);return {};}
        if(action==='save_preset'){w.presets=w.presets.filter(p=>p.name!==payload.name);w.presets.push(payload);return {};}
        if(action==='delete_preset'){w.presets=w.presets.filter(p=>p.name!==payload.name);return {};}
        if(!s)fail();
        if(action==='open_room'){s.room_code ||= crypto.randomBytes(12).toString('hex').toUpperCase();if(!rooms.has(s.id)){rooms.set(s.id,crypto.randomBytes(32));roomStates.set(s.id,{locked:false,revision:crypto.randomUUID()});}return s;}
        if(action==='set_room_stage'||action==='room_status'){
            const r=roomStates.get(s.id);if(!r)fail();
            if(action==='set_room_stage'){
                if(payload.expected_version!==s.save_version)fail('Stale game','40001');
                if(s.results)fail('Clear results first','22023');
                if(r.locked!==(payload.stage==='locked')){r.locked=payload.stage==='locked';r.revision=crypto.randomUUID();}
            }
            return {picks:[...picks.values()].filter(p=>p.session_id===s.id),stage:s.results?'published':r.locked?'locked':'collecting',save_version:s.save_version};
        }
        if(action==='reset_room_links'){rooms.set(s.id,crypto.randomBytes(32));return {};}
        if(action==='submissions')return [...picks.values()].filter(p=>p.session_id===s.id);
        if(action==='invite'){const player=payload.player_id||'';if(player&&!s.players.some(p=>p.id===player))fail();return {room_code:s.room_code,player_id:player,token:invitation(rooms.get(s.id),player)};}
    }
    if(fn==='sp_room'){
        const s=[...registry.values()].flatMap(w=>w.sessions).find(s=>s.room_code===args.room), player=args.player||'';
        if(!s||!rooms.has(s.id)||invitation(rooms.get(s.id),player)!==credential)fail();
        const chosen=s.players.find(p=>p.id===player);if(player&&!chosen)fail();
        const r=roomStates.get(s.id), prior=picks.get(s.id+':'+player);
        if(action==='submit'){
            if(!player||s.results||r.locked)fail();
            if(payload.expected_room!==r.revision||payload.expected_pick!==(prior?.updated_at||null))fail('Changed elsewhere','40001');
            picks.set(s.id+':'+player,{...payload,source:'player',player_id:player,session_id:s.id,updated_at:new Date().toISOString()});
        }
        return {session_name:s.session_name,game_title:s.game_title,factions:s.factions,results:s.results||null,
            revision:r.revision,stage:s.results?'published':r.locked?'locked':'collecting',initial_choices:chosen?choices(chosen,s.factions):null,
            players:s.players.map(p=>({id:p.id,name:p.name,submitted:picks.get(s.id+':'+p.id)?.source==='player'})),mine:picks.get(s.id+':'+player)||null,player_name:chosen?.name||null};
    }
    fail('Unknown operation','22023');
}
// Mirrors migration 006: proof by organizer key, one owning account, device keys.
function account(action,payload,user){
    if(!user)fail('permission denied for function sp_account','42501');
    let h=null;
    if(Object.hasOwn(payload,'credential')){if(!/^[0-9a-f]{64}$/.test(payload.credential||''))fail('Organizer link is missing or invalid');h=sha(payload.credential);}
    const mine=owner=>accountLinks.get(owner)===user, keysOf=w=>keyEntries().filter(k=>k.w===w);
    if(action==='list')return {workspaces:[...accountLinks].filter(([,u])=>u===user).map(([owner])=>{const w=registry.get(owner);return {owner_key:owner,
        sessions:w.sessions.map(s=>({name:s.name,session_name:s.session_name,game_title:s.game_title,updated_at:s.updated_at})).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))),
        presets:w.presets.map(p=>p.name).sort(),
        keys:keysOf(w).map(k=>{const i=keyInfo(k.hash);return {id:i.id,kind:i.kind,label:i.label,created_at:i.created_at,current:k.hash===h};})};})};
    if(action==='attach'){
        const k=h&&keyEntries().find(k=>k.hash===h);if(!k)fail('Organizer link is missing or invalid');
        const owner=k.w.owner_key;if(accountLinks.has(owner)&&!mine(owner))fail('These games already belong to another account');
        accountLinks.set(owner,user);return {owner_key:owner};
    }
    if(action==='open'){
        if(!mine(payload.owner_key))fail('These games are not in your account');
        if(!/^[0-9a-f]{64}$/.test(payload.token_hash||''))fail('Invalid device key','22023');
        const w=registry.get(payload.owner_key);if(keysOf(w).length>=20)fail('These games are open on too many devices. Remove an old device first.','22023');
        rotatedWorkspaces.set(payload.token_hash,w);Object.assign(keyInfo(payload.token_hash),{kind:'device',user,label:String(payload.label||'').slice(0,100)||null});
        return {owner_key:w.owner_key};
    }
    if(action==='revoke_key'){
        const k=keyEntries().find(k=>keyInfo(k.hash).id===payload.id&&mine(k.w.owner_key));if(!k)fail('Key not found');
        k.drop();keyMeta.delete(k.hash);return {};
    }
    if(action==='forget_device'){
        if(!h)fail();const k=keyEntries().find(k=>k.hash===h);if(!k)return {forget:true};if(!mine(k.w.owner_key))return {forget:false};
        if(keyInfo(h).kind==='device'){k.drop();keyMeta.delete(h);}return {forget:true};
    }
    if(action==='unlink'){
        if(!mine(payload.owner_key))fail('These games are not in your account');const w=registry.get(payload.owner_key);
        if(!keysOf(w).length)fail('Open these games on a device before removing them, or they could not be opened again','22023');
        accountLinks.delete(payload.owner_key);for(const k of keysOf(w))if(keyInfo(k.hash).user===user)keyInfo(k.hash).user=null;return {};
    }
    if(action==='delete_account'){
        for(const [owner,u] of accountLinks)if(u===user&&!keysOf(registry.get(owner)).length)fail('Some games can only be opened through your account. Open them on a device or delete them first.','22023');
        for(const [owner,u] of [...accountLinks])if(u===user)accountLinks.delete(owner);
        for(const info of keyMeta.values())if(info.user===user)info.user=null;return {};
    }
    fail('Unknown operation','22023');
}
http.createServer(async(req,res)=>{
    const file=new URL(req.url,'http://localhost').pathname;
    if(file==='/controls'){
        if(req.method==='POST'){
            const chunks=[];for await(const chunk of req)chunks.push(chunk);const mode=Buffer.concat(chunks).toString();
            offline=mode==='offline';loseNext=mode==='lost';delay=mode==='slow'?1500:0;
            roomsOffline=mode==='rooms-offline';
        }
        res.setHeader('Content-Type','text/html');return res.end(`<h1>Isolated save test controls</h1><button onclick="fetch('/controls',{method:'POST',body:'rooms-offline'}).then(()=>location.reload())">Disconnect rooms</button><p>${offline?'Offline':loseNext?'Lose next save response':delay?'Slow saves':'Online'}</p><form method="post"><button name="mode" value="offline">Offline</button></form><button onclick="fetch('/controls',{method:'POST',body:'offline'}).then(()=>location.reload())">Disconnect saves</button><button onclick="fetch('/controls',{method:'POST',body:'online'}).then(()=>location.reload())">Reconnect saves</button><button onclick="fetch('/controls',{method:'POST',body:'lost'}).then(()=>location.reload())">Lose next response</button><button onclick="fetch('/controls',{method:'POST',body:'slow'}).then(()=>location.reload())">Slow saves</button>`);
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
            const {fn,args,user}=JSON.parse(Buffer.concat(chunks));
            const isSave=args.action?.includes('session')||args.action?.includes('preset');
            if(isSave&&delay)await new Promise(resolve=>setTimeout(resolve,delay));
            const data=rpc(fn,args,user);
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
