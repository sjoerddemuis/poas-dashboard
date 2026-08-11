// Beveiligde live-data endpoint. Alleen voor ingelogde gebruikers.
// Haalt Metorik-cijfers per shop op (server-side, token blijft geheim) en cachet 30 min.
const { getSession, readBody } = require("./_lib/util");
const { allData, SHOPS } = require("./_lib/metorik");
const { getKey, setKey, kv } = require("./_lib/store");

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
  const skuRaw = String(q.sku || "").trim();
  // Meerdere SKU's mogen met komma's gescheiden worden; dan combineren we de data.
  const skus = [...new Set(skuRaw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 30);
  const today = ymd(new Date());
  const d90 = new Date(); d90.setDate(d90.getDate() - 89);
  let start = q.start || ymd(d90), end = q.end || today;
  if (!isDate(start) || !isDate(end)) return res.status(400).json({ error: "ongeldige datum (YYYY-MM-DD)" });
  if (start > end) { const t = start; start = end; end = t; }
  const token = shopToken(shop);
  if (!token) return res.status(400).json({ error: "onbekende shop" });
  if (!skus.length) return res.status(400).json({ error: "geen SKU opgegeven" });

  // Diagnose: toon de top-bekeken items met hun ECHTE GA4 item-id + item-naam,
  // zodat we kunnen zien onder welk id GA4 deze producten registreert.
  if (q.diag) {
    const gaTok = gaConfigured() ? await gaAccessToken().catch(() => null) : null;
    const propId = process.env[GA_PROP[shop]];
    if (!gaTok || !propId) return res.json({ diag: true, note: "geen GA-token of property-id", configured: gaConfigured(), hasPropId: !!propId });
    const id = String(propId).replace(/\D/g, "");
    const r = await fetch("https://analyticsdata.googleapis.com/v1beta/properties/" + id + ":runReport", {
      method: "POST", headers: { Authorization: "Bearer " + gaTok, "Content-Type": "application/json" },
      body: JSON.stringify({ dateRanges: [{ startDate: start, endDate: end }], dimensions: [{ name: "itemId" }, { name: "itemName" }], metrics: [{ name: "itemsViewed" }], orderBys: [{ metric: { metricName: "itemsViewed" }, desc: true }], limit: 30 }),
    });
    const j = await r.json();
    return res.json({ diag: true, ok: r.ok, propId: id, range: [start, end], rows: (j.rows || []).map((row) => ({ itemId: (row.dimensionValues[0] || {}).value, itemName: (row.dimensionValues[1] || {}).value, views: (row.metricValues[0] || {}).value })), error: r.ok ? null : j });
  }

  const key = "p_" + shop + "_" + skus.join("+") + "_" + start + "_" + end;
  const now = Date.now();
  if (mCache[key] && now - mCache[key].at < MTTL && !q.fresh) return res.json(mCache[key].data);

  try {
    const resolved = await Promise.all(skus.map((s) => resolveProduct(token, s, start, end).then((p) => ({ sku: s, p })).catch(() => ({ sku: s, p: null }))));
    const found = resolved.filter((r) => r.p);
    const missing = resolved.filter((r) => !r.p).map((r) => r.sku);
    if (!found.length) return res.json({ shop, sku: skuRaw, product: null, rows: [], error: "Geen van de SKU's gevonden in " + shop + ": " + skus.join(", ") });

    const gaTok = gaConfigured() ? await gaAccessToken().catch(() => null) : null;
    const byDays = await Promise.all(found.map((r) => productByDay(token, r.p.product_id, start, end)));
    let views = null, gaErr = null;
    const propId = process.env[GA_PROP[shop]];
    if (gaTok && propId) {
      const ids = []; found.forEach((r) => { ids.push(r.sku); ids.push(r.p.product_id); });
      try { views = await gaItemViewsByDay(propId, gaTok, start, end, ids); } catch (e) { gaErr = e.message; }
    }

    const dateSet = new Set(views ? Object.keys(views) : []);
    byDays.forEach((bd) => Object.keys(bd).forEach((d) => dateSet.add(d)));
    const rows = [...dateSet].sort().map((d) => {
      let grossSales = 0, netSales = 0, grossItems = 0, netItems = 0, itemsRefunded = 0, refunds = 0, orders = 0, cogs = 0;
      found.forEach((r, i) => {
        const p = byDays[i][d] || {};
        grossSales += p.grossSales || 0; netSales += p.netSales || 0; grossItems += p.grossItems || 0;
        netItems += p.netItems || 0; itemsRefunded += p.itemsRefunded || 0; refunds += p.refunds || 0; orders += p.orders || 0;
        cogs += (r.p.cogs || 0) * (p.netItems || 0);   // COGS per product × verkochte stuks
      });
      return { d, grossSales, netSales, grossItems, netItems, itemsRefunded, refunds, orders, cogs, profit: netSales - cogs, views: views ? (views[d] || 0) : 0 };
    });

    const combined = found.length > 1;
    let product;
    if (combined) {
      const stock = found.reduce((s, r) => s + (r.p.stock_quantity != null ? r.p.stock_quantity : 0), 0);
      product = { id: null, combined: true, count: found.length, skus: found.map((r) => r.sku), titles: found.map((r) => r.p.title),
        title: found.length + " producten samen", image: null, currentPrice: null, stock, cogsUnit: null };
    } else {
      const r0 = found[0];
      product = { id: r0.p.product_id, title: r0.p.title, image: r0.p.image, currentPrice: r0.p.current_price, stock: r0.p.stock_quantity, cogsUnit: r0.p.cogs || 0 };
    }
    const out = {
      shop, sku: skuRaw, skus: found.map((r) => r.sku), missing, product,
      rows, ga: { configured: gaConfigured(), hasViews: !!views, error: gaErr },
      start, end, updated: new Date().toISOString(),
    };
    mCache[key] = { at: now, data: out };
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || "Productdata ophalen mislukt" });
  }
}

