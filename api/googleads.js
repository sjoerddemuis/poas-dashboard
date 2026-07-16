// Google Ads: dagelijkse metrics per shop (3 accounts onder één MCC) over een datumrange.
// Auth = OAuth refresh-token -> access token. Data = GAQL searchStream per customer-id.
// Env: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
//      GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC),
//      GOOGLE_ADS_CID_NL / _DE / _FR (klant-id's), GOOGLE_ADS_API_VERSION (default v24).
const { getSession } = require("./_lib/util");
const SHOPS = [["NL", "Nederland"], ["DE", "Duitsland"], ["FR", "Frankrijk"]];
const cache = {}, cacheAt = {};
const TTL = 15 * 60 * 1000;

function isConfigured() {
  return !!(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET && process.env.GOOGLE_ADS_REFRESH_TOKEN);
}
function isDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function ymd(d) { return d.toISOString().slice(0, 10); }

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error("OAuth " + r.status + ": " + t.slice(0, 160)); }
  const j = await r.json();
  return j.access_token;
}

async function queryCustomer(cid, token, start, end) {
  const ver = (process.env.GOOGLE_ADS_API_VERSION || "v24").replace(/^v?/, "v");
  const dev = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const mcc = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/\D/g, "");
  cid = String(cid).replace(/\D/g, "");
  const query = "SELECT segments.date, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.clicks, metrics.impressions FROM customer WHERE segments.date BETWEEN '" + start + "' AND '" + end + "'";
  const headers = { "Authorization": "Bearer " + token, "developer-token": dev, "Content-Type": "application/json" };
  if (mcc) headers["login-customer-id"] = mcc;
  const r = await fetch("https://googleads.googleapis.com/" + ver + "/customers/" + cid + "/googleAds:searchStream", {
    method: "POST", headers, body: JSON.stringify({ query }),
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error("Ads API " + r.status + ": " + t.slice(0, 220)); }
  const j = await r.json();
  const chunks = Array.isArray(j) ? j : [j];
  const byDate = {};
  chunks.forEach((chunk) => (chunk.results || []).forEach((row) => {
    const d = row.segments && row.segments.date; if (!d) return;
    const m = row.metrics || {};
    const o = byDate[d] || (byDate[d] = { date: d, cost: 0, conv: 0, value: 0, clicks: 0, impr: 0 });
    o.cost += (+m.costMicros || 0) / 1e6;
    o.conv += +m.conversions || 0;
    o.value += +m.conversionsValue || 0;
    o.clicks += +m.clicks || 0;
    o.impr += +m.impressions || 0;
  }));
  return Object.values(byDate).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Tijdelijk: meet welke bron/UTM-data Metorik teruggeeft, om te bepalen of we
// betrouwbaar op campagnenaam kunnen joinen met Google Ads. Alleen admin.
async function srcProbe(req, res) {
  const token = process.env.METORIK_TOKEN_NL;
  if (!token) return res.status(400).json({ error: "geen NL-token" });
  const q = req.query || {};
  const start = q.start || "2026-06-01", end = q.end || "2026-06-30";
  const out = {};
  async function probe(name, url, params) {
    try {
      const u = new URL(url);
      Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
      const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
      const txt = await r.text();
      if (!r.ok) { out[name] = { status: r.status, body: txt.slice(0, 160) }; return; }
      let j; try { j = JSON.parse(txt); } catch (e) { out[name] = { status: r.status, body: txt.slice(0, 160) }; return; }
      const data = j.data || j;
      out[name] = { status: r.status, keys: Object.keys(j).slice(0, 8),
        aantal: Array.isArray(data) ? data.length : null,
        eerste5: Array.isArray(data) ? data.slice(0, 5) : String(JSON.stringify(data)).slice(0, 250) };
    } catch (e) { out[name] = { error: e.message }; }
  }
  await probe("sources-utms", "https://app.metorik.com/api/v1/store/reports/sources-utms", { start_date: start, end_date: end });
  await probe("sources", "https://app.metorik.com/api/v1/store/reports/sources", { start_date: start, end_date: end });
  return res.json({ periode: start + " t/m " + end, out });
}

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });
  if (req.query && req.query.view === "srcprobe") {
    if (s.role !== "admin") return res.status(403).json({ error: "Alleen admin." });
    return srcProbe(req, res);
  }
  if (!isConfigured()) return res.json({ configured: false });

  const today = ymd(new Date());
  const d30 = new Date(); d30.setDate(d30.getDate() - 29);
  let start = (req.query && req.query.start) || ymd(d30);
  let end = (req.query && req.query.end) || today;
  if (!isDate(start) || !isDate(end)) return res.status(400).json({ error: "ongeldige datum (YYYY-MM-DD)" });
  if (start > end) { const t = start; start = end; end = t; }

  const key = start + "_" + end;
  const now = Date.now();
  if (cache[key] && now - cacheAt[key] < TTL) return res.json(cache[key]);

  try {
    const token = await getAccessToken();
    const shops = {};
    for (const [k] of SHOPS) {
      const cid = process.env["GOOGLE_ADS_CID_" + k];
      shops[k] = cid ? await queryCustomer(cid, token, start, end) : [];
    }
    // Totaal per dag over alle shops.
    const totMap = {};
    Object.values(shops).forEach((arr) => arr.forEach((o) => {
      const t = totMap[o.date] || (totMap[o.date] = { date: o.date, cost: 0, conv: 0, value: 0, clicks: 0, impr: 0 });
      t.cost += o.cost; t.conv += o.conv; t.value += o.value; t.clicks += o.clicks; t.impr += o.impr;
    }));
    const total = Object.values(totMap).sort((a, b) => (a.date < b.date ? -1 : 1));
    const out = { configured: true, start, end, shops, total, currency: process.env.GOOGLE_ADS_CURRENCY || "EUR" };
    cache[key] = out; cacheAt[key] = now;
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || "Google Ads ophalen mislukt" });
  }
};
