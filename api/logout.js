const { clearSessionCookie } = require("./_lib/util");
module.exports = (req, res) => { clearSessionCookie(res); res.json({ ok: true }); };
