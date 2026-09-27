const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
test('published source and documentation use valid UTF-8 without doubled carriage returns',()=>{
    function check(dir,recurse){
        for(const item of fs.readdirSync(dir,{withFileTypes:true})){
            const file=path.join(dir,item.name);
            if(item.isDirectory()){if(recurse)check(file,true);continue;}
            if(!/\.(md|js|cjs|html|css|sql)$/.test(item.name))continue;
            const bytes=fs.readFileSync(file);
            assert.doesNotThrow(()=>new TextDecoder('utf-8',{fatal:true}).decode(bytes),file);
            assert.equal(bytes.includes(Buffer.from('\r\r\n')),false,file+' has doubled CRLF');
        }
    }
    check('.',false);for(const dir of ['docs','tests','supabase'])check(dir,true);
});
