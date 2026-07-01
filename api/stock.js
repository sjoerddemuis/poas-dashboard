// Beveiligd: voorraad-runway (Ronada/RTM) per shop, 12 maandbuckets/product. 30 min cache.
const { getSession } = require("./_lib/util");
const { stockData, stockDataAll, SHOPS } = require("./_lib/metorik");

const cache = {}, cacheAt = {};
const TTL = 30 * 60 * 1000;

module.exports = async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: "unauthorized" });
  const shop = (req.query && req.query.shop) || "ALL";
  const now = Date.now();
  if (cache[shop] && now - cacheAt[shop] < TTL) return res.json({ shop, products: cache[shop] });
  try {
    let products;
    if (shop === "ALL") {
      const tokens = SHOPS.map((s) => process.env[s[1]]).filter(Boolean);
      if (!tokens.length) return res.status(400).json({ error: "geen API-tokens ingesteld" });
      products = await stockDataAll(tokens);
    } else {
      const found = SHOPS.find((s) => s[0] === shop);
      if (!found) return res.status(400).json({ error: "onbekende shop" });
      const token = process.env[found[1]];
      if (!token) return res.status(400).json({ error: "geen API-token voor " + shop });
      products = await stockData(token);
    }
    cache[shop] = products; cacheAt[shop] = now;
    res.json({ shop, products });
  } catch (e) {
    if (cache[shop]) return res.json({ shop, products: cache[shop] });
    res.status(500).json({ error: e.message || "Ophalen mislukt" });
  }
};
