// Reviews per shop (Trustpilot-export) in KV. Eén sleutel per shop: "reviews:NL" etc.
// Upload gaat in stukjes (chunks) omdat een KV-waarde niet te groot mag worden.
// GET: iedereen ingelogd. POST/DELETE: alleen admin.
const { getSession, readBody } = require("./_lib/util");
const { getKey, setKey } = require("./_lib/store");

const SHOPS = ["NL", "DE", "FR"];
const MAX = 4000;        // max aantal reviews dat we per shop bewaren (nieuwste eerst)
const TXT = 600;         // max lengte review-tekst
const key = (shop) => "reviews:" + shop;

function clean(list) {
  if (!Array.isArray(list)) return [];
  return list.map((r) => ({
    id: String((r && r.id) || "").slice(0, 60),
    date: String((r && r.date) || "").slice(0, 10),      // YYYY-MM-DD
    stars: Math.max(1, Math.min(5, Math.round(+(r && r.stars) || 0))) || 0,
    title: String((r && r.title) || "").slice(0, 200),
    text: String((r && r.text) || "").slice(0, TXT),
    product: String((r && r.product) || "").slice(0, 120),
  })).filter((r) => r.stars >= 1 && r.stars <= 5);
}

async function load(shop) {
  try { const d = await getKey(key(shop)); return (d && Array.isArray(d.reviews)) ? d : { reviews: [], updated: "" }; }
  catch (e) { return { reviews: [], updated: "" }; }
}

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });

  if (req.method === "GET") {
    const q = req.query || {};
    const shop = SHOPS.includes(q.shop) ? q.shop : null;
    try {
      if (shop) { const d = await load(shop); return res.json({ shop, reviews: d.reviews, updated: d.updated || "" }); }
      const out = {}, upd = {};
      for (const sh of SHOPS) { const d = await load(sh); out[sh] = d.reviews; upd[sh] = d.updated || ""; }
      return res.json({ reviews: out, updated: upd });
    } catch (e) {
      return res.status(500).json({ error: e.message || "ophalen mislukt" });
    }
  }

  if (req.method === "POST") {
    if (s.role !== "admin") return res.status(403).json({ error: "Alleen admin kan reviews inladen." });
    const body = await readBody(req);
    if (!body || !SHOPS.includes(body.shop)) return res.status(400).json({ error: "onbekende shop" });
    try {
      const shop = body.shop;
      // mode "replace" = eerste chunk (wist de oude set), "append" = volgende chunks.
      const cur = (body.mode === "replace") ? { reviews: [], updated: "" } : await load(shop);
      const add = clean(body.reviews);
      let all = cur.reviews.concat(add);
      // dedupe op id (of op datum+titel als id ontbreekt), nieuwste eerst, cap op MAX
      const seen = new Set();
      all = all.filter((r) => {
        const k = r.id || (r.date + "|" + r.title).slice(0, 60);
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
      all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      if (all.length > MAX) all = all.slice(0, MAX);
      const d = new Date();
      const store = { reviews: all, updated: d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) };
      await setKey(key(shop), store);
      return res.json({ ok: true, shop, count: all.length, updated: store.updated });
    } catch (e) {
      return res.status(500).json({ error: e.message || "opslaan mislukt (mogelijk te groot; probeer minder reviews)" });
    }
  }

  if (req.method === "DELETE") {
    if (s.role !== "admin") return res.status(403).json({ error: "Alleen admin." });
    const q = req.query || {};
    if (!SHOPS.includes(q.shop)) return res.status(400).json({ error: "onbekende shop" });
    try { await setKey(key(q.shop), { reviews: [], updated: "" }); return res.json({ ok: true }); }
    catch (e) { return res.status(500).json({ error: e.message || "wissen mislukt" }); }
  }

  res.status(405).json({ error: "method not allowed" });
};
