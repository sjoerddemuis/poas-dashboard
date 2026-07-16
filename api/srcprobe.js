// TIJDELIJK diagnose-endpoint: wat geeft Metorik terug per bron/UTM?
// Wordt na de analyse weer verwijderd. Alleen admin.
const { getSession } = require("./_lib/util");

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s || s.role !== "admin") return res.status(403).json({ error: "Alleen admin." });
  const token = process.env.METORIK_TOKEN_NL;
  if (!token) return res.status(400).json({ error: "geen NL-token" });

  const start = (req.query && req.query.start) || "2026-06-01";
  const end = (req.query && req.query.end) || "2026-06-30";
  const out = {};

  async function probe(name, url, params) {
    try {
      const u = new URL(url);
      Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
      const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
      const txt = await r.text();
      if (!r.ok) { out[name] = { status: r.status, body: txt.slice(0, 200) }; return; }
      let j; try { j = JSON.parse(txt); } catch (e) { out[name] = { status: r.status, parse: "geen json", body: txt.slice(0, 200) }; return; }
      const data = j.data || j;
      out[name] = {
        status: r.status,
        keys: Object.keys(j).slice(0, 10),
        aantal: Array.isArray(data) ? data.length : null,
        eerste3: Array.isArray(data) ? data.slice(0, 3) : String(JSON.stringify(data)).slice(0, 300),
      };
    } catch (e) { out[name] = { error: e.message }; }
  }

  await probe("sources-utms", "https://app.metorik.com/api/v1/store/reports/sources-utms", { start_date: start, end_date: end });
  await probe("sources", "https://app.metorik.com/api/v1/store/reports/sources", { start_date: start, end_date: end });
  await probe("profit-by-source", "https://app.metorik.com/api/v1/store/reports/profit-by-source", { start_date: start, end_date: end });

  res.json({ periode: start + " t/m " + end, out });
};
