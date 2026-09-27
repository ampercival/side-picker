const GOAL_NAMES = {total:'Highest Group Score',fairness:'Fairest for Everyone'};
let goalComparison = null, publishingComparison = false;
function showGoalComparison(results,snapshot) {
    goalComparison={results,snapshot};
    const container=get('goal-previews');container.replaceChildren();
    for(const mode of ['total','fairness']){
        const result=results[mode],card=document.createElement('section');card.className='goal-preview';
        const title=document.createElement('h4');title.textContent=GOAL_NAMES[mode];
        const metrics=document.createElement('p');metrics.textContent=`Total points: ${result.score} · Lowest player score: ${result.minimum}`;
        const detail=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('ul');
        summary.textContent='View assignments';
        for(const player of snapshot.players){
            const li=document.createElement('li'),faction=result.assignment[player.id];
            li.textContent=`${player.name}: ${faction} (${getScore(player,faction)} points)`;list.appendChild(li);
        }
        detail.append(summary,list);
        const publish=document.createElement('button');publish.className='btn primary';publish.textContent='Publish '+GOAL_NAMES[mode];publish.onclick=()=>publishGoalComparison(mode);
        card.append(title,metrics,detail,publish);container.appendChild(card);
    }
    get('comparison-room-note').textContent=state.roomCode?'Picking is closed while you compare. Nothing is published until you choose.':'Nothing is published until you choose.';
    get('modal-overlay').classList.add('active');get('comparison-modal').classList.add('active');
}
async function publishGoalComparison(mode) {
    if(!goalComparison || publishingComparison || !GOAL_NAMES[mode])return;
    const {snapshot,results}=goalComparison;publishingComparison=true;
    try{
        if(!optimizationSnapshotIsCurrent(snapshot)){
            closeModal('comparison-modal');showToast('info','Picks changed','Compare again to include the latest setup and choices.');return;
        }
        if(state.roomCode && !(await setRoomStage('locked')))return;
        if(!optimizationSnapshotIsCurrent(snapshot)){
            closeModal('comparison-modal');showToast('info','Picks changed','Compare again to include the latest setup and choices.');return;
        }
        closeModal('comparison-modal');
        displayResults(results[mode],snapshot,GOAL_NAMES[mode]);
        state.results=lastResults;state.roomStage='published';autoSave();switchView('view-results');
        if(activeSessionName && !(await flushSession()))showToast('info','Results not published yet','Players will see them once saving succeeds. Check the save status above.');
    }finally{publishingComparison=false;}
}
function formatResultsSummary(payload) {
    return [[payload.t,payload.gm].filter(Boolean).join(' · '),`Goal: ${payload.g}`,`Preference score: ${payload.pct}%`,
        ...payload.r.map(row=>`${row.n}: ${row.f} — ${row.note} (${row.s>=0?'+':''}${row.s} points)`)].filter(Boolean).join('\n');
}
async function copyResultsSummary() {
    const payload=validateResultsPayload(lastResults);if(!payload)return;
    if(await copyToClipboard(formatResultsSummary(payload)))showToast('success','Summary copied','Ready to paste into your group chat.');
    else {get('results-summary-text').focus();get('results-summary-text').select();showToast('info','Copy manually','Copy the selected summary.');}
}
function showInvitationQR(link,label) {
    const canvas=get('invitation-qr');get('invitation-qr-label').textContent=label;
    try{
        const code=qrcode(0,'M');code.addData(link);code.make();
        const size=code.getModuleCount(),scale=4,margin=4;
        canvas.width=canvas.height=(size+margin*2)*scale;
        const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle='#000';
        for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(code.isDark(y,x))context.fillRect((x+margin)*scale,(y+margin)*scale,scale,scale);
        canvas.hidden=false;
    }catch{canvas.hidden=true;get('invitation-qr-label').textContent='QR code unavailable. Use the invitation link above.';}
}
if(typeof module!=='undefined')module.exports={formatResultsSummary};
