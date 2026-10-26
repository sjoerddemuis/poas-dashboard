/* ===== Sectie: Meta Ads — ROAS per campagne / ad set / groep, per dag =====
 * Zelfstandig bestand (public/meta.js). Verwacht <div id="sec-meta"> in index.html, Chart.js op window.Chart,
 * window.isAdmin() en /api/meta (zie api/meta.js). Start via window.__metaLoad() bij tab-activatie.
 */
(function(){
"use strict";
const CSS=`
#sec-meta .mbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:11px;padding:9px 12px;margin-bottom:10px}
#sec-meta select,#sec-meta input[type=date],#sec-meta input[type=text],#sec-meta input[type=number]{font-size:13px;border:1.5px solid var(--line);background:var(--card);color:var(--ink);border-radius:9px;padding:7px 10px;font-weight:600;outline:none}
#sec-meta input[type=text]{min-width:180px;font-weight:500}
#sec-meta input:focus,#sec-meta select:focus{border-color:var(--green)}
#sec-meta .mseg{display:inline-flex;border:1.5px solid var(--line);border-radius:9px;overflow:hidden}
#sec-meta .mseg button{border:0;border-right:1px solid var(--line);background:var(--card);color:var(--ink);font-size:12px;font-weight:700;padding:7px 12px;cursor:pointer}
#sec-meta .mseg button:last-child{border-right:0}
#sec-meta .mseg button.on{background:var(--green);color:#fff}
#sec-meta .mbtn{border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink);font-size:12px;font-weight:700;padding:7px 12px;cursor:pointer}
#sec-meta .mbtn:hover{border-color:var(--green);color:var(--greenDk)}
#sec-meta .mbtn.on{background:var(--ink);color:#fff;border-color:var(--ink)}
#sec-meta .mbtn.prim{background:var(--green);border-color:var(--green);color:#fff}
#sec-meta .mbtn.prim:hover{background:var(--greenDk)}
#sec-meta .mbtn.danger:hover{border-color:var(--red);color:var(--red)}
#sec-meta .mlbl{font-size:12px;color:var(--mute);font-weight:600}
#sec-meta .msep{width:1px;align-self:stretch;min-height:24px;background:var(--line);margin:0 2px}
#sec-meta .mchips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 12px}
#sec-meta .mchip{border:1.5px solid var(--line);border-radius:20px;background:var(--card);padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
#sec-meta .mchip .dotc{width:9px;height:9px;border-radius:50%;background:var(--mute);display:inline-block}
#sec-meta .mchip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
#sec-meta .mchip .x{opacity:.7;margin-left:2px}
#sec-meta .mcards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}
#sec-meta .mcard{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;box-shadow:var(--shadow)}
#sec-meta .mcard .l{font-size:11px;color:var(--mute);font-weight:700;text-transform:uppercase;letter-spacing:.4px}
#sec-meta .mcard .v{font-size:22px;font-weight:800;margin-top:4px;letter-spacing:-.3px}
#sec-meta .mcard .d{font-size:11.5px;margin-top:3px;color:var(--mute)}
#sec-meta .up{color:var(--greenDk)} #sec-meta .dn{color:var(--red)}
#sec-meta .mpanel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:12px;box-shadow:var(--shadow)}
#sec-meta .mph{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}
#sec-meta .mph h3{font-size:14px;margin:0;font-weight:700}
#sec-meta .mph .sub{font-size:12px;color:var(--mute)}
#sec-meta .mchart{position:relative;height:260px}
#sec-meta .mtbl{overflow-x:auto}
#sec-meta table{width:100%;border-collapse:collapse;font-size:12.5px}
#sec-meta th{text-align:right;font-size:10.5px;letter-spacing:.3px;text-transform:uppercase;color:var(--mute);padding:7px 8px;white-space:nowrap;border-bottom:1px solid var(--line);cursor:pointer;user-select:none}
#sec-meta th.l,#sec-meta td.l{text-align:left}
#sec-meta th.sorted{color:var(--ink)}
#sec-meta td{text-align:right;padding:6px 8px;border-top:1px solid var(--line);white-space:nowrap}
#sec-meta tr.camp td{background:var(--paper);font-weight:700;cursor:pointer}
#sec-meta tr.camp td .car{display:inline-block;width:14px;color:var(--mute);font-size:10px}
#sec-meta tr.adset td.l{padding-left:26px}
#sec-meta tr.adset:hover td{background:#FAFBFA}
#sec-meta tr.sel td{background:#F2FBF4}
#sec-meta .nm{cursor:pointer;font-weight:600}
#sec-meta .nm:hover{color:var(--greenDk);text-decoration:underline}
#sec-meta .st{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:#C9CDCA;vertical-align:middle}
#sec-meta .st.act{background:var(--green)}
#sec-meta .st.lrn{background:#0A6CCB}
#sec-meta .roas{display:inline-block;font-weight:800;border-radius:20px;padding:2px 9px;min-width:46px;text-align:center}
#sec-meta .r0{background:#F0F0EC;color:var(--mute)} #sec-meta .r1{background:#FBEEE8;color:var(--red)} #sec-meta .r2{background:#FFF1E5;color:#b3590a} #sec-meta .r3{background:var(--lightg);color:var(--greenDk)} #sec-meta .r4{background:#CDEFD6;color:#0b6b22}
#sec-meta .tag{display:inline-block;border-radius:6px;padding:1px 7px;font-size:10.5px;font-weight:700;margin-left:4px;color:#fff;vertical-align:middle}
#sec-meta .mute{color:var(--mute)}
#sec-meta .spark{vertical-align:middle}
#sec-meta .mchk{width:15px;height:15px;accent-color:var(--green);cursor:pointer}
#sec-meta .selbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#F2FBF4;border:1px solid #CDEFD6;border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:12.5px}
#sec-meta .mloading,#sec-meta .merr,#sec-meta .mempty{padding:34px;text-align:center;color:var(--mute)}
#sec-meta .merr{color:var(--red)}
#sec-meta .mgrp{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);flex-wrap:wrap}
#sec-meta .mgrp:first-child{border-top:none}
#sec-meta .mgrp .gn{font-weight:700;min-width:140px}
#sec-meta .mgrp .gm{display:flex;flex-wrap:wrap;gap:4px;flex:1}
#sec-meta .gmem{border:1px solid var(--line);border-radius:6px;padding:2px 7px;font-size:11px;background:var(--paper)}
#sec-meta .gmem b{cursor:pointer;color:var(--red);margin-left:4px}
#sec-meta .matrix td{padding:4px 6px;font-size:11.5px}
#sec-meta .matrix th{font-size:10px;max-width:120px;overflow:hidden;text-overflow:ellipsis}
#sec-meta .mc{display:inline-block;min-width:44px;border-radius:6px;padding:2px 6px;font-weight:700;text-align:center}
#sec-meta .mnote{font-size:11.5px;color:var(--mute);margin-top:8px}
#sec-meta .mfoot{font-size:11px;color:var(--mute);margin-top:6px}
`;
const HTML=`
<div class="mbar">
  <select id="maAcc"><option value="">Accounts laden…</option></select>
  <div class="mseg" id="maPer"><button data-p="7">7 d</button><button data-p="14">14 d</button><button data-p="30" class="on">30 d</button><button data-p="90">90 d</button></div>
  <input type="date" id="maFrom" title="Van"><input type="date" id="maTo" title="Tot en met">
  <input type="text" id="maQ" placeholder="Zoek campagne of ad set…" autocomplete="off">
  <span class="msep"></span>
  <span class="mlbl">Doel-ROAS</span><input type="number" id="maTarget" step="0.1" min="0" style="width:64px" value="3">
  <span class="msep"></span>
  <button class="mbtn" id="maGroupsBtn">⚙ Groepen</button>
  <button class="mbtn" id="maRefresh" title="Laatste 8 dagen opnieuw bij Meta ophalen">↻ Ververs</button>
</div>
<div class="mchips" id="maChips"></div>
<div id="maBody"><div class="mloading">Meta Ads laden…</div></div>`;

/* ---------- state ---------- */
let inited=false, ACC=[], acc=localStorage.getItem("ma_acc")||"ALL", per=+(localStorage.getItem("ma_per")||30), from="", to="";
let target=+(localStorage.getItem("ma_target")||3)||3, q="", scope={type:"all",id:null}, groups=[], sel=new Set(), openCamp={}, showGroups=false;
let D=null, loading=false, chart=null, sortKey="spend", sortDir=-1, dayView="total", matrixMetric="roas";
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const eur=n=>(n==null||!isFinite(n))?"—":"€ "+Math.round(n).toLocaleString("nl-NL");
const eur2=n=>(n==null||!isFinite(n))?"—":"€ "+Number(n).toLocaleString("nl-NL",{minimumFractionDigits:2,maximumFractionDigits:2});
const num=n=>(n==null||!isFinite(n))?"—":Math.round(n).toLocaleString("nl-NL");
const x2=n=>(n==null||!isFinite(n))?"—":Number(n).toLocaleString("nl-NL",{minimumFractionDigits:2,maximumFractionDigits:2})+"×";
const pct1=n=>(n==null||!isFinite(n))?"—":Number(n).toLocaleString("nl-NL",{minimumFractionDigits:1,maximumFractionDigits:1})+"%";
const todayISO=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Amsterdam",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const addDays=(iso,n)=>{const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const listDays=(a,b)=>{const o=[];for(let d=a;d<=b;d=addDays(d,1))o.push(d);return o;};
const fmtD=iso=>{const d=new Date(iso+"T00:00:00Z");return d.toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"short",timeZone:"UTC"});};
const COLORS=["#01B52D","#0A6CCB","#FD5900","#8E44AD","#E5484D","#0097A7","#b3590a","#2E7D32","#6A726E","#C2185B"];
function roasCls(r,spend){if(!spend)return"r0";if(r==null||!isFinite(r))return"r1";if(r>=target*1.3)return"r4";if(r>=target)return"r3";if(r>=target*0.67)return"r2";return"r1";}
function periodRange(){const t=todayISO();if(from&&to)return{from,to};return{from:addDays(t,-(per-1)),to:t};}

