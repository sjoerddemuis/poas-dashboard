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
  const end = new Date().toISOString().slice(0, 10);
  const filters = JSON.stringify([{ field: "brand", operator: "not_in", value: ["Ronada", "RTM"] }]);
  const sb = (mo) => { const d = new Date(); d.setMonth(d.getMonth() - mo); return d.toISOString().slice(0, 10); };
  const call = async (start, orderBy) => {
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
  const [r12, o12, r6, o6, r3, o3] = await Promise.all([
    call(sb(12), "gross_sales"), call(sb(12), "net_orders"),
    call(sb(6), "gross_sales"), call(sb(6), "net_orders"),
    call(sb(3), "gross_sales"), call(sb(3), "net_orders"),
  ]);
  return { 12: { rev: r12, ord: o12 }, 6: { rev: r6, ord: o6 }, 3: { rev: r3, ord: o3 } };
}
// Eén pagina (20) niet-Ronada/RTM producten voor 'laad meer'.
async function topProductsPage(token, months, sort, page) {
  const end = new Date().toISOString().slice(0, 10);
  const d = new Date(); d.setMonth(d.getMonth() - months); const start = d.toISOString().slice(0, 10);
  const u = new URL(PRODUCTS);
  u.searchParams.set("start_date", start);
  u.searchParams.set("end_date", end);
  u.searchParams.set("order_by", sort === "ord" ? "net_orders" : "gross_sales");
  u.searchParams.set("order_dir", "desc");
  u.searchParams.set("per_page", "20");
  u.searchParams.set("page", String(page));
  u.searchParams.set("filters", JSON.stringify([{ field: "brand", operator: "not_in", value: ["Ronada", "RTM"] }]));
  const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  if (!r.ok) throw new Error("Metorik API " + r.status);
  const j = await r.json();
  const items = (j.data || []).map((p) => ({ t: p.title, sku: p.sku, img: p.image, u: p.net_items_sold || 0, o: p.net_orders || 0, om: p.net_sales || 0 }));
  const more = j.pagination ? !!j.pagination.has_more_pages : items.length >= 20;
  return { items, more };
}

// Mijn actuele winkelprijs (current_price) per SKU uit Metorik.
async function pricesBySku(token, skus) {
  if (!skus || !skus.length) return {};
  const end = new Date().toISOString().slice(0, 10);
  const d = new Date(); d.setMonth(d.getMonth() - 6); const start = d.toISOString().slice(0, 10);
  const u = new URL(PRODUCTS);
  u.searchParams.set("start_date", start);
  u.searchParams.set("end_date", end);
  u.searchParams.set("per_page", "100");
  u.searchParams.set("filters", JSON.stringify([{ field: "sku", operator: "in", value: skus }]));
  const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  if (!r.ok) throw new Error("Metorik API " + r.status);
  const j = await r.json();
  const out = {};
  (j.data || []).forEach((p) => { if (p.sku != null) out[String(p.sku)] = p.current_price; });
  return out;
}

// Prijsmonitor: alle gepubliceerde NL-producten (bestsellers eerst) met merk-groep.
// Het product-object bevat zelf geen brand, dus we halen per merk de SKU-set op en taggen.
function pmWindow() {
  const end = new Date().toISOString().slice(0, 10);
  const d = new Date(); d.setMonth(d.getMonth() - 24);
  return { start: d.toISOString().slice(0, 10), end };
}
async function brandSkuSet(token, brand) {
  const { start, end } = pmWindow();
  const set = new Set();
  for (let page = 1; page <= 10; page++) {
    const u = new URL(PRODUCTS);
    u.searchParams.set("start_date", start); u.searchParams.set("end_date", end);
    u.searchParams.set("per_page", "100"); u.searchParams.set("page", String(page));
    u.searchParams.set("filters", JSON.stringify([{ field: "brand", operator: "eq", value: brand }]));
    const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
    if (!r.ok) throw new Error("Metorik API " + r.status);
    const j = await r.json();
    (j.data || []).forEach((p) => { if (p.sku != null) set.add(String(p.sku)); });
    if (!(j.pagination && j.pagination.has_more_pages)) break;
  }
  return set;
}
async function allProductsNL(token) {
  const { start, end } = pmWindow();
  const [ronada, rtm, ronadap] = await Promise.all([
    brandSkuSet(token, "Ronada"), brandSkuSet(token, "RTM"), brandSkuSet(token, "Ronada products"),
  ]);
  const out = [];
  for (let page = 1; page <= 15; page++) {
    const u = new URL(PRODUCTS);
    u.searchParams.set("start_date", start); u.searchParams.set("end_date", end);
    u.searchParams.set("order_by", "gross_sales"); u.searchParams.set("order_dir", "desc");
    u.searchParams.set("per_page", "100"); u.searchParams.set("page", String(page));
    const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
    if (!r.ok) throw new Error("Metorik API " + r.status);
    const j = await r.json();
    (j.data || []).forEach((p) => {
      if (p.status !== "publish") return;
      const sku = String(p.sku);
      const group = ronada.has(sku) ? "ronada" : rtm.has(sku) ? "rtm" : ronadap.has(sku) ? "ronadap" : "niet";
      const brand = group === "ronada" ? "Ronada" : group === "rtm" ? "RTM" : group === "ronadap" ? "Ronada products" : "";
      out.push({ sku: p.sku, title: p.title, brand, group, mine: p.current_price, img: p.image, stock: p.stock_quantity || 0, units: p.net_items_sold || 0, margin: p.sales_margin != null ? Math.round(p.sales_margin * 10) / 10 : null, url: "" });
    });
    if (!(j.pagination && j.pagination.has_more_pages)) break;
  }
  return out;
}

