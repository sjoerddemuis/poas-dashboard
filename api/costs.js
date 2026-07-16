// Verkoopkosten uit de Google Sheet (publiek leesbaar, één tabblad per maand).
// Leest elk maand-tabblad via de gviz CSV-export — geen API-key nodig.
// Koppelt er de Metorik-maandomzet aan voor 'kosten als % van omzet'. 10 min cache.
const { getSession } = require("./_lib/util");
const { monthlyRevenue, SHOPS } = require("./_lib/metorik");

const SHEET_ID = process.env.COSTS_SHEET_ID || "18FeLVzTooORCph_DY4qAZ2khqFHqQbYhn4v_KLUcgTY";
const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const MLABEL = ["Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli", "Augustus", "September", "Oktober", "November", "December"];
let cache = null, cacheAt = 0;
const TTL = 10 * 60 * 1000;

// Minimale CSV-parser (gviz levert komma-gescheiden met quotes).
function csvRows(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); cell = ""; rows.push(row); row = []; }
    else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
// "€1.748,06" -> 1748.06 ; "" -> null
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
// Jaar bepalen: staat het in de tabnaam, dan die. Anders: maand die nog moet komen = vorig jaar.
function yearFor(monthNum, tabName) {
  const m = String(tabName).match(/(20\d{2})/);
  if (m) return +m[1];
  const now = new Date();
  const cy = now.getFullYear(), cm = now.getMonth() + 1;
  return monthNum > cm ? cy - 1 : cy;
}
async function fetchTab(name) {
  const u = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(name);
  try {
    const r = await fetch(u, { redirect: "follow" });
    if (!r.ok) return null;
    const t = await r.text();
    if (!t || /^\s*</.test(t)) return null;   // HTML = foutpagina / tab bestaat niet
    return t;
  } catch (e) { return null; }
}
function parseTab(text) {
  const items = {};
  csvRows(text).forEach((r) => {
    const naam = String(r[0] || "").trim();
    if (!naam) return;                         // lege naam = totaalregel, die rekenen we zelf
    if (/^totaal|^total$/i.test(naam)) return;
    const v = amount(r[1]);
    items[naam] = v == null ? 0 : v;
  });
  return items;
}

module.exports = async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: "unauthorized" });
  const now = Date.now();
  if (cache && now - cacheAt < TTL && !(req.query && req.query.fresh)) return res.json(cache);

  try {
    // 1) Alle maand-tabbladen ophalen (bestaat 'ie niet, dan null).
    const tabs = await Promise.all(MONTHS.map(async (m, i) => {
      const txt = await fetchTab(MLABEL[i]);
      if (!txt) return null;
      const items = parseTab(txt);
      if (!Object.keys(items).length) return null;
      const y = yearFor(i + 1, MLABEL[i]);
      return { key: y + "-" + String(i + 1).padStart(2, "0"), label: MLABEL[i] + " " + y, items };
    }));
    const months = tabs.filter(Boolean).sort((a, b) => (a.key < b.key ? -1 : 1));
    if (!months.length) return res.status(500).json({ error: "Geen maand-tabbladen gevonden in de sheet. Staat de sheet op 'iedereen met de link kan lezen'?" });

    // 2) Alle kostenposten samenvoegen over alle maanden (ontbreekt = 0).
    const names = [...new Set(months.flatMap((m) => Object.keys(m.items)))].sort((a, b) => a.localeCompare(b));
    months.forEach((m) => { m.total = Object.values(m.items).reduce((s, v) => s + v, 0); });

    // 3) Metorik-omzet per maand (alle shops samen) voor 'kosten als % van omzet'.
    const revenue = {};
    try {
      const start = months[0].key + "-01";
      const end = new Date().toISOString().slice(0, 10);
      const per = await Promise.all(SHOPS.map(async ([, envKey]) => {
        const token = process.env[envKey];
        if (!token) return {};
        try { return await monthlyRevenue(token, start, end); } catch (e) { return {}; }
      }));
      per.forEach((map) => Object.entries(map).forEach(([k, v]) => { revenue[k] = (revenue[k] || 0) + v; }));
    } catch (e) { /* omzet is optioneel */ }

    const out = { months, names, revenue, sheetId: SHEET_ID, updated: new Date().toISOString() };
    cache = out; cacheAt = now;
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || "Kosten ophalen mislukt" });
  }
};
