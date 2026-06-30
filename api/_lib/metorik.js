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
module.exports = { allData, SHOPS };
