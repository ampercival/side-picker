const {test}=require('node:test'), assert=require('node:assert/strict');
const {setupFactionDrag,cancelFactionDrag}=require('../drag.js');
const {setPreferenceOrder}=require('../optimizer.js');

function fixture(fromTemplate=false) {
    const listeners=new Map(),frames=new Map();let nextFrame=1,hit=null,saved=0,scrolled=0;
    const events=target=>({
        addEventListener(type,fn){const k=target+type;listeners.set(k,[...(listeners.get(k)||[]),fn]);},
        removeEventListener(type,fn){const k=target+type;listeners.set(k,(listeners.get(k)||[]).filter(f=>f!==fn));},
        fire(type,event={}){for(const fn of [...(listeners.get(target+type)||[])])fn({button:0,isPrimary:true,pointerId:1,pointerType:'mouse',preventDefault(){},stopPropagation(){},...event});}
    });
    const classes=()=>{const set=new Set();return {add:k=>set.add(k),remove:k=>set.delete(k),contains:k=>set.has(k),toggle(k,on){if(on)set.add(k);else set.delete(k);}};};
    const win={...events('win'),innerHeight:800,innerWidth:1200,
        requestAnimationFrame(fn){const id=nextFrame++;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
        scrollBy({top}){scrolled+=top;},setTimeout(fn){fn();}};
    const overlays=[];
    const doc={...events('doc'),defaultView:win,elementFromPoint:()=>hit,
        createElement(){const element={style:{},setAttribute(){},appendChild(child){this.child=child;},remove(){this.removed=true;}};overlays.push(element);return element;},
        body:{classList:classes(),appendChild(){}}};
    const lists=[0,1,2,3].map(i=>({
        ...events('list'+i),ownerDocument:doc,isConnected:true,children:[],classList:classes(),
        getBoundingClientRect:()=>({left:i*250,right:i*250+240,top:100,height:500}),
        closest(selector){return selector==='.sortable-list'?this:null;},
        setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){},
        insertBefore(item,after){item.parentElement?.children.splice(item.parentElement.children.indexOf(item),1);const index=after?this.children.indexOf(after):this.children.length;this.children.splice(index,0,item);item.parentElement=this;},
        appendChild(item){this.insertBefore(item,null);},
        querySelectorAll(){return this.children.filter(x=>!x.classList.contains('dragging'));}
    }));
    const row=(name,list)=>{const item={dataset:{faction:name},classList:classes(),isConnected:true,
        get nextSibling(){return this.parentElement.children[this.parentElement.children.indexOf(this)+1]||null;},
        getBoundingClientRect:()=>({left:10,top:110,height:50,width:220}),
        cloneNode:()=>({classList:classes(),style:{},setAttribute(){},remove(){}}),
        closest:s=>s==='li'?item:s==='.drag-handle'?item:null};list.appendChild(item);return item;};
    const a=row('A',lists[1]),b=row('B',lists[1]),c=row('C',lists[0]);
    const player={preferences:['A','B'],preferenceRanks:[1,1],bans:[]};
    if(fromTemplate)lists.forEach(list=>list.ownerDocument={defaultView:null});
    setupFactionDrag(lists.slice(0,3),{commit(){saved++;setPreferenceOrder(player,lists[1].children.map(x=>x.dataset.faction));player.bans=lists[2].children.map(x=>x.dataset.faction);}});
    lists.forEach(list=>list.ownerDocument=doc);
    return {lists,a,b,c,player,doc,win,overlays,
        hit(value){hit=value;},get saved(){return saved;},get scrolled(){return scrolled;},get frames(){return frames.size;},
        down(item,type='mouse',extra={}){item.parentElement.fire('pointerdown',{target:item,pointerType:type,clientX:20,clientY:125,...extra});},
        move(x=270,y=350){doc.fire('pointermove',{clientX:x,clientY:y});},
        up(x=270,y=350){doc.fire('pointerup',{clientX:x,clientY:y});},
        frame(){const [id,fn]=frames.entries().next().value;frames.delete(id);fn();},
        clean(){cancelFactionDrag();}
    };
}

