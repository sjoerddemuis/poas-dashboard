// Gedeelde auth-helpers: JWT (HMAC), wachtwoord-hashing (scrypt), cookies.
// Geen externe deps — alleen Node's ingebouwde crypto.
const crypto = require("crypto");
const SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
const MAXAGE = 60 * 60 * 24 * 30; // 30 dagen

function b64url(s) { return Buffer.from(s).toString("base64url"); }

function signToken(payload, maxAgeSec = MAXAGE) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + maxAgeSec };
  const data = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })) + "." + b64url(JSON.stringify(body));
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return data + "." + sig;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const data = parts[0] + "." + parts[1];
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(parts[2]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch (e) { return null; }
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64);
  return salt.toString("hex") + ":" + hash.toString("hex");
}

function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [s, h] = stored.split(":");
  const hash = crypto.scryptSync(String(pw), Buffer.from(s, "hex"), 64);
  const hb = Buffer.from(h, "hex");
  return hash.length === hb.length && crypto.timingSafeEqual(hash, hb);
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((c) => {
    const i = c.indexOf("=");
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

function getSession(req) { return verifyToken(parseCookies(req).session); }

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAXAGE}`);
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

module.exports = { signToken, verifyToken, hashPassword, verifyPassword, parseCookies, getSession, setSessionCookie, clearSessionCookie, readBody };
