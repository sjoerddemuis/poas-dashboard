// Haalt automatisch naam + prijs op uit een concurrent-URL. Alleen admin.
const { getSession, readBody } = require("./_lib/util");
const { scrapeInfo } = require("./_lib/scrape");

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s || s.role !== "admin") return res.status(403).json({ error: "Alleen admin." });
  const body = (req.method === "POST") ? await readBody(req) : (req.query || {});
  const url = (body && body.url) || "";
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "ongeldige URL" });
  let shop = "";
  try { shop = new URL(url).hostname.replace(/^www\./, ""); } catch (e) {}
  try {
    const r = await scrapeInfo(url);
    return res.json({ ok: (r.price != null || !!r.title), shop, price: r.price != null ? r.price : null, title: r.title || "", error: r.error || null });
  } catch (e) {
    return res.json({ ok: false, shop, price: null, title: "", error: e.message || "ophalen mislukt" });
  }
};