test('template cards use the live document after being inserted',()=>{
    const f=fixture(true);f.hit(f.lists[1]);f.down(f.c);f.move();f.up();
    assert.equal(f.saved,1);assert.deepEqual(f.player.preferences,['A','B','C']);f.clean();
});

test('the preview retains source dimensions and pickup offset through movement and scrolling',()=>{
    const f=fixture();f.hit(f.lists[1]);
    f.down(f.c,'touch',{clientX:200,clientY:145});f.move(208,156);
    const preview=f.overlays[0];
    assert.equal(preview.style.width,'220px');assert.equal(preview.style.height,'50px');
    assert.equal(preview.style.transform,'translate3d(18px,121px,0)');
    f.win.scrollBy({top:100});f.move(300,500);
    assert.equal(preview.style.transform,'translate3d(110px,465px,0)');
    f.clean();assert.equal(preview.removed,true);assert.equal(f.saved,0);
});

test('mouse and touch drops move between lists, preserve ties, and save once',()=>{
    for(const type of ['mouse','touch','pen']) {
        const f=fixture();f.hit(f.lists[1]);f.down(f.c,type);f.move();
        assert.equal(f.saved,0);assert.deepEqual(f.player.preferences,['A','B']);
        f.up();assert.equal(f.saved,1);assert.deepEqual(f.player.preferences,['A','B','C']);assert.deepEqual(f.player.preferenceRanks,[1,1,3]);assert.equal(f.frames,0);
        f.hit(f.lists[2]);f.down(f.a,type);f.move(520);f.up(520);
        assert.deepEqual(f.player.preferences,['B','C']);assert.deepEqual(f.player.preferenceRanks,[1,2]);assert.deepEqual(f.player.bans,['A']);f.clean();
    }
});

test('invalid and cross-player releases, Escape and pointer cancellation restore without saves',()=>{
    for(const end of ['outside','other-player','Escape','pointercancel','blur','hidden','lostcapture','rerender']) {
        const f=fixture();f.hit(f.lists[1]);f.down(f.c,'touch');f.move();
        if(end==='outside'||end==='other-player'){f.hit(end==='outside'?null:f.lists[3]);f.up();}
        else if(end==='Escape')f.doc.fire('keydown',{key:'Escape'});
        else if(end==='pointercancel')f.doc.fire('pointercancel');
        else if(end==='blur')f.win.fire('blur');
        else if(end==='hidden'){f.doc.hidden=true;f.doc.fire('visibilitychange');}
        else if(end==='lostcapture')f.lists[0].fire('lostpointercapture');
        else cancelFactionDrag();
        assert.equal(f.saved,0,end);assert.deepEqual(f.lists[0].children.map(x=>x.dataset.faction),['C'],end);assert.deepEqual(f.player.preferenceRanks,[1,1],end);assert.equal(f.frames,0,end);f.clean();
    }
});

test('touch scrolling and action controls do not start a drag; taps and other pointers cannot save',()=>{
    const f=fixture();
    const target={closest:s=>s==='li'?f.c:null};
    f.lists[0].fire('pointerdown',{target,pointerType:'touch',clientX:20,clientY:125});f.move();f.up();assert.equal(f.saved,0);
    const button={closest:s=>s==='button,select,input,a'?{}:f.c};
    f.lists[0].fire('pointerdown',{target:button,clientX:20,clientY:125});f.move();f.up();assert.equal(f.saved,0);
    f.down(f.c);f.doc.fire('pointermove',{pointerId:2,clientX:300,clientY:350});f.up(22,126);assert.equal(f.saved,0);assert.equal(f.frames,0);f.clean();
});

test('auto-scroll runs at edges, stops after cancellation, and release hit testing is current',()=>{
    const f=fixture();f.hit(f.lists[1]);f.down(f.c,'touch');f.move(270,790);f.frame();assert.ok(f.scrolled>0);
    f.hit(null);f.up(270,600);assert.equal(f.saved,0);assert.equal(f.frames,0);f.clean();
    const fresh=fixture();fresh.hit(fresh.lists[1]);fresh.down(fresh.c);fresh.move();fresh.hit(fresh.lists[2]);fresh.up(520,300);
    assert.deepEqual(fresh.player.bans,['C']);assert.equal(fresh.saved,1);fresh.clean();
});
