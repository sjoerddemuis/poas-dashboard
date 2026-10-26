/* ===== Sectie: Merkbekendheid — rollend 7-daags uniek bereik via Meta, met doel per 7 dagen per account =====
 * Zelfstandig bestand (public/reach.js). Verwacht <div id="sec-reach"> in index.html, Chart.js op window.Chart
 * en /api/meta (views reach7, reachrange, reachtargets7; POST settarget7). Start via window.__reachLoad().
 * Elke dag d = het unieke bereik van [d-6, d]. On-track = dat venster ligt op of boven het doel.
 */
(function(){
"use strict";
const CSS=`
#sec-reach .rbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:11px;padding:9px 12px;margin-bottom:12px}
#sec-reach select,#sec-reach input[type=number]{font-size:13px;border:1.5px solid var(--line);background:var(--card);color:var(--ink);border-radius:9px;padding:7px 10px;font-weight:600;outline:none}
#sec-reach input:focus,#sec-reach select:focus{border-color:var(--green)}
#sec-reach .rlbl{font-size:12px;color:var(--mute);font-weight:600}
#sec-reach .rbtn{border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink);font-size:12px;font-weight:700;padding:7px 12px;cursor:pointer}
#sec-reach .rbtn:hover{border-color:var(--green);color:var(--greenDk)}
#sec-reach .rsep{width:1px;align-self:stretch;min-height:24px;background:var(--line);margin:0 2px}
#sec-reach .rcards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:12px}
#sec-reach .rcard{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;box-shadow:var(--shadow)}
#sec-reach .rcard .l{font-size:11px;color:var(--mute);font-weight:700;text-transform:uppercase;letter-spacing:.4px}
#sec-reach .rcard .v{font-size:22px;font-weight:800;margin-top:4px;letter-spacing:-.3px}
#sec-reach .rcard .d{font-size:11.5px;margin-top:3px;color:var(--mute)}
#sec-reach .rcard.hero{grid-column:span 2;background:linear-gradient(135deg,#F2FBF4,#fff)}
#sec-reach .rcard.hero.off{background:linear-gradient(135deg,#FFF1E5,#fff)}
#sec-reach .rcard.hero .v{font-size:30px}
#sec-reach .status{display:inline-block;border-radius:20px;padding:3px 11px;font-size:12px;font-weight:800;margin-left:8px;vertical-align:middle}
#sec-reach .status.ok{background:var(--lightg);color:var(--greenDk)} #sec-reach .status.off{background:#FFF1E5;color:#b3590a} #sec-reach .status.no{background:#F0F0EC;color:var(--mute)}
#sec-reach .rbarw{height:10px;background:#EEF0EE;border-radius:6px;overflow:hidden;margin-top:8px}
#sec-reach .rbarf{height:100%;background:var(--green);border-radius:6px;transition:width .3s}
#sec-reach .rbarf.warn{background:#FD5900}
#sec-reach .up{color:var(--greenDk)} #sec-reach .dn{color:var(--red)}
#sec-reach .rpanel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:12px;box-shadow:var(--shadow)}
#sec-reach .rph{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}
#sec-reach .rph h3{font-size:14px;margin:0;font-weight:700}
#sec-reach .rph .sub{font-size:12px;color:var(--mute)}
#sec-reach .rchart{position:relative;height:260px}
#sec-reach .rtbl{overflow-x:auto}
#sec-reach table{width:100%;border-collapse:collapse;font-size:12.5px}
#sec-reach th{text-align:right;font-size:10.5px;letter-spacing:.3px;text-transform:uppercase;color:var(--mute);padding:7px 8px;white-space:nowrap;border-bottom:1px solid var(--line)}
#sec-reach th.l,#sec-reach td.l{text-align:left}
#sec-reach td{text-align:right;padding:6px 8px;border-top:1px solid var(--line);white-space:nowrap}
#sec-reach tr.sel td{background:#F2FBF4}
#sec-reach tr.wrow{cursor:pointer}
#sec-reach tr.wrow:hover td{background:#FAFBFA}
#sec-reach .pill{display:inline-block;font-weight:800;border-radius:20px;padding:2px 9px;min-width:46px;text-align:center}
#sec-reach .p0{background:#F0F0EC;color:var(--mute)} #sec-reach .p1{background:#FBEEE8;color:var(--red)} #sec-reach .p2{background:#FFF1E5;color:#b3590a} #sec-reach .p3{background:var(--lightg);color:var(--greenDk)}
#sec-reach .mute{color:var(--mute)}
#sec-reach .rgrid{display:grid;grid-template-columns:1.6fr 1fr;gap:12px}
@media(max-width:900px){#sec-reach .rgrid{grid-template-columns:1fr}#sec-reach .rcard.hero{grid-column:span 1}}
#sec-reach .cbar{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:4px 0}
#sec-reach .cbar .cn{width:44px;font-weight:700}
#sec-reach .cbar .ct{flex:1;height:10px;background:#EEF0EE;border-radius:6px;overflow:hidden}
#sec-reach .cbar .cf{height:100%;background:#0A6CCB;border-radius:6px}
#sec-reach .cbar .cv{width:90px;text-align:right}
#sec-reach .rloading,#sec-reach .rerr,#sec-reach .rempty{padding:34px;text-align:center;color:var(--mute)}
#sec-reach .rerr{color:var(--red)}
#sec-reach .rnote{font-size:11.5px;color:var(--mute);margin-top:8px;line-height:1.5}
#sec-reach .rfoot{font-size:11px;color:var(--mute);margin-top:6px}
`;
const HTML=`
<div class="rbar">
  <select id="mrAcc"><option value="">Accounts laden…</option></select>
  <span class="rsep"></span>
  <span class="rlbl">Doel / 7 dagen</span><input type="number" id="mrTarget" min="0" step="5000" style="width:130px" placeholder="bv. 230000">
  <span class="rlbl" id="mrTargetSaved"></span>
  <span class="rsep"></span>
  <button class="rbtn" id="mrRefresh" title="Venster t/m vandaag opnieuw bij Meta ophalen">↻ Ververs</button>
</div>
<div id="mrBody"><div class="rloading">Laden…</div></div>`;

let inited=false, ACC=[], acc=localStorage.getItem("mr_acc")||"", targets={}, R=null, DET=null, selEnd="", chart=null, tT=null;
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const num=n=>(n==null||!isFinite(n))?"—":Math.round(n).toLocaleString("nl-NL");
const eur=n=>(n==null||!isFinite(n))?"—":"€ "+Math.round(n).toLocaleString("nl-NL");
const eur2=n=>(n==null||!isFinite(n))?"—":"€ "+Number(n).toLocaleString("nl-NL",{minimumFractionDigits:2,maximumFractionDigits:2});
const f1=n=>(n==null||!isFinite(n))?"—":Number(n).toLocaleString("nl-NL",{minimumFractionDigits:1,maximumFractionDigits:1});
const pct=n=>(n==null||!isFinite(n))?"—":Math.round(n)+"%";
const MN=["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
const todayISO=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Amsterdam",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const addDays=(iso,n)=>{const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const fD=iso=>+iso.slice(8,10)+" "+MN[+iso.slice(5,7)-1];
const winLbl=end=>fD(addDays(end,-6))+" – "+fD(end);
function target(){return +targets[acc]||0;}
function pcls(p){if(p==null)return"p0";if(p>=100)return"p3";if(p>=70)return"p2";return"p1";}

async function api(url,opt){const r=await fetch(url,opt);if(r.status===401){location.href="/login.html";throw new Error("Niet ingelogd");}const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||("HTTP "+r.status));return d;}
async function loadAccounts(){const d=await api("/api/meta?view=accounts");ACC=d.accounts||[];const s=document.getElementById("mrAcc");s.innerHTML=ACC.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}${a.status!==1?" (inactief)":""}</option>`).join("");if(!ACC.find(a=>a.id===acc))acc=ACC[0]?ACC[0].id:"";s.value=acc;}
async function loadTargets(){try{const d=await api("/api/meta?view=reachtargets7");targets=d.targets||{};}catch(e){targets={};}}
function syncTargetInput(){const el=document.getElementById("mrTarget");el.value=target()||"";document.getElementById("mrTargetSaved").textContent=target()?"≈ "+num(target()*30.44/7)+" / maand":"geen doel";}
async function saveTarget(v){try{const d=await api("/api/meta",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"settarget7",account:acc,target:v})});targets=d.targets||targets;syncTargetInput();render();}catch(e){alert("Doel opslaan mislukt: "+e.message);}}
async function loadData(force){
  const body=document.getElementById("mrBody");
  if(!acc){body.innerHTML='<div class="rempty">Geen accounts (META_TOKEN?)</div>';return;}
  if(!R)body.innerHTML='<div class="rloading">Laden…</div>';
  try{
    const d=await api(`/api/meta?view=reach7&account=${encodeURIComponent(acc)}&days=56${force?"&refresh=1":""}`);
    const by={};(d.days||[]).forEach(x=>{by[x.d]=x;});
    R={by,days:(d.days||[]).slice().sort((a,b)=>a.d.localeCompare(b.d)),at:Date.now(),today:todayISO()};
    if(!selEnd||!by[selEnd])selEnd=R.today;
    render();loadDetail(force);
  }catch(e){body.innerHTML='<div class="rerr">Kon bereik niet laden.<br><small>'+esc(e.message||e)+'</small></div>';}
}
async function loadDetail(force){
  DET=null;renderDetail();
  try{DET=await api(`/api/meta?view=reachrange&account=${encodeURIComponent(acc)}&since=${addDays(selEnd,-6)}&until=${selEnd}${force?"&refresh=1":""}`);}
  catch(e){DET={error:e.message||String(e)};}
  renderDetail();
}
function blocks(){ // 8 aansluitende blokken van 7 dagen, eindigend vandaag
  const out=[];for(let k=0;k<8;k++){const end=addDays(R.today,-7*k);const x=R.by[end];if(x)out.push(x);}return out;
}
function render(){
  if(!R)return;
  const T=target(), cur=R.by[R.today]||{reach:0,impr:0,freq:0,spend:0,cpm:0,cpr:0};
  const prev=R.by[addDays(R.today,-7)], w4=R.by[addDays(R.today,-28)];
  const p=T>0?cur.reach/T*100:null, gap=T>0?T-cur.reach:null;
  const onTrack=T>0?cur.reach>=T:null;
  const dPrev=prev&&prev.reach>0?(cur.reach-prev.reach)/prev.reach*100:null;
  const d4=w4&&w4.reach>0?(cur.reach-w4.reach)/w4.reach*100:null;
  const costTarget=T>0&&cur.cpr>0?T/1000*cur.cpr:null;
  const body=document.getElementById("mrBody");
  body.innerHTML=`<div class="rcards">
    <div class="rcard hero ${onTrack===false?"off":""}"><div class="l">Uniek bereik · 7 dagen · ${winLbl(R.today)}</div><div class="v">${num(cur.reach)}${onTrack==null?'<span class="status no">geen doel</span>':onTrack?'<span class="status ok">✓ on track</span>':'<span class="status off">achter op doel</span>'}</div>
      <div class="d">${T>0?`<b class="${p>=100?"up":""}">${pct(p)}</b> van ${num(T)}${gap>0?` · <b>−${num(gap)}</b>`:gap!=null?` · <b class="up">+${num(-gap)}</b>`:""}`:'<span class="mute">geen doel ingesteld</span>'}</div>
      ${T>0?`<div class="rbarw"><div class="rbarf ${p<100?"warn":""}" style="width:${Math.min(100,p||0)}%"></div></div>`:""}
      <div class="d">vs vorige 7 d ${dPrev==null?"—":`<span class="${dPrev>=0?"up":"dn"}">${dPrev>0?"+":""}${Math.round(dPrev)}%</span>`} · vs 4 wk ${d4==null?"—":`<span class="${d4>=0?"up":"dn"}">${d4>0?"+":""}${Math.round(d4)}%</span>`}</div>
    </div>
    <div class="rcard"><div class="l">Per dag</div><div class="v">${num(cur.reach/7)}</div><div class="d">${T>0?`nodig ${num(T/7)}`:"&nbsp;"}</div></div>
    <div class="rcard"><div class="l">€ / 1.000 bereikt</div><div class="v">${eur2(cur.cpr)}</div><div class="d">${eur(cur.spend)} besteed${costTarget?` · doel ≈ ${eur(costTarget)}`:""}</div></div>
    <div class="rcard"><div class="l">Frequentie</div><div class="v">${f1(cur.freq)}×</div><div class="d">${num(cur.impr)} impr.</div></div>
  </div>
  <div class="rpanel"><div class="rph"><h3>Rollend 7-daags bereik</h3><span class="sub">${esc((ACC.find(a=>a.id===acc)||{}).name||acc)}</span></div><div class="rchart"><canvas id="mrChart"></canvas></div></div>
  <div class="rgrid">
    <div class="rpanel"><div class="rph"><h3>Per 7 dagen</h3></div><div class="rtbl"><table>
      <thead><tr><th class="l">Periode</th><th>Bereik</th><th>Δ</th><th>Doel</th><th>Impr.</th><th>Freq.</th><th>Besteed</th><th>€/1.000</th></tr></thead><tbody>
      ${blocks().map((b,i,arr)=>{const pv=arr[i+1];const d=pv&&pv.reach>0?(b.reach-pv.reach)/pv.reach*100:null;const pp=T>0?b.reach/T*100:null;return`<tr class="wrow ${b.d===selEnd?"sel":""}" data-end="${b.d}"><td class="l"><b>${winLbl(b.d)}</b>${b.d===R.today?' <span class="mute">(nu)</span>':""}</td><td><b>${num(b.reach)}</b></td><td class="${d==null?"mute":d>=0?"up":"dn"}">${d==null?"—":(d>0?"+":"")+Math.round(d)+"%"}</td><td><span class="pill ${pcls(pp)}">${pct(pp)}</span></td><td>${num(b.impr)}</td><td>${f1(b.freq)}×</td><td>${eur(b.spend)}</td><td>${eur2(b.cpr)}</td></tr>`;}).join("")}
      </tbody></table></div></div>
    <div class="rpanel" id="mrDetail"></div>
  </div>
  <div class="rfoot">Meta · ${new Date(R.at).toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"})}</div>`;
  drawChart(T);
  renderDetail();
}
function renderDetail(){
  const el=document.getElementById("mrDetail");if(!el)return;
  const title=`${winLbl(selEnd)}`;
  if(!DET){el.innerHTML=`<div class="rph"><h3>${esc(title)}</h3></div><div class="rloading">…</div>`;return;}
  if(DET.error){el.innerHTML=`<div class="rph"><h3>${esc(title)}</h3></div><div class="rerr">${esc(DET.error)}</div>`;return;}
  const A=DET.account||{reach:0};
  const camps=(DET.campaigns||[]).filter(c=>c.reach>0);
  const cs=(DET.countries||[]).filter(c=>c.reach>0).slice(0,8);const mx=cs.length?cs[0].reach:1;
  el.innerHTML=`<div class="rph"><h3>${esc(title)}</h3><span class="sub">${num(A.reach)}</span></div>
  <div class="rtbl"><table><thead><tr><th class="l">Campagne</th><th>Bereik</th><th>Aandeel</th><th>Freq.</th><th>Besteed</th><th>€/1.000</th></tr></thead><tbody>
  ${camps.length?camps.map(c=>`<tr><td class="l" title="${esc(c.name)}">${esc(c.name.length>34?c.name.slice(0,33)+"…":c.name)}</td><td><b>${num(c.reach)}</b></td><td class="mute">${A.reach>0?pct(c.reach/A.reach*100):"—"}</td><td>${f1(c.freq)}×</td><td>${eur(c.spend)}</td><td>${eur2(c.cpr)}</td></tr>`).join(""):'<tr><td class="l mute" colspan="6">—</td></tr>'}
  </tbody></table></div>
  ${cs.length?`<div class="rph" style="margin-top:12px"><h3>Landen</h3></div>${cs.map(c=>`<div class="cbar"><span class="cn">${esc(c.c)}</span><div class="ct"><div class="cf" style="width:${Math.round(c.reach/mx*100)}%"></div></div><span class="cv">${num(c.reach)}</span></div>`).join("")}`:""}`;
}
function drawChart(T){
  const c=document.getElementById("mrChart");if(!c||!window.Chart)return;
  if(chart){chart.destroy();chart=null;}
  const days=R.days;
  const ds=[{type:"line",label:"Bereik 7 d",data:days.map(x=>x.reach),borderColor:"#01B52D",backgroundColor:"rgba(1,181,45,.12)",fill:true,pointRadius:days.map(x=>x.d===R.today?4:0),pointBackgroundColor:"#01B52D",tension:.25,borderWidth:2,order:1}];
  if(T>0)ds.push({type:"line",label:"Doel",data:days.map(()=>T),borderColor:"#b3590a",borderDash:[5,4],pointRadius:0,borderWidth:1.5,order:0});
  chart=new Chart(c,{type:"line",data:{labels:days.map(x=>fD(x.d)),datasets:ds},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{position:"bottom",labels:{boxWidth:10,font:{size:11}}},tooltip:{callbacks:{title:items=>items.length?winLbl(days[items[0].dataIndex].d):"",label:ctx=>ctx.dataset.label.split(" (")[0]+": "+num(ctx.parsed.y)}}},
    scales:{y:{beginAtZero:true,ticks:{callback:v=>v>=1e6?(v/1e6).toLocaleString("nl-NL")+" M":v>=1e3?Math.round(v/1e3)+" k":v,font:{size:10}},grid:{color:"#EEF0EE"}},x:{ticks:{font:{size:10},maxRotation:0,autoSkip:true,maxTicksLimit:14}}}}});
}
function bind(){
  const sec=document.getElementById("sec-reach");
  document.getElementById("mrAcc").addEventListener("change",e=>{acc=e.target.value;localStorage.setItem("mr_acc",acc);R=null;DET=null;selEnd="";syncTargetInput();loadData(false);});
  document.getElementById("mrTarget").addEventListener("input",e=>{clearTimeout(tT);const v=Math.max(0,Math.round(+e.target.value||0));tT=setTimeout(()=>saveTarget(v),700);});
  document.getElementById("mrRefresh").addEventListener("click",async()=>{const b=document.getElementById("mrRefresh");b.disabled=true;b.textContent="Bezig…";try{await loadData(true);}finally{b.disabled=false;b.textContent="↻ Ververs";}});
  sec.addEventListener("click",e=>{const tr=e.target.closest("tr.wrow");if(tr&&tr.dataset.end!==selEnd){selEnd=tr.dataset.end;render();loadDetail(false);}});
}
window.__reachLoad=async function(){
  const sec=document.getElementById("sec-reach");if(!sec)return;
  if(!inited){inited=true;
    const st=document.createElement("style");st.textContent=CSS;document.head.appendChild(st);
    sec.innerHTML=HTML;bind();
    try{await Promise.all([loadAccounts(),loadTargets()]);}catch(e){document.getElementById("mrBody").innerHTML='<div class="rerr">Kon Meta-accounts niet laden.<br><small>'+esc(e.message||e)+'</small></div>';return;}
    syncTargetInput();loadData(false);return;
  }
  if(R&&(Date.now()-R.at>30*60*1000||R.today!==todayISO()))loadData(false);else if(R)render();
};
})();