/* ---------- data ---------- */
async function api(url,opt){const r=await fetch(url,opt);if(r.status===401){location.href="/login.html";throw new Error("Niet ingelogd");}const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||("HTTP "+r.status));return d;}
async function loadAccounts(){const d=await api("/api/meta?view=accounts");ACC=d.accounts||[];const s=document.getElementById("maAcc");s.innerHTML=(ACC.length>1?'<option value="ALL">Alle accounts</option>':"")+ACC.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}${a.status!==1?" (inactief)":""}</option>`).join("");if(!ACC.find(a=>a.id===acc)&&!(acc==="ALL"&&ACC.length>1))acc=ACC.length>1?"ALL":(ACC[0]?ACC[0].id:"");s.value=acc;}
async function loadGroups(){try{const d=await api("/api/meta?view=groups");groups=d.groups||[];}catch(e){groups=[];}}
async function loadData(force){
  const body=document.getElementById("maBody");
  if(!ACC.length){body.innerHTML='<div class="mempty">Geen advertentieaccounts gevonden. Controleer META_TOKEN / META_AD_ACCOUNTS in Vercel.</div>';return;}
  loading=true;if(!D)body.innerHTML='<div class="mloading">Meta Ads laden…</div>';
  const {from:f,to:t}=periodRange();const n=listDays(f,t).length;const f2=addDays(f,-n); // vorige periode mee voor de vergelijking
  let accs=acc==="ALL"?ACC.filter(a=>a.status===1).map(a=>a.id):[acc];
  if(!accs.length)accs=ACC.map(a=>a.id);
  try{
    const parts=await Promise.all(accs.map(a=>api(`/api/meta?view=daily&account=${encodeURIComponent(a)}&from=${f2}&to=${t}${force?"&refresh=1":""}`).then(d=>({a,d}))));
    const days={},names={},adsets={},actOf={};
    parts.forEach(({a,d})=>{
      Object.entries(d.days||{}).forEach(([day,rows])=>{(days[day]=days[day]||[]).push(...rows.map(r=>r.concat([a])));});
      Object.entries(d.names||{}).forEach(([id,v])=>{names[id]=Object.assign({},names[id]||{},v);actOf[id]=a;});
      Object.entries(d.adsets||{}).forEach(([id,v])=>{adsets[id]=v;actOf[id]=a;if(!names[id])names[id]={an:v.an,cn:v.cn,c:v.c};});
    });
    D={from:f,to:t,prevFrom:f2,prevTo:addDays(f,-1),days,names,adsets,actOf,at:Date.now()};
    render();
  }catch(e){body.innerHTML='<div class="merr">Kon Meta-data niet laden.<br><small>'+esc(e.message||e)+'</small></div>';}
  loading=false;
}

/* ---------- aggregaties ---------- */
// rij: [adset, campaign, spend, impr, clicks, linkclicks, purchases, value, act]
function agg(rows){const o={spend:0,impr:0,clicks:0,lclicks:0,purch:0,value:0};rows.forEach(r=>{o.spend+=r[2];o.impr+=r[3];o.clicks+=r[4];o.lclicks+=r[5];o.purch+=r[6];o.value+=r[7];});o.roas=o.spend>0?o.value/o.spend:null;o.cpa=o.purch>0?o.spend/o.purch:null;o.ctr=o.impr>0?o.clicks/o.impr*100:null;o.aov=o.purch>0?o.value/o.purch:null;return o;}
function scopeIds(){ // set van adset-ids in de huidige scope (null = alles)
  if(scope.type==="group"){const g=groups.find(x=>x.id===scope.id);return new Set(g?g.adsets.map(x=>x.id):[]);}
  if(scope.type==="campaign")return new Set(Object.keys(D.names).filter(id=>D.names[id].c===scope.id));
  if(scope.type==="adset")return new Set([scope.id]);
  return null;
}
function matchQ(id){if(!q)return true;const n=D.names[id]||{};const s=q.toLowerCase();return (n.an||"").toLowerCase().includes(s)||(n.cn||"").toLowerCase().includes(s);}
function rowsIn(dayFrom,dayTo,ids,useQ){const out=[];listDays(dayFrom,dayTo).forEach(d=>{(D.days[d]||[]).forEach(r=>{if(ids&&!ids.has(r[0]))return;if(useQ&&!matchQ(r[0]))return;out.push(r);});});return out;}
function perDay(dayFrom,dayTo,ids,useQ){return listDays(dayFrom,dayTo).map(d=>({d,a:agg((D.days[d]||[]).filter(r=>(!ids||ids.has(r[0]))&&(!useQ||matchQ(r[0])))) }));}
function scopeLabel(){if(scope.type==="group"){const g=groups.find(x=>x.id===scope.id);return g?g.name:"Groep";}if(scope.type==="campaign"){const n=Object.values(D.names).find(x=>x.c===scope.id);return n?n.cn:"Campagne";}if(scope.type==="adset"){const n=D.names[scope.id];return n?n.an:"Ad set";}return "Alles";}
function groupsOf(id){return groups.filter(g=>g.adsets.some(x=>x.id===id));}
function gColor(g,i){return g.color||COLORS[i%COLORS.length];}

/* ---------- render ---------- */
function render(){
  if(!D)return;
  renderChips();
  const ids=scopeIds();
  const cur=agg(rowsIn(D.from,D.to,ids,true)), prev=agg(rowsIn(D.prevFrom,D.prevTo,ids,true));
  const days=perDay(D.from,D.to,ids,true);
  const body=document.getElementById("maBody");
  body.innerHTML=cards(cur,prev)
    +`<div class="mpanel"><div class="mph"><h3>Per dag · ${esc(scopeLabel())}</h3><span class="sub">${fmtD(D.from)} – ${fmtD(D.to)}</span><div class="mseg" style="margin-left:auto" id="maCm"><button data-m="roas" class="${matrixMetric==="roas"?"on":""}">ROAS</button><button data-m="value" class="${matrixMetric==="value"?"on":""}">Omzet</button><button data-m="purch" class="${matrixMetric==="purch"?"on":""}">Aankopen</button></div></div><div class="mchart"><canvas id="maChart"></canvas></div></div>`
    +(showGroups?groupsPanel():"")
    +(sel.size?selBar():"")
    +tablePanel(ids)
    +dayPanel(days,ids)
    +`<div class="mfoot">Bron: Meta Marketing API (${acc==="ALL"?"alle actieve accounts":esc((ACC.find(a=>a.id===acc)||{}).name||acc)}), attributie volgens accountinstelling. Dagen ouder dan 8 dagen zijn definitief; recente dagen worden max. elke 30 min ververst. Laatst geladen ${new Date(D.at).toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"})}.</div>`;
  drawChart(days);
}
function delta(a,b,inv){if(b==null||a==null||!isFinite(a)||!isFinite(b)||b===0)return'<span class="mute">vorige periode —</span>';const p=(a-b)/Math.abs(b)*100;const good=inv?p<0:p>0;return`<span class="${Math.abs(p)<1?"mute":good?"up":"dn"}">${p>0?"+":""}${p.toLocaleString("nl-NL",{maximumFractionDigits:0})}%</span> <span class="mute">vs. vorige ${listDays(D.from,D.to).length} d</span>`;}
function cards(c,p){
  return`<div class="mcards">
  <div class="mcard"><div class="l">Besteed</div><div class="v">${eur(c.spend)}</div><div class="d">${delta(c.spend,p.spend,true)}</div></div>
  <div class="mcard"><div class="l">Omzet (Meta)</div><div class="v">${eur(c.value)}</div><div class="d">${delta(c.value,p.value)}</div></div>
  <div class="mcard"><div class="l">ROAS</div><div class="v"><span class="roas ${roasCls(c.roas,c.spend)}" style="font-size:18px">${x2(c.roas)}</span></div><div class="d">${delta(c.roas,p.roas)} · doel ${x2(target)}</div></div>
  <div class="mcard"><div class="l">Aankopen</div><div class="v">${num(c.purch)}</div><div class="d">${delta(c.purch,p.purch)}</div></div>
  <div class="mcard"><div class="l">Kosten / aankoop</div><div class="v">${eur2(c.cpa)}</div><div class="d">${delta(c.cpa,p.cpa,true)}</div></div>
  <div class="mcard"><div class="l">CTR · Orderwaarde</div><div class="v" style="font-size:17px">${pct1(c.ctr)} · ${eur2(c.aov)}</div><div class="d">${num(c.clicks)} klikken · ${num(c.impr)} impr.</div></div>
  </div>`;
}
function renderChips(){
  const el=document.getElementById("maChips");
  let h=`<button class="mchip ${scope.type==="all"?"on":""}" data-s="all">Alles</button>`;
  groups.forEach((g,i)=>{h+=`<button class="mchip ${scope.type==="group"&&scope.id===g.id?"on":""}" data-s="group" data-id="${esc(g.id)}"><span class="dotc" style="background:${gColor(g,i)}"></span>${esc(g.name)} <span class="mute" style="font-weight:600">${g.adsets.length}</span></button>`;});
  if(scope.type==="campaign"||scope.type==="adset")h+=`<button class="mchip on" data-s="all">${scope.type==="campaign"?"Campagne":"Ad set"}: ${esc(scopeLabel())} <span class="x">✕</span></button>`;
  if(!groups.length)h+=`<span class="mlbl" style="margin-left:6px">Tip: vink ad sets aan in de tabel en maak een groep om ze samen te volgen.</span>`;
  el.innerHTML=h;
}
function selBar(){
  return`<div class="selbar"><b>${sel.size}</b> ad set(s) geselecteerd
  <button class="mbtn prim" id="maNewGroup">+ Nieuwe groep</button>
  ${groups.length?`<select id="maAddTo"><option value="">Toevoegen aan groep…</option>${groups.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("")}</select>`:""}
  <button class="mbtn" id="maSelClear" style="margin-left:auto">Selectie wissen</button></div>`;
}
function groupsPanel(){
  return`<div class="mpanel"><div class="mph"><h3>Groepen</h3><span class="sub">gedeeld met het team · klik op een groep (chip hierboven) om alleen die ad sets te zien</span><button class="mbtn" id="maGroupsClose" style="margin-left:auto">Sluiten</button></div>
  ${groups.length?groups.map((g,i)=>`<div class="mgrp" data-id="${esc(g.id)}"><span class="dotc" style="width:10px;height:10px;border-radius:50%;background:${gColor(g,i)};display:inline-block"></span><input type="text" class="gname" value="${esc(g.name)}" style="min-width:120px;width:170px">
    <div class="gm">${g.adsets.length?g.adsets.map(x=>{const n=D.names[x.id]||{};return`<span class="gmem" title="${esc(n.cn||"")}">${esc(n.an||x.id)}<b data-rm="${esc(x.id)}" title="Uit groep halen">✕</b></span>`;}).join(""):'<span class="mute" style="font-size:12px">nog geen ad sets — vink ze aan in de tabel</span>'}</div>
    <input type="color" class="gcolor" value="${esc(gColor(g,i))}" title="Kleur" style="width:30px;height:28px;border:none;background:none;cursor:pointer">
    <button class="mbtn danger gdel">🗑</button></div>`).join(""):'<div class="mute" style="padding:6px 0;font-size:12.5px">Nog geen groepen. Selecteer ad sets in de tabel en klik “Nieuwe groep”.</div>'}
  </div>`;
}
function spark(vals){ // kleine ROAS-lijn, kleur t.o.v. doel
  const w=90,h=22,v=vals.map(x=>x==null?null:x);const nums=v.filter(x=>x!=null);if(nums.length<2)return'<span class="mute">—</span>';
  const mx=Math.max(target*1.5,...nums),mn=0;const pts=v.map((x,i)=>x==null?null:[(i/(v.length-1))*w,h-((x-mn)/(mx-mn||1))*(h-2)-1]).filter(Boolean);
  const path=pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");const ty=h-((target-mn)/(mx-mn||1))*(h-2)-1;
  const last=nums[nums.length-1];const col=last>=target?"#018A24":last>=target*0.67?"#b3590a":"#E5484D";
  return`<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><line x1="0" y1="${ty.toFixed(1)}" x2="${w}" y2="${ty.toFixed(1)}" stroke="#C9CDCA" stroke-dasharray="2,2"/><path d="${path}" fill="none" stroke="${col}" stroke-width="1.6"/></svg>`;
}
function statusDot(m){if(!m)return'<span class="st" title="status onbekend"></span>';const es=m.es||m.st||"";const cls=es==="ACTIVE"?"act":(es==="IN_PROCESS"||es==="WITH_ISSUES")?"lrn":"";const lbl={ACTIVE:"Actief",PAUSED:"Gepauzeerd",CAMPAIGN_PAUSED:"Campagne gepauzeerd",ADSET_PAUSED:"Gepauzeerd",ARCHIVED:"Gearchiveerd",DELETED:"Verwijderd",IN_PROCESS:"In behandeling",WITH_ISSUES:"Met problemen"}[es]||es;return`<span class="st ${cls}" title="${esc(lbl)}"></span>`;}
function budgetTxt(m){if(!m)return"—";if(m.db!=null)return eur(m.db)+"/d";if(m.cdb!=null)return'<span class="mute" title="Campagnebudget (CBO)">CBO '+eur(m.cdb)+"/d</span>";if(m.lb!=null)return eur(m.lb)+' <span class="mute">tot.</span>';return"—";}
function tablePanel(ids){
  // per adset aggregeren over de periode (+ vorige periode voor delta) en per dag voor sparkline
  const dlist=listDays(D.from,D.to);const byA={};
  dlist.forEach(d=>(D.days[d]||[]).forEach(r=>{if(ids&&!ids.has(r[0]))return;if(!matchQ(r[0]))return;(byA[r[0]]=byA[r[0]]||{rows:[],daily:{}}).rows.push(r);(byA[r[0]].daily[d]=byA[r[0]].daily[d]||[]).push(r);}));
  // ad sets zonder verkeer in de periode maar wel in scope/zoekterm (bv. net gepauzeerd) tonen we alleen als ze in een groep/scope zitten
  if(ids)ids.forEach(id=>{if(!byA[id]&&D.names[id]&&matchQ(id))byA[id]={rows:[],daily:{}};});
  const prevRows={};listDays(D.prevFrom,D.prevTo).forEach(d=>(D.days[d]||[]).forEach(r=>{if(byA[r[0]])(prevRows[r[0]]=prevRows[r[0]]||[]).push(r);}));
  const items=Object.keys(byA).map(id=>{const a=agg(byA[id].rows),p=agg(prevRows[id]||[]);const n=D.names[id]||{};return{id,an:n.an||id,cn:n.cn||"",c:n.c||"",a,p,m:D.adsets[id],sp:dlist.map(d=>{const x=byA[id].daily[d];if(!x)return null;const g=agg(x);return g.spend>0?(g.roas||0):null;})};});
  if(!items.length)return`<div class="mpanel"><div class="mempty">Geen ad sets met data in deze periode${q?" voor “"+esc(q)+"”":""}.</div></div>`;
  const key=k=>o=>k==="name"?o.an:(o.a[k]==null?-Infinity:o.a[k]);
  const kf=key(sortKey);items.sort((x,y)=>{const a=kf(x),b=kf(y);if(typeof a==="string")return sortDir*a.localeCompare(b);return sortDir*((a===-Infinity?-1e18:a)-(b===-Infinity?-1e18:b));});
  const camps={};items.forEach(it=>{(camps[it.c]=camps[it.c]||{c:it.c,cn:it.cn,items:[],rows:[]}).items.push(it);camps[it.c].rows.push(...byA[it.id].rows);});
  const clist=Object.values(camps).map(c=>{c.a=agg(c.rows);return c;});
  clist.sort((x,y)=>{if(sortKey==="name")return sortDir*x.cn.localeCompare(y.cn);const a=x.a[sortKey]==null?-1e18:x.a[sortKey],b=y.a[sortKey]==null?-1e18:y.a[sortKey];return sortDir*(a-b);});
  const th=(k,l,cls)=>`<th class="${cls||""} ${sortKey===k?"sorted":""}" data-k="${k}">${l}${sortKey===k?(sortDir<0?" ▼":" ▲"):""}</th>`;
  const allSel=items.length&&items.every(it=>sel.has(it.id));
  let h=`<div class="mpanel"><div class="mph"><h3>Campagnes & ad sets</h3><span class="sub">${items.length} ad sets in ${clist.length} campagnes · klik op een naam om alleen die te volgen · ▲▼ = ROAS per dag t.o.v. doel</span></div><div class="mtbl"><table>
  <thead><tr><th class="l" style="width:30px"><input type="checkbox" class="mchk" id="maSelAll" ${allSel?"checked":""} title="Alles selecteren"></th>${th("name","Naam","l")}<th>Status · budget</th>${th("spend","Besteed")}${th("value","Omzet")}${th("roas","ROAS")}${th("purch","Aankopen")}${th("cpa","Kosten/aank.")}${th("ctr","CTR")}<th>Verloop</th><th class="l">Groep</th></tr></thead><tbody>`;
  clist.forEach(c=>{
    const open=openCamp[c.c]!==false;
    h+=`<tr class="camp" data-c="${esc(c.c)}"><td></td><td class="l"><span class="car">${open?"▾":"▸"}</span><span class="nm" data-camp="${esc(c.c)}">${esc(c.cn||"(zonder campagne)")}</span> <span class="mute" style="font-weight:500">${c.items.length}</span></td><td class="mute" style="font-weight:500">${c.items.filter(i=>i.m&&i.m.es==="ACTIVE").length} actief</td><td>${eur(c.a.spend)}</td><td>${eur(c.a.value)}</td><td><span class="roas ${roasCls(c.a.roas,c.a.spend)}">${x2(c.a.roas)}</span></td><td>${num(c.a.purch)}</td><td>${eur2(c.a.cpa)}</td><td>${pct1(c.a.ctr)}</td><td></td><td></td></tr>`;
    if(!open)return;
    c.items.forEach(it=>{
      const gs=groupsOf(it.id);
      h+=`<tr class="adset ${sel.has(it.id)?"sel":""}" data-id="${esc(it.id)}"><td class="l"><input type="checkbox" class="mchk rowchk" data-id="${esc(it.id)}" ${sel.has(it.id)?"checked":""}></td>
      <td class="l">${statusDot(it.m)}<span class="nm" data-adset="${esc(it.id)}">${esc(it.an)}</span></td>
      <td>${budgetTxt(it.m)}</td><td>${eur(it.a.spend)}</td><td>${eur(it.a.value)}</td>
      <td><span class="roas ${roasCls(it.a.roas,it.a.spend)}">${x2(it.a.roas)}</span>${it.p.spend>0&&it.a.roas!=null&&it.p.roas!=null?`<div class="mute" style="font-size:10.5px">was ${x2(it.p.roas)}</div>`:""}</td>
      <td>${num(it.a.purch)}</td><td>${eur2(it.a.cpa)}</td><td>${pct1(it.a.ctr)}</td><td>${spark(it.sp)}</td>
      <td class="l">${gs.map(g=>`<span class="tag" style="background:${gColor(g,groups.indexOf(g))}">${esc(g.name)}</span>`).join("")||'<span class="mute">—</span>'}</td></tr>`;
    });
  });
  h+=`</tbody></table></div></div>`;
  return h;
}
function dayPanel(days,ids){
  const tot=agg(rowsIn(D.from,D.to,ids,true));
  let h=`<div class="mpanel"><div class="mph"><h3>Dagoverzicht · ${esc(scopeLabel())}</h3><div class="mseg" id="maDv"><button data-v="total" class="${dayView==="total"?"on":""}">Totaal per dag</button><button data-v="matrix" class="${dayView==="matrix"?"on":""}">Per ad set (matrix)</button></div><button class="mbtn" id="maCsv" style="margin-left:auto">⬇ CSV</button></div><div class="mtbl">`;
  if(dayView==="total"){
    h+=`<table><thead><tr><th class="l">Dag</th><th>Besteed</th><th>Omzet</th><th>ROAS</th><th>Aankopen</th><th>Kosten/aank.</th><th>Orderwaarde</th><th>Klikken</th><th>CTR</th><th>Impressies</th></tr></thead><tbody>`;
    [...days].reverse().forEach(({d,a})=>{h+=`<tr><td class="l">${fmtD(d)}${d===todayISO()?' <span class="mute">(vandaag, loopt)</span>':""}</td><td>${eur2(a.spend)}</td><td>${eur2(a.value)}</td><td><span class="roas ${roasCls(a.roas,a.spend)}">${x2(a.roas)}</span></td><td>${num(a.purch)}</td><td>${eur2(a.cpa)}</td><td>${eur2(a.aov)}</td><td>${num(a.clicks)}</td><td>${pct1(a.ctr)}</td><td>${num(a.impr)}</td></tr>`;});
    h+=`<tr style="font-weight:800"><td class="l">Totaal</td><td>${eur2(tot.spend)}</td><td>${eur2(tot.value)}</td><td><span class="roas ${roasCls(tot.roas,tot.spend)}">${x2(tot.roas)}</span></td><td>${num(tot.purch)}</td><td>${eur2(tot.cpa)}</td><td>${eur2(tot.aov)}</td><td>${num(tot.clicks)}</td><td>${pct1(tot.ctr)}</td><td>${num(tot.impr)}</td></tr></tbody></table>`;
  }else{
    // kolommen: ad sets in scope, op besteding; max 14 kolommen
    const spendBy={};rowsIn(D.from,D.to,ids,true).forEach(r=>{spendBy[r[0]]=(spendBy[r[0]]||0)+r[2];});
    const cols=Object.keys(spendBy).sort((a,b)=>spendBy[b]-spendBy[a]);const shown=cols.slice(0,14);
    const cell=(a)=>{const v=matrixMetric==="roas"?a.roas:matrixMetric==="value"?a.value:a.purch;const txt=matrixMetric==="roas"?x2(v):matrixMetric==="value"?eur(v):num(v);const cls=matrixMetric==="roas"?roasCls(v,a.spend):(a.spend>0?"r3":"r0");return`<span class="mc ${a.spend>0?cls:"r0"}" title="besteed ${eur2(a.spend)} · omzet ${eur2(a.value)} · ${num(a.purch)} aankopen">${a.spend>0?txt:"·"}</span>`;};
    h+=`<table class="matrix"><thead><tr><th class="l">Dag</th><th>Totaal</th>${shown.map(id=>`<th title="${esc((D.names[id]||{}).cn||"")}">${esc((D.names[id]||{}).an||id)}</th>`).join("")}</tr></thead><tbody>`;
    [...days].reverse().forEach(({d,a})=>{const rows=(D.days[d]||[]);h+=`<tr><td class="l">${fmtD(d)}</td><td>${cell(a)}</td>${shown.map(id=>"<td>"+cell(agg(rows.filter(r=>r[0]===id)))+"</td>").join("")}</tr>`;});
    h+=`<tr style="font-weight:800"><td class="l">Periode</td><td>${cell(tot)}</td>${shown.map(id=>"<td>"+cell(agg(rowsIn(D.from,D.to,new Set([id]),false)))+"</td>").join("")}</tr></tbody></table>`;
    if(cols.length>shown.length)h+=`<div class="mnote">${cols.length-shown.length} ad set(s) met minder besteding niet getoond — kies een groep of campagne, of zoek, om ze te zien.</div>`;
    h+=`<div class="mnote">Celwaarde: ${matrixMetric==="roas"?"ROAS":matrixMetric==="value"?"omzet":"aankopen"} (kies boven de grafiek). Kleur t.o.v. doel-ROAS ${x2(target)}: groen ≥ doel, oranje ≥ ⅔ doel, rood lager.</div>`;
  }
  h+=`</div></div>`;return h;
}
function drawChart(days){
  const c=document.getElementById("maChart");if(!c||!window.Chart)return;
  if(chart){chart.destroy();chart=null;}
  const lab=days.map(x=>{const d=new Date(x.d+"T00:00:00Z");return d.toLocaleDateString("nl-NL",{day:"numeric",month:"short",timeZone:"UTC"});});
  const spend=days.map(x=>Math.round(x.a.spend*100)/100);
  const line=days.map(x=>matrixMetric==="roas"?(x.a.spend>0?Math.round((x.a.roas||0)*100)/100:null):matrixMetric==="value"?Math.round(x.a.value*100)/100:x.a.purch);
  const lineLabel=matrixMetric==="roas"?"ROAS":matrixMetric==="value"?"Omzet (Meta)":"Aankopen";
  const ds=[{type:"bar",label:"Besteed",data:spend,backgroundColor:"rgba(20,27,31,.18)",borderColor:"rgba(20,27,31,.35)",borderWidth:1,yAxisID:"y",order:2},
            {type:"line",label:lineLabel,data:line,borderColor:"#01B52D",backgroundColor:"#01B52D",pointRadius:3,tension:.25,spanGaps:true,yAxisID:"y2",order:1}];
  if(matrixMetric==="roas")ds.push({type:"line",label:"Doel",data:days.map(()=>target),borderColor:"#b3590a",borderDash:[4,4],pointRadius:0,borderWidth:1,yAxisID:"y2",order:0});
  chart=new Chart(c,{type:"bar",data:{labels:lab,datasets:ds},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{position:"bottom",labels:{boxWidth:10,font:{size:11}}},tooltip:{callbacks:{label:ctx=>{const v=ctx.parsed.y;if(v==null)return null;return ctx.dataset.label+": "+(ctx.dataset.yAxisID==="y"||matrixMetric==="value"?eur2(v):matrixMetric==="roas"?x2(v):num(v));}}}},
    scales:{y:{position:"left",ticks:{callback:v=>"€ "+v,font:{size:10}},grid:{color:"#EEF0EE"}},y2:{position:"right",beginAtZero:true,ticks:{callback:v=>matrixMetric==="roas"?v+"×":matrixMetric==="value"?"€ "+v:v,font:{size:10}},grid:{drawOnChartArea:false}},x:{ticks:{font:{size:10},maxRotation:0,autoSkip:true}}}}});
}
function exportCsv(){
  const ids=scopeIds();const days=perDay(D.from,D.to,ids,true);const dec=n=>n==null||!isFinite(n)?"":String(Math.round(n*100)/100).replace(".",",");
  const lines=[["Dag","Scope","Besteed","Omzet (Meta)","ROAS","Aankopen","Kosten per aankoop","Klikken","CTR %","Impressies"].join(";")];
  days.forEach(({d,a})=>lines.push([d,scopeLabel().replace(/;/g,","),dec(a.spend),dec(a.value),dec(a.roas),a.purch,dec(a.cpa),a.clicks,dec(a.ctr),a.impr].join(";")));
  const blob=new Blob(["﻿"+lines.join("\r\n")],{type:"text/csv;charset=utf-8;"});const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=`meta_${scopeLabel().replace(/[^\w-]+/g,"_")}_${D.from}_${D.to}.csv`;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(u),1500);
}

