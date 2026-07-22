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
  const BASE = "https://app.metorik.com/api/v1/store/reports/orders-by-date";
  async function ordersFor(extra) {
    const u = new URL(BASE);
    u.searchParams.set("group_by", "month");
    u.searchParams.set("start_date", start);
    u.searchParams.set("end_date", end);
    Object.entries(extra || {}).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
    const txt = await r.text();
    if (!r.ok) return { status: r.status, body: txt.slice(0, 90) };
    let j; try { j = JSON.parse(txt); } catch (e) { return { status: r.status, parse: "geen json" }; }
    const orders = (j.data || []).reduce((s, d) => s + (d.orders || 0), 0);
    return { status: r.status, orders };
  }
  const F = (arr) => JSON.stringify(arr);
  const out = { baseline: await ordersFor() };
  // Kandidaat-filters/params voor "nieuwe klant"-orders. We zien welke werkt + hoeveel minder orders.
  const kandidaten = {
    "param customer_type=new": { customer_type: "new" },
    "param new_customers=true": { new_customers: "true" },
    "filter first_time_customer": { filters: F([{ field: "first_time_customer", operator: "eq", value: true }]) },
    "filter new_customer": { filters: F([{ field: "new_customer", operator: "eq", value: true }]) },
    "filter customer_orders_count=1": { filters: F([{ field: "customer_orders_count", operator: "eq", value: 1 }]) },
    "filter customer_new": { filters: F([{ field: "customer_new", operator: "eq", value: true }]) },
    "filter lifetime_orders=1": { filters: F([{ field: "lifetime_orders", operator: "eq", value: 1 }]) },
  };
  for (const [naam, extra] of Object.entries(kandidaten)) {
    try { out[naam] = await ordersFor(extra); } catch (e) { out[naam] = { error: String(e.message).slice(0, 90) }; }
  }
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
