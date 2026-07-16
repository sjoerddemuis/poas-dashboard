// Verkoopkosten uit de Google Sheet (publiek leesbaar, één tabblad per maand).
// Tabbladen worden ontdekt via hun gid (uniek id) — NIET door namen te raden:
// gviz geeft bij een onbekende tabnaam stilzwijgend het eerste tabblad terug,
// wat eerder spookmaanden opleverde met een gekopieerd totaal.
// Voegt Metorik-omzet en advertentiekosten per maand toe. 10 min cache.
const { getSession } = require("./_lib/util");
const { monthlyRevenue, monthlyAds, SHOPS } = require("./_lib/metorik");

const SHEET_ID = process.env.COSTS_SHEET_ID || "18FeLVzTooORCph_DY4qAZ2khqFHqQbYhn4v_KLUcgTY";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
let cache = null, cacheAt = 0;
const TTL = 10 * 60 * 1000;

function csvRows(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); cell = ""; rows.push(row); row = []; }
    else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function amount(s) {
  s = String(s == null ? "" : s).replace(/[€\s]|EUR/gi, "").trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()\-]/g, "");
  if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.indexOf(",") > -1) s = s.replace(",", ".");
  const v = parseFloat(s);
  if (!isFinite(v)) return null;
  return neg ? -v : v;
}
function decodeEnt(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();
}
// Maand + jaar uit de tabnaam ("December 2025", "Januari 2026", of alleen "Mei").
function periodOf(name) {
  const low = String(name).toLowerCase();
  const mi = MONTHS.findIndex((m) => low.includes(m));
  if (mi < 0) return null;
  const ym = low.match(/(20\d{2})/);
  let year;
  if (ym) year = +ym[1];
  else {
    const now = new Date(), cy = now.getFullYear(), cm = now.getMonth() + 1;
    year = (mi + 1) > cm ? cy - 1 : cy;      // maand die nog moet komen = vorig jaar
  }
  return { key: year + "-" + String(mi + 1).padStart(2, "0"), label: String(name).trim(), monthNum: mi + 1, year };
}
// Alle tabbladen (naam + gid) uit de htmlview-pagina halen.
async function discoverTabs() {
  const r = await fetch("https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/htmlview", { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!r.ok) throw new Error("Sheet niet bereikbaar (HTTP " + r.status + "). Staat hij op 'iedereen met de link kan lezen'?");
  const html = await r.text();
  const tabs = []; const seen = new Set();
  // De tabbladen staan in een JS-blok:  items.push({name: "Januari 2026", pageUrl: "...", gid: "1895417899"})
  // (dus niet als gewone <a href="#gid=..">-links).
  const re = /\{\s*name:\s*"([^"]+)"[\s\S]{0,400}?gid:\s*"(\d+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const naam = decodeEnt(m[1]), gid = m[2];
    if (!naam || seen.has(gid)) continue;
    seen.add(gid); tabs.push({ gid, naam });
  }
  return tabs;
}
async function fetchGid(gid) {
  const u = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv&gid=" + encodeURIComponent(gid);
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (!r.ok) return null;
    const t = await r.text();
    if (!t || /^\s*</.test(t)) return null;
    return t;
  } catch (e) { return null; }
}
function parseTab(text) {
  const items = {}; let sheetTotal = null;
  csvRows(text).forEach((r) => {
    const naam = String(r[0] || "").trim();
    const v = amount(r[1]);
    if (!naam) { if (v != null) sheetTotal = v; return; }   // lege naam = de totaalregel uit de sheet
    if (/^totaal$|^total$/i.test(naam)) { if (v != null) sheetTotal = v; return; }
    items[naam] = v == null ? 0 : v;
  });
  return { items, sheetTotal };
}

module.exports = async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: "unauthorized" });
  const now = Date.now();
  if (cache && now - cacheAt < TTL && !(req.query && req.query.fresh)) return res.json(cache);

  try {
    const tabs = await discoverTabs();
    if (!tabs.length) return res.status(500).json({ error: "Kon de tabbladen niet uitlezen. Staat de sheet op 'iedereen met de link kan lezen'?" });

    const parsed = await Promise.all(tabs.map(async (t) => {
      const p = periodOf(t.naam);
      if (!p) return null;                                  // geen maand-tab (bv. een notities-blad)
      const txt = await fetchGid(t.gid);
      if (!txt) return null;
      const { items, sheetTotal } = parseTab(txt);
      if (!Object.keys(items).length) return null;
      const total = Object.values(items).reduce((s, v) => s + v, 0);
      return { key: p.key, label: p.label, gid: t.gid, items, total,
               sheetTotal, klopt: sheetTotal == null ? null : Math.abs(sheetTotal - total) < 0.02 };
    }));
    const months = parsed.filter(Boolean).sort((a, b) => (a.key < b.key ? -1 : 1));
    if (!months.length) return res.status(500).json({ error: "Geen maand-tabbladen gevonden in de sheet." });

    const names = [...new Set(months.flatMap((m) => Object.keys(m.items)))].sort((a, b) => a.localeCompare(b));

    // Metorik: omzet + advertentiekosten per maand (alle shops samen).
    const revenue = {}, ads = {};
    try {
      const start = months[0].key + "-01";
      const end = new Date().toISOString().slice(0, 10);
      const per = await Promise.all(SHOPS.map(async ([, envKey]) => {
        const token = process.env[envKey];
        if (!token) return [{}, {}];
        const [rev, ad] = await Promise.all([
          monthlyRevenue(token, start, end).catch(() => ({})),
          monthlyAds(token, start, end).catch(() => ({})),
        ]);
        return [rev, ad];
      }));
      per.forEach(([rev, ad]) => {
        Object.entries(rev).forEach(([k, v]) => { revenue[k] = (revenue[k] || 0) + v; });
        Object.entries(ad).forEach(([k, v]) => { ads[k] = (ads[k] || 0) + v; });
      });
    } catch (e) { /* optioneel */ }

    const out = { months, names, revenue, ads, sheetId: SHEET_ID, tabs: tabs.length, updated: new Date().toISOString() };
    cache = out; cacheAt = now;
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || "Kosten ophalen mislukt" });
  }
};
