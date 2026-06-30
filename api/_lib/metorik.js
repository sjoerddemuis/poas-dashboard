const SHOPS = [
  ["NL", "METORIK_TOKEN_NL", "Nederland"],
  ["DE", "METORIK_TOKEN_DE", "Duitsland"],
  ["FR", "METORIK_TOKEN_FR", "Frankrijk"],
];
const MABBR = ["", "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
const BASE = "https://app.metorik.com/api/v1/store/reports/profit-by-date";
function label(date) { const [y, m] = String(date).split("-"); return MABBR[+m] + " '" + String(y).slice(2); }
async function metFetch(token, params) {
  const u = new URL(BASE);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  if (!r.ok) throw new Error("Metorik API " + r.status);
  return r.json();
}
async function shopData(token) {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today.getFullYear() - 2, today.getMonth(), 1).toISOString().slice(0, 10);
  const d30 = new Date(today.getTime() - 30 * 864e5).toISOString().slice(0, 10);
  const rep = await metFetch(token, { start_date: start, end_date: end, group_by: "month" });
  const m = (rep.data || []).map((d) => [
    label(d.date), d.net || 0, d.advertising_cost || 0, d.orders || 0,
    d.product_cogs || 0, d.shipping_cogs || 0, d.transaction_cogs || 0, d.extra_cogs || 0, d.operational_cost || 0,
  ]);
  let aov = null, opexPer = null, transPer = null, marge = null;
  try {
    const a = await metFetch(token, { start_date: d30, end_date: end });
    const t = a.totals || {};
    if (t.orders > 0) {
      aov = t.net / t.orders;
      opexPer = (t.operational_cost || 0) / t.orders;
      transPer = (t.transaction_cogs || 0) / t.orders;
      const cogs30 = (t.product_cogs || 0) + (t.shipping_cogs || 0) + (t.transaction_cogs || 0) + (t.extra_cogs || 0);
      if (t.net > 0 && cogs30 > 0) marge = (t.net - cogs30) / t.net;
    }
  } catch (e) { /* 30d optioneel */ }
  return { m, aov, opexPer, transPer, marge };
}
// ---- Ronada-aandeel (eigen huismerk Ronada+RTM vs rest) ----
// Publieke REST geeft per merk omzet + orders (geen winst), dus alleen die twee metrics.
const BRANDS = "https://app.metorik.com/api/v1/store/brands/by-date";
const REVENUE = "https://app.metorik.com/api/v1/store/reports/revenue-by-date";
function ym(d) { const a = String(d).split("-"); return a[0] + "-" + String(a[1]).padStart(2, "0"); }
async function metGet(url, token, params) {
  const u = new URL(url);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  if (!r.ok) throw new Error("Metorik API " + r.status);
  return r.json();
}
async function ronadaData(token) {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = "2024-03-01";
  const [ron, rtm, rev] = await Promise.all([
    metGet(BRANDS, token, { brand: "Ronada", group_by: "month", start_date: start, end_date: end }),
    metGet(BRANDS, token, { brand: "RTM", group_by: "month", start_date: start, end_date: end }),
    metGet(REVENUE, token, { group_by: "month", start_date: start, end_date: end }),
  ]);
  const idx = (d) => { const o = {}; (d.data || []).forEach((x) => { o[ym(x.date)] = x; }); return o; };
  const R = idx(ron), T = idx(rtm);
  const rows = [];
  (rev.data || []).forEach((rv) => {
    const k = ym(rv.date);
    const net = rv.net || 0, ship = rv.shipping || 0, ords = rv.orders || 0;
    const tOm = net - ship;
    const r = R[k] || {}, t = T[k] || {};
    const rOm = (r.net_sales || 0) + (t.net_sales || 0);
    const rOr = (r.net_orders || 0) + (t.net_orders || 0);
    if (tOm <= 0 && rOm <= 0) return;
    rows.push({ m: k, om: { r: rOm, n: tOm - rOm, t: tOm }, or: { r: rOr, n: ords - rOr, t: ords } });
  });
  return rows;
}

// Top-20 niet-Ronada/RTM producten op omzet en op orders (per shop).
const PRODUCTS = "https://app.metorik.com/api/v1/store/products";
async function topProducts(token) {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const cs = new Date(); cs.setFullYear(cs.getFullYear() - 1);
  const start = cs.toISOString().slice(0, 10);
  const filters = JSON.stringify([{ field: "brand", operator: "not_in", value: ["Ronada", "RTM"] }]);
  const call = async (orderBy) => {
    const u = new URL(PRODUCTS);
    u.searchParams.set("start_date", start);
    u.searchParams.set("end_date", end);
    u.searchParams.set("order_by", orderBy);
    u.searchParams.set("order_dir", "desc");
    u.searchParams.set("per_page", "20");
    u.searchParams.set("filters", filters);
    const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
    if (!r.ok) throw new Error("Metorik API " + r.status);
    const j = await r.json();
    return (j.data || []).map((p) => ({ t: p.title, sku: p.sku, img: p.image, u: p.net_items_sold || 0, o: p.net_orders || 0, om: p.net_sales || 0 }));
  };
  const [rev, ord] = await Promise.all([call("gross_sales"), call("net_orders")]);
  return { rev, ord };
}

async function allData() {
  const out = {};
  await Promise.all(SHOPS.map(async ([key, envName, name]) => {
    const token = process.env[envName];
    if (!token) { out[key] = { name, m: [], aov: null, error: "geen API-token ingesteld" }; return; }
    try { out[key] = { name, ...(await shopData(token)) }; }
    catch (e) { out[key] = { name, m: [], aov: null, error: e.message }; }
  }));
  out.updatedAt = Date.now();
  return out;
}
module.exports = { allData, SHOPS, ronadaData, topProducts };
