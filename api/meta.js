// /api/meta — Meta Ads (Facebook/Instagram) ROAS per campagne / ad set / dag, met KV-cache en groepen.
//
// Env: META_TOKEN (systeemgebruiker-token met ads_read + read_insights), optioneel META_AD_ACCOUNTS
// ("act_1,act_2"; anders alles waar het token bij kan), optioneel META_API_VERSION (default v23.0).
//
// Views (GET, ingelogd):
//   ?view=accounts                        → { accounts:[{id,name,currency,status,tz}] }   (KV 6 uur)
//   ?view=daily&account=act_X&from=&to=   → { account, from, to, days:{date:[[adset,campaign,spend,impr,clicks,linkclicks,purchases,value],…]},
//                                             names:{adset:{an,cn,c}}, adsets:{adset:{st,es,db,lb,cst,cdb}}, fetchedAt }
//        &refresh=1 dwingt verversen van de laatste 8 dagen af (anders 30 min cache).
//   ?view=groups                          → { groups:[{id,name,color,adsets:[{act,id}]}] }
// POST (ingelogd) body {action:"create"|"update"|"delete", …} op groepen.
//
// Cache-strategie: per account per dag een KV-key meta:d:<act>:<YYYY-MM-DD>. Dagen ouder dan 8 dagen
// zijn definitief (Meta's attributievenster is max 7 dagen) en worden nooit opnieuw gehaald; de laatste
// 8 dagen worden hoogstens elke 30 min opnieuw bij Meta opgevraagd. Zo blijft het aantal Graph-calls laag.
const { getSession, readBody } = require("./_lib/util");
const { kv, getKey, setKey } = require("./_lib/store");

const VER = process.env.META_API_VERSION || "v23.0";
const G = "https://graph.facebook.com/" + VER + "/";
const FRESH_DAYS = 8, FRESH_TTL = 30 * 60 * 1000, ACC_TTL = 6 * 3600 * 1000, ADSET_TTL = 30 * 60 * 1000;
const GROUPS_KEY = "meta:groups";

function todayAms() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function listDays(from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }
function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }

