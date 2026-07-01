// Gedeelde instellingen (inkoop: leveranciers, leadtimes, dekking) in KV.
// GET: iedereen ingelogd. POST: iedereen ingelogd (gedeelde teaminstellingen).
// Zonder KV-koppeling degradeert dit netjes: GET geeft null, POST meldt kv:false,
// de frontend valt dan terug op localStorage.
const { getSession, readBody } = require("./_lib/util");
const { getKey, setKey } = require("./_lib/store");
const KEY = "stockcfg"; // v2: KV gekoppeld

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });

  if (req.method === "GET") {
    try { const cfg = await getKey(KEY); return res.json({ cfg: cfg || null }); }
    catch (e) { return res.json({ cfg: null }); }
  }
  if (req.method === "POST") {
    const body = await readBody(req);
    if (!body || typeof body.cfg !== "object" || body.cfg === null) return res.status(400).json({ error: "ongeldige data" });
    try { await setKey(KEY, body.cfg); return res.json({ ok: true, kv: true }); }
    catch (e) { return res.json({ ok: false, kv: false }); }
  }
  res.status(405).json({ error: "method not allowed" });
};
