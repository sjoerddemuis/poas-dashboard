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
  const start = "2026-06-01", end = "2026-06-07";
  const reports = {
    "profit-by-date": { group_by: "day", start_date: start, end_date: end },
    "revenue-by-date": { group_by: "day", start_date: start, end_date: end },
    "orders-by-date": { group_by: "day", start_date: start, end_date: end },
    "customers-by-date": { group_by: "day", start_date: start, end_date: end },
  };
  const out = {};
  await Promise.all(Object.entries(reports).map(async ([name, params]) => {
    try {
      const u = new URL("https://app.metorik.com/api/v1/store/reports/" + name);
      Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
      const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
      const txt = await r.text();
      if (!r.ok) { out[name] = { status: r.status, body: txt.slice(0, 120) }; return; }
      let j; try { j = JSON.parse(txt); } catch (e) { out[name] = { status: r.status, parse: "geen json" }; return; }
      const first = (j.data || [])[0] || {};
      out[name] = { status: r.status, velden: Object.keys(first), totalsVelden: Object.keys(j.totals || {}), sample: first };
    } catch (e) { out[name] = { error: String(e.message).slice(0, 120) }; }
  }));
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
