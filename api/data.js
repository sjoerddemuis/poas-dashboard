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
