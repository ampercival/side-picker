// Offline checks: no production requests, credentials, or package installation.
const fs = require('node:fs'), path = require('node:path'), {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Use Node.js 24 or newer.');
function run(command, args) {
    const result = spawnSync(command, args, {cwd:root, stdio:'inherit', windowsHide:true});
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}
for (const file of fs.readdirSync(root).filter(f=>f.endsWith('.js'))) run(process.execPath, ['--check',file]);
const tests = fs.readdirSync('tests').filter(f=>f.endsWith('.test.cjs')).sort().map(f=>'tests/'+f);
run(process.execPath, ['--test','--test-isolation=none',...tests]);
run(process.platform==='win32'?'powershell.exe':'pwsh', ['-NoProfile','-ExecutionPolicy','Bypass','-File','tests/keepalive.Tests.ps1']);
console.log('PASS: syntax, Node regressions, and offline keepalive checks. Browser and deployed SQL checks are separate.');
