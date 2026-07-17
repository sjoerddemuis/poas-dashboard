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

// ---- Profit per campagne: Metorik-winst (per utm_campaign = Google-campagne-ID)
//      gekoppeld aan de adspend van diezelfde campagne in Google Ads.
const SRCUTM = "https://app.metorik.com/api/v1/store/reports/sources-utms";

// Winst/omzet per utm_campaign uit Metorik. utm_campaign bevat de Google-campagne-ID
// (dankzij {campaignid} in het trackingtemplate).
async function metorikByCampaign(token, start, end) {
  const u = new URL(SRCUTM);
  u.searchParams.set("start_date", start);
  u.searchParams.set("end_date", end);
  u.searchParams.set("source_type", "utm_campaign");
  const r = await fetch(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  if (!r.ok) throw new Error("Metorik " + r.status);
  const j = await r.json();
  const out = {};
  (j.data || []).forEach((row) => {
    const key = row.utm_campaign == null ? "" : String(row.utm_campaign).trim();
    if (!key) return;
    out[key] = {
      orders: row.count || 0,
      revenue: row.net || 0,            // netto-omzet, zelfde definitie als elders
      profit: row.profit || 0,          // winst na COGS (Metorik)
      grossProfit: row.gross_profit || 0,
    };
  });
  return out;
}

// Adspend per campagne (id + naam) uit Google Ads.
async function adsByCampaign(cid, token, start, end) {
  const ver = (process.env.GOOGLE_ADS_API_VERSION || "v24").replace(/^v?/, "v");
  const dev = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const mcc = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/\D/g, "");
  cid = String(cid).replace(/\D/g, "");
  const query = "SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.clicks FROM campaign WHERE segments.date BETWEEN '" + start + "' AND '" + end + "'";
  const headers = { "Authorization": "Bearer " + token, "developer-token": dev, "Content-Type": "application/json" };
  if (mcc) headers["login-customer-id"] = mcc;
  const r = await fetch("https://googleads.googleapis.com/" + ver + "/customers/" + cid + "/googleAds:searchStream", {
    method: "POST", headers, body: JSON.stringify({ query }),
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error("Ads API " + r.status + ": " + t.slice(0, 200)); }
  const j = await r.json();
  const chunks = Array.isArray(j) ? j : [j];
  const byId = {};
  chunks.forEach((chunk) => (chunk.results || []).forEach((row) => {
    const c = row.campaign || {}, m = row.metrics || {};
    const id = String(c.id || "");
    if (!id) return;
    const o = byId[id] || (byId[id] = { id, name: c.name || id, status: c.status || "", spend: 0, gConv: 0, gValue: 0, clicks: 0 });
    o.spend += (+m.costMicros || 0) / 1e6;
    o.gConv += +m.conversions || 0;
    o.gValue += +m.conversionsValue || 0;
    o.clicks += +m.clicks || 0;
  }));
  return byId;
}

async function profitView(req, res) {
  const q = req.query || {};
  const today = ymd(new Date());
  const d30 = new Date(); d30.setDate(d30.getDate() - 29);
  let start = q.start || ymd(d30), end = q.end || today;
  if (!isDate(start) || !isDate(end)) return res.status(400).json({ error: "ongeldige datum (YYYY-MM-DD)" });
  if (start > end) { const t = start; start = end; end = t; }
  if (!isConfigured()) return res.json({ configured: false });

  const key = "profit_" + start + "_" + end;
  const now = Date.now();
  if (cache[key] && now - cacheAt[key] < TTL) return res.json(cache[key]);

  try {
    const token = await getAccessToken();
    const shops = {};
    for (const [k] of SHOPS) {
      const cid = process.env["GOOGLE_ADS_CID_" + k];
      const mtok = process.env["METORIK_TOKEN_" + k];
      if (!cid || !mtok) { shops[k] = { rows: [], unmatched: [], note: !cid ? "geen Google-klant-id" : "geen Metorik-token" }; continue; }
      const [ads, met] = await Promise.all([
        adsByCampaign(cid, token, start, end).catch((e) => ({ __err: e.message })),
        metorikByCampaign(mtok, start, end).catch((e) => ({ __err: e.message })),
      ]);
      if (ads.__err || met.__err) { shops[k] = { rows: [], unmatched: [], note: ads.__err || met.__err }; continue; }
      // Join: Metorik's utm_campaign == Google campagne-id
      const rows = Object.values(ads).map((c) => {
        const m = met[c.id] || { orders: 0, revenue: 0, profit: 0 };
        return {
          id: c.id, name: c.name, status: c.status, spend: c.spend,
          orders: m.orders, revenue: m.revenue, profit: m.profit,
          roas: c.spend > 0 ? m.revenue / c.spend : null,
          poas: c.spend > 0 ? m.profit / c.spend : null,
          matched: !!met[c.id],
        };
      }).sort((a, b) => b.spend - a.spend);
      // Metorik-omzet die we niet aan een campagne konden koppelen (bv. 'google_cpc').
      const usedIds = new Set(Object.keys(ads));
      const unmatched = Object.entries(met).filter(([k2]) => !usedIds.has(k2) && !/^\d+$/.test(k2))
        .map(([k2, v]) => ({ utm: k2, orders: v.orders, revenue: v.revenue, profit: v.profit }))
        .sort((a, b) => b.profit - a.profit).slice(0, 10);
      shops[k] = { rows, unmatched };
    }
    const out = { configured: true, start, end, shops, currency: process.env.GOOGLE_ADS_CURRENCY || "EUR" };
    cache[key] = out; cacheAt[key] = now;
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || "Profit per campagne ophalen mislukt" });
  }
}

