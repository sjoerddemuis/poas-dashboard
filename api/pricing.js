// Prijsmonitor: alle gepubliceerde NL-producten (live uit Metorik) + concurrent-data uit KV.
// GET: iedereen ingelogd. POST: alleen admin (concurrenten toevoegen/verwijderen).
const { getSession, readBody } = require("./_lib/util");
const { getKey, setKey } = require("./_lib/store");
const { SEED } = require("./_lib/pricingseed");
const { allProductsNL } = require("./_lib/metorik");
const { scrapePrice, scrapeInfo } = require("./_lib/scrape");

let catalogCache = null, catalogAt = 0;
const TTL = 30 * 60 * 1000;

async function getCatalog() {
  const now = Date.now();
  if (catalogCache && now - catalogAt < TTL) return catalogCache;
  const token = process.env.METORIK_TOKEN_NL;
  if (!token) return catalogCache || [];
  const list = await allProductsNL(token);
  catalogCache = list; catalogAt = now;
  return list;
}

// Concurrent-data { updated, comp: { sku: [ {shop,title,price,url,date,err} ] } }.
// Migreert eenmalig vanuit oude "pricing"-sleutel of de SEED.
async function getStore() {
  let store = null;
  try { store = await getKey("pricing2"); } catch (e) {}
  if (store && store.comp) { if (!Array.isArray(store.hidden)) store.hidden = []; return store; }
  let old = null; try { old = await getKey("pricing"); } catch (e) {}
  const src = (old && Array.isArray(old.products)) ? old.products : SEED.products;
  const comp = {};
  src.forEach((p) => { if (p.comp && p.comp.length) comp[String(p.sku)] = p.comp; });
  store = { updated: (old && old.updated) || SEED.updated, comp, hidden: (old && Array.isArray(old.hidden)) ? old.hidden : [] };
  try { await setKey("pricing2", store); } catch (e) {}
  return store;
}

function merge(catalog, store) {
  const comp = store.comp || {};
  const hidden = new Set((store.hidden || []).map(String));
  const products = catalog.map((p) => ({ ...p, comp: comp[String(p.sku)] || [], hidden: hidden.has(String(p.sku)) }));
  // Concurrent-SKU's die niet in de catalogus zitten (bv. niet-gepubliceerd) toch tonen.
  const have = new Set(catalog.map((p) => String(p.sku)));
  Object.keys(comp).forEach((sku) => {
    if (!have.has(String(sku)) && comp[sku] && comp[sku].length) {
      products.push({ sku, title: "SKU " + sku, brand: "", group: "niet", mine: null, img: "", stock: null, units: null, margin: null, url: "", comp: comp[sku], hidden: hidden.has(String(sku)) });
    }
  });
  return products;
}

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });

  if (req.method === "GET") {
    try {
      const [catalog, store] = await Promise.all([getCatalog(), getStore()]);
      return res.json({ products: merge(catalog, store), updated: store.updated || "" });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Ophalen mislukt" });
    }
  }
  if (req.method === "POST") {
    if (s.role !== "admin") return res.status(403).json({ error: "Alleen admin kan de monitor bewerken." });
    const body = await readBody(req);
    if (!body) return res.status(400).json({ error: "ongeldige data" });

    // op:"fetch" — naam + prijs ophalen uit één concurrent-URL (was api/pricing-fetch).
    if (body.op === "fetch") {
      const url = body.url || "";
      if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "ongeldige URL" });
      let shop = ""; try { shop = new URL(url).hostname.replace(/^www\./, ""); } catch (e) {}
      try {
        const r = await scrapeInfo(url);
        return res.json({ ok: (r.price != null || !!r.title), shop, price: r.price != null ? r.price : null, title: r.title || "", error: r.error || null });
      } catch (e) {
        return res.json({ ok: false, shop, price: null, title: "", error: e.message || "ophalen mislukt" });
      }
    }

    // op:"run" — alle concurrent-URL's scrapen en prijzen bijwerken (was api/pricing-run).
    if (body.op === "run") {
      try {
        const store = await getStore();
        const comp = store.comp || {};
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
        await setKey("pricing2", store);
        const catalog = await getCatalog();
        return res.json({ products: merge(catalog, store), updated: store.updated, scraped, failed });
      } catch (e) {
        return res.status(500).json({ error: e.message || "vergelijking mislukt" });
      }
    }

    try {
      const store = await getStore();
      store.comp = store.comp || {};
      store.hidden = Array.isArray(store.hidden) ? store.hidden : [];
      if (body.sku != null) {
        // Per-product update: raakt alleen dit product, geen clobber van de rest.
        const sku = String(body.sku);
        if (Array.isArray(body.comp)) { if (body.comp.length) store.comp[sku] = body.comp; else delete store.comp[sku]; }
        if (typeof body.hidden === "boolean") { const set = new Set(store.hidden.map(String)); if (body.hidden) set.add(sku); else set.delete(sku); store.hidden = [...set]; }
      } else if (body.comp && typeof body.comp === "object") {
        store.comp = body.comp;
        if (Array.isArray(body.hidden)) store.hidden = body.hidden.map(String);
      } else {
        return res.status(400).json({ error: "ongeldige data" });
      }
      await setKey("pricing2", store);
      const catalog = await getCatalog();
      return res.json({ ok: true, products: merge(catalog, store), updated: store.updated || "" });
    } catch (e) {
      return res.status(500).json({ error: e.message || "opslaan mislukt" });
    }
  }
  res.status(405).json({ error: "method not allowed" });
};
