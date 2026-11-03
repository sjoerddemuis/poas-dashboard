/* ===== Te verzenden — open orders van alle shops per SKU =====
 * Data: /api/stock?view=toship  (open orders, bundels al uitgesplitst naar losse SKU's)
 * Ververst automatisch elke 5 minuten zolang dit tabblad open staat.
 */
(function () {
  var SHOPS = ["NL", "DE", "FR", "EU"];
  var SHOPNAME = { NL: "Ongediertewinkel.nl", DE: "Ungeziefershop.de", FR: "Boutiqueantinuisibles.fr", EU: "Ronada.eu" };
  var REFRESH_MS = 5 * 60 * 1000;
  var D = null, loadedAt = 0, loading = false, built = false, timer = null;
  var st = { q: "", sort: "total", dir: -1, open: null, off: {} };
  try { st.off = JSON.parse(localStorage.getItem("vz_off") || "{}") || {}; } catch (e) { st.off = {}; }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function n0(v) { return (Number(v) || 0).toLocaleString("nl-NL"); }
  function tip(t) { return window.qtip ? window.qtip(t) : ""; }
  function el(id) { return document.getElementById(id); }
  function visible() { var s = el("sec-verzend"); return s && s.style.display !== "none" && document.visibilityState === "visible"; }
  function dmy(d) { if (!d) return "—"; var p = d.split("-"); return p[2] + "-" + p[1]; }
  function daysAgo(d) { if (!d) return null; return Math.max(0, Math.floor((Date.now() - new Date(d + "T12:00:00").getTime()) / 86400000)); }

  var CSS = ""
    + "#sec-verzend .vzbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 12px;margin-bottom:14px;border-radius:14px;background:rgba(255,255,255,.42);-webkit-backdrop-filter:var(--g-blur);backdrop-filter:var(--g-blur);border:var(--g-border);box-shadow:0 4px 18px rgba(31,38,35,.06),inset 0 1px 0 rgba(255,255,255,.9)}"
    + "#sec-verzend .vzq{flex:1 1 260px;min-width:200px;font:600 16px/1.2 var(--sans);padding:11px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.8);background:rgba(255,255,255,.7);box-shadow:inset 0 1px 2px rgba(31,38,35,.06);color:var(--ink);outline:none}"
    + "#sec-verzend .vzq:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(1,181,45,.15)}"
    + "#sec-verzend .vzchips{display:flex;flex-wrap:wrap;gap:6px}"
    + "#sec-verzend .vzchip{font:600 12px/1 var(--sans);padding:7px 10px;border-radius:999px;border:1px solid rgba(60,60,67,.14);background:rgba(255,255,255,.55);color:var(--ink);cursor:pointer;white-space:nowrap}"
    + "#sec-verzend .vzchip b{font-weight:700;margin-left:4px;color:var(--mute)}"
    + "#sec-verzend .vzchip.on{background:#1d1d1f;border-color:#1d1d1f;color:#fff}#sec-verzend .vzchip.on b{color:rgba(255,255,255,.7)}"
    + "#sec-verzend .vzsep{flex:1}"
    + "#sec-verzend .vzupd{font-size:12px;color:var(--mute);white-space:nowrap}"
    + "#sec-verzend .vzbtn{font:600 13px/1 var(--sans);padding:9px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.75);background:rgba(255,255,255,.6);cursor:pointer;color:var(--ink);white-space:nowrap}"
    + "#sec-verzend .vzbtn:hover{background:rgba(255,255,255,.85)}"
    + "#sec-verzend .vzwarn{font-size:12px;color:#C0392B;font-weight:600}"
    + "#sec-verzend .vzcards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}"
    + "#sec-verzend .vzcard{padding:14px 16px;border-radius:18px;background:var(--g-bg);-webkit-backdrop-filter:var(--g-blur);backdrop-filter:var(--g-blur);border:var(--g-border);box-shadow:var(--g-shadow)}"
    + "#sec-verzend .vzcard .l{font:600 11px/1.2 var(--sans);letter-spacing:.4px;text-transform:uppercase;color:var(--mute)}"
    + "#sec-verzend .vzcard .v{font:700 26px/1.15 var(--sans);letter-spacing:-.02em;margin-top:6px;color:var(--ink)}"
    + "#sec-verzend .vzcard .d{font-size:12px;color:var(--mute);margin-top:2px}"
    + "#sec-verzend .vzpanel{border-radius:18px;overflow:hidden;background:var(--g-bg);-webkit-backdrop-filter:var(--g-blur);backdrop-filter:var(--g-blur);border:var(--g-border);box-shadow:var(--g-shadow)}"
    + "#sec-verzend .vzscroll{overflow-x:auto}"
    + "#sec-verzend table{width:100%;border-collapse:collapse;font-size:14px}"
    + "#sec-verzend th{font:600 11px/1 var(--sans);text-transform:uppercase;letter-spacing:.4px;color:var(--mute);text-align:right;padding:12px 14px;border-bottom:1px solid var(--line);cursor:pointer;user-select:none;white-space:nowrap;background:rgba(255,255,255,.28)}"
    + "#sec-verzend th:first-child{text-align:left}"
    + "#sec-verzend th.on{color:var(--ink)}"
    + "#sec-verzend td{padding:10px 14px;border-bottom:1px solid var(--line);text-align:right;font-variant-numeric:tabular-nums;vertical-align:middle}"
    + "#sec-verzend td:first-child{text-align:left}"
    + "#sec-verzend tr.vzrow{cursor:pointer}#sec-verzend tr.vzrow:hover{background:rgba(255,255,255,.45)}"
    + "#sec-verzend tr.vzrow.open{background:rgba(1,181,45,.07)}"
    + "#sec-verzend .sku{font:700 14px/1.2 var(--sans);color:var(--ink)}"
    + "#sec-verzend .nm{font-size:12.5px;color:var(--mute);margin-top:2px;max-width:520px}"
    + "#sec-verzend .z{color:rgba(60,60,67,.3)}"
    + "#sec-verzend td.tot{font-weight:800;font-size:16px;color:var(--ink)}"
    + "#sec-verzend tr.vzdet td{background:rgba(255,255,255,.35);padding:4px 14px 12px}"
    + "#sec-verzend .vzol{width:100%;border-collapse:collapse;font-size:13px}"
    + "#sec-verzend .vzol td{border-bottom:1px dashed rgba(60,60,67,.12);padding:6px 8px;text-align:left}"
    + "#sec-verzend .vzol td.r{text-align:right;font-weight:700}"
    + "#sec-verzend .vzst{display:inline-block;font:600 11px/1 var(--sans);padding:4px 8px;border-radius:999px;background:rgba(60,60,67,.08)}"
    + "#sec-verzend .vzst.out-of-stock{background:rgba(255,109,44,.16);color:#b84a14}"
    + "#sec-verzend .vzst.on-hold,#sec-verzend .vzst.send-later{background:rgba(10,108,203,.12);color:#0A5AA8}"
    + "#sec-verzend .vzempty{padding:28px;text-align:center;color:var(--mute)}"
    + "#sec-verzend .vzload{padding:28px;text-align:center;color:var(--mute)}"
    + "@media (max-width:760px){#sec-verzend .vzcards{grid-template-columns:repeat(2,minmax(0,1fr))}#sec-verzend td,#sec-verzend th{padding:9px 8px}#sec-verzend .nm{max-width:none}#sec-verzend .vzq{font-size:17px}}";

  function build() {
    if (built) return;
    var s = el("sec-verzend"); if (!s) return;
    if (!el("vz-css")) { var c = document.createElement("style"); c.id = "vz-css"; c.textContent = CSS; document.head.appendChild(c); }
    s.innerHTML = ""
      + '<div class="vzbar">'
      + '<input id="vzq" class="vzq" type="search" inputmode="search" autocomplete="off" placeholder="Zoek SKU of product…">'
      + '<div class="vzchips" id="vzchips"></div>'
      + '<span class="vzsep"></span>'
      + '<span class="vzwarn" id="vzwarn"></span>'
      + '<span class="vzupd" id="vzupd"></span>'
      + '<button class="vzbtn" id="vzcsv" type="button">CSV</button>'
      + '<button class="vzbtn" id="vzref" type="button">↻ Ververs</button>'
      + tip("Alle openstaande orders van Ongediertewinkel.nl, Ungeziefershop.de, Boutiqueantinuisibles.fr en Ronada.eu, per SKU opgeteld.\nTelt mee: In behandeling, In de wacht, Niet op voorraad, Later verzenden, Orderverwerking 1 en 2. Klik een status uit om hem niet mee te tellen.\nBundels zijn uitgesplitst naar de losse producten erin; de bundel zelf telt niet.\nBron: Metorik. Ververst automatisch elke 5 minuten (Metorik loopt 1–2 minuten achter op de shop).\nKlik op een regel om de orders te zien.")
      + '</div>'
      + '<div class="vzcards" id="vzcards"></div>'
      + '<div class="vzpanel"><div class="vzscroll" id="vztbl"><div class="vzload">Open orders laden…</div></div></div>';
    built = true;
    var q = el("vzq");
    q.addEventListener("input", function () { st.q = q.value.trim(); st.open = null; render(); });
    q.addEventListener("keydown", function (e) { if (e.key === "Escape") { q.value = ""; st.q = ""; render(); } });
    el("vzref").addEventListener("click", function () { load(true); });
    el("vzcsv").addEventListener("click", csv);
    el("vztbl").addEventListener("click", function (e) {
      var th = e.target.closest && e.target.closest("th[data-k]");
      if (th) { var k = th.getAttribute("data-k"); if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = k === "sku" ? 1 : -1; } render(); return; }
      var tr = e.target.closest && e.target.closest("tr.vzrow");
      if (tr) { var key = tr.getAttribute("data-sku"); st.open = st.open === key ? null : key; render(); }
    });
    el("vzchips").addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".vzchip"); if (!b) return;
      var k = b.getAttribute("data-k");
      if (st.off[k]) delete st.off[k]; else st.off[k] = 1;
      try { localStorage.setItem("vz_off", JSON.stringify(st.off)); } catch (x) {}
      render();
    });
  }

  function load(fresh) {
    if (loading) return;
    loading = true;
    var u = el("vzupd"); if (u) u.textContent = "laden…";
    fetch("/api/stock?view=toship" + (fresh ? "&fresh=1" : "") + "&_=" + Date.now(), { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { if (r.status === 401) throw new Error("Niet ingelogd — log opnieuw in."); return r.json(); })
      .then(function (j) {
        if (!j || !j.lines) throw new Error((j && j.error) || "Ophalen mislukt");
        D = j; loadedAt = Date.now(); render();
      })
      .catch(function (e) {
        var t = el("vztbl"); if (t && !D) t.innerHTML = '<div class="vzempty">' + esc(e.message || "Ophalen mislukt") + "</div>";
        var w = el("vzwarn"); if (w) w.textContent = "⚠ " + (e.message || "Ophalen mislukt");
      })
      .then(function () { loading = false; stamp(); });
  }

  function stamp() {
    var u = el("vzupd"); if (!u) return;
    if (!D) { u.textContent = ""; return; }
    var t = new Date(D.updated);
    u.textContent = "bijgewerkt " + t.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) + (D.stale ? " (oud)" : "");
  }

  // Aggregeer op SKU met de actieve statussen.
  function aggregate() {
    var by = {}, orders = {}, oldest = null, perStatus = {};
    D.lines.forEach(function (l) {
      var shop = l[0], num = l[1], status = l[2], date = l[3], sku = l[4], name = l[5], qty = l[6];
      perStatus[status] = (perStatus[status] || 0) + qty;
      if (st.off[status]) return;
      var r = by[sku];
      if (!r) r = by[sku] = { sku: sku, name: name, total: 0, s: { NL: 0, DE: 0, FR: 0, EU: 0 }, o: [] };
      if (shop === "NL" || !r.name) r.name = name;
      r.s[shop] = (r.s[shop] || 0) + qty;
      r.total += qty;
      r.o.push(l);
      orders[shop + "#" + num] = 1;
      if (date && (!oldest || date < oldest)) oldest = date;
    });
    return { rows: Object.keys(by).map(function (k) { return by[k]; }), orders: Object.keys(orders).length, oldest: oldest, perStatus: perStatus };
  }

  function match(r, q) {
    if (!q) return true;
    var ql = q.toLowerCase();
    return r.sku.toLowerCase().indexOf(ql) >= 0 || r.name.toLowerCase().indexOf(ql) >= 0;
  }

  function sortRows(rows) {
    var k = st.sort, d = st.dir, q = st.q.toLowerCase();
    rows.sort(function (a, b) {
      if (q) { var ea = a.sku.toLowerCase() === q ? 1 : 0, eb = b.sku.toLowerCase() === q ? 1 : 0; if (ea !== eb) return eb - ea; }
      var va, vb;
      if (k === "sku") { return d * a.sku.localeCompare(b.sku, "nl", { numeric: true }); }
      if (k === "total") { va = a.total; vb = b.total; } else { va = a.s[k] || 0; vb = b.s[k] || 0; }
      if (va !== vb) return d * (va - vb);
      return a.sku.localeCompare(b.sku, "nl", { numeric: true });
    });
    return rows;
  }

  function render() {
    build();
    if (!D) return;
    var A = aggregate();
    // statuschips
    el("vzchips").innerHTML = D.statuses.map(function (s) {
      var n = A.perStatus[s.key] || 0;
      return '<button type="button" class="vzchip ' + (st.off[s.key] ? "" : "on") + '" data-k="' + esc(s.key) + '">' + esc(s.label) + "<b>" + n0(n) + "</b></button>";
    }).join("");
    var errs = (D.shops || []).filter(function (s) { return s.error; }).map(function (s) { return s.code; });
    el("vzwarn").textContent = errs.length ? "⚠ " + errs.join(", ") + " niet geladen" : "";
    stamp();

    var rows = sortRows(A.rows.filter(function (r) { return match(r, st.q); }));
    var units = rows.reduce(function (a, r) { return a + r.total; }, 0);
    var od = daysAgo(A.oldest);
    var ordCount = st.q ? Object.keys(rows.reduce(function (m, r) { r.o.forEach(function (l) { m[l[0] + "#" + l[1]] = 1; }); return m; }, {})).length : A.orders;
    el("vzcards").innerHTML = ""
      + '<div class="vzcard"><div class="l">Te verzenden</div><div class="v">' + n0(units) + '</div><div class="d">stuks</div></div>'
      + '<div class="vzcard"><div class="l">Open orders</div><div class="v">' + n0(ordCount) + '</div><div class="d">' + (D.shops || []).map(function (s) { return s.code + " " + n0(s.orders); }).join(" · ") + "</div></div>"
      + '<div class="vzcard"><div class="l">Producten</div><div class="v">' + n0(rows.length) + '</div><div class="d">SKU\'s</div></div>'
      + '<div class="vzcard"><div class="l">Oudste order' + tip("Datum van de oudste openstaande order (met de statussen die nu aan staan).") + '</div><div class="v">' + (A.oldest ? dmy(A.oldest) : "—") + '</div><div class="d">' + (od == null ? "" : od === 0 ? "vandaag" : od + " dagen geleden") + "</div></div>";

    var cols = [["sku", "Product"]].concat(SHOPS.map(function (c) { return [c, c]; })).concat([["total", "Totaal"]]);
    var head = "<tr>" + cols.map(function (c) {
      var on = st.sort === c[0];
      return '<th data-k="' + c[0] + '" class="' + (on ? "on" : "") + '" title="' + esc(SHOPNAME[c[0]] || "") + '">' + esc(c[1]) + (on ? (st.dir < 0 ? " ↓" : " ↑") : "") + "</th>";
    }).join("") + "</tr>";
    if (!rows.length) {
      el("vztbl").innerHTML = "<table><thead>" + head + '</thead></table><div class="vzempty">' + (st.q ? "Geen open orders met “" + esc(st.q) + "”." : "Geen openstaande orders.") + "</div>";
      return;
    }
    var autoOpen = rows.length === 1 ? rows[0].sku : null;
    var body = rows.map(function (r) {
      var open = st.open === r.sku || autoOpen === r.sku;
      var tr = '<tr class="vzrow' + (open ? " open" : "") + '" data-sku="' + esc(r.sku) + '"><td><div class="sku">' + esc(r.sku) + '</div><div class="nm">' + esc(r.name) + "</div></td>"
        + SHOPS.map(function (c) { var v = r.s[c] || 0; return "<td>" + (v ? n0(v) : '<span class="z">–</span>') + "</td>"; }).join("")
        + '<td class="tot">' + n0(r.total) + "</td></tr>";
      if (open) {
        var ol = r.o.slice().sort(function (a, b) { return a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0; });
        var lbl = {}; D.statuses.forEach(function (s) { lbl[s.key] = s.label; });
        tr += '<tr class="vzdet"><td colspan="' + cols.length + '"><table class="vzol">' + ol.map(function (l) {
          return "<tr><td>" + esc(l[0]) + "</td><td>#" + esc(l[1]) + '</td><td><span class="vzst ' + esc(l[2]) + '">' + esc(lbl[l[2]] || l[2]) + "</span></td><td>" + esc(dmy(l[3])) + '</td><td class="r">' + n0(l[6]) + " st.</td></tr>";
        }).join("") + "</table></td></tr>";
      }
      return tr;
    }).join("");
    var foot = '<tr><td><b>Totaal</b></td>' + SHOPS.map(function (c) { return "<td><b>" + n0(rows.reduce(function (a, r) { return a + (r.s[c] || 0); }, 0)) + "</b></td>"; }).join("") + '<td class="tot">' + n0(units) + "</td></tr>";
    el("vztbl").innerHTML = "<table><thead>" + head + "</thead><tbody>" + body + "</tbody><tfoot>" + foot + "</tfoot></table>";
  }

  function csv() {
    if (!D) return;
    var A = aggregate();
    var rows = sortRows(A.rows.filter(function (r) { return match(r, st.q); }));
    var lines = [["SKU", "Product"].concat(SHOPS).concat(["Totaal"]).join(";")];
    rows.forEach(function (r) {
      lines.push([r.sku, '"' + r.name.replace(/"/g, '""') + '"'].concat(SHOPS.map(function (c) { return r.s[c] || 0; })).concat([r.total]).join(";"));
    });
    var blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "te-verzenden-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function tick() { if (visible() && Date.now() - loadedAt >= REFRESH_MS) load(false); }

  window.__verzendLoad = function () {
    build();
    if (!D || Date.now() - loadedAt >= REFRESH_MS) load(false); else render();
    if (!timer) {
      timer = setInterval(tick, 30000);
      document.addEventListener("visibilitychange", tick);
    }
    setTimeout(function () { var q = el("vzq"); if (q && window.matchMedia && window.matchMedia("(min-width: 761px)").matches) q.focus(); }, 50);
  };
})();
