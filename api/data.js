// Beveiligde live-data endpoint. Alleen voor ingelogde gebruikers.
// Haalt Metorik-cijfers per shop op (server-side, token blijft geheim) en cachet 30 min.
const { getSession } = require("./_lib/util");
const { allData, SHOPS } = require("./_lib/metorik");

let cache = null, cacheAt = 0;
const TTL = 30 * 60 * 1000;
const mCache = {};                       // Kerncijfers-cache per datumrange.
const MTTL = 15 * 60 * 1000;

function isDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function addD(dstr, n) { const d = new Date(dstr + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); }

// Metorik rate-limit't (429). We proberen het bij een 429 een paar keer opnieuw
// met oplopende wachttijd, zodat brede vensterqueries alsnog compleet worden.
async function metGet(token, url, params) {
  const u = new URL(url);
  Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
    if (r.status === 429) {
      const ra = parseInt(r.headers.get("retry-after") || "0", 10);
      const wait = ra > 0 ? Math.min(ra * 1000, 6000) : Math.min(500 * Math.pow(2, attempt), 5000);
      await new Promise((x) => setTimeout(x, wait));
      continue;
    }
    if (!r.ok) throw new Error("Metorik " + r.status);
    return r.json();
  }
  throw new Error("Metorik 429 (rate limit)");
}

// Winst-rapport per dag: alle bouwstenen voor de kerncijfers in één call.
// Metorik's dag-rapport geeft niets terug bij ranges > ~1 jaar, dus in vensters van 300 dagen.
async function profitDays(token, start, end) {
  const out = {};
  let ws = start;
  for (let i = 0; i < 20 && ws <= end; i++) {
    let we = addD(ws, 299); if (we > end) we = end;
    const rep = await metGet(token, "https://app.metorik.com/api/v1/store/reports/profit-by-date",
      { group_by: "day", start_date: ws, end_date: we });
    (rep.data || []).forEach((d) => {
      const k = String(d.date).slice(0, 10);
      out[k] = {
        net: d.net || 0, orders: d.orders || 0, items: d.items || 0,
        product: d.product_cogs || 0, shipping: d.shipping_cogs || 0, transaction: d.transaction_cogs || 0,
        extra: d.extra_cogs || 0, advertising: d.advertising_cost || 0, operational: d.operational_cost || 0,
      };
    });
    ws = addD(we, 1);
  }
  return out;
}

// Nieuwe klanten per dag = klanten wiens EERSTE order in de periode valt.
// Metorik's klanten-endpoint kapt brede queries stilzwijgend af (~2400 records),
// dus we knippen de periode in vensters van 30 dagen en pagineren op paginavulling
// (doorgaan zolang een pagina 100 records geeft) i.p.v. op has_more_pages.
const CUSTURL = "https://app.metorik.com/api/v1/store/customers";
function addDays(dstr, n) { const d = new Date(dstr + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); }
async function newCustInWindow(token, ws, we, byDay) {
  const filters = JSON.stringify([{ field: "first_order_date", operator: "between", value: [ws, we] }]);
  let capped = false;
  for (let page = 1; page <= 40; page++) {
    let j;
    try { j = await metGet(token, CUSTURL, { per_page: "100", page: String(page), filters }); }
    catch (e) { break; }
    const rows = j.data || [];
    rows.forEach((c) => { if (c.first_order_date) { const k = String(c.first_order_date).slice(0, 10); byDay[k] = (byDay[k] || 0) + 1; } });
    if (rows.length < 100) break;               // laatste (deels gevulde) pagina
    if (page === 40) capped = true;             // venster > 4000 nieuwe klanten: aftoppen
  }
  return capped;
}
async function newCustomersByDay(token, start, end) {
  const byDay = {}; let capped = false;
  let ws = start;
  for (let i = 0; i < 40 && ws <= end; i++) {   // max 40 vensters (~3,3 jaar)
    let we = addDays(ws, 29); if (we > end) we = end;
    if (await newCustInWindow(token, ws, we, byDay)) capped = true;
    ws = addDays(we, 1);
  }
  return { byDay, capped };
}

// Kerncijfers per shop: dagelijkse rijen met alle rauwe bouwstenen.
// De frontend bucketet naar dag/week/maand en rekent alle afgeleide metrics uit,
// zodat het "totaal" simpelweg de som van de landen is.
async function metricsView(req, res) {
  const q = req.query || {};
  const today = ymd(new Date());
  const d90 = new Date(); d90.setDate(d90.getDate() - 89);
  let start = q.start || ymd(d90), end = q.end || today;
  if (!isDate(start) || !isDate(end)) return res.status(400).json({ error: "ongeldige datum (YYYY-MM-DD)" });
  if (start > end) { const t = start; start = end; end = t; }

  const key = start + "_" + end;
  const now = Date.now();
  if (mCache[key] && now - mCache[key].at < MTTL && !q.fresh) return res.json(mCache[key].data);

  try {
    const shops = {};
    await Promise.all(SHOPS.map(async ([code, envName]) => {
      const token = process.env[envName];
      if (!token) { shops[code] = { rows: [], error: "geen token" }; return; }
      try {
        const [pd, nc] = await Promise.all([profitDays(token, start, end), newCustomersByDay(token, start, end)]);
        const dates = new Set([...Object.keys(pd), ...Object.keys(nc.byDay)]);
        const rows = [...dates].sort().map((d) => {
          const p = pd[d] || {};
          return {
            d, net: p.net || 0, orders: p.orders || 0, items: p.items || 0,
            product: p.product || 0, shipping: p.shipping || 0, transaction: p.transaction || 0,
            extra: p.extra || 0, advertising: p.advertising || 0, operational: p.operational || 0,
            newOrders: nc.byDay[d] || 0,
          };
        });
        shops[code] = { rows, newCapped: nc.capped };
      } catch (e) { shops[code] = { rows: [], error: e.message }; }
    }));
    const out = { start, end, shops, updated: new Date().toISOString() };
    mCache[key] = { at: now, data: out };
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || "Kerncijfers ophalen mislukt" });
  }
}

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });
  if (req.query && req.query.view === "metrics") return metricsView(req, res);
  const now = Date.now();
  if (cache && now - cacheAt < TTL) return res.json(cache);
  try {
    const data = await allData();
    cache = data; cacheAt = now;
    res.json(data);
  } catch (e) {
    if (cache) return res.json(cache);
    res.status(500).json({ error: e.message || "Ophalen mislukt" });
  }
};
