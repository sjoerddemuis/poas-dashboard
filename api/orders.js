// Inkooporders (purchase orders) in KV. Producten selecteren in de Voorraad-sectie
// -> concept-order per leverancier -> besteld (telt mee als 'onderweg') -> ontvangen.
// GET: iedereen ingelogd (nodig om 'onderweg' in het advies te verrekenen).
// POST: alleen admin (aanmaken/wijzigen/verwijderen).
const { getSession, readBody } = require("./_lib/util");
const { getKey, setKey } = require("./_lib/store");
const KEY = "orders";
const STATUSES = ["concept", "besteld", "ontvangen"];

function rid() {
  return "po_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}
function cleanLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((l) => ({
      sku: String((l && l.sku) != null ? l.sku : "").trim(),
      title: String((l && l.title) || "").slice(0, 200),
      img: String((l && l.img) || "").slice(0, 500),
      qty: Math.max(0, Math.round(+(l && l.qty) || 0)),
    }))
    .filter((l) => l.sku);
}
async function getStore() {
  let s = null;
  try { s = await getKey(KEY); } catch (e) {}
  if (s && Array.isArray(s.orders)) return s;
  return { orders: [] };
}

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });

  if (req.method === "GET") {
    try { const store = await getStore(); return res.json({ orders: store.orders }); }
    catch (e) { return res.json({ orders: [] }); }
  }

  if (req.method === "POST") {
    if (s.role !== "admin") return res.status(403).json({ error: "Alleen admin kan inkooporders beheren." });
    const body = await readBody(req);
    if (!body || !body.action) return res.status(400).json({ error: "ongeldige data" });
    try {
      const store = await getStore();
      const now = new Date().toISOString();

      if (body.action === "create") {
        const incoming = Array.isArray(body.orders) ? body.orders : [];
        const created = [];
        incoming.forEach((o) => {
          const lines = cleanLines(o.lines).filter((l) => l.qty > 0);
          if (!lines.length) return;
          const order = {
            id: rid(),
            supplier: String((o.supplier || "")).slice(0, 120),
            shop: String((o.shop || "")).slice(0, 8),
            status: "concept",
            created: now,
            updated: now,
            note: String((o.note || "")).slice(0, 500),
            lines,
          };
          store.orders.push(order);
          created.push(order.id);
        });
        if (!created.length) return res.status(400).json({ error: "geen geldige regels (aantal > 0)" });
        await setKey(KEY, store);
        return res.json({ ok: true, created, orders: store.orders });
      }

      if (body.action === "update") {
        const o = store.orders.find((x) => x.id === body.id);
        if (!o) return res.status(404).json({ error: "order niet gevonden" });
        if (typeof body.status === "string" && STATUSES.includes(body.status)) o.status = body.status;
        if (Array.isArray(body.lines)) { const cl = cleanLines(body.lines); if (cl.length) o.lines = cl; }
        if (typeof body.note === "string") o.note = body.note.slice(0, 500);
        if (typeof body.supplier === "string") o.supplier = body.supplier.slice(0, 120);
        o.updated = now;
        await setKey(KEY, store);
        return res.json({ ok: true, orders: store.orders });
      }

      if (body.action === "delete") {
        const n = store.orders.length;
        store.orders = store.orders.filter((x) => x.id !== body.id);
        if (store.orders.length === n) return res.status(404).json({ error: "order niet gevonden" });
        await setKey(KEY, store);
        return res.json({ ok: true, orders: store.orders });
      }

      return res.status(400).json({ error: "onbekende actie" });
    } catch (e) {
      return res.status(500).json({ error: e.message || "opslaan mislukt" });
    }
  }

  res.status(405).json({ error: "method not allowed" });
};
