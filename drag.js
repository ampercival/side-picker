// One pointer workflow for mouse, touch and pen. Touch begins only on the grip
// so ordinary row swipes can scroll. Choices change only after a valid release.
let activeFactionDrag = null;

function cancelFactionDrag() {
    activeFactionDrag?.finish(false);
}

function setupFactionDrag(lists, callbacks) {
    for (const list of lists) {
        list.addEventListener('pointerdown', event => {
            if (activeFactionDrag || event.button !== 0 || event.isPrimary === false ||
                event.target.closest('button,select,input,a')) return;
            const item = event.target.closest('li');
            if (!item || item.parentElement !== list) return;
            if (event.pointerType !== 'mouse' && !event.target.closest('.drag-handle')) return;

            // Template clones acquire the live document only when inserted.
            const doc = list.ownerDocument, win = doc.defaultView;

            const originalNext = item.nextSibling;
            const start = {x:event.clientX, y:event.clientY};
            const rect = item.getBoundingClientRect();
            const drag = {
                item, lists, pointerId:event.pointerId, x:start.x, y:start.y,
                ghost:null, overlay:null, frame:null, target:null, started:false,
                finish, move, update, capture:list
            };
            activeFactionDrag = drag;
            // Capture on a stable list, rather than the item that moves lists.
            try { list.setPointerCapture(event.pointerId); } catch { /* Synthetic tests or older browsers. */ }
            doc.addEventListener('pointermove', move, {passive:false});
            doc.addEventListener('pointerup', release);
            doc.addEventListener('pointercancel', cancel);
            doc.addEventListener('keydown', key);
            doc.addEventListener('visibilitychange', hidden);
            win.addEventListener('blur', cancel);
            list.addEventListener('lostpointercapture', cancel);

            function begin() {
                drag.started = true;
                item.classList.add('dragging');
                doc.body.classList.add('faction-drag-active');
                drag.ghost = item.cloneNode(true);
                drag.ghost.classList.remove('dragging');
                drag.ghost.classList.add('drag-ghost');
                drag.ghost.setAttribute('aria-hidden','true');
                drag.ghost.inert = true;
                // Preserve the source list's full row styling, controls and size.
                // A smaller preview moves the grip away from the pickup point.
                drag.overlay = doc.createElement('ul');
                drag.overlay.className = list.className + ' drag-overlay';
                drag.overlay.setAttribute('aria-hidden','true');
                drag.overlay.inert = true;
                Object.assign(drag.overlay.style, {position:'fixed', left:'0', top:'0',
                    width:rect.width+'px', height:rect.height+'px', margin:'0',
                    pointerEvents:'none', zIndex:'10000'});
                drag.overlay.appendChild(drag.ghost);
                doc.body.appendChild(drag.overlay);
            }
            function move(e) {
                if (e.pointerId !== drag.pointerId) return;
                drag.x = e.clientX; drag.y = e.clientY;
                if (!drag.started && Math.hypot(drag.x-start.x,drag.y-start.y)<6) return;
                if (!drag.started) begin();
                e.preventDefault();
                update();
                if (!drag.frame) drag.frame = win.requestAnimationFrame(scrollFrame);
            }
            function update() {
                if (!drag.started) return;
                drag.overlay.style.transform = `translate3d(${drag.x-(start.x-rect.left)}px,${drag.y-(start.y-rect.top)}px,0)`;
                // The source placeholder must not intercept hit testing.
                const hit = doc.elementFromPoint(drag.x,drag.y);
                const target = hit?.closest('.sortable-list');
                drag.target = lists.includes(target) && target.isConnected ? target : null;
                for (const candidate of lists) candidate.classList.toggle('drag-target',candidate===drag.target);
                if (!drag.target) return;
                const after = [...drag.target.querySelectorAll('li:not(.dragging)')]
                    .find(row => drag.y < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
                if (after) drag.target.insertBefore(item,after);
                else drag.target.appendChild(item);
            }
            function scrollFrame() {
                drag.frame = null;
                if (activeFactionDrag !== drag || !drag.started) return;
                if (!item.isConnected || lists.some(candidate=>!candidate.isConnected)) return finish(false);
                const height = win.innerHeight, width = win.innerWidth, edge = 64;
                // Restrict scrolling to the owning card's horizontal region.
                const bounds = lists.map(candidate=>candidate.getBoundingClientRect());
                const inside = drag.x >= Math.min(...bounds.map(b=>b.left))-24 &&
                    drag.x <= Math.max(...bounds.map(b=>b.right))+24 && drag.x >= 0 && drag.x <= width;
                const speed = !inside ? 0 : drag.y < edge ? -Math.ceil(18*(1-Math.max(0,drag.y)/edge))
                    : drag.y > height-edge ? Math.ceil(18*(1-Math.max(0,height-drag.y)/edge)) : 0;
                if (speed) { win.scrollBy({top:speed,behavior:'instant'}); update(); }
                drag.frame = win.requestAnimationFrame(scrollFrame);
            }
            function release(e) {
                if (e.pointerId !== drag.pointerId) return;
                drag.x=e.clientX; drag.y=e.clientY;
                update(); // Include the release position even if the last frame hasn't run.
                finish(drag.started && !!drag.target);
            }
            function cancel(e) {
                if (e?.pointerId !== undefined && e.pointerId !== drag.pointerId) return;
                finish(false);
            }
            function key(e) { if(e.key==='Escape') { e.preventDefault(); finish(false); } }
            function hidden() { if(doc.hidden) finish(false); }
            function finish(commit) {
                if (activeFactionDrag !== drag) return;
                activeFactionDrag = null;
                if (drag.frame) win.cancelAnimationFrame(drag.frame);
                doc.removeEventListener('pointermove',move);
                doc.removeEventListener('pointerup',release);
                doc.removeEventListener('pointercancel',cancel);
                doc.removeEventListener('keydown',key);
                doc.removeEventListener('visibilitychange',hidden);
                win.removeEventListener('blur',cancel);
                list.removeEventListener('lostpointercapture',cancel);
                try { if(list.hasPointerCapture(drag.pointerId)) list.releasePointerCapture(drag.pointerId); } catch {}
                item.classList.remove('dragging');
                lists.forEach(candidate=>candidate.classList.remove('drag-target'));
                doc.body.classList.remove('faction-drag-active');
                drag.overlay?.remove();
                if (!drag.started) return;
                if (!commit) {
                    if (list.isConnected) list.insertBefore(item,originalNext?.parentElement===list ? originalNext : null);
                    callbacks.cancel?.();
                    return;
                }
                const destination = drag.target;
                callbacks.commit(item.dataset.faction,destination);
                // Avoid an accidental button click after releasing over controls.
                const suppress = e => { e.preventDefault();e.stopPropagation(); };
                doc.addEventListener('click',suppress,{capture:true,once:true});
                win.setTimeout(()=>doc.removeEventListener('click',suppress,true),0);
            }
        });
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = {setupFactionDrag,cancelFactionDrag};
