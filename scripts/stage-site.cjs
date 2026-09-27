// Publish only the application assets. Never copy the repository or local recovery files.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname,'..');
function publicFiles() {
    const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
    const files = ['index.html','LICENSE','vendor/qrcode-generator-LICENSE'];
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const file = match[1];
        if (/^https:\/\//.test(file) || file==='./') continue;
        if (!/^(?:[a-z][a-z0-9-]*\.(?:js|css)|vendor\/qrcode-generator-1\.4\.4\.js)$/.test(file)) throw new Error('Review new public asset: '+file);
        if (!fs.statSync(path.join(root,file)).isFile()) throw new Error('Missing asset: '+file);
        files.push(file);
    }
    return [...new Set(files)];
}
function stage(destination) {
    // Require a fresh directory, so a previous build cannot leave extra files behind.
    fs.mkdirSync(path.dirname(destination),{recursive:true}); fs.mkdirSync(destination);
    for (const file of publicFiles()) {
        const target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);
    }
    fs.writeFileSync(path.join(destination,'.nojekyll'),'');
}
if (require.main===module) { const destination=path.resolve(root,'.local/site');stage(destination);console.log('Staged public application in '+destination); }
module.exports={publicFiles,stage};