async function gfetch(path, params) {
  const token = process.env.META_TOKEN;
  if (!token) throw Object.assign(new Error("META_TOKEN niet ingesteld (Vercel → Environment Variables)"), { status: 400 });
  const u = path.startsWith("http") ? new URL(path) : new URL(G + path);
  Object.entries(params || {}).forEach(([k, v]) => { if (v != null) u.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v)); });
  if (!u.searchParams.get("access_token")) u.searchParams.set("access_token", token);
  const r = await fetch(u, { headers: { Accept: "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    const msg = "Meta API: " + (e.message || ("HTTP " + r.status)) + (e.code != null ? " (code " + e.code + (e.error_subcode ? "/" + e.error_subcode : "") + ")" : "");
    const rate = [4, 17, 32, 613, 80000, 80004].includes(e.code);
    throw Object.assign(new Error(msg), { status: rate ? 503 : (e.code === 190 ? 401 : 502), meta: e });
  }
  return j;
}
// Alle pagina's van een Graph-lijst (volgt paging.next).
async function gall(path, params, maxPages) {
  let out = [], j = await gfetch(path, params), n = 0;
  out = out.concat(j.data || []);
  while (j.paging && j.paging.next && ++n < (maxPages || 40)) { j = await gfetch(j.paging.next, {}); out = out.concat(j.data || []); }
  return out;
}

/* ---------- accounts ---------- */
async function accounts(force) {
  const c = !force && (await getKey("meta:accounts"));
  if (c && c.ts && Date.now() - c.ts < ACC_TTL && Array.isArray(c.list) && c.list.length) return c.list;
  const fields = "id,account_id,name,currency,account_status,timezone_name";
  let list;
  const envAcc = (process.env.META_AD_ACCOUNTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (envAcc.length) {
    list = await Promise.all(envAcc.map(async (a) => {
      const id = a.startsWith("act_") ? a : "act_" + a;
      try { const j = await gfetch(id, { fields }); return norm(j); } catch (e) { return { id, name: id, currency: "EUR", status: 0, tz: "", error: e.message }; }
    }));
  } else {
    const rows = await gall("me/adaccounts", { fields, limit: 100 });
    list = rows.map(norm).sort((a, b) => (b.status === 1) - (a.status === 1) || a.name.localeCompare(b.name));
  }
  try { await setKey("meta:accounts", { ts: Date.now(), list }); } catch (e) {}
  return list;
  function norm(j) { return { id: j.id, name: j.name || j.id, currency: j.currency || "EUR", status: j.account_status, tz: j.timezone_name || "" }; }
}

/* ---------- ad sets (status, budget) ---------- */
async function adsetsMeta(act, force) {
  const key = "meta:adsets:" + act;
  const c = !force && (await getKey(key));
  if (c && c.ts && Date.now() - c.ts < ADSET_TTL && c.map) return c.map;
  const rows = await gall(act + "/adsets", {
    fields: "id,name,status,effective_status,daily_budget,lifetime_budget,campaign_id,campaign{name,status,effective_status,daily_budget,lifetime_budget}",
    limit: 500,
  }, 10);
  const map = {};
  rows.forEach((a) => {
    const cp = a.campaign || {};
    map[a.id] = {
      an: a.name, cn: cp.name || "", c: a.campaign_id || cp.id || "",
      st: a.status, es: a.effective_status,
      db: a.daily_budget != null ? +a.daily_budget / 100 : null, lb: a.lifetime_budget != null ? +a.lifetime_budget / 100 : null,
      cst: cp.effective_status || cp.status || "", cdb: cp.daily_budget != null ? +cp.daily_budget / 100 : null,
    };
  });
  try { await setKey(key, { ts: Date.now(), map }); } catch (e) {}
  return map;
}

/* ---------- insights per dag ---------- */
function pick(arr, types) {
  if (!Array.isArray(arr)) return 0;
  for (const t of types) { const f = arr.find((x) => x.action_type === t); if (f) return +f.value || 0; }
  return 0;
}
const PURCHASE = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase"];
// Haalt adset-niveau per dag op voor [since, until] en retourneert { date: { rows:[…], names:{…} } }.
async function fetchInsights(act, since, until) {
  const rows = await gall(act + "/insights", {
    level: "adset", time_increment: 1,
    time_range: { since, until },
    fields: "campaign_id,campaign_name,adset_id,adset_name,spend,impressions,clicks,inline_link_clicks,actions,action_values,purchase_roas",
    limit: 500,
  }, 60);
  const byDay = {};
  rows.forEach((r) => {
    const d = r.date_start;
    if (!byDay[d]) byDay[d] = { rows: [], names: {} };
    const p = pick(r.actions, PURCHASE), v = pick(r.action_values, PURCHASE);
    byDay[d].rows.push([r.adset_id, r.campaign_id, +r.spend || 0, +r.impressions || 0, +r.clicks || 0, +r.inline_link_clicks || 0, p, Math.round(v * 100) / 100]);
    byDay[d].names[r.adset_id] = { an: r.adset_name, cn: r.campaign_name, c: r.campaign_id };
  });
  return byDay;
}
async function daily(act, from, to, force) {
  const today = todayAms();
  if (to > today) to = today;
  const days = listDays(from, to);
  const keys = days.map((d) => "meta:d:" + act + ":" + d);
  const r = kv();
  let cached = new Array(days.length).fill(null);
  if (r) { try { cached = await r.mget(...keys); } catch (e) { cached = new Array(days.length).fill(null); } }
  const freshCut = addDays(today, -(FRESH_DAYS - 1));
  let fresh = null; try { fresh = await getKey("meta:fresh:" + act); } catch (e) {}
  const stale = force || !fresh || !fresh.ts || Date.now() - fresh.ts > FRESH_TTL;
  const need = days.filter((d, i) => cached[i] == null || (d >= freshCut && stale));
  const out = {}; days.forEach((d, i) => { if (cached[i]) out[d] = cached[i]; });
  if (need.length) {
    const since = need[0], until = need[need.length - 1];
    const got = await fetchInsights(act, since, until);
    const upd = {};
    listDays(since, until).forEach((d) => {
      const v = got[d] || { rows: [], names: {} };
      out[d] = v;
      // alleen opslaan wat definitief is of in het verse venster valt (vandaag ook: wordt binnen 30 min opnieuw gehaald)
      upd["meta:d:" + act + ":" + d] = v;
    });
    if (r) {
      try { await r.mset(upd); } catch (e) {}
      if (until >= freshCut) { try { await setKey("meta:fresh:" + act, { ts: Date.now() }); } catch (e) {} }
    }
  }
  // compacte respons
  const resDays = {}, names = {};
  days.forEach((d) => { const v = out[d]; if (!v) return; resDays[d] = v.rows || []; Object.assign(names, v.names || {}); });
  return { days: resDays, names, fetchedAt: Date.now(), refreshed: need.length > 0 };
}

/* ---------- groepen ---------- */
async function getGroups() { let g = null; try { g = await getKey(GROUPS_KEY); } catch (e) {} return g && Array.isArray(g.groups) ? g : { groups: [] }; }
function gid() { return "g_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6); }
function cleanAdsets(a) { return (Array.isArray(a) ? a : []).map((x) => ({ act: String((x && x.act) || ""), id: String((x && x.id) || "") })).filter((x) => x.id); }

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });
  const q = req.query || {};
  try {
    if (req.method === "POST") {
      const b = await readBody(req);
      if (!b || !b.action) return res.status(400).json({ error: "ongeldige data" });
      const store = await getGroups();
      if (b.action === "create") {
        const g = { id: gid(), name: String(b.name || "Groep").slice(0, 80), color: String(b.color || "").slice(0, 12), adsets: cleanAdsets(b.adsets), created: Date.now() };
        store.groups.push(g);
      } else if (b.action === "update") {
        const g = store.groups.find((x) => x.id === b.id);
        if (!g) return res.status(404).json({ error: "groep niet gevonden" });
        if (typeof b.name === "string") g.name = b.name.slice(0, 80);
        if (typeof b.color === "string") g.color = b.color.slice(0, 12);
        if (Array.isArray(b.adsets)) g.adsets = cleanAdsets(b.adsets);
        if (Array.isArray(b.add)) { const have = new Set(g.adsets.map((x) => x.id)); cleanAdsets(b.add).forEach((x) => { if (!have.has(x.id)) { g.adsets.push(x); have.add(x.id); } }); }
        if (Array.isArray(b.remove)) { const rm = new Set(b.remove.map(String)); g.adsets = g.adsets.filter((x) => !rm.has(x.id)); }
      } else if (b.action === "delete") {
        const n = store.groups.length; store.groups = store.groups.filter((x) => x.id !== b.id);
        if (store.groups.length === n) return res.status(404).json({ error: "groep niet gevonden" });
      } else return res.status(400).json({ error: "onbekende actie" });
      await setKey(GROUPS_KEY, store);
      return res.json({ ok: true, groups: store.groups });
    }

    const view = q.view || "accounts";
    if (view === "accounts") return res.json({ accounts: await accounts(q.refresh === "1"), version: VER });
    if (view === "groups") return res.json(await getGroups());
    if (view === "daily") {
      const act = String(q.account || "");
      if (!/^act_\d+$/.test(act)) return res.status(400).json({ error: "account ontbreekt (act_…)" });
      const today = todayAms();
      let to = isDate(q.to) ? q.to : today, from = isDate(q.from) ? q.from : addDays(to, -29);
      if (from > to) [from, to] = [to, from];
      if (listDays(from, to).length > 400) from = addDays(to, -399);
      const force = q.refresh === "1";
      const [d, adsets] = await Promise.all([daily(act, from, to, force), adsetsMeta(act, force).catch(() => ({}))]);
      return res.json({ account: act, from, to, ...d, adsets });
    }
    return res.status(400).json({ error: "onbekende view" });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Ophalen mislukt" });
  }
};
