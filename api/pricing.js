// Prijsmonitor: alle gepubliceerde NL-producten (live uit Metorik) + concurrent-data uit KV.
// GET: iedereen ingelogd. POST: alleen admin (concurrenten toevoegen/verwijderen).
const { getSession, readBody } = require("./_lib/util");
const { getKey, setKey } = require("./_lib/store");
const { SEED } = require("./_lib/pricingseed");
const { allProductsNL } = require("./_lib/metorik");

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
    if (!body || typeof body.comp !== "object" || body.comp === null) return res.status(400).json({ error: "ongeldige data" });
    try {
      const store = await getStore();
      store.comp = body.comp;
      if (Array.isArray(body.hidden)) store.hidden = body.hidden.map(String);
      await setKey("pricing2", store);
      const catalog = await getCatalog();
      return res.json({ ok: true, products: merge(catalog, store), updated: store.updated || "" });
    } catch (e) {
      return res.status(500).json({ error: e.message || "opslaan mislukt" });
    }
  }
  res.status(405).json({ error: "method not allowed" });
};