// ---- Marktaandeel: reviewgroei-tracker per concurrent uit de Google Sheet.
// Per maand het daggemiddelde (nieuwe reviews/dag) per shop; marktaandeel = aandeel
// in de som van alle shops. Live via gviz-JSON; snapshot als de sheet niet deelbaar is.
const MARKET_SHEET = process.env.MARKET_SHEET_ID || "1uSNiUshJEtQAlLuEozzCIsmsiio4LOUu6AB5Bzls6Us";
const MARKET_SNAPSHOT = {
  source: "snapshot",
  periods: ["oktober", "november", "december", "januari", "februari", "maart", "april & mei", "juni"],
  companies: [
    { name: "ongediertewinkel.nl", us: true, avg: [195.1, 187.3, 164, 144.7, 126.6, 134.2, 152.9, 150.6] },
    { name: "allestegenongedierte.nl", us: false, avg: [186, 219.8, 183.3, 168.1, 188.1, 210.7, 270.4, 260.5] },
    { name: "ongedierteproducten.nl", us: false, avg: [94.3, 80.4, 75.1, 70.1, 62.2, 62.2, 68.5, 81.8] },
    { name: "budgetongediertebestrijden.nl", us: false, avg: [64.7, 75.5, 60.5, 50.7, 60.2, 68.5, 86.1, 93.5] },
    { name: "pestor.nl", us: false, avg: [13.4, 12.7, 9.8, 10.6, 14.1, 11.4, 20.3, 25.3] },
    { name: "verminbuster.nl", us: false, avg: [2.2, 3.1, 2.8, 2.7, 2.1, 2.6, 4.4, 0] },
  ],
};
function cleanName(s) {
  s = String(s || "").trim();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return s;
}
async function fetchMarketSheet() {
  const url = "https://docs.google.com/spreadsheets/d/" + MARKET_SHEET + "/gviz/tq?tqx=out:json&headers=1";
  const r = await fetch(url);
  if (!r.ok) throw new Error("sheet " + r.status);
  const t = await r.text();
  const m = t.match(/setResponse\(([\s\S]*?)\);?\s*$/);
  if (!m) throw new Error("geen gviz-json (sheet niet deelbaar?)");
  const j = JSON.parse(m[1]);
  if (!j.table || !j.table.cols) throw new Error("sheet niet leesbaar");
  const cols = j.table.cols;
  const avgIdx = []; const periods = [];
  cols.forEach((c, i) => {
    const lab = String((c && c.label) || "");
    if (/gemiddelde|dagelijks/i.test(lab)) {
      avgIdx.push(i);
      periods.push(lab.replace(/gemiddelde\s*/i, "").replace(/dagelijks\s*/i, "").trim());
    }
  });
  if (avgIdx.length < 2) throw new Error("geen gemiddelde-kolommen gevonden");
  const num = (c) => (c && c.v != null && typeof c.v === "number") ? c.v : (c && c.v != null && !isNaN(parseFloat(c.v)) ? parseFloat(c.v) : null);
  const companies = [];
  (j.table.rows || []).forEach((row) => {
    const c = row.c || [];
    const nm = c[0] && c[0].v;
    if (typeof nm !== "string" || !nm.trim()) return;
    if (/totaal|gemiddeld/i.test(nm)) return;
    const avg = avgIdx.map((i) => { const v = num(c[i]); return (v == null || v < 0) ? null : Math.round(v * 10) / 10; });
    if (avg.every((x) => x == null)) return;
    const clean = cleanName(nm);
    companies.push({ name: clean, us: /ongediertewinkel/i.test(clean), avg });
  });
  if (companies.length < 2) throw new Error("te weinig bedrijven uit sheet");
  return { source: "sheet", periods, companies };
}
// ---- Metingen-sheet (bron van waarheid): 1 rij per datum, kolommen = concurrenten,
// cellen = het ordernummer op die datum. De app leest 'm en rekent orders/dag + marktaandeel uit.
function parseSheetDate(s) {
  if (s == null) return null;
  s = String(s).trim(); if (!s) return null;
  let m = s.match(/^Date\((\d+),(\d+),(\d+)/);
  if (m) return m[1] + "-" + String(+m[2] + 1).padStart(2, "0") + "-" + String(+m[3]).padStart(2, "0");
  m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  const d = new Date(s); if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}
async function fetchOrderSheet() {
  const url = "https://docs.google.com/spreadsheets/d/" + MARKET_SHEET + "/gviz/tq?tqx=out:json&headers=1";
  const r = await fetch(url);
  if (!r.ok) throw new Error("sheet " + r.status);
  const t = await r.text();
  const m = t.match(/setResponse\(([\s\S]*?)\);?\s*$/);
  if (!m) throw new Error("geen gviz-json (sheet niet gedeeld?)");
  const j = JSON.parse(m[1]);
  if (!j.table || !j.table.cols) throw new Error("sheet niet leesbaar");
  const compCols = [];
  j.table.cols.forEach((c, i) => { if (i === 0) return; const nm = cleanName((c && c.label) || ""); if (nm) compCols.push({ idx: i, name: nm }); });
  if (compCols.length < 1) throw new Error("geen concurrent-kolommen in sheet");
  const competitors = [...new Set(compCols.map((c) => c.name))];
  const num = (c) => { if (!c || c.v == null) return null; if (typeof c.v === "number") return c.v; const n = parseFloat(String(c.v).replace(/[^\d.-]/g, "")); return isNaN(n) ? null : n; };
  const entries = [];
  (j.table.rows || []).forEach((row) => {
    const c = row.c || [];
    const date = parseSheetDate(c[0] && (c[0].f != null ? c[0].f : c[0].v));
    if (!date) return;
    const vals = {};
    compCols.forEach((cc) => { const v = num(c[cc.idx]); if (v != null) vals[cc.name] = v; });
    if (Object.keys(vals).length) entries.push({ date, vals });
  });
  entries.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!entries.length) throw new Error("geen datumrijen in sheet");
  return { competitors, entries };
}
// ---- Handmatige metingen in KV (fallback als de sheet (nog) niet leesbaar is).
// Per datum een momentopname (ordernummer per concurrent); dagen-ertussen + daggemiddelde.
const MKEY = "market:measurements";
const DEF_COMPETITORS = ["ongediertewinkel.nl", "allestegenongedierte.nl", "ongedierteproducten.nl", "budgetongediertebestrijden.nl", "pestor.nl", "verminbuster.nl"];
async function loadMeasurements() {
  let s = null;
  try { s = await getKey(MKEY); } catch (e) {}
  if (!s || typeof s !== "object") s = {};
  const competitors = Array.isArray(s.competitors) && s.competitors.length ? s.competitors : DEF_COMPETITORS.slice();
  const entries = Array.isArray(s.entries) ? s.entries : [];
  return { competitors, entries, updated: s.updated || "" };
}
function pLabel(dstr) { const p = String(dstr).split("-"); return p[2] + "-" + p[1]; }   // dd-mm
function daysBetween(a, b) { return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000); }
function computeFromEntries(st) {
  const comps = st.competitors;
  const entries = st.entries.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (entries.length < 2) return null;
  const periods = [], avgByComp = {};
  comps.forEach((c) => (avgByComp[c] = []));
  for (let i = 1; i < entries.length; i++) {
    const d = daysBetween(entries[i - 1].date, entries[i].date);
    periods.push(pLabel(entries[i - 1].date) + "–" + pLabel(entries[i].date));
    comps.forEach((c) => {
      const v0 = +(entries[i - 1].vals && entries[i - 1].vals[c]);
      const v1 = +(entries[i].vals && entries[i].vals[c]);
      const ok = isFinite(v0) && isFinite(v1) && d > 0;
      avgByComp[c].push(ok ? Math.round(((v1 - v0) / d) * 10) / 10 : null);
    });
  }
  const companies = comps.map((c) => ({ name: cleanName(c), us: /ongediertewinkel/i.test(c), avg: avgByComp[c] }));
  return { source: "manual", periods, companies };
}
async function marketView(req, res) {
  const now = Date.now();
  if (mCache.market && now - mCache.market.at < MTTL && !(req.query && req.query.fresh)) return res.json(mCache.market.data);
  let out = null, sheetErr = null, sheetData = null;
  try { sheetData = await fetchOrderSheet(); }               // de Google Sheet is de bron van waarheid
  catch (e) { sheetErr = e.message || String(e); }
  if (sheetData) {
    out = computeFromEntries(sheetData) || { source: "sheet", periods: [], companies: [] };
    out.source = "sheet";
    out.competitors = sheetData.competitors;
    out.entries = sheetData.entries;
    out.hasData = sheetData.entries.length >= 2;
    if (sheetData.entries.length < 2) out.note = "Nog maar één meting in de sheet — voeg een tweede datumrij toe om orders/dag en marktaandeel te zien.";
  } else {
    const st = await loadMeasurements();                     // terugval: handmatige metingen in KV
    out = computeFromEntries(st);
    if (out) { out.competitors = st.competitors; out.entries = st.entries; out.hasData = st.entries.length >= 2; }
    else {
      out = Object.assign({}, MARKET_SNAPSHOT);
      out.competitors = st.competitors; out.entries = st.entries; out.hasData = false;
      out.note = "Sheet niet gelezen (" + sheetErr + "). Deel de sheet als 'iedereen met de link: lezer' zodat de app 'm kan uitlezen.";
    }
  }
  out.sheetUrl = "https://docs.google.com/spreadsheets/d/" + MARKET_SHEET + "/edit";
  out.updated = new Date().toISOString();
  mCache.market = { at: now, data: out };
  res.json(out);
}
async function marketWrite(req, res, s) {
  if (!s || s.role !== "admin") return res.status(403).json({ error: "alleen admin mag metingen wijzigen" });
  let body;
  try { body = await readBody(req); } catch (e) { return res.status(400).json({ error: "ongeldige body" }); }
  const action = body && body.action;
  const st = await loadMeasurements();
  if (action === "save") {
    const date = String(body.date || "").slice(0, 10);
    if (!isDate(date)) return res.status(400).json({ error: "ongeldige datum (YYYY-MM-DD)" });
    const vals = {};
    st.competitors.forEach((c) => { const v = body.vals && body.vals[c]; if (v !== "" && v != null && isFinite(+v)) vals[c] = +v; });
    const idx = st.entries.findIndex((e) => e.date === date);
    if (idx >= 0) st.entries[idx] = { date, vals }; else st.entries.push({ date, vals });
  } else if (action === "delete") {
    const date = String(body.date || "").slice(0, 10);
    st.entries = st.entries.filter((e) => e.date !== date);
  } else if (action === "competitors") {
    const list = Array.isArray(body.competitors) ? body.competitors.map((x) => cleanName(String(x))).filter(Boolean).slice(0, 20) : null;
    if (list && list.length) st.competitors = [...new Set(list)];
  } else return res.status(400).json({ error: "onbekende actie" });
  st.entries.sort((a, b) => (a.date < b.date ? -1 : 1));
  const updated = new Date().toISOString();
  await setKey(MKEY, { competitors: st.competitors, entries: st.entries, updated });
  mCache.market = null;
  st.updated = updated;
  let out = computeFromEntries(st) || { source: "manual-empty", periods: [], companies: [] };
  out.competitors = st.competitors; out.entries = st.entries; out.hasManual = st.entries.length >= 2; out.updated = updated;
  out.sheetUrl = "https://docs.google.com/spreadsheets/d/" + MARKET_SHEET + "/edit";
  res.json(out);
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

// ---- Prognose: 7-daags daggemiddelde per shop doortrekken naar de lopende maand,
// plus year-to-date jaarcijfers. Metriek per dag uit profit-by-date (omzet/orders/winst).
const MND = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
async function forecastView(req, res) {
  const nowMs = Date.now();
  if (mCache.forecast && nowMs - mCache.forecast.at < MTTL && !(req.query && req.query.fresh)) return res.json(mCache.forecast.data);
  const d = new Date();
  const year = d.getFullYear(), m0 = d.getMonth();
  const today = ymd(d);
  const yearStart = year + "-01-01";
  const monthStart = ymd(new Date(year, m0, 1));
  const daysInMonth = new Date(year, m0 + 1, 0).getDate();
  const dayOfMonth = d.getDate();
  const asof = addD(today, -1);                                  // laatste afgeronde dag (vandaag telt niet mee)
  const completedDays = dayOfMonth - 1;                          // afgeronde dagen deze maand
  const remaining = Math.max(0, daysInMonth - completedDays);    // nog te gaan (incl. vandaag als run-rate-dag)
  const last7Start = addD(today, -7), last7End = addD(today, -1); // 7 complete dagen (excl. vandaag)
  const winstOf = (v) => (v.net || 0) - (v.product || 0) - (v.shipping || 0) - (v.transaction || 0) - (v.extra || 0) - (v.advertising || 0) - (v.operational || 0);
  try {
    const shops = {};
    await Promise.all(SHOPS.map(async ([code, envName]) => {
      const token = process.env[envName];
      if (!token) { shops[code] = { error: "geen token" }; return; }
      try {
        const pd = await profitDays(token, yearStart, today);
        const agg = (from, to) => {
          let omzet = 0, orders = 0, winst = 0;
          Object.entries(pd).forEach(([dt, v]) => {
            if (dt >= from && dt <= to) { omzet += v.net || 0; orders += v.orders || 0; winst += winstOf(v); }
          });
          return { omzet, orders, winst };
        };
        const ytd = agg(yearStart, asof);
        const mtd = agg(monthStart, asof);
        const a7 = agg(last7Start, last7End);
        const avg7 = { omzet: a7.omzet / 7, orders: a7.orders / 7, winst: a7.winst / 7 };
        const proj = {
          omzet: mtd.omzet + avg7.omzet * remaining,
          orders: mtd.orders + avg7.orders * remaining,
          winst: mtd.winst + avg7.winst * remaining,
        };
        shops[code] = { ytd, mtd, avg7, proj };
      } catch (e) { shops[code] = { error: e.message }; }
    }));
    const sumKey = (key) => {
      const t = { omzet: 0, orders: 0, winst: 0 };
      Object.values(shops).forEach((s) => { if (s && s[key]) { t.omzet += s[key].omzet; t.orders += s[key].orders; t.winst += s[key].winst; } });
      return t;
    };
    const total = { ytd: sumKey("ytd"), mtd: sumKey("mtd"), avg7: sumKey("avg7"), proj: sumKey("proj") };
    const out = {
      today, asof, year, monthLabel: MND[m0] + " " + year, daysInMonth, dayOfMonth, completedDays, daysRemaining: remaining,
      last7: { start: last7Start, end: last7End },
      shops, total, landen: SHOPS.map(([code, , label]) => ({ code, label })),
      updated: new Date().toISOString(),
    };
    mCache.forecast = { at: nowMs, data: out };
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || "Prognose ophalen mislukt" });
  }
}

