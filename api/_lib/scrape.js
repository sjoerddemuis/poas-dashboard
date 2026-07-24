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
function decodeEntities(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
}
// Productnaam uit JSON-LD (name), anders og:title, anders <title>.
function parseTitle(html) {
  if (!html) return "";
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
        const t = String(node["@type"] || "");
        if (/product/i.test(t) && typeof node.name === "string" && node.name.trim()) return decodeEntities(node.name);
        Object.values(node).forEach((v) => { if (v && typeof v === "object") stack.push(v); });
      }
    }
  }
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og) return decodeEntities(og[1]);
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) { let s = decodeEntities(t[1]); s = s.split(/\s[|–—-]\s/)[0].trim() || s; return s; }
  return "";
}
// Zo browser-achtig mogelijke headers om eenvoudige bot-blokkades (403) te omzeilen.
function browserHeaders(url) {
  let ref = ""; try { ref = new URL(url).origin + "/"; } catch (e) {}
  const h = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
    "Upgrade-Insecure-Requests": "1",
    "sec-ch-ua": '"Chromium";v="124", "Not:A-Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
  };
  if (ref) h["Referer"] = ref;
  return h;
}
// Directe fetch (gratis). Snel, maar wordt geblokkeerd door bot-protection.
async function fetchDirect(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: browserHeaders(url), redirect: "follow", signal: ctrl.signal });
    clearTimeout(to);
    return { ok: r.ok, status: r.status, html: r.ok ? await r.text() : "" };
  } catch (e) {
    clearTimeout(to);
    return { ok: false, status: 0, html: "", err: (e && e.name === "AbortError") ? "time-out" : (e.message || "fetch-fout") };
  }
}
// Herkent een blokkade / challenge-pagina (Cloudflare, DataDome, PerimeterX, lege JS-shell).
function looksBlocked(status, html) {
  if (status === 401 || status === 403 || status === 429 || status === 503) return true;
  if (!html || html.length < 200) return true;
  return /Just a moment\.\.\.|cf-browser-verification|Checking your browser|Attention Required!|cf_chl_|challenge-platform|Enable JavaScript and cookies|px-captcha|_px|datadome|captcha-delivery|Access denied|Request unsuccessful/i.test(html);
}
// ScrapingBee: residential proxies + JS-rendering + (optioneel) stealth om bot-protection te passeren.
const BEE = "https://app.scrapingbee.com/api/v1/";
function beeConfigured() { return !!process.env.SCRAPER_API_KEY; }
async function fetchBee(url, opt) {
  const p = new URLSearchParams({ api_key: process.env.SCRAPER_API_KEY, url, render_js: "true", country_code: process.env.SCRAPER_COUNTRY || "nl", block_ads: "true" });
  if (opt && opt.stealth) p.set("stealth_proxy", "true");
  else if (opt && opt.premium) p.set("premium_proxy", "true");
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 22000);
  try {
    const r = await fetch(BEE + "?" + p.toString(), { signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) { const t = await r.text().catch(() => ""); return { ok: false, html: "", err: "scraper " + r.status + ": " + t.slice(0, 120) }; }
    return { ok: true, html: await r.text() };
  } catch (e) {
    clearTimeout(to);
    return { ok: false, html: "", err: (e && e.name === "AbortError") ? "scraper time-out" : (e.message || "scraper-fout") };
  }
}
// Haalt HTML op: eerst gratis direct; bij blokkade oplopend via de scraping-API
// (goedkoop -> duur), zodat eenvoudige sites gratis blijven en alleen zware
// bot-protection de betaalde stappen raakt.
async function getHtml(url) {
  const d = await fetchDirect(url);
  if (d.ok && d.html && !looksBlocked(d.status, d.html)) return { html: d.html, via: "direct" };
  if (!beeConfigured()) return { html: d.html || "", via: "direct", err: d.err || ("geblokkeerd (HTTP " + d.status + ")") };
  const b1 = await fetchBee(url, {});                         // JS-render (5 cr)
  if (b1.ok && b1.html && !looksBlocked(200, b1.html)) return { html: b1.html, via: "scraper-js" };
  const b2 = await fetchBee(url, { premium: true });          // residential proxy (25 cr)
  if (b2.ok && b2.html && !looksBlocked(200, b2.html)) return { html: b2.html, via: "scraper-premium" };
  if (process.env.SCRAPER_STEALTH === "1") {                  // stealth (75 cr), alleen indien aangezet
    const b3 = await fetchBee(url, { stealth: true });
    if (b3.ok && b3.html) return { html: b3.html, via: "scraper-stealth" };
  }
  return { html: b2.html || b1.html || "", via: "scraper", err: b2.err || b1.err || "scraper geblokkeerd" };
}
// Haalt prijs én productnaam op uit één URL (voor 'plak alleen een link').
async function scrapeInfo(url) {
  const g = await getHtml(url);
  if (!g.html) return { price: null, title: "", error: g.err || "kon pagina niet ophalen" };
  const price = parsePrice(g.html);
  const title = parseTitle(g.html);
  return { price, title, via: g.via, error: (price == null && !title) ? "geen prijs/naam gevonden" : null };
}
async function scrapePrice(url) {
  const g = await getHtml(url);
  if (g.html) { const price = parsePrice(g.html); if (price != null) return { price, via: g.via }; }
  return { price: null, via: g.via, error: g.err || "geen prijs gevonden in pagina" };
}
module.exports = { scrapePrice, scrapeInfo, parsePrice, parseTitle, normNum };
