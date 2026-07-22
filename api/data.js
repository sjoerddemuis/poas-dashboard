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

// Nieuwe vs. terugkerende orders per dag komen uit Metorik's eigen rapport
// (orders-new-returning-customers-by-date): één call voor de hele periode,
// gecapt op 1500 periodes. Dit vervangt de trage/onbetrouwbare klanten-paginatie:
// geen 30-dagen-vensters, geen ~2400-cap en geen timeout bij brede ranges.
async function newReturningByDay(token, start, end) {
  const byDay = {};
  const rep = await metGet(token, "https://app.metorik.com/api/v1/store/reports/orders-new-returning-customers-by-date",
    { group_by: "day", start_date: start, end_date: end });
  (rep.data || []).forEach((d) => {
    const k = String(d.date).slice(0, 10);
    byDay[k] = d.new_orders || 0;               // eerste-order (= nieuwe klant) orders die dag
  });
  return { byDay, capped: false };
}

// GA4-sessies per shop (optioneel, voor conversie = orders / sessies).
// Hergebruikt de OAuth-client van Google Ads; vereist een refresh-token met de
// analytics.readonly-scope (GA_REFRESH_TOKEN) en GA_PROPERTY_ID_NL/_DE/_FR.
const GA_PROP = { NL: "GA_PROPERTY_ID_NL", DE: "GA_PROPERTY_ID_DE", FR: "GA_PROPERTY_ID_FR" };
function gaConfigured() {
  return !!(process.env.GA_REFRESH_TOKEN &&
    (process.env.GA_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID) &&
    (process.env.GA_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET));
}
let gaTok = null, gaTokAt = 0;
async function gaAccessToken() {
  if (gaTok && Date.now() - gaTokAt < 50 * 60 * 1000) return gaTok;
  const body = new URLSearchParams({
    client_id: process.env.GA_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GA_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET,
    refresh_token: process.env.GA_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error("GA OAuth " + r.status + ": " + t.slice(0, 140)); }
  const j = await r.json(); gaTok = j.access_token; gaTokAt = Date.now(); return gaTok;
}
// Sessies per dag via GA4 Data API (runReport): één call per property voor de hele range.
async function gaSessionsByDay(propId, token, start, end) {
  const id = String(propId).replace(/\D/g, "");
  const r = await fetch("https://analyticsdata.googleapis.com/v1beta/properties/" + id + ":runReport", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: start, endDate: end }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      limit: 100000,
    }),
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error("GA " + r.status + ": " + t.slice(0, 140)); }
  const j = await r.json();
  const byDay = {};
  (j.rows || []).forEach((row) => {
    const dv = (row.dimensionValues[0] || {}).value || "";     // YYYYMMDD
    if (dv.length !== 8) return;
    const k = dv.slice(0, 4) + "-" + dv.slice(4, 6) + "-" + dv.slice(6, 8);
    byDay[k] = (byDay[k] || 0) + (+((row.metricValues[0] || {}).value) || 0);
  });
  return byDay;
}

