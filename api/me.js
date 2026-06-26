const { getSession } = require("./_lib/util");
module.exports = (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });
  res.json({ email: s.email, role: s.role });
};
