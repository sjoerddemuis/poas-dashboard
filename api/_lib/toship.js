// Nog te verzenden: alle openstaande orders van alle shops, per orderregel (SKU).
// Bundels worden uitgesplitst: de bundel-regel zelf telt niet, de losse producten erin wel.
// Bron: Metorik REST (zelfde tokens als de rest van het dashboard). Cache 2 min (KV + geheugen).
const { SHOPS } = require("./metorik");
const { kv } = require("./store");

const STATUSES = [
  ["processing", "In behandeling"],
  ["on-hold", "In de wacht"],
  ["out-of-stock", "Niet op voorraad"],
  ["send-later", "Later verzenden"],
  ["processing-1", "Orderverwerking 1"],
  ["processing-2", "Orderverwerking 2"],
];
const KEYS = STATUSES.map((s) => s[0]);
const URL_ORDERS = "https://app.metorik.com/api/v1/store/orders";
const TTL = 120; // seconden
const CACHE_KEY = "toship:v1";
let mem = null, memAt = 0;

async function mget(token, params) {
  const u = new URL(URL_ORDERS);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let a = 0; a < 6; a++) {
    const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
    if (r.status === 429) {
      const ra = parseInt(r.headers.get("retry-after") || "0", 10);
      await new Promise((s) => setTimeout(s, ra > 0 ? Math.min(ra * 1000, 6000) : Math.min(500 * Math.pow(2, a), 5000)));
      continue;
    }
    if (!r.ok) throw new Error("Metorik API " + r.status);
    return r.json();
  }
  throw new Error("Metorik API 429 (te veel verzoeken)");
}

function metaHas(li, key) {
  return Array.isArray(li.meta) && li.meta.some((m) => m && m.key === key);
}
// Bundel-/samenstel-ouders tellen niet mee: hun losse producten staan als eigen regels in de order.
function isParent(li) {
  return metaHas(li, "_bundled_items") || metaHas(li, "_woosb_ids") || metaHas(li, "_composite_children");
}

async function shopLines(code, token) {
  const lines = [];
  let orders = 0;
  for (let page = 1; page <= 30; page++) {
    const j = await mget(token, {
      per_page: "100",
      page: String(page),
      filters: JSON.stringify([{ field: "status", operator: "in", value: KEYS }]),
    });
    const rows = j.data || j.orders || [];
    // Veiligheid: als het statusfilter genegeerd wordt, nooit door alle orders bladeren.
    if (rows.some((o) => !KEYS.includes(o.status))) throw new Error("statusfilter niet toegepast door Metorik");
    rows.forEach((o) => {
      orders++;
      const num = String(o.order_number || o.order_id || "").replace(/^#/, "");
      const date = String(o.order_created_at || "").slice(0, 10);
      (o.line_items || []).forEach((li) => {
        if (isParent(li)) return;
        const qty = Number(li.quantity) || 0;
        if (qty <= 0) return;
        const sku = String(li.sku || "").trim();
        lines.push([code, num, o.status, date, sku || "—", String(li.name || "").trim(), qty, o.order_id]);
      });
    });
    const more = j.pagination ? j.pagination.has_more_pages : rows.length === 100;
    if (!rows.length || !more) break;
  }
  return { lines, orders };
}

async function build() {
  const list = SHOPS.map((s) => [s[0], process.env[s[1]], s[2]]).filter((x) => x[1]);
  const res = await Promise.all(
    list.map(async ([code, token, label]) => {
      try {
        const r = await shopLines(code, token);
        return { code, label, orders: r.orders, lines: r.lines };
      } catch (e) {
        return { code, label, orders: 0, lines: [], error: e.message || "mislukt" };
      }
    })
  );
  return {
    updated: new Date().toISOString(),
    statuses: STATUSES.map(([key, label]) => ({ key, label })),
    shops: res.map((r) => ({ code: r.code, label: r.label, orders: r.orders, error: r.error || null })),
    // [shop, ordernummer, status, datum, sku, productnaam, aantal, order_id]
    lines: res.flatMap((r) => r.lines),
  };
}

async function toship(req, res) {
  const fresh = req.query && (req.query.fresh === "1" || req.query.fresh === "true");
  const now = Date.now();
  try {
    if (!fresh) {
      if (mem && now - memAt < TTL * 1000) return res.json(mem);
      const r = kv();
      if (r) {
        const c = await r.get(CACHE_KEY);
        if (c && c.updated) { mem = c; memAt = now; return res.json(c); }
      }
    }
    const data = await build();
    mem = data; memAt = now;
    const r = kv();
    if (r && !data.shops.some((s) => s.error)) await r.set(CACHE_KEY, data, { ex: TTL });
    res.json(data);
  } catch (e) {
    if (mem) return res.json(Object.assign({}, mem, { stale: true }));
    res.status(500).json({ error: e.message || "Ophalen mislukt" });
  }
}

module.exports = { toship, STATUSES };
