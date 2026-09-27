// Shared focus, modal and view navigation for the static application.
let restoringView = false;
function announce(message) {
    const status = document.getElementById('interaction-status');
    if (status) status.textContent = message;
}
function onViewChanged(viewId) {
    const heading = get(viewId).querySelector('h2');
    if (heading) { heading.tabIndex = -1; queueMicrotask(() => { if(get(viewId).classList.contains('active'))heading.focus({preventScroll:true}); }); }
    window.scrollTo({top:0,behavior:'instant'});
    if (!restoringView && !isGuestMode && !isSharedMode) {
        history.pushState({sidePickerView:viewId,session:activeSessionName,workspace:getWorkspaceKey()},'');
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const status = document.createElement('div');status.id='interaction-status';status.className='sr-only';status.setAttribute('role','status');document.body.appendChild(status);
    get('toast-container').setAttribute('role','status');
    for (const id of ['guest-connection','room-connection','guest-submitted']) get(id)?.setAttribute('role','status');
    // Placeholder hints remain visible, but are no longer the only input names.
    for (const input of document.querySelectorAll('input[placeholder],textarea[placeholder]')) {
        if (!input.labels?.length && !input.hasAttribute('aria-label')) input.setAttribute('aria-label',input.placeholder);
    }
    let top = null, lastOutside = document.activeElement;
    const openers = new Map(), modals = [...document.querySelectorAll('.modal')];
    const visible = el => el?.isConnected && el.getClientRects().length > 0;
    const focusable = modal => [...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"],[contenteditable="true"]')].filter(visible);
    document.addEventListener('focusin', event => { if (!event.target.closest('.modal')) lastOutside=event.target; });
    for (const modal of modals) {
        modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.tabIndex=-1;
        const heading=modal.querySelector('h3');
        if(heading){heading.id ||= modal.id+'-heading';modal.setAttribute('aria-labelledby',heading.id);}
        new MutationObserver(() => {
            const active=modals.filter(m=>m.classList.contains('active'));
            const next=active.find(m=>m.id==='confirm-modal') || active.at(-1) || null;
            document.querySelector('.app-container').inert=!!next;
            document.body.classList.toggle('dialog-open',!!next);
            for(const m of active)m.inert=m!==next;
            if(next===top)return;
            const previous=top;top=next;
            if(next && !openers.has(next))openers.set(next,previous?.contains(document.activeElement)?document.activeElement:lastOutside);
            if(previous && !active.includes(previous)){
                const opener=openers.get(previous);openers.delete(previous);
                if(visible(opener) && (!next || next.contains(opener)))opener.focus({preventScroll:true});
            }
            if(next && !next.contains(document.activeElement)){
                (next.id==='confirm-modal'?get('confirm-cancel-btn'):focusable(next)[0] || next).focus({preventScroll:true});
            }
        }).observe(modal,{attributes:true,attributeFilter:['class']});
    }
    document.addEventListener('keydown',event=>{
        if(!top)return;
        if(event.key==='Escape'){
            event.preventDefault();
            if(top.id==='confirm-modal')get('confirm-cancel-btn').click();else closeModal(top.id);
        }else if(event.key==='Tab'){
            const items=focusable(top),first=items[0]||top,last=items.at(-1)||top;
            if(event.shiftKey && (document.activeElement===first || !top.contains(document.activeElement))){event.preventDefault();last.focus();}
            else if(!event.shiftKey && (document.activeElement===last || !top.contains(document.activeElement))){event.preventDefault();first.focus();}
        }
    });
    if(!isGuestMode&&!isSharedMode)history.replaceState({sidePickerView:document.querySelector('.view.active')?.id||'view-home',session:activeSessionName,workspace:getWorkspaceKey()},'');
});
async function restoreHistoryView(destination) {
    if(isGuestMode||isSharedMode)return;
    restoringView=true;
    try{
        closeModals();
        if(!destination?.session || destination.workspace!==getWorkspaceKey())await goHome();
        else {
            if(destination.session!==activeSessionName)await resumeSession(destination.session);
            if(destination.session===activeSessionName){
                const view=destination.sidePickerView;
                if(view==='view-results' && state.results)showHostResults(state.results);
                else switchView(view==='view-factions'?'view-factions':'view-players');
            }
        }
    }finally{restoringView=false;}
}
let viewNavigation = Promise.resolve();
window.addEventListener('popstate',event=>{
    viewNavigation = viewNavigation.then(()=>restoreHistoryView(event.state)).catch(error=>accessError(error,'Could not change screen'));
});
