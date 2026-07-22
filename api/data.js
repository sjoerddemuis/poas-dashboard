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
