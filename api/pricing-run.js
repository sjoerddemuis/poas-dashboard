// 'Vergelijking uitvoeren': mijn prijzen uit Metorik (op SKU) + concurrentprijzen scrapen. Alleen admin.
const { getSession } = require("./_lib/util");
const { getKey, setKey } = require("./_lib/store");
const { SEED } = require("./_lib/pricingseed");
const { pricesBySku } = require("./_lib/metorik");
const { scrapePrice } = require("./_lib/scrape");

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s || s.role !== "admin") return res.status(403).json({ error: "Alleen admin." });

  let data = null;
  try { data = await getKey("pricing"); } catch (e) {}
  data = JSON.parse(JSON.stringify(data || SEED));
  const products = data.products || [];

  // 1) Mijn prijzen verversen uit Metorik (NL).
  const nlToken = process.env.METORIK_TOKEN_NL;
  if (nlToken) {
    try {
      const skus = products.map((p) => p.sku).filter(Boolean);
      const map = await pricesBySku(nlToken, skus);
      products.forEach((p) => { if (map[String(p.sku)] != null) p.mine = map[String(p.sku)]; });
    } catch (e) { /* mijn-prijzen optioneel */ }
  }

  // 2) Concurrentprijzen scrapen (parallel).
  const tasks = [];
  products.forEach((p) => (p.comp || []).forEach((c) => {
    if (!c.url) return;
    tasks.push((async () => {
      const r = await scrapePrice(c.url);
      if (r.price != null) { c.price = r.price; c.date = Date.now(); delete c.err; }
      else { c.err = r.error; }
    })());
  }));
  await Promise.all(tasks);

  let scraped = 0, failed = 0;
  products.forEach((p) => (p.comp || []).forEach((c) => { if (c.url) (c.err ? failed++ : scraped++); }));

  const d = new Date();
  data.updated = d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  try { await setKey("pricing", data); } catch (e) {}
  res.json({ ...data, scraped, failed });
};
