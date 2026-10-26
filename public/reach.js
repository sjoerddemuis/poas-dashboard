/* ===== Sectie: Merkbekendheid — uniek bereik per maand via Meta, met doel per account =====
 * Zelfstandig bestand (public/reach.js). Verwacht <div id="sec-reach"> in index.html, Chart.js op window.Chart
 * en /api/meta (views reachmonths, reach, reachtargets; POST settarget). Start via window.__reachLoad().
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
#sec-reach .rcard.hero .v{font-size:30px}
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
#sec-reach tr.mrow{cursor:pointer}
#sec-reach tr.mrow:hover td{background:#FAFBFA}
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
  <span class="rlbl">Doel uniek bereik per maand</span><input type="number" id="mrTarget" min="0" step="10000" style="width:130px" placeholder="bv. 1000000">
  <span class="rlbl" id="mrTargetSaved"></span>
  <span class="rsep"></span>
  <button class="rbtn" id="mrRefresh" title="Lopende maand opnieuw bij Meta ophalen">↻ Ververs</button>
</div>
<div id="mrBody"><div class="rloading">Bereik laden…</div></div>`;

let inited=false, ACC=[], acc=localStorage.getItem("mr_acc")||"", targets={}, M=null, DET=null, selM="", chart=null, tT=null;
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const num=n=>(n==null||!isFinite(n))?"—":Math.round(n).toLocaleString("nl-NL");
const eur=n=>(n==null||!isFinite(n))?"—":"€ "+Math.round(n).toLocaleString("nl-NL");
const eur2=n=>(n==null||!isFinite(n))?"—":"€ "+Number(n).toLocaleString("nl-NL",{minimumFractionDigits:2,maximumFractionDigits:2});
const f1=n=>(n==null||!isFinite(n))?"—":Number(n).toLocaleString("nl-NL",{minimumFractionDigits:1,maximumFractionDigits:1});
const pct=n=>(n==null||!isFinite(n))?"—":Math.round(n)+"%";
const MN=["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
const mLabel=ym=>{const [y,m]=ym.split("-");return MN[+m-1]+" '"+y.slice(2);};
const mLong=ym=>{const [y,m]=ym.split("-");return ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"][+m-1]+" "+y;};
const todayISO=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Amsterdam",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const dim=ym=>{const [y,m]=ym.split("-").map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();};
function target(){return +targets[acc]||0;}
function pcls(p){if(p==null)return"p0";if(p>=100)return"p3";if(p>=70)return"p2";return"p1";}

async function api(url,opt){const r=await fetch(url,opt);if(r.status===401){location.href="/login.html";throw new Error("Niet ingelogd");}const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||("HTTP "+r.status));return d;}
async function loadAccounts(){const d=await api("/api/meta?view=accounts");ACC=d.accounts||[];const s=document.getElementById("mrAcc");s.innerHTML=ACC.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}${a.status!==1?" (inactief)":""}</option>`).join("");if(!ACC.find(a=>a.id===acc))acc=ACC[0]?ACC[0].id:"";s.value=acc;}
async function loadTargets(){try{const d=await api("/api/meta?view=reachtargets");targets=d.targets||{};}catch(e){targets={};}}
function syncTargetInput(){const el=document.getElementById("mrTarget");el.value=target()||"";document.getElementById("mrTargetSaved").textContent=target()?"voor "+((ACC.find(a=>a.id===acc)||{}).name||acc):"nog geen doel voor dit account";}
async function saveTarget(v){try{const d=await api("/api/meta",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"settarget",account:acc,target:v})});targets=d.targets||targets;syncTargetInput();render();}catch(e){alert("Doel opslaan mislukt: "+e.message);}}
async function loadMonths(force){
  const body=document.getElementById("mrBody");
  if(!acc){body.innerHTML='<div class="rempty">Geen advertentieaccounts gevonden. Controleer META_TOKEN in Vercel.</div>';return;}
  if(!M)body.innerHTML='<div class="rloading">Bereik laden…</div>';
  try{
    const d=await api(`/api/meta?view=reachmonths&account=${encodeURIComponent(acc)}&months=13${force?"&refresh=1":""}`);
    M={rows:(d.months||[]).slice().sort((a,b)=>a.m.localeCompare(b.m)),at:Date.now()};
    const cur=todayISO().slice(0,7);
    if(!selM||!M.rows.find(r=>r.m===selM))selM=M.rows.find(r=>r.m===cur)?cur:(M.rows.length?M.rows[M.rows.length-1].m:cur);
    render();
    loadDetail(force);
  }catch(e){body.innerHTML='<div class="rerr">Kon bereik niet laden.<br><small>'+esc(e.message||e)+'</small></div>';}
}
async function loadDetail(force){
  DET=null;renderDetail();
  try{DET=await api(`/api/meta?view=reach&account=${encodeURIComponent(acc)}&month=${selM}${force?"&refresh=1":""}`);}
  catch(e){DET={error:e.message||String(e)};}
  renderDetail();
}

function render(){
  if(!M)return;
  const rows=M.rows, cur=todayISO().slice(0,7), today=todayISO();
  const curRow=rows.find(r=>r.m===cur), prevRow=rows.length>1?rows.filter(r=>r.m<cur).slice(-1)[0]:null;
  const T=target();
  const day=+today.slice(8,10), days=dim(cur), left=days-day;
  const reach=curRow?curRow.reach:0;
  const proj=day>0?reach/day*days:null;
  const needPerDay=T>0&&left>0?Math.max(0,T-reach)/left:null;
  const p=T>0?reach/T*100:null;
  const body=document.getElementById("mrBody");
  body.innerHTML=`<div class="rcards">
    <div class="rcard hero"><div class="l">Uniek bereik ${esc(mLong(cur))} · t/m ${day} ${MN[+cur.slice(5,7)-1]}</div><div class="v">${num(reach)}</div>
      <div class="d">${T>0?`<b class="${p>=100?"up":""}">${pct(p)}</b> van doel ${num(T)}`:'<span class="mute">Stel rechtsboven een doel in om voortgang te zien.</span>'}${prevRow?` · vorige maand ${num(prevRow.reach)}`:""}</div>
      ${T>0?`<div class="rbarw"><div class="rbarf ${p<(day/days*100)*0.8?"warn":""}" style="width:${Math.min(100,p||0)}%"></div></div><div class="d">${Math.round(day/days*100)}% van de maand voorbij${p!=null?` · tempo ${p>=day/days*100?"ligt op schema":"ligt achter"}`:""}</div>`:""}
    </div>
    <div class="rcard"><div class="l">Prognose einde maand</div><div class="v">${num(proj)}</div><div class="d">lineair (${num(day>0?reach/day:null)}/dag) — bovengrens, overlap drukt het echte cijfer${T>0&&proj!=null?` · ${pct(proj/T*100)} van doel`:""}</div></div>
    <div class="rcard"><div class="l">Nodig per dag</div><div class="v">${T>0?(left>0?num(needPerDay):"—"):"—"}</div><div class="d">${T>0?(left>0?`nieuwe unieke mensen, ${left} dagen te gaan`:"maand voorbij"):"geen doel ingesteld"}</div></div>
    <div class="rcard"><div class="l">Frequentie · impressies</div><div class="v">${f1(curRow?curRow.freq:null)}×</div><div class="d">${num(curRow?curRow.impr:null)} impressies</div></div>
    <div class="rcard"><div class="l">Kosten per 1.000 bereikt</div><div class="v">${eur2(curRow?curRow.cpr:null)}</div><div class="d">${eur(curRow?curRow.spend:null)} besteed · CPM ${eur2(curRow?curRow.cpm:null)}</div></div>
  </div>
  <div class="rpanel"><div class="rph"><h3>Uniek bereik per maand</h3><span class="sub">laatste ${rows.length} maanden · ${esc((ACC.find(a=>a.id===acc)||{}).name||acc)}${T>0?` · doel ${num(T)}`:""}</span></div><div class="rchart"><canvas id="mrChart"></canvas></div></div>
  <div class="rgrid">
    <div class="rpanel"><div class="rph"><h3>Per maand</h3><span class="sub">klik op een maand voor campagnes en landen</span></div><div class="rtbl"><table>
      <thead><tr><th class="l">Maand</th><th>Uniek bereik</th><th>Δ vorige</th><th>% doel</th><th>Impressies</th><th>Freq.</th><th>Besteed</th><th>€/1.000</th></tr></thead><tbody>
      ${rows.slice().reverse().map((r,i,arr)=>{const prev=arr[i+1];const d=prev&&prev.reach>0?(r.reach-prev.reach)/prev.reach*100:null;const pp=T>0?r.reach/T*100:null;return`<tr class="mrow ${r.m===selM?"sel":""}" data-m="${r.m}"><td class="l"><b>${mLabel(r.m)}</b>${r.m===cur?' <span class="mute">(loopt)</span>':""}</td><td><b>${num(r.reach)}</b></td><td class="${d==null?"mute":d>=0?"up":"dn"}">${d==null?"—":(d>0?"+":"")+Math.round(d)+"%"}</td><td><span class="pill ${pcls(pp)}">${pct(pp)}</span></td><td>${num(r.impr)}</td><td>${f1(r.freq)}×</td><td>${eur(r.spend)}</td><td>${eur2(r.cpr)}</td></tr>`;}).join("")}
      </tbody></table></div>
      <div class="rnote">Uniek bereik = Meta's schatting van het aantal verschillende personen dat minstens één advertentie zag in die maand. Niet optelbaar over maanden of campagnes (dezelfde persoon telt dan dubbel). €/1.000 = kosten per 1.000 bereikte personen.</div>
    </div>
    <div class="rpanel" id="mrDetail"></div>
  </div>
  <div class="rfoot">Bron: Meta Marketing API, accountniveau per kalendermaand. Afgesloten maanden zijn definitief; de lopende maand wordt max. elke 30 min ververst. Laatst geladen ${new Date(M.at).toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"})}.</div>`;
  drawChart(rows,T,cur);
  renderDetail();
}
function renderDetail(){
  const el=document.getElementById("mrDetail");if(!el)return;
  if(!DET){el.innerHTML=`<div class="rph"><h3>${esc(mLong(selM))}</h3></div><div class="rloading">Details laden…</div>`;return;}
  if(DET.error){el.innerHTML=`<div class="rph"><h3>${esc(mLong(selM))}</h3></div><div class="rerr">${esc(DET.error)}</div>`;return;}
  const A=DET.account||{reach:0};
  const camps=(DET.campaigns||[]).filter(c=>c.reach>0);
  const cs=(DET.countries||[]).filter(c=>c.reach>0).slice(0,8);const mx=cs.length?cs[0].reach:1;
  el.innerHTML=`<div class="rph"><h3>${esc(mLong(selM))}</h3><span class="sub">${DET.complete?"afgesloten":"loopt t/m "+DET.to.slice(8,10)+" "+MN[+selM.slice(5,7)-1]} · account-bereik ${num(A.reach)}</span></div>
  <div class="rtbl"><table><thead><tr><th class="l">Campagne</th><th>Uniek bereik</th><th>Aandeel</th><th>Freq.</th><th>Besteed</th><th>€/1.000</th></tr></thead><tbody>
  ${camps.length?camps.map(c=>`<tr><td class="l" title="${esc(c.name)}">${esc(c.name.length>34?c.name.slice(0,33)+"…":c.name)}</td><td><b>${num(c.reach)}</b></td><td class="mute">${A.reach>0?pct(c.reach/A.reach*100):"—"}</td><td>${f1(c.freq)}×</td><td>${eur(c.spend)}</td><td>${eur2(c.cpr)}</td></tr>`).join(""):'<tr><td class="l mute" colspan="6">Geen campagnes met bereik in deze maand.</td></tr>'}
  </tbody></table></div>
  <div class="rnote">Aandeel = campagnebereik ÷ accountbereik; som kan boven 100% komen door overlap tussen campagnes.</div>
  ${cs.length?`<div class="rph" style="margin-top:12px"><h3>Landen</h3><span class="sub">uniek bereik per land</span></div>${cs.map(c=>`<div class="cbar"><span class="cn">${esc(c.c)}</span><div class="ct"><div class="cf" style="width:${Math.round(c.reach/mx*100)}%"></div></div><span class="cv">${num(c.reach)}</span></div>`).join("")}`:""}`;
}
function drawChart(rows,T,cur){
  const c=document.getElementById("mrChart");if(!c||!window.Chart)return;
  if(chart){chart.destroy();chart=null;}
  const ds=[{type:"bar",label:"Uniek bereik",data:rows.map(r=>r.reach),backgroundColor:rows.map(r=>r.m===cur?"rgba(1,181,45,.45)":"rgba(1,181,45,.85)"),borderRadius:4,order:2}];
  if(T>0)ds.push({type:"line",label:"Doel",data:rows.map(()=>T),borderColor:"#b3590a",borderDash:[5,4],pointRadius:0,borderWidth:1.5,order:1});
  chart=new Chart(c,{type:"bar",data:{labels:rows.map(r=>mLabel(r.m)+(r.m===cur?" (loopt)":"")),datasets:ds},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{position:"bottom",labels:{boxWidth:10,font:{size:11}}},tooltip:{callbacks:{label:ctx=>ctx.dataset.label+": "+num(ctx.parsed.y)}}},
    scales:{y:{beginAtZero:true,ticks:{callback:v=>v>=1e6?(v/1e6).toLocaleString("nl-NL")+" M":v>=1e3?Math.round(v/1e3)+" k":v,font:{size:10}},grid:{color:"#EEF0EE"}},x:{ticks:{font:{size:10},maxRotation:0,autoSkip:false}}}}});
}
function bind(){
  const sec=document.getElementById("sec-reach");
  document.getElementById("mrAcc").addEventListener("change",e=>{acc=e.target.value;localStorage.setItem("mr_acc",acc);M=null;DET=null;selM="";syncTargetInput();loadMonths(false);});
  document.getElementById("mrTarget").addEventListener("input",e=>{clearTimeout(tT);const v=Math.max(0,Math.round(+e.target.value||0));tT=setTimeout(()=>saveTarget(v),700);});
  document.getElementById("mrRefresh").addEventListener("click",async()=>{const b=document.getElementById("mrRefresh");b.disabled=true;b.textContent="Bezig…";try{await loadMonths(true);}finally{b.disabled=false;b.textContent="↻ Ververs";}});
  sec.addEventListener("click",e=>{const tr=e.target.closest("tr.mrow");if(tr&&tr.dataset.m!==selM){selM=tr.dataset.m;render();loadDetail(false);}});
}
window.__reachLoad=async function(){
  const sec=document.getElementById("sec-reach");if(!sec)return;
  if(!inited){inited=true;
    const st=document.createElement("style");st.textContent=CSS;document.head.appendChild(st);
    sec.innerHTML=HTML;bind();
    try{await Promise.all([loadAccounts(),loadTargets()]);}catch(e){document.getElementById("mrBody").innerHTML='<div class="rerr">Kon Meta-accounts niet laden.<br><small>'+esc(e.message||e)+'</small></div>';return;}
    syncTargetInput();loadMonths(false);return;
  }
  if(M&&Date.now()-M.at>30*60*1000)loadMonths(false);else if(M)render();
};
})();
