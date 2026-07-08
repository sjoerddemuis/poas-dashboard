// Haalt een prijs uit de HTML van een (gestructureerde) productpagina.
// Werkt op WooCommerce/Open Graph/JSON-LD-prijzen; niet op JS-only sites.
function normNum(s) {
  s = String(s).trim();
  if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.indexOf(",") > -1) s = s.replace(",", ".");
  const v = parseFloat(s);
  return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}
// Doorzoekt JSON-LD (schema.org Product/Offer) recursief naar een prijs.
function priceFromJsonLd(html) {
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of blocks) {
    const raw = b.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    let data; try { data = JSON.parse(raw); } catch (e) { continue; }
    const stack = [data];
    while (stack.length) {
      const node = stack.pop();
      if (node == null) continue;
      if (Array.isArray(node)) { node.forEach((x) => stack.push(x)); continue; }
      if (typeof node === "object") {
        // offers.price of price direct
        for (const key of ["price", "lowPrice", "highPrice"]) {
          if (node[key] != null && (typeof node[key] === "string" || typeof node[key] === "number")) {
            const n = normNum(node[key]); if (n != null) return n;
          }
        }
        Object.values(node).forEach((v) => { if (v && typeof v === "object") stack.push(v); });
      }
    }
  }
  return null;
}
function parsePrice(html) {
  if (!html) return null;
  // 1) JSON-LD is het betrouwbaarst.
  const ld = priceFromJsonLd(html); if (ld != null) return ld;
  // 2) Meta-tags / microdata / veelvoorkomende JSON-velden.
  const tries = [
    /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([0-9.,]+)["']/i,
    /<meta[^>]+content=["']([0-9.,]+)["'][^>]+property=["']product:price:amount["']/i,
    /<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([0-9.,]+)["']/i,
    /<meta[^>]+itemprop=["']price["'][^>]+content=["']([0-9.,]+)["']/i,
    /<[^>]+itemprop=["']price["'][^>]+content=["']([0-9.,]+)["']/i,
    /"price(?:_amount)?"\s*:\s*"([0-9]+[.,][0-9]{2})"/i,
    /"price(?:_amount)?"\s*:\s*([0-9]+\.[0-9]{2})\b/i,
    /data-product-price=["']([0-9.,]+)["']/i,
  ];
  for (const re of tries) {
    const m = html.match(re);
    if (m) { const n = normNum(m[1]); if (n != null) return n; }
  }
  // 3) WooCommerce / zichtbare prijs-elementen (neem de eerste, dat is meestal de actieprijs).
  const el = html.match(/class=["'][^"']*(?:woocommerce-Price-amount|price)[^"']*["'][^>]*>[\s\S]{0,80}?(?:&euro;|€|EUR)\s*([0-9]+(?:[.,][0-9]{2})?)/i)
    || html.match(/(?:&euro;|€|EUR)\s*([0-9]+[.,][0-9]{2})/i);
  if (el) { const n = normNum(el[1]); if (n != null) return n; }
  return null;
}
async function scrapePrice(url) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8" },
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
