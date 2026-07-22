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

async function metGet(token, url, params) {
  const u = new URL(url);
  Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  if (!r.ok) throw new Error("Metorik " + r.status);
  return r.json();
}

// Winst-rapport per dag: alle bouwstenen voor de kerncijfers in één call.
async function profitDays(token, start, end) {
  const rep = await metGet(token, "https://app.metorik.com/api/v1/store/reports/profit-by-date",
    { group_by: "day", start_date: start, end_date: end });
  const out = {};
  (rep.data || []).forEach((d) => {
    const k = String(d.date).slice(0, 10);
    out[k] = {
      net: d.net || 0, orders: d.orders || 0, items: d.items || 0,
      product: d.product_cogs || 0, shipping: d.shipping_cogs || 0, transaction: d.transaction_cogs || 0,
      extra: d.extra_cogs || 0, advertising: d.advertising_cost || 0, operational: d.operational_cost || 0,
    };
  });
  return out;
}

// Nieuwe klanten per dag = klanten wiens EERSTE order in de periode valt.
// Metorik geeft geen pagination.total, dus we pagineren en bucketen op first_order_date.
// Cap op 60 pagina's (6000 nieuwe klanten/shop) om binnen de time-out te blijven.
async function newCustomersByDay(token, start, end) {
  const url = "https://app.metorik.com/api/v1/store/customers";
  const filters = JSON.stringify([{ field: "first_order_date", operator: "between", value: [start, end] }]);
  const byDay = {}; let capped = false, page = 1;
  for (; page <= 60; page++) {
    let j;
    try { j = await metGet(token, url, { per_page: "100", page: String(page), filters }); }
    catch (e) { break; }
    (j.data || []).forEach((c) => {
      if (!c.first_order_date) return;
      const k = String(c.first_order_date).slice(0, 10);
      byDay[k] = (byDay[k] || 0) + 1;
    });
    if (!(j.pagination && j.pagination.has_more_pages)) break;
    if (page === 60) capped = true;
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
// Beveiligde live-data endpoint. Alleen voor ingelogde gebruikers.
// Haalt Metorik-cijfers per shop op (server-side, token blijft geheim) en cachet 30 min.
const { getSession } = require("./_lib/util");
const { allData, SHOPS } = require("./_lib/metorik");

let cache = null, cacheAt = 0;
const TTL = 30 * 60 * 1000;

// TIJDELIJK: veld-probe om te zien welke velden Metorik per rapport teruggeeft.
// Alleen admin. Wordt na het bouwen van Kerncijfers weer verwijderd.
async function probeView(req, res) {
  const token = process.env.METORIK_TOKEN_NL;
  if (!token) return res.status(400).json({ error: "geen NL-token" });
  const start = "2026-06-01", end = "2026-06-30";
  async function call(url, params) {
    const u = new URL(url);
    Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
    const txt = await r.text();
    if (!r.ok) return { status: r.status, body: txt.slice(0, 100) };
    let j; try { j = JSON.parse(txt); } catch (e) { return { status: r.status, parse: "geen json" }; }
    return { status: r.status, j };
  }
  const F = (arr) => JSON.stringify(arr);
  const CU = "https://app.metorik.com/api/v1/store/customers";
  async function custTotal(params) {
    const c = await call(CU, Object.assign({ per_page: "1" }, params));
    if (!c.j) return c;
    const p = c.j.pagination || {};
    const rec = (c.j.data || [])[0] || {};
    return { status: c.status, total: p.total != null ? p.total : (p.has_more_pages ? "onbekend" : (c.j.data || []).length), eersteDatum: rec.first_order_date };
  }
  const out = {};
  // Baseline: alle klanten (geen filter).
  out.alleKlanten = await custTotal({});
  // Nieuwe klanten in juni = first_order_date in juni. Test operators.
  out["filter between"] = await custTotal({ filters: F([{ field: "first_order_date", operator: "between", value: [start, end] }]) });
  out["filter gte+lte"] = await custTotal({ filters: F([{ field: "first_order_date", operator: "gte", value: start }, { field: "first_order_date", operator: "lte", value: end }]) });
  out["filter after+before"] = await custTotal({ filters: F([{ field: "first_order_date", operator: "after", value: start }, { field: "first_order_date", operator: "before", value: end }]) });
  out["param date-range"] = await custTotal({ start_date: start, end_date: end });
  res.json(out);
}

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });
  if (req.query && req.query.view === "probe") {
    if (s.role !== "admin") return res.status(403).json({ error: "Alleen admin." });
    return probeView(req, res);
  }
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
