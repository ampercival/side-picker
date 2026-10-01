// Optional independent decoder check. Pass the path to npm jsqr@1.4.0's dist/jsQR.js.
// The decoder is test-only; it is not a runtime dependency or part of the site.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
if(!process.argv[2])throw new Error('Pass the local jsqr decoder file path. See docs/APP_GUIDE.md.');
const decode=require(path.resolve(process.argv[2])),qrcode=require('../vendor/qrcode-generator-1.4.4.js');
for(const player of ['', 'player-11111111-2222-3333-4444-555555555555','legacy name/é']){
    const link='https://example.test/side-picker/?room=1234567890ABCDEF12345678#player='+encodeURIComponent(player)+'&token='+'a'.repeat(64);
    let pixels;const canvas={};
    const context={fillStyle:'#fff',fillRect(x,y,w,h){pixels ||= new Uint8ClampedArray(canvas.width*canvas.height*4);for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++){const offset=(row*canvas.width+col)*4,colour=this.fillStyle==='#fff'?255:0;pixels.set([colour,colour,colour,255],offset);}}};
    canvas.getContext=()=>context;
    const ctx=vm.createContext({...require('../i18n.js'),qrcode,get:id=>id==='invitation-qr'?canvas:{}});
    vm.runInContext(fs.readFileSync('sharing.js','utf8'),ctx);ctx.link=link;vm.runInContext('showInvitationQR(link,"Test invitation")',ctx);
    assert.equal(decode(pixels,canvas.width,canvas.height)?.data,link);
}
console.log('PASS: viewer, personal-player, and encoded legacy-player QR images decode to the exact original URLs.');
