const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {stage,publicFiles}=require('../scripts/stage-site.cjs');
test('release contains every local page asset but excludes tests, SQL, docs and recovery files',()=>{
    const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'side-picker-release-'));
    try {
        const destination=path.join(temporary,'site');stage(destination);
        for(const file of publicFiles())assert.ok(fs.existsSync(path.join(destination,file)),file);
        for(const forbidden of ['.git','.local','tests','supabase','docs','scripts'])assert.equal(fs.existsSync(path.join(destination,forbidden)),false,forbidden);
        assert.throws(()=>stage(destination),/EEXIST/);
        const html=fs.readFileSync(path.join(destination,'index.html'),'utf8');
        const external=[...html.matchAll(/<script[^>]+src="https:[^>]+>/g)];
        assert.equal(external.length,1);
        assert.match(external[0][0],/@supabase\/supabase-js@\d+\.\d+\.\d+\/dist\/umd\/supabase\.js/);
        assert.match(external[0][0],/integrity="sha384-[A-Za-z0-9+/=]+" crossorigin="anonymous"/);
    } finally {fs.rmSync(temporary,{recursive:true,force:true});}
});
