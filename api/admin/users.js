// Gebruikersbeheer — alleen admin. GET=lijst, POST=toevoegen/uitnodigen, DELETE=verwijderen.
const { getSession, hashPassword, readBody } = require("../_lib/util");
const { setUser, delUser, listUsers } = require("../_lib/store");

module.exports = async (req, res) => {
  const s = getSession(req);
  if (!s || s.role !== "admin") return res.status(403).json({ error: "Alleen admin." });

  if (req.method === "GET") {
    try { return res.json({ users: await listUsers() }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }
  const body = await readBody(req);
  const email = String(body.email || "").toLowerCase().trim();

  if (req.method === "POST") {
    const pw = String(body.password || "");
    if (!email || !pw) return res.status(400).json({ error: "E-mail en wachtwoord vereist." });
    if (pw.length < 6) return res.status(400).json({ error: "Wachtwoord minimaal 6 tekens." });
    try { await setUser(email, { password: hashPassword(pw), role: "viewer", createdAt: Date.now() }); return res.json({ ok: true }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }
  if (req.method === "DELETE") {
    if (!email) return res.status(400).json({ error: "E-mail vereist." });
    try { await delUser(email); return res.json({ ok: true }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }
  res.status(405).json({ error: "method not allowed" });
};
