// Beveiligd: Ronada-aandeel per shop (omzet + orders). Token blijft server-side. 30 min cache.
const { getSession } = require("./_lib/util");
const { ronadaData, topProducts, SHOPS } = require("./_lib/metorik");

const cache = {}, cacheAt = {};
const TTL = 30 * 60 * 1000;

module.exports = async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: "unauthorized" });
  const shop = (req.query && req.query.shop) || "NL";
  const found = SHOPS.find((s) => s[0] === shop);
  if (!found) return res.status(400).json({ error: "onbekende shop" });
  const token = process.env[found[1]];
  if (!token) return res.status(400).json({ error: "geen API-token voor " + shop });
  const now = Date.now();
  if (cache[shop] && now - cacheAt[shop] < TTL) return res.json({ shop, ...cache[shop] });
  try {
    const [rows, top] = await Promise.all([ronadaData(token), topProducts(token)]);
    cache[shop] = { rows, top }; cacheAt[shop] = now;
    res.json({ shop, rows, top });
  } catch (e) {
    if (cache[shop]) return res.json({ shop, ...cache[shop] });
    res.status(500).json({ error: e.message || "Ophalen mislukt" });
  }
};
