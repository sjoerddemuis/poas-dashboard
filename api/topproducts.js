// Beveiligd: één extra pagina (20) niet-Ronada/RTM producten voor 'laad meer'. 30 min cache.
const { getSession } = require("./_lib/util");
const { topProductsPage, SHOPS } = require("./_lib/metorik");

const cache = {}, cacheAt = {};
const TTL = 30 * 60 * 1000;

module.exports = async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: "unauthorized" });
  const q = req.query || {};
  const shop = q.shop || "NL";
  const months = [12, 6, 3].includes(+q.months) ? +q.months : 12;
  const sort = q.sort === "ord" ? "ord" : "rev";
  const page = Math.max(2, Math.min(50, parseInt(q.page, 10) || 2));
  const found = SHOPS.find((s) => s[0] === shop);
  if (!found) return res.status(400).json({ error: "onbekende shop" });
  const token = process.env[found[1]];
  if (!token) return res.status(400).json({ error: "geen API-token voor " + shop });
  const ck = shop + "|" + months + "|" + sort + "|" + page;
  const now = Date.now();
  if (cache[ck] && now - cacheAt[ck] < TTL) return res.json(cache[ck]);
  try {
    const out = await topProductsPage(token, months, sort, page);
    cache[ck] = out; cacheAt[ck] = now;
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || "Ophalen mislukt" });
  }
};