// ---- Diagnose: wijst precies aan welke schakel ontbreekt of stuk is.
// Geeft NOOIT de waarde van een token terug — alleen of hij er staat en hoe lang hij is.
// Alleen voor admin.
async function diagView(req, res) {
  const need = ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_LOGIN_CUSTOMER_ID", "GOOGLE_ADS_CID_NL",
    "GOOGLE_ADS_CID_DE", "GOOGLE_ADS_CID_FR"];
  const env = {};
  need.forEach((k) => {
    const v = process.env[k];
    env[k] = v ? { gezet: true, lengte: String(v).length } : { gezet: false };
  });
  const out = { env, stappen: {} };

  // 1) Refresh token -> access token
  let token = null;
  try {
    token = await getAccessToken();
    out.stappen.oauth = { ok: true, uitleg: "Refresh token is geldig; access token opgehaald." };
  } catch (e) {
    out.stappen.oauth = { ok: false, fout: String(e.message).slice(0, 300),
      uitleg: "Client id/secret of refresh token klopt niet, of de refresh token hoort bij een andere OAuth-client." };
    return res.json(out);
  }

  // 2) Per shop een minimale query — de echte Google-fout komt terug.
  out.stappen.shops = {};
  for (const [k] of SHOPS) {
    const cid = process.env["GOOGLE_ADS_CID_" + k];
    if (!cid) { out.stappen.shops[k] = { ok: false, uitleg: "GOOGLE_ADS_CID_" + k + " staat niet in Vercel." }; continue; }
    try {
      const rows = await queryCustomer(cid, token, "2026-01-01", "2026-01-07");
      out.stappen.shops[k] = { ok: true, dagenMetData: rows.length };
    } catch (e) {
      const msg = String(e.message);
      let uitleg = "Onbekende fout — zie 'fout'.";
      if (/DEVELOPER_TOKEN_NOT_APPROVED|test account/i.test(msg)) uitleg = "Developer token staat nog op testniveau. Vraag Basic access aan in het API Center van je MCC.";
      else if (/DEVELOPER_TOKEN_PROHIBITED|invalid developer token|DEVELOPER_TOKEN_INVALID/i.test(msg)) uitleg = "Developer token wordt niet geaccepteerd. Hoort hij bij dit MCC-account?";
      else if (/USER_PERMISSION_DENIED|not permitted/i.test(msg)) uitleg = "Het Google-account van de refresh token heeft geen toegang tot dit klant-id, of GOOGLE_ADS_LOGIN_CUSTOMER_ID is niet het MCC waar deze shop onder hangt.";
      else if (/CUSTOMER_NOT_FOUND|INVALID_CUSTOMER_ID/i.test(msg)) uitleg = "Dit klant-id bestaat niet. Let op: gebruik het shop-id, niet het MCC-id.";
      else if (/unsupported|version/i.test(msg)) uitleg = "API-versie klopt niet. Zet GOOGLE_ADS_API_VERSION op de versie die Google nu vraagt.";
      out.stappen.shops[k] = { ok: false, fout: msg.slice(0, 300), uitleg };
    }
  }
  res.json(out);
}

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });
  if (req.query && req.query.view === "diag") {
    if (s.role !== "admin") return res.status(403).json({ error: "Alleen admin." });
    return diagView(req, res);
  }
  if (req.query && req.query.view === "profit") return profitView(req, res);
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
