// Haalt een prijs uit de HTML van een (gestructureerde) productpagina.
// Werkt op WooCommerce/Open Graph/JSON-LD-prijzen; niet op JS-only sites.
function normNum(s) {
  s = String(s).trim();
  if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.indexOf(",") > -1) s = s.replace(",", ".");
  const v = parseFloat(s);
  return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}
function parsePrice(html) {
  if (!html) return null;
  const tries = [
    /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([0-9.,]+)["']/i,
    /<meta[^>]+content=["']([0-9.,]+)["'][^>]+property=["']product:price:amount["']/i,
    /<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([0-9.,]+)["']/i,
    /<meta[^>]+itemprop=["']price["'][^>]+content=["']([0-9.,]+)["']/i,
    /"price"\s*:\s*"([0-9]+[.,][0-9]{2})"/i,
    /"price"\s*:\s*([0-9]+\.[0-9]{2})\b/i,
  ];
  for (const re of tries) {
    const m = html.match(re);
    if (m) { const n = normNum(m[1]); if (n != null) return n; }
  }
  return null;
}
async function scrapePrice(url) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OW-Prijsmonitor/1.0)", "Accept": "text/html,application/xhtml+xml" },
      redirect: "follow", signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!r.ok) return { price: null, error: "HTTP " + r.status };
    const html = await r.text();
    const price = parsePrice(html);
    return price != null ? { price } : { price: null, error: "geen prijs gevonden in pagina" };
  } catch (e) {
    return { price: null, error: (e && e.name === "AbortError") ? "time-out" : (e.message || "kon pagina niet ophalen") };
  }
}
module.exports = { scrapePrice, parsePrice, normNum };