// Voorraad-runway + trend: per Ronada/RTM-product 12 maandelijkse verkoop-buckets.
// We halen 12 cumulatieve vensters op (laatste 1..12 mnd) en differentiëren die naar
// losse maandbuckets, zodat de frontend groei/daling (trend) kan berekenen.
const STOCK_FILTERS = JSON.stringify([{ field: "brand", operator: "in", value: ["Ronada", "RTM"] }]);
async function stockWindow(token, months) {
  const end = new Date().toISOString().slice(0, 10);
  const d = new Date(); d.setMonth(d.getMonth() - months);
  const start = d.toISOString().slice(0, 10);
  const u = new URL(PRODUCTS);
  u.searchParams.set("start_date", start);
  u.searchParams.set("end_date", end);
  u.searchParams.set("per_page", "100");
  u.searchParams.set("filters", STOCK_FILTERS);
  const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  if (!r.ok) throw new Error("Metorik API " + r.status);
  const j = await r.json();
  const map = {};
  (j.data || []).forEach((p) => {
    map[String(p.sku)] = { sold: p.net_items_sold || 0, stock: p.stock_quantity || 0, title: p.title, img: p.image, status: p.status, price: p.current_price };
  });
  return map;
}
// Retourneert array van producten met m = [12 maandbuckets, meest recente eerst].
async function stockData(token) {
  const N = 12;
  const cums = await Promise.all(Array.from({ length: N }, (_, i) => stockWindow(token, i + 1)));
  const bySku = {};
  cums.forEach((mp, i) => {
    Object.entries(mp).forEach(([sku, d]) => {
      if (!bySku[sku]) bySku[sku] = { sku: d.sku != null ? d.sku : sku, title: d.title, img: d.img || d.image, status: d.status, price: d.price, stock: d.stock, cum: new Array(N).fill(0) };
      const o = bySku[sku];
      o.cum[i] = d.sold;
      if (d.stock > o.stock) o.stock = d.stock;
      if (d.price != null) o.price = d.price;
      if (d.title) o.title = d.title;
      if (!o.img && d.img) o.img = d.img;
    });
  });
  return Object.values(bySku).map((p) => {
    const m = [];
    for (let i = 0; i < N; i++) { const c = p.cum[i] || 0, pc = i > 0 ? (p.cum[i - 1] || 0) : 0; m[i] = Math.max(0, c - pc); }
    return { sku: String(p.sku), title: p.title, img: p.img, status: p.status, price: p.price, stock: p.stock, m };
  });
}
// Alle shops samen: buckets per maand optellen per SKU; voorraad gedeeld (max over shops).
async function stockDataAll(tokens) {
  const per = await Promise.all(tokens.map((t) => stockData(t)));
  const bySku = {};
  per.forEach((list) => list.forEach((p) => {
    const k = String(p.sku);
    if (!bySku[k]) bySku[k] = { sku: p.sku, title: p.title, img: p.img, status: p.status, price: p.price, stock: p.stock, m: p.m.slice() };
    else {
      const o = bySku[k];
      for (let i = 0; i < p.m.length; i++) o.m[i] = (o.m[i] || 0) + (p.m[i] || 0);
      if (p.stock > o.stock) o.stock = p.stock;
      if (!o.img && p.img) o.img = p.img;
      if (p.price != null && o.price == null) o.price = p.price;
    }
  }));
  return Object.values(bySku);
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
module.exports = { allData, SHOPS, ronadaData, topProducts, topProductsPage, pricesBySku, stockData, stockDataAll, allProductsNL };
