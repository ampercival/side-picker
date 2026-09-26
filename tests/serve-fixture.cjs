// Local browser fixture: never connects to production. Reload resets sample data.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fixture = `
window.SUPABASE_CONFIG = {url:'https://fixture.invalid',publishableKey:'fixture'};
localStorage.setItem('side_picker_workspace_key','test-fixture');
const tables = {
  users: [], presets: [], submissions: [],
  sessions: [{owner_key:'test-fixture',name:'Ban conflict fixture',session_name:'Ban conflict fixture',
    game_title:'Example Game',factions:['A','B'],room_code:null,results:null,updated_at:new Date().toISOString(),
    players:['Alex','Jordan'].map((name,i)=>({id:'p'+i,name,preferences:['A'],bans:['B'],expanded:true,noPreference:false}))}]
};
window.supabase = {createClient:()=>({
  from(table) {
    let filters=[], operation='select', payload;
    const q = {
      select(){return q}, eq(key,value){filters.push([key,value]);return q}, limit(){return q},
      maybeSingle(){q.single=true;return q},
      upsert(value){operation='upsert';payload=value;return q}, delete(){operation='delete';return q},
      then(resolve){
        const matches = row => filters.every(([key,value])=>row[key]===value);
        if(operation==='upsert') {
          const i=tables[table].findIndex(row=>row.name===payload.name && row.owner_key===payload.owner_key);
          const saved=JSON.parse(JSON.stringify(payload));
          if(i<0)tables[table].push(saved);else tables[table][i]=saved;
        } else if(operation==='delete') tables[table]=tables[table].filter(row=>!matches(row));
        const rows=tables[table].filter(matches).map(row=>JSON.parse(JSON.stringify(row)));
        return Promise.resolve({data:q.single?(rows[0]||null):rows,error:null}).then(resolve);
      }
    }; return q;
  }, channel(){const c={on(){return c},subscribe(){return c}};return c}, removeChannel(){}
})};`;
const files = new Set(['/index.html', '/style.css', '/script.js', '/rooms.js', '/results.js', '/optimizer.js']);
http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = pathname === '/' ? '/index.html' : pathname;
    if (file === '/config.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(fixture); }
    if (!files.has(file)) { res.writeHead(404); return res.end(); }
    let content = fs.readFileSync(path.join(root, file.slice(1)), 'utf8');
    if (file === '/index.html') content = content.replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^>]+><\/script>/, '');
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'text/html');
    res.end(content);
}).listen(8754, '127.0.0.1', () => console.log('Isolated host fixture: http://127.0.0.1:8754/ (no real database connection)'));