// Diagnose: welke locatievelden levert Metorik per order? (tijdelijk, om de heatmap te ontwerpen)
async function geodiagView(req, res) {
  const q = req.query || {};
  const shop = String(q.shop || "NL").toUpperCase();
  const token = shopToken(shop);
  if (!token) return res.status(400).json({ error: "onbekende shop" });
  function pickGeo(o) {
    const out = {};
    (function walk(obj, pre) {
      if (!obj || typeof obj !== "object") return;
      for (const k in obj) {
        const v = obj[k];
        if (v && typeof v === "object" && !Array.isArray(v)) walk(v, pre + k + ".");
        else if (/city|post|zip|country|lat|lng|lon|geo|state|region|plaats|address|straat/i.test(k)) out[pre + k] = v;
      }
    })(o, "");
    return out;
  }
  try {
    const j = await metGet(token, PSTORE + "/orders", { per_page: "5" });
    const rows = j.data || j.orders || [];
    const sample = rows.slice(0, 3).map((o) => ({ id: o.id, keys: Object.keys(o), geo: pickGeo(o) }));
    res.json({ shop, count: rows.length, topKeys: rows[0] ? Object.keys(rows[0]) : [], sample });
  } catch (e) {
    res.status(500).json({ error: e.message || "geodiag mislukt" });
  }
}

