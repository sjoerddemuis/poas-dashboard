// Prijsmonitor-data: GET (iedereen ingelogd) / POST (alleen admin, bewerken).
const { getSession, readBody } = require("./_lib/util");
const { getKey, setKey } = require("./_lib/store");
const { SEED } = require("./_lib/pricingseed");

function stamp() {
  const d = new Date();
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });

  if (req.method === "GET") {
    try { const stored = await getKey("pricing"); return res.json(stored || SEED); }
    catch (e) { return res.json(SEED); }
  }
  if (req.method === "POST") {
    if (s.role !== "admin") return res.status(403).json({ error: "Alleen admin kan de monitor bewerken." });
    const body = await readBody(req);
    if (!body || !Array.isArray(body.products)) return res.status(400).json({ error: "ongeldige data" });
    const data = { products: body.products, updated: body.updated || stamp() };
    try { await setKey("pricing", data); return res.json({ ok: true, ...data }); }
    catch (e) { return res.status(500).json({ error: e.message || "opslaan mislukt" }); }
  }
  res.status(405).json({ error: "method not allowed" });
};
