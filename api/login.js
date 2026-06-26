const { signToken, setSessionCookie, verifyPassword, readBody } = require("./_lib/util");
const { getUser } = require("./_lib/store");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  const body = await readBody(req);
  const email = String(body.email || "").toLowerCase().trim();
  const pw = String(body.password || "");
  if (!email || !pw) return res.status(400).json({ error: "Vul e-mail en wachtwoord in." });

  // Admin via env vars (altijd geldig, geen KV nodig)
  const adminEmail = String(process.env.ADMIN_EMAIL || "").toLowerCase();
  if (adminEmail && email === adminEmail && pw === process.env.ADMIN_PASSWORD) {
    setSessionCookie(res, signToken({ email, role: "admin" }));
    return res.json({ ok: true, role: "admin" });
  }
  // Uitgenodigde gebruikers via KV
  try {
    const u = await getUser(email);
    if (u && verifyPassword(pw, u.password)) {
      setSessionCookie(res, signToken({ email, role: u.role || "viewer" }));
      return res.json({ ok: true, role: u.role || "viewer" });
    }
  } catch (e) { /* val terug op onjuist */ }
  return res.status(401).json({ error: "Onjuiste inloggegevens." });
};
