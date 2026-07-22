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
  const out = {};
  // 1) Klanten-endpoint: welke velden? (zoek orders_count / first_order-datum)
  const cust = await call("https://app.metorik.com/api/v1/store/customers", { per_page: "1" });
  if (cust.j) {
    const first = (cust.j.data || [])[0] || {};
    out.customers = { status: cust.status, velden: Object.keys(first), sample: first, paginatie: cust.j.pagination };
  } else out.customers = cust;
  // 2) Klanten met eerste order in juni = nieuwe klanten. Test date-range betekenis + count.
  const custRange = await call("https://app.metorik.com/api/v1/store/customers",
    { per_page: "1", start_date: start, end_date: end, order_by: "first_order_at" });
  out.customersInRange = custRange.j ? { status: custRange.status, totaal: custRange.j.pagination && custRange.j.pagination.total, sample1: (custRange.j.data || [])[0] } : custRange;
  // 3) orders-by-date met customer_type in de filters-array (nieuw/terugkerend).
  const ordBase = "https://app.metorik.com/api/v1/store/reports/orders-by-date";
  async function ordCount(extra) {
    const c = await call(ordBase, Object.assign({ group_by: "month", start_date: start, end_date: end }, extra));
    return c.j ? (c.j.data || []).reduce((s, d) => s + (d.orders || 0), 0) : c;
  }
  out.ordersBaseline = await ordCount({});
  out.ordersFilterTypeNew = await ordCount({ filters: F([{ field: "customer_type", operator: "eq", value: "new" }]) });
  out.ordersFilterTypeReturning = await ordCount({ filters: F([{ field: "customer_type", operator: "eq", value: "returning" }]) });
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