/* ---------- groepen (API) ---------- */
async function gpost(payload){const d=await api("/api/meta",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});groups=d.groups||groups;}
function selAdsets(){return [...sel].map(id=>({act:D.actOf[id]||"",id}));}
async function newGroup(){const name=prompt("Naam van de groep:",q||"");if(name==null||!name.trim())return;try{await gpost({action:"create",name:name.trim(),adsets:selAdsets(),color:COLORS[groups.length%COLORS.length]});sel.clear();scope={type:"group",id:groups[groups.length-1].id};render();}catch(e){alert("Groep maken mislukt: "+e.message);}}
async function addToGroup(id){try{await gpost({action:"update",id,add:selAdsets()});sel.clear();scope={type:"group",id};render();}catch(e){alert("Toevoegen mislukt: "+e.message);}}

/* ---------- events ---------- */
function bind(){
  const sec=document.getElementById("sec-meta");
  document.getElementById("maAcc").addEventListener("change",e=>{acc=e.target.value;localStorage.setItem("ma_acc",acc);sel.clear();if(scope.type!=="group")scope={type:"all",id:null};loadData(false);});
  document.getElementById("maPer").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;per=+b.dataset.p;from="";to="";document.getElementById("maFrom").value="";document.getElementById("maTo").value="";localStorage.setItem("ma_per",per);[...document.querySelectorAll("#maPer button")].forEach(x=>x.classList.toggle("on",x===b));loadData(false);});
  const onRange=()=>{const f=document.getElementById("maFrom").value,t=document.getElementById("maTo").value;if(f&&t){from=f<=t?f:t;to=f<=t?t:f;[...document.querySelectorAll("#maPer button")].forEach(x=>x.classList.remove("on"));loadData(false);}};
  document.getElementById("maFrom").addEventListener("change",onRange);document.getElementById("maTo").addEventListener("change",onRange);
  document.getElementById("maQ").addEventListener("input",e=>{q=e.target.value;render();});
  document.getElementById("maTarget").addEventListener("input",e=>{target=+e.target.value||0;localStorage.setItem("ma_target",target);render();});
  document.getElementById("maGroupsBtn").addEventListener("click",()=>{showGroups=!showGroups;document.getElementById("maGroupsBtn").classList.toggle("on",showGroups);render();});
  document.getElementById("maRefresh").addEventListener("click",async()=>{const b=document.getElementById("maRefresh");b.disabled=true;b.textContent="Bezig…";try{await loadData(true);}finally{b.disabled=false;b.textContent="↻ Ververs";}});
  document.getElementById("maChips").addEventListener("click",e=>{const c=e.target.closest(".mchip");if(!c)return;scope=c.dataset.s==="group"?{type:"group",id:c.dataset.id}:{type:"all",id:null};render();});
  sec.addEventListener("click",async e=>{
    const t=e.target;
    if(t.closest("#maCm")){const b=t.closest("button");if(b){matrixMetric=b.dataset.m;render();}return;}
    if(t.closest("#maDv")){const b=t.closest("button");if(b){dayView=b.dataset.v;render();}return;}
    if(t.id==="maCsv"){exportCsv();return;}
    if(t.id==="maNewGroup"){newGroup();return;}
    if(t.id==="maSelClear"){sel.clear();render();return;}
    if(t.id==="maGroupsClose"){showGroups=false;document.getElementById("maGroupsBtn").classList.remove("on");render();return;}
    const th=t.closest("th[data-k]");if(th){const k=th.dataset.k;if(sortKey===k)sortDir=-sortDir;else{sortKey=k;sortDir=k==="name"?1:-1;}render();return;}
    const nmA=t.closest("[data-adset]");if(nmA){scope={type:"adset",id:nmA.dataset.adset};render();return;}
    const nmC=t.closest("[data-camp]");if(nmC){scope={type:"campaign",id:nmC.dataset.camp};render();return;}
    const camp=t.closest("tr.camp");if(camp){openCamp[camp.dataset.c]=openCamp[camp.dataset.c]===false;render();return;}
    const rm=t.closest("[data-rm]");if(rm){const gid=rm.closest(".mgrp").dataset.id;try{await gpost({action:"update",id:gid,remove:[rm.dataset.rm]});render();}catch(err){alert(err.message);}return;}
    const del=t.closest(".gdel");if(del){const gid=del.closest(".mgrp").dataset.id;const g=groups.find(x=>x.id===gid);if(!confirm(`Groep “${g?g.name:""}” verwijderen?`))return;try{await gpost({action:"delete",id:gid});if(scope.type==="group"&&scope.id===gid)scope={type:"all",id:null};render();}catch(err){alert(err.message);}return;}
  });
  sec.addEventListener("change",async e=>{
    const t=e.target;
    if(t.id==="maSelAll"){[...document.querySelectorAll("#sec-meta .rowchk")].forEach(c=>{if(t.checked)sel.add(c.dataset.id);else sel.delete(c.dataset.id);});render();return;}
    if(t.classList.contains("rowchk")){if(t.checked)sel.add(t.dataset.id);else sel.delete(t.dataset.id);render();return;}
    if(t.id==="maAddTo"&&t.value){addToGroup(t.value);return;}
    if(t.classList.contains("gname")){const gid=t.closest(".mgrp").dataset.id;try{await gpost({action:"update",id:gid,name:t.value});render();}catch(err){alert(err.message);}return;}
    if(t.classList.contains("gcolor")){const gid=t.closest(".mgrp").dataset.id;try{await gpost({action:"update",id:gid,color:t.value});render();}catch(err){alert(err.message);}return;}
  });
}

window.__metaLoad=async function(){
  const sec=document.getElementById("sec-meta");if(!sec)return;
  if(!inited){inited=true;
    const st=document.createElement("style");st.textContent=CSS;document.head.appendChild(st);
    sec.innerHTML=HTML;document.getElementById("maTarget").value=target;
    [...document.querySelectorAll("#maPer button")].forEach(b=>b.classList.toggle("on",+b.dataset.p===per));
    bind();
    try{await Promise.all([loadAccounts(),loadGroups()]);}catch(e){document.getElementById("maBody").innerHTML='<div class="merr">Kon Meta-accounts niet laden.<br><small>'+esc(e.message||e)+'</small></div>';return;}
    loadData(false);return;
  }
  if(D&&Date.now()-D.at>30*60*1000)loadData(false);else if(D)render();
};
})();
