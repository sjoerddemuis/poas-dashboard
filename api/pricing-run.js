// 'Vergelijking uitvoeren': concurrentprijzen scrapen in de opgeslagen concurrent-map. Alleen admin.
// Mijn prijzen komen live uit de Metorik-catalogus (pricing.js), dus die hoeven hier niet ververst.
const { getSession } = require("./_lib/util");
const { getKey, setKey } = require("./_lib/store");
const { SEED } = require("./_lib/pricingseed");
const { allProductsNL } = require("./_lib/metorik");
const { scrapePrice } = require("./_lib/scrape");

async function loadStore() {
  let store = null;
  try { store = await getKey("pricing2"); } catch (e) {}
  if (store && store.comp) return store;
  let old = null; try { old = await getKey("pricing"); } catch (e) {}
  const src = (old && Array.isArray(old.products)) ? old.products : SEED.products;
  const comp = {};
  src.forEach((p) => { if (p.comp && p.comp.length) comp[String(p.sku)] = p.comp; });
  return { updated: (old && old.updated) || SEED.updated, comp };
}

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s || s.role !== "admin") return res.status(403).json({ error: "Alleen admin." });

  const store = await loadStore();
  const comp = store.comp || {};

  // Scrape alle concurrent-URL's (parallel).
  const tasks = [];
  Object.keys(comp).forEach((sku) => (comp[sku] || []).forEach((c) => {
    if (!c.url) return;
    tasks.push((async () => {
      const r = await scrapePrice(c.url);
      if (r.price != null) { c.price = r.price; c.date = Date.now(); delete c.err; }
      else { c.err = r.error; }
    })());
  }));
  await Promise.all(tasks);

  let scraped = 0, failed = 0;
  Object.keys(comp).forEach((sku) => (comp[sku] || []).forEach((c) => { if (c.url) (c.err ? failed++ : scraped++); }));

  const d = new Date();
  store.updated = d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  store.comp = comp;
  try { await setKey("pricing2", store); } catch (e) {}

  // Terug: samengevoegde productlijst zodat de UI meteen ververst.
  let products = [];
  try {
    const token = process.env.METORIK_TOKEN_NL;
    const catalog = token ? await allProductsNL(token) : [];
    const have = new Set(catalog.map((p) => String(p.sku)));
    const hiddenSet = new Set((store.hidden || []).map(String));
    products = catalog.map((p) => ({ ...p, comp: comp[String(p.sku)] || [], hidden: hiddenSet.has(String(p.sku)) }));
    Object.keys(comp).forEach((sku) => { if (!have.has(String(sku)) && comp[sku] && comp[sku].length) products.push({ sku, title: "SKU " + sku, brand: "", group: "niet", mine: null, img: "", comp: comp[sku], hidden: hiddenSet.has(String(sku)) }); });
  } catch (e) {}

  res.json({ products, updated: store.updated, scraped, failed });
};