// ---- Order-heatmap: orders in een periode aggregeren per postcode + land (met count + omzet).
// De frontend geocodeert de postcodes client-side (zippopotam) en tekent de kaart.
function normPc(cc, pc) {
  pc = String(pc || "").toUpperCase().replace(/\s+/g, "");
  if (!pc) return null;
  if (cc === "NL") { const m = pc.match(/^(\d{4})/); return m ? m[1] : null; }        // PC4
  const m = pc.match(/^(\d{4,5})/); return m ? m[1] : null;                           // DE/FR: PLZ / code postal
}
// KV-opslag: per shop per dag een compact aggregaat, zodat de kaart uit de database
// leest i.p.v. elke keer Metorik te belasten. Wordt eenmalig gevuld (backfill) en
// daarna elke nacht bijgewerkt (georefresh mode=daily).
function gdKey(shop, d) { return "gd:" + shop + ":" + d; }   // dag-aggregaat (postcode-totalen)
function geKey(shop, d) { return "ge:" + shop + ":" + d; }   // dag-tijdlijn (per order een tijdstip+locatie)
function gmKey(shop) { return "gm:" + shop; }                 // backfill-meta
function normDate(s) { const m = String(s || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0") : null; }
const GEO_SHOPS = ["NL", "DE", "FR"];
const GEO_FLOOR = "2015-01-01";
const CRON_KEY = process.env.CRON_KEY || "owgeo";

// Haal één datumvenster [from..to] uit Metorik en schrijf per dag een aggregaat naar KV.
async function geoAggregateWindow(token, shop, from, to) {
  const days = {};   // "yyyy-mm-dd" -> { o, e, p:{ "cc|pc":[count, omzet, plaats] } }
  const dateOf = (o) => String(o.order_created_at || o.order_paid_at || o.created_at || "").slice(0, 10);
  let seen = 0;
  for (let page = 1; page <= 200; page++) {
    let j;
    try { j = await metGet(token, PSTORE + "/orders", { per_page: "100", page: String(page), start_date: from, end_date: to }); }
    catch (e) { break; }
    const rows = j.data || j.orders || [];
    if (!rows.length) break;
    rows.forEach((o) => {
      const tstr = String(o.order_created_at || o.order_paid_at || o.created_at || "");
      const dt = tstr.slice(0, 10); if (!dt || dt < from || dt > to) return;
      seen++;
      const cc = String(o.shipping_address_country || o.billing_address_country || "").toUpperCase();
      const pc = normPc(cc, o.shipping_address_postcode || o.billing_address_postcode);
      const plaats = o.shipping_address_city || o.billing_address_city || "";
      const rev = +(o.net != null ? o.net : o.total) || 0;
      const tm = tstr.slice(11, 16).match(/(\d{2}):(\d{2})/);
      const minute = tm ? (+tm[1]) * 60 + (+tm[2]) : 0;
      const day = days[dt] || (days[dt] = { o: 0, e: 0, p: {}, ev: [] });
      day.o++; day.e += rev;
      if (!cc || !pc) return;
      const k = cc + "|" + pc;
      const a = day.p[k] || (day.p[k] = [0, 0, plaats]);
      a[0]++; a[1] += rev; if (!a[2] && plaats) a[2] = plaats;
      day.ev.push([minute, cc, pc, Math.round(rev)]);
    });
    if (rows.length < 100) break;
  }
  const written = [];
  for (const d of Object.keys(days)) {
    const day = days[d];
    day.e = Math.round(day.e);
    Object.values(day.p).forEach((a) => { a[1] = Math.round(a[1]); });
    const ev = (day.ev || []).sort((a, b) => a[0] - b[0]);
    try { await setKey(gdKey(shop, d), { o: day.o, e: day.e, p: day.p }); await setKey(geKey(shop, d), ev); written.push(d); } catch (e) {}
  }
  return { wroteDays: written.length, orders: seen };
}

// Refresh/backfill-endpoint (aangeroepen door cron, of handmatig door een admin).
// mode=daily  : werk de laatste dagen bij (nachtelijke cron).
// mode=backfill: pak per call één venster verder terug in de tijd, tot de historie compleet is.
async function geoRefreshView(req, res) {
  const q = req.query || {};
  const s = getSession(req);
  const authed = (s && s.role === "admin") || q.key === CRON_KEY || !!req.headers["x-vercel-cron"];
  if (!authed) return res.status(401).json({ error: "unauthorized" });
  const mode = q.mode || "daily";
  const today = ymd(new Date());
  const shops = q.shop ? [String(q.shop).toUpperCase()] : GEO_SHOPS;

  if (mode === "daily") {
    const out = {};
    for (const shop of shops) {
      const token = shopToken(shop); if (!token) continue;
      try { out[shop] = await geoAggregateWindow(token, shop, addD(today, -3), today); } catch (e) { out[shop] = { error: e.message }; }
      try { const m = (await getKey(gmKey(shop))) || {}; m.lastDaily = today; await setKey(gmKey(shop), m); } catch (e) {}
    }
    return res.json({ mode, updated: today, out });
  }

  // backfill: één shop, één klein venster per call (blijft ruim onder de 60s-limiet).
  const WIN = Math.max(2, Math.min(20, parseInt(q.win || "6", 10)));
  const metas = {};
  for (const shop of shops) { if (!shopToken(shop)) continue; let m = null; try { m = await getKey(gmKey(shop)); } catch (e) {} m = m || { cursor: today }; if (!m.cursor) m.cursor = today; metas[shop] = m; }
  let pick = null, meta = null;
  for (const shop of Object.keys(metas)) { const m = metas[shop]; if (m.done) continue; if (!pick || m.cursor > meta.cursor) { pick = shop; meta = m; } }
  if (!pick) {
    // Historie compleet → houd de recentste dagen actueel (nieuwe orders van vandaag/gisteren).
    for (const shop of Object.keys(metas)) { const m = metas[shop]; if (!pick || (m.lastDaily || "") < (meta.lastDaily || "")) { pick = shop; meta = m; } }
    if (!pick) return res.json({ mode, done: true, note: "geen shops" });
    let rr = { wroteDays: 0, orders: 0 };
    try { rr = await geoAggregateWindow(shopToken(pick), pick, addD(today, -2), today); } catch (e) {}
    meta.lastDaily = today;
    try { await setKey(gmKey(pick), meta); } catch (e) {}
    return res.json({ mode, refresh: true, shop: pick, window: addD(today, -2) + ".." + today, wroteDays: rr.wroteDays, orders: rr.orders, done: true });
  }

  // Bepaal (eenmalig) de vroegste maand met omzet, zodat we niet eindeloos leeg terugzoeken.
  if (!meta.earliest) {
    try {
      const rep = await metGet(shopToken(pick), "https://app.metorik.com/api/v1/store/reports/profit-by-date",
        { group_by: "month", start_date: GEO_FLOOR, end_date: today });
      const withRev = (rep.data || []).filter((d) => (d.orders || 0) > 0 || (d.net || 0) > 0);
      const first = withRev.length ? String(withRev[0].date) : null;
      meta.earliest = first ? (normDate(first) || normDate(first.slice(0, 7) + "-01") || GEO_FLOOR) : GEO_FLOOR;
    } catch (e) { meta.earliest = GEO_FLOOR; }
  }
  const floor = normDate(meta.earliest) || GEO_FLOOR;
  const winEnd = addD(meta.cursor, -1);
  let winStart = addD(winEnd, -(WIN - 1));
  if (winStart < floor) winStart = floor;
  let r = { wroteDays: 0, orders: 0 };
  try { r = await geoAggregateWindow(shopToken(pick), pick, winStart, winEnd); } catch (e) {}
  meta.cursor = winStart;
  meta.lastWindow = winStart + ".." + winEnd;
  if (winStart <= floor) meta.done = true;
  try { await setKey(gmKey(pick), meta); } catch (e) {}
  return res.json({ mode, shop: pick, window: winStart + ".." + winEnd, wroteDays: r.wroteDays, orders: r.orders, cursor: meta.cursor, earliest: floor, done: !!meta.done });
}

// Heatmap: lees de dag-aggregaten voor het gekozen tijdvak uit KV en tel per postcode op.
async function geoOrdersView(req, res) {
  const q = req.query || {};
  const shop = String(q.shop || "NL").toUpperCase();
  if (!shopToken(shop)) return res.status(400).json({ error: "onbekende shop" });
  const today = ymd(new Date());
  const d0 = new Date(); d0.setDate(d0.getDate() - 29);
  let start = isDate(q.start) ? q.start : ymd(d0), end = isDate(q.end) ? q.end : today;
  if (start > end) { const t = start; start = end; end = t; }
  const keys = []; for (let d = start; d <= end && keys.length < 4000; d = addD(d, 1)) keys.push(gdKey(shop, d));
  const r = kv();
  let vals = [];
  if (r && keys.length) { try { vals = await r.mget(...keys); } catch (e) { vals = []; } }
  const agg = {}; let orders = 0, omzetTot = 0, daysWith = 0;
  vals.forEach((day) => {
    if (!day || !day.p) return;
    daysWith++; orders += day.o || 0; omzetTot += day.e || 0;
    Object.keys(day.p).forEach((k) => {
      const rec = day.p[k]; const cc = k.slice(0, k.indexOf("|")), pc = k.slice(k.indexOf("|") + 1);
      const a = agg[k] || (agg[k] = { cc, pc, plaats: rec[2] || "", count: 0, omzet: 0 });
      a.count += rec[0] || 0; a.omzet += rec[1] || 0; if (!a.plaats && rec[2]) a.plaats = rec[2];
    });
  });
  const points = Object.values(agg).map((p) => ({ ...p, omzet: Math.round(p.omzet) })).sort((a, b) => b.count - a.count);
  let meta = null; try { meta = await getKey(gmKey(shop)); } catch (e) {}
  res.json({
    shop, start, end, points, total: { orders, omzet: Math.round(omzetTot) },
    daysCovered: daysWith, daysRequested: keys.length, source: "kv",
    backfill: meta ? { cursor: meta.cursor || null, earliest: meta.earliest || null, done: !!meta.done } : null,
    updated: new Date().toISOString(),
  });
}

// Play-modus: de tijdlijn van één dag (per order tijdstip + locatie), voor de afspeel-animatie.
async function geoDayView(req, res) {
  const q = req.query || {};
  const shop = String(q.shop || "NL").toUpperCase();
  if (!shopToken(shop)) return res.status(400).json({ error: "onbekende shop" });
  const date = isDate(q.date) ? q.date : ymd(new Date());
  let ev = null; try { ev = await getKey(geKey(shop, date)); } catch (e) {}
  ev = Array.isArray(ev) ? ev : [];
  const events = ev.map((e) => ({ m: e[0], cc: e[1], pc: e[2], omzet: e[3] || 0 }));
  res.json({ shop, date, events, count: events.length, source: "kv" });
}

module.exports = async (req, res) => {
  if (req.query && req.query.view === "georefresh") return geoRefreshView(req, res);
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });
  if (req.method === "POST" && req.query && req.query.view === "market") return marketWrite(req, res, s);
  if (req.query && req.query.view === "geodiag") return geodiagView(req, res);
  if (req.query && req.query.view === "geoorders") return geoOrdersView(req, res);
  if (req.query && req.query.view === "geoday") return geoDayView(req, res);
  if (req.query && req.query.view === "metrics") return metricsView(req, res);
  if (req.query && req.query.view === "product") return productView(req, res);
  if (req.query && req.query.view === "market") return marketView(req, res);
  if (req.query && req.query.view === "forecast") return forecastView(req, res);
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