// ---- Productdata per SKU (1 shop): Metorik-verkoopcijfers per dag + GA4 product-views.
const PSTORE = "https://app.metorik.com/api/v1/store";
function shopToken(shop) {
  const row = SHOPS.find((r) => r[0] === shop);
  return row ? process.env[row[1]] : null;
}
// SKU -> product (id + statische velden zoals cogs/voorraad/prijs).
async function resolveProduct(token, sku, start, end) {
  const filters = JSON.stringify([{ field: "sku", operator: "eq", value: sku }]);
  let rows = [];
  try { const j = await metGet(token, PSTORE + "/products", { start_date: start, end_date: end, per_page: "5", filters }); rows = j.data || []; } catch (e) { rows = []; }
  if (!rows.length) {
    try { const j2 = await metGet(token, PSTORE + "/products", { start_date: start, end_date: end, per_page: "25", search: sku }); rows = (j2.data || []).filter((p) => String(p.sku) === String(sku)); } catch (e) { rows = []; }
  }
  return rows[0] || null;
}
// Verkoopcijfers per dag voor één product.
async function productByDay(token, id, start, end) {
  const out = {};
  const rep = await metGet(token, PSTORE + "/products/" + id + "/by-date", { group_by: "day", start_date: start, end_date: end });
  (rep.data || []).forEach((d) => {
    const k = String(d.date).slice(0, 10);
    out[k] = {
      grossSales: d.gross_sales || 0, netSales: d.net_sales || 0,
      grossItems: d.gross_items_sold || 0, netItems: d.net_items_sold || 0,
      itemsRefunded: d.items_refunded || 0, refunds: d.total_refunds || 0,
      orders: d.net_orders != null ? d.net_orders : (d.orders_count || 0),
    };
  });
  return out;
}
// GA4 product-views per dag (item-scoped). We filteren op itemId = SKU of product-id,
// want WooCommerce-GA4-koppelingen sturen soms de SKU en soms het product-id als item-id.
async function gaItemViewsByDay(propId, token, start, end, ids) {
  const id = String(propId).replace(/\D/g, "");
  const r = await fetch("https://analyticsdata.googleapis.com/v1beta/properties/" + id + ":runReport", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: start, endDate: end }],
      dimensions: [{ name: "date" }, { name: "itemId" }],
      metrics: [{ name: "itemsViewed" }],
      dimensionFilter: { filter: { fieldName: "itemId", inListFilter: { values: ids.map(String) } } },
      limit: 100000,
    }),
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error("GA " + r.status + ": " + t.slice(0, 140)); }
  const j = await r.json();
  const byDay = {};
  (j.rows || []).forEach((row) => {
    const dv = (row.dimensionValues[0] || {}).value || "";
    if (dv.length !== 8) return;
    const k = dv.slice(0, 4) + "-" + dv.slice(4, 6) + "-" + dv.slice(6, 8);
    byDay[k] = (byDay[k] || 0) + (+((row.metricValues[0] || {}).value) || 0);
  });
  return byDay;
}
async function productView(req, res) {
  const q = req.query || {};
  const shop = String(q.shop || "NL").toUpperCase();
  const sku = String(q.sku || "").trim();
  const today = ymd(new Date());
  const d90 = new Date(); d90.setDate(d90.getDate() - 89);
  let start = q.start || ymd(d90), end = q.end || today;
  if (!isDate(start) || !isDate(end)) return res.status(400).json({ error: "ongeldige datum (YYYY-MM-DD)" });
  if (start > end) { const t = start; start = end; end = t; }
  const token = shopToken(shop);
  if (!token) return res.status(400).json({ error: "onbekende shop" });
  if (!sku) return res.status(400).json({ error: "geen SKU opgegeven" });

  const key = "p_" + shop + "_" + sku + "_" + start + "_" + end;
  const now = Date.now();
  if (mCache[key] && now - mCache[key].at < MTTL && !q.fresh) return res.json(mCache[key].data);

  try {
    const prod = await resolveProduct(token, sku, start, end);
    if (!prod) return res.json({ shop, sku, product: null, rows: [], error: "SKU '" + sku + "' niet gevonden in " + shop });
    const [byDay, gaTok] = await Promise.all([
      productByDay(token, prod.product_id, start, end),
      gaConfigured() ? gaAccessToken().catch(() => null) : Promise.resolve(null),
    ]);
    let views = null, gaErr = null;
    const propId = process.env[GA_PROP[shop]];
    if (gaTok && propId) {
      try { views = await gaItemViewsByDay(propId, gaTok, start, end, [sku, prod.product_id]); } catch (e) { gaErr = e.message; }
    }
    const cogsUnit = prod.cogs || 0;
    const dates = new Set([...Object.keys(byDay), ...(views ? Object.keys(views) : [])]);
    const rows = [...dates].sort().map((d) => {
      const p = byDay[d] || {};
      const netItems = p.netItems || 0, netSales = p.netSales || 0;
      const cogs = cogsUnit * netItems;
      return {
        d, grossSales: p.grossSales || 0, netSales, grossItems: p.grossItems || 0, netItems,
        itemsRefunded: p.itemsRefunded || 0, refunds: p.refunds || 0, orders: p.orders || 0,
        cogs, profit: netSales - cogs, views: views ? (views[d] || 0) : 0,
      };
    });
    const out = {
      shop, sku,
      product: { id: prod.product_id, title: prod.title, image: prod.image, currentPrice: prod.current_price, stock: prod.stock_quantity, cogsUnit },
      rows, ga: { configured: gaConfigured(), hasViews: !!views, error: gaErr },
      start, end, updated: new Date().toISOString(),
    };
    mCache[key] = { at: now, data: out };
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || "Productdata ophalen mislukt" });
  }
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
    // GA4-token eenmalig ophalen (best-effort). Faalt dit, dan gewoon geen sessies/conversie.
    let gaToken = null, gaErr = null;
    if (gaConfigured()) {
      try { gaToken = await gaAccessToken(); } catch (e) { gaErr = e.message; }
    }
    const shops = {};
    await Promise.all(SHOPS.map(async ([code, envName]) => {
      const token = process.env[envName];
      if (!token) { shops[code] = { rows: [], error: "geen token" }; return; }
      try {
        const propId = process.env[GA_PROP[code]];
        const [pd, nc, ga] = await Promise.all([
          profitDays(token, start, end),
          newReturningByDay(token, start, end),
          (gaToken && propId) ? gaSessionsByDay(propId, gaToken, start, end).catch(() => null) : Promise.resolve(null),
        ]);
        const dates = new Set([...Object.keys(pd), ...Object.keys(nc.byDay), ...(ga ? Object.keys(ga) : [])]);
        const rows = [...dates].sort().map((d) => {
          const p = pd[d] || {};
          return {
            d, net: p.net || 0, orders: p.orders || 0, items: p.items || 0,
            product: p.product || 0, shipping: p.shipping || 0, transaction: p.transaction || 0,
            extra: p.extra || 0, advertising: p.advertising || 0, operational: p.operational || 0,
            newOrders: nc.byDay[d] || 0,
            sessions: ga ? (ga[d] || 0) : 0,
          };
        });
        shops[code] = { rows, newCapped: nc.capped, hasSessions: !!ga };
      } catch (e) { shops[code] = { rows: [], error: e.message }; }
    }));
    const out = { start, end, shops, ga: { configured: gaConfigured(), error: gaErr }, updated: new Date().toISOString() };
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
  if (req.query && req.query.view === "product") return productView(req, res);
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
