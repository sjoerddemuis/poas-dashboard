/* ===== Beweging (motion.js) =====
 * Overgenomen uit de Lex-app (Motion-blok + CSS "beweging") en aangepast aan dit dashboard.
 * Zonder library: WAAPI (element.animate) voor binnenkomen/verschuiven, één requestAnimationFrame-lus
 * voor optellende getallen. Alleen transform en opacity (plus clip-path voor de tab-pil).
 *
 * Generiek: elke innerHTML-wissel binnen een tabblad (#sec-…) wordt onderschept. Vlak vóór de wissel
 * meten we de rijen, vlak erna (microtask, vóór de volgende paint) kiezen we:
 *   - binnenkomen   → bij openen/wisselen van tabblad of als er "laden…" stond (nieuwe data)
 *   - verschuiven   → bij klikken/verversen: rijen glijden naar hun nieuwe plek (FLIP), getallen tellen
 *   - stil          → tijdens typen in een zoekveld, of bij "minder beweging"
 * Zelfde HTML opnieuw gezet (bijv. na opslaan zonder zichtbare wijziging): lopende animaties lopen door.
 * Bestaande render-code hoeft dus niet aangepast te worden; index.html roept alleen Motion.shown(sec) aan.
 */
(function () {
  "use strict";
  if (window.Motion || !window.Element || !Element.prototype.animate) return;

  var REDUCE = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";       // binnenkomen
  var EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";   // verschuiven
  var MOVE_MS = 300;
  var forceOff = false;
  function off() { return forceOff || REDUCE.matches; }
  function now() { return performance.now(); }

  /* ---------- CSS ---------- */
  var LOADERS = ".knloading,.tloading,.rloading,.svloading,.adloading,.rvloading,.kloading,.floading,.dloading,.ploading,.vzload,.m-loading";
  var CSS = ""
    + ":root{--ease-out:cubic-bezier(0.23,1,0.32,1);--ease-in-out:cubic-bezier(0.77,0,0.175,1)}"
    /* tab-pil: één element achter de knoppen, clip-path schuift naar de actieve */
    + ".m-ind{position:absolute;inset:0;z-index:0;pointer-events:none;clip-path:inset(0 100% 0 0);transition:clip-path 260ms var(--ease-in-out),opacity 150ms ease}"
    + ".m-has-ind>button,.m-has-ind>.navgroup>.navtop{position:relative;z-index:1}"
    + ".m-has-ind>button{transition:color 200ms ease,background-color 150ms ease,border-color 150ms ease,transform 160ms var(--ease-out)}"
    + ".m-has-ind>button.on{background:transparent!important;background-image:none!important;border-color:transparent!important;box-shadow:none!important}"
    + "#secnav.m-has-ind .navgroup .navtop{transition:color 200ms ease,background-color 150ms ease,box-shadow 150ms ease,transform 160ms var(--ease-out)}"
    + "#secnav.m-has-ind .navgroup.hasactive .navtop{background:transparent!important;background-image:none!important;border-color:transparent!important;box-shadow:none!important}"
    /* knoppen veren in bij klikken */
    + "button:active:not(:disabled),.btn:active{transform:scale(.97)}"
    + "button,.btn{transition-property:transform,background-color,color,border-color,box-shadow,opacity;transition-duration:160ms,150ms,150ms,150ms,150ms,150ms;transition-timing-function:var(--ease-out),ease,ease,ease,ease,ease}"
    /* bolletjes die ploppen */
    + ".vzchip b{display:inline-block}"
    + ".m-num{font-variant-numeric:tabular-nums}"
    /* verdwijnende rij + oplichten */
    + ".m-ghost{position:absolute;z-index:60;pointer-events:none;overflow:hidden;border-radius:10px;background:rgba(255,255,255,.94);box-shadow:0 8px 24px rgba(31,38,35,.12)}"
    + ".m-ghost table{border-collapse:collapse}"
    + ".m-glow{position:absolute;z-index:5;pointer-events:none;border-radius:8px;background:rgba(1,181,45,.16)}"
    /* laadbalkje dat glanst (alleen transform) */
    + LOADERS.split(",").map(function (s) { return s + "{position:relative;overflow:hidden}"; }).join("")
    + LOADERS.split(",").map(function (s) { return s + "::after"; }).join(",") + "{content:\"\";display:block;width:min(220px,60%);height:6px;margin:14px auto 0;border-radius:999px;background:rgba(60,60,67,.10)}"
    + LOADERS.split(",").map(function (s) { return s + "::before"; }).join(",") + "{content:\"\";position:absolute;inset:0;pointer-events:none;background:linear-gradient(100deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.75) 50%,rgba(255,255,255,0) 70%);transform:translateX(-100%);animation:m-sheen 1.3s linear infinite}"
    + "@keyframes m-sheen{to{transform:translateX(100%)}}"
    /* minder beweging: alles meteen op zijn plek */
    + "@media (prefers-reduced-motion:reduce){.m-ind{transition:none}button:active,.btn:active{transform:none}"
    + LOADERS.split(",").map(function (s) { return s + "::before"; }).join(",") + "{animation:none;display:none}}"
    + "html.m-reduce .m-ind{transition:none}html.m-reduce button:active,html.m-reduce .btn:active{transform:none}"
    + LOADERS.split(",").map(function (s) { return "html.m-reduce " + s + "::before"; }).join(",") + "{animation:none;display:none}";
  function injectCss() {
    if (document.getElementById("motion-css")) return;
    var st = document.createElement("style");
    st.id = "motion-css";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  injectCss();

  /* ---------- easing voor de getallen-lus ---------- */
  function bezier(x1, y1, x2, y2) {
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    function sx(t) { return ((ax * t + bx) * t + cx) * t; }
    function sy(t) { return ((ay * t + by) * t + cy) * t; }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 28; i++) {
        var v = sx(t);
        if (Math.abs(v - x) < 1e-5) break;
        if (v < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return sy(t);
    };
  }
  var easeOut = bezier(0.23, 1, 0.32, 1);

  /* ---------- wat doet de gebruiker? ---------- */
  var typeAt = 0, enterUntil = new Map();
  function isText(t) {
    if (!t) return false;
    if (t.tagName === "TEXTAREA" || t.isContentEditable) return true;
    return t.tagName === "INPUT" && /^(text|search|number|email|tel|url|)$/i.test(t.getAttribute("type") || "text");
  }
  function secOf(el) { return el && el.closest ? el.closest('[id^="sec-"]') : null; }
  document.addEventListener("input", function (e) { if (isText(e.target)) typeAt = now(); }, true);
  document.addEventListener("keydown", function (e) {
    if (isText(e.target) && (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete")) typeAt = now();
  }, true);
  function typing() { return now() - typeAt < 700; }
  function visible(el) { return !!(el && el.isConnected && el.getClientRects().length); }

  function anim(el, kf, opts, id) {
    try { var a = el.animate(kf, opts); a.id = id; return a; } catch (e) { return null; }
  }

  /* ---------- 1. binnenkomen ---------- */
  function cardLike(el) { var c = typeof el.className === "string" ? el.className : ""; return /card|(^|\s)pc(\s|$)/.test(c); }
  // Een rij kaarten komt kaart voor kaart binnen; een inhoudsvak (div met id) per onderdeel.
  function expand(el, out, depth) {
    var kids = el.children ? [].slice.call(el.children) : [];
    if (kids.length >= 2 && kids.length <= 10 && kids.filter(cardLike).length >= Math.max(2, kids.length - 1)) kids.forEach(function (k) { out.push(k); });
    else if (!depth && el.id && !/^sec-/.test(el.id) && !el.classList.contains("m-has-ind") && kids.length >= 2 && kids.length <= 12 && el.tagName === "DIV") kids.forEach(function (k) { expand(k, out, 1); });
    else out.push(el);
  }
  function blocksOf(root) {
    if (!root) return [];
    var kids = [].slice.call(root.children);
    if (kids.length === 1 && kids[0].tagName === "DIV" && !cardLike(kids[0]) && kids[0].children.length >= 2 && !kids[0].querySelector(":scope > table")) kids = [].slice.call(kids[0].children);
    return kids;
  }
  function entering(el) { return el.getAnimations().some(function (a) { return a.id === "m-enter" && a.playState !== "finished"; }); }
  function enter(blocks) {
    if (off()) return;
    var list = [], i = 0, rowsLeft = 14;
    blocks.forEach(function (b) { if (b) expand(b, list); });
    list.forEach(function (el) {
      if (!el || el.tagName === "STYLE" || el.tagName === "SCRIPT" || el.classList.contains("m-ind") || !visible(el) || entering(el)) return;
      var delay = Math.min(i++, 7) * 40;
      anim(el, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
        { duration: 300, delay: delay, easing: EASE_OUT, fill: "backwards" }, "m-enter");
      el.querySelectorAll("tbody > tr").forEach(function (tr) {
        if (rowsLeft <= 0 || !tr.getClientRects().length) return;
        var j = 14 - rowsLeft--;
        anim(tr, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
          { duration: 280, delay: delay + 60 + j * 30, easing: EASE_OUT, fill: "backwards" }, "m-enter");
      });
      // balkjes (voortgang, verdeling) groeien mee vanaf links
      el.querySelectorAll(".ct > .cf, .rvibar > i, .rvdbar > i").forEach(function (bar) {
        if (getComputedStyle(bar).display === "inline") return;
        bar.style.transformOrigin = "left center";
        anim(bar, [{ transform: "scaleX(0)" }, { transform: "none" }], { duration: 700, delay: delay + 80, easing: EASE_OUT, fill: "backwards" }, "m-enter");
      });
    });
  }

  /* ---------- 2. optellende getallen ---------- */
  var NUM_SEL = '.now .big, .pc > .v, [class*="card"] > .v, [class*="card"] > .big, .kncard .knval, .dcard .dc-val';
  var last = new Map(), lastGroup = new Map(), shownKeys = new Set(), running = new Map(), raf = 0;
  function numEls(root) {
    var out = [].slice.call(root.querySelectorAll(NUM_SEL));
    if (root.matches && root.matches(NUM_SEL)) out.push(root);
    var up = root.parentElement && root.parentElement.closest ? root.parentElement.closest(NUM_SEL) : null;
    if (up) out.push(up);
    return out;
  }
  function labelOf(el) {
    var card = el.parentElement, kids = card ? card.children : [];
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c === el || c.contains(el)) continue;
      var t = (c.textContent || "").replace(/\?/g, "").replace(/\s+/g, " ").trim();
      if (t) return t.slice(0, 40);
    }
    return "";
  }
  function numNode(el) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) if (/\d/.test(n.nodeValue)) return n;
    return null;
  }
  var TOK = /[-−]?\d[\d.]*(?:,\d+)?/;
  function parse(el) {
    var toks = (el.textContent || "").match(/[-−]?\d[\d.]*(?:,\d+)?/g) || [];
    if (toks.length !== 1) return null;                 // datums, tijden (2u 54m), "x / y": niet tellen
    var node = numNode(el); if (!node) return null;
    var m = node.nodeValue.match(TOK); if (!m) return null;
    var tok = m[0], neg = /^[-−]/.test(tok), body = tok.replace(/^[-−]/, "");
    var parts = body.split(","), ip = parts[0], dp = parts[1] || "";
    if (/\./.test(ip) && !/^\d{1,3}(\.\d{3})+$/.test(ip)) return null;
    var v = parseFloat(ip.replace(/\./g, "") + (dp ? "." + dp : ""));
    if (!isFinite(v)) return null;
    return { node: node, pre: node.nodeValue.slice(0, m.index), post: node.nodeValue.slice(m.index + tok.length),
      v: neg ? -v : v, dec: dp.length, group: ip.indexOf(".") >= 0, minus: tok.charAt(0) === "−" ? "−" : "-" };
  }
  function fmt(p, v) {
    var a = Math.abs(v), lim = 0.5 * Math.pow(10, -p.dec);
    var s = a.toLocaleString("nl-NL", { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec, useGrouping: p.group });
    return (v < 0 && a >= lim ? p.minus : "") + s;
  }
  function write(p, v) { if (p.node.isConnected) p.node.nodeValue = p.pre + fmt(p, v) + p.post; }
  function count(root, sec, enterMode, instant) {
    if (!root || !sec) return;
    var occ = new Map();
    numEls(root).forEach(function (el) {
      var k = sec.id + "|" + labelOf(el), n = occ.get(k) || 0;
      occ.set(k, n + 1);
      if (n) k += "#" + n;
      var p = parse(el); if (!p) return;
      var to = p.v, run = running.get(k), vis = visible(el);
      if (run && run.to === to && !instant) { run.p = p; write(p, run.value); return; } // loopt al: verder op het nieuwe element
      var from;
      if (run) from = run.value;
      else if (enterMode && !shownKeys.has(k)) from = 0;
      else if (last.has(k)) from = last.get(k);
      else from = to;
      last.set(k, to);
      if (vis) shownKeys.add(k);
      if (lastGroup.get(k)) p.group = true;
      lastGroup.set(k, p.group);
      if (instant || off() || !vis || from === to) { running.delete(k); return; } // tekst staat al goed
      var small = Math.abs(to - from) <= Math.max(2 * Math.pow(10, -p.dec), Math.abs(to) * 0.02);
      write(p, from);
      running.set(k, { p: p, from: from, to: to, value: from, t0: now(), dur: small ? 300 : 800 });
    });
    if (running.size && !raf) raf = requestAnimationFrame(step);
  }
  function step(t) {
    raf = 0;
    running.forEach(function (r, k) {
      var x = Math.min(1, (t - r.t0) / r.dur);
      r.value = r.from + (r.to - r.from) * easeOut(x);
      write(r.p, x >= 1 ? r.to : r.value);
      if (x >= 1) running.delete(k);
    });
    if (running.size) raf = requestAnimationFrame(step);
  }

  /* ---------- 5. bolletjes die ploppen ---------- */
  var POP_SEL = ".vzchip b, .m-pop", lastPop = new Map();
  function pops(root, sec, quiet) {
    if (!sec) return;
    var els = [].slice.call(root.querySelectorAll(POP_SEL));
    els.forEach(function (el, i) {
      var host = el.closest("[data-k]"), k = sec.id + "|pop|" + (host ? host.getAttribute("data-k") : i);
      var v = (el.textContent || "").trim(), was = lastPop.get(k);
      lastPop.set(k, v);
      if (quiet || off() || was === undefined || was === v || !visible(el)) return;
      anim(el, [{ transform: "scale(.85)", opacity: 0.4 }, { transform: "scale(1.12)", opacity: 1, offset: 0.55 }, { transform: "none", opacity: 1 }],
        { duration: 320, easing: EASE_OUT }, "m-pop");
    });
  }
  function pop(el) {
    if (off() || !el || !visible(el)) return;
    anim(el, [{ transform: "scale(.85)", opacity: 0.4 }, { transform: "scale(1.12)", opacity: 1, offset: 0.55 }, { transform: "none", opacity: 1 }],
      { duration: 320, easing: EASE_OUT }, "m-pop");
  }

  /* ---------- 4. lijsten: rijen glijden naar hun nieuwe plek (FLIP) ---------- */
  function rowKey(tr) {
    var d = tr.dataset || {};
    var k = d.key || d.sku || d.k || d.id;
    if (k) return String(k);
    if (tr.classList.contains("vzdet") && tr.previousElementSibling) return "det:" + rowKey(tr.previousElementSibling);
    var c = tr.cells && tr.cells[0];
    return ((c ? c.textContent : tr.textContent) || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }
  // In welk vak (welke tabel van het tabblad) staat de rij? Op volgorde, niet op koptekst (die verandert bij sorteren).
  function tableKey(tr) {
    var t = tr.closest("table"), s = secOf(tr);
    if (!t || !s || t.parentElement.closest("table")) return "";
    return String([].indexOf.call(s.querySelectorAll("table"), t));
  }
  function measureRows(root) {
    var m = new Map(), occ = new Map(), H = innerHeight;
    root.querySelectorAll("tbody > tr").forEach(function (tr) {
      if (m.size > 160) return;
      var r = tr.getBoundingClientRect();
      if (!r.height) return;
      var k = rowKey(tr), n = occ.get(k) || 0;
      occ.set(k, n + 1);
      if (n) k += "#" + n;
      if (r.bottom < -200 || r.top > H + 200) return;           // buiten beeld: niet nodig
      m.set(k, { el: tr, rect: r, table: tableKey(tr), widths: [].map.call(tr.children, function (td) { return td.getBoundingClientRect().width; }) });
    });
    return m;
  }
  function flip(root, before) {
    if (off() || !before) return;
    var seen = new Set(), occ = new Map(), fresh = 0, H = innerHeight;
    root.querySelectorAll("tbody > tr").forEach(function (tr) {
      var k = rowKey(tr), n = occ.get(k) || 0;
      occ.set(k, n + 1);
      if (n) k += "#" + n;
      var b = before.get(k);
      if (b) seen.add(k);
      var r = tr.getBoundingClientRect();
      if (!r.height || r.bottom < -100 || r.top > H + 100) return;
      if (!b) {
        anim(tr, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
          { duration: 260, delay: Math.min(fresh++, 10) * 25, easing: EASE_OUT, fill: "backwards" }, "m-new");
        return;
      }
      var dy = b.rect.top - r.top;
      if (Math.abs(dy) > 0.5 && Math.abs(dy) < H * 1.5)
        anim(tr, [{ transform: "translateY(" + dy + "px)" }, { transform: "none" }], { duration: MOVE_MS, easing: EASE_IN_OUT }, "m-move");
      if (b.table && b.table !== tableKey(tr)) glow(tr);          // in een ander vak beland: licht even op
    });
    var gone = [];
    before.forEach(function (b, k) { if (!seen.has(k)) gone.push(b); });
    if (gone.length && gone.length <= 6) gone.forEach(ghost);
  }
  function glow(tr) {
    var r = tr.getBoundingClientRect(), g = document.createElement("div");
    g.className = "m-glow";
    g.style.cssText = "left:" + (r.left + scrollX) + "px;top:" + (r.top + scrollY) + "px;width:" + r.width + "px;height:" + r.height + "px";
    document.body.appendChild(g);
    var a = anim(g, [{ opacity: 1 }, { opacity: 0 }], { duration: 1200, delay: MOVE_MS - 60, easing: EASE_OUT, fill: "backwards" }, "m-glow");
    if (a) a.onfinish = function () { g.remove(); }; else g.remove();
  }
  // Een rij die verdwijnt schuift naar rechts weg (kopie boven de pagina, de echte rij is al weg)
  function ghost(b) {
    var r = b.rect, table = b.el.closest("table");
    if (!table || r.bottom < 0 || r.top > innerHeight) return;
    var g = document.createElement("div");
    g.className = "m-ghost";
    g.style.cssText = "left:" + (r.left + scrollX) + "px;top:" + (r.top + scrollY) + "px;width:" + r.width + "px;height:" + r.height + "px";
    var t = document.createElement("table");
    t.className = table.className;
    t.style.width = r.width + "px";
    var tb = document.createElement("tbody");
    var clone = b.el.cloneNode(true);
    clone.querySelectorAll("[id]").forEach(function (x) { x.removeAttribute("id"); });
    if (b.widths) [].forEach.call(clone.children, function (td, i) { td.style.width = b.widths[i] + "px"; td.style.background = "transparent"; });
    tb.appendChild(clone); t.appendChild(tb); g.appendChild(t);
    document.body.appendChild(g);
    var a = anim(g, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(40px) scale(.97)" }],
      { duration: 320, easing: EASE_OUT, fill: "forwards" }, "m-ghost");
    if (a) a.onfinish = function () { g.remove(); }; else g.remove();
  }

  /* ---------- 3. tabbladen: één pil die via clip-path naar het actieve tabblad schuift ---------- */
  var SEG_SEL = '[class*="seg"], [class*="preset"], #tabs', lastClip = new Map();
  function segActive(c) {
    if (c.id === "secnav") return c.querySelector(".navgroup.hasactive > .navtop") || null;
    var btns = [].filter.call(c.children, function (x) { return x.tagName === "BUTTON"; });
    if (btns.length < 2) return undefined;
    var on = btns.filter(function (b) { return b.classList.contains("on"); });
    if (on.length > 1) return undefined;                         // meerkeuze (bijv. statusknoppen): geen pil
    return on[0] || null;
  }
  function pillKey(c) {
    if (c.id) return c.id;
    var s = secOf(c);
    return (s ? s.id : "") + "|" + (c.className || "") + "|" + [].map.call(c.querySelectorAll(":scope > button"), function (b) { return b.textContent.trim(); }).join("/");
  }
  function px(v) { return Math.round(v * 10) / 10 + "px"; }
  function pill(c, animate) {
    var act = segActive(c);
    if (act === undefined) return;
    var ind = c.__mInd;
    if (!ind || ind.parentNode !== c) {
      if (!act || !visible(act)) return;
      var cs = getComputedStyle(act);
      ind = document.createElement("span");
      ind.className = "m-ind";
      ind.setAttribute("aria-hidden", "true");
      ind.style.backgroundColor = cs.backgroundColor;
      if (cs.backgroundImage && cs.backgroundImage !== "none") ind.style.backgroundImage = cs.backgroundImage;
      c.__mRad = parseFloat(cs.borderTopLeftRadius) || 0;
      if (getComputedStyle(c).position === "static") c.style.position = "relative";
      c.insertBefore(ind, c.firstChild);
      c.__mInd = ind;
      c.classList.add("m-has-ind");
      if (window.ResizeObserver && !c.__mRO) { c.__mRO = new ResizeObserver(function () { pill(c, false); }); c.__mRO.observe(c); }
      var prev = lastClip.get(pillKey(c));                        // opnieuw getekende balk: vanaf de oude plek
      if (prev) { setClip(ind, prev, false); animate = true; } else animate = false;
    }
    if (!act || !visible(act)) { ind.style.opacity = "0"; return; }
    ind.style.opacity = "";
    // layout-posities (offset*), zodat een indrukkende knop (scale) of een binnenkomend blok de meting niet verstoort
    var L = 0, T = 0, e = act;
    while (e && e !== c) { L += e.offsetLeft; T += e.offsetTop; e = e.offsetParent; }
    if (e !== c || !ind.offsetWidth || !act.offsetWidth) return;
    var l = L - ind.offsetLeft, t = T - ind.offsetTop;
    var clip = "inset(" + px(t) + " " + px(ind.offsetWidth - l - act.offsetWidth) + " " + px(ind.offsetHeight - t - act.offsetHeight) + " " + px(l) + " round " + c.__mRad + "px)";
    lastClip.set(pillKey(c), clip);
    setClip(ind, clip, animate && !off());
  }
  function setClip(ind, clip, animate) {
    if (ind.style.clipPath === clip) return;
    if (!animate) { ind.style.transition = "none"; ind.style.clipPath = clip; ind.getBoundingClientRect(); ind.style.transition = ""; return; }
    ind.style.clipPath = clip;
  }
  function pills(root, animate) {
    var scope = root || document, list = [].slice.call(scope.querySelectorAll(SEG_SEL));
    if (root && root.matches && root.matches(SEG_SEL)) list.push(root);
    var up = root && root.parentElement && root.parentElement.closest ? root.parentElement.closest(SEG_SEL) : null;
    if (up) list.push(up);
    list.forEach(function (c) { if (!c.classList.contains("m-ind")) pill(c, animate); });
  }
  function navPill(animate) { var n = document.getElementById("secnav"); if (n) pill(n, animate); }
  // actieve knop gewisseld (klik of code) → pil schuift mee
  var pillQ = new Set(), pillQueued = false;
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      var t = m.target;
      if (t.tagName === "BUTTON" && t.parentElement && t.parentElement.__mInd) pillQ.add(t.parentElement);
      else if (t.classList && t.classList.contains("navgroup")) pillQ.add(document.getElementById("secnav"));
    });
    if (pillQ.size && !pillQueued) {
      pillQueued = true;
      queueMicrotask(function () { pillQueued = false; pillQ.forEach(function (c) { if (c) pill(c, true); }); pillQ.clear(); });
    }
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["class"] });

  /* ---------- zelfde HTML opnieuw: lopende animaties niet afbreken ---------- */
  function pathOf(el, root) {
    var p = [];
    while (el && el !== root) { var par = el.parentElement; if (!par) return null; p.unshift([].indexOf.call(par.children, el)); el = par; }
    return el === root ? p : null;
  }
  function byPath(root, p) { var el = root; for (var i = 0; i < p.length && el; i++) el = el.children[p[i]]; return el || null; }
  function saveAnims(root) {
    var out = [];
    root.getAnimations({ subtree: true }).forEach(function (a) {
      if (!a.id || a.id.slice(0, 2) !== "m-" || a.playState === "finished") return;
      var t = a.effect && a.effect.target, p = t && pathOf(t, root);
      if (p) out.push({ p: p, kf: a.effect.getKeyframes(), timing: a.effect.getTiming(), ct: a.currentTime, id: a.id });
    });
    return out;
  }
  function restoreAnims(root, list) {
    list.forEach(function (x) {
      var el = byPath(root, x.p); if (!el) return;
      var a = anim(el, x.kf, x.timing, x.id);
      if (a && x.ct != null) a.currentTime = x.ct;
    });
  }

  /* ---------- de onderschepping: innerHTML binnen een tabblad ---------- */
  var pending = new Map(), queued = false;
  function wasLoading(root) {
    var t = (root.textContent || "").replace(/\s+/g, " ").trim();
    if (!root.firstElementChild && !t) return true;
    if (t.length < 200 && /laden|ophalen|bezig|loading/i.test(t)) return true;
    return t.length < 400 && !!root.querySelector(LOADERS + ',[class*="loading"]');
  }
  function before(root, html) {
    var sec = secOf(root);
    if (!sec || root.closest(".leaflet-container")) return null;
    var nested = null;
    pending.forEach(function (s, r) { if (r !== root && r.contains(root)) nested = r; });
    if (nested || pending.has(root)) return null;                 // de buitenste wissel regelt het
    var snap = { sec: sec, same: root.__mHTML === html, vis: visible(sec), mode: "still", rows: null, anims: null };
    // binnenste wissels die al klaarstonden opgaan in deze
    pending.forEach(function (s, r) { if (root.contains(r)) { if (s.rows && !snap.rows) snap.rows = s.rows; pending.delete(r); } });
    root.__mHTML = html;
    if (!snap.vis) return snap;
    var t = now();
    if (off() || typing()) snap.mode = "still";
    else if ((enterUntil.get(sec.id) || 0) > t || wasLoading(root)) snap.mode = "enter";
    else snap.mode = "flip";
    if (snap.mode === "flip" && !snap.same) {
      var m = measureRows(root);
      if (snap.rows) snap.rows.forEach(function (v, k) { m.set(k, v); });
      snap.rows = m;
    }
    if (snap.same) snap.anims = saveAnims(root);
    return snap;
  }
  function after(root, s) {
    if (!root.isConnected) return;
    if (!s.vis || s.mode === "still") { count(root, s.sec, false, true); pops(root, s.sec, true); pills(root, false); return; }
    if (s.same && s.anims && s.anims.length) restoreAnims(root, s.anims);
    else if (s.mode === "enter") enter(blocksOf(root));
    else if (s.mode === "flip" && s.rows) flip(root, s.rows);
    count(root, s.sec, s.mode === "enter", false);
    pops(root, s.sec, s.mode === "enter");
    pills(root, false);
  }
  function flush() {
    queued = false;
    var items = [];
    pending.forEach(function (s, r) { items.push([r, s]); });
    pending.clear();
    items.forEach(function (it) { try { after(it[0], it[1]); } catch (e) { if (window.console) console.warn("motion", e); } });
  }
  var desc = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  if (desc && desc.set && desc.configurable) {
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: true,
      enumerable: desc.enumerable,
      get: function () { return desc.get.call(this); },
      set: function (v) {
        var snap = null;
        if (this.isConnected) { try { snap = before(this, String(v)); } catch (e) { snap = null; } }
        desc.set.call(this, v);
        if (snap) { pending.set(this, snap); if (!queued) { queued = true; queueMicrotask(flush); } }
      },
    });
  }

  /* ---------- tabblad geopend / gewisseld (aangeroepen vanuit activate) ---------- */
  var firstShow = true;
  function shown(sec) {
    var el = document.getElementById("sec-" + sec);
    if (!el) return;
    var first = firstShow;
    firstShow = false;
    enterUntil.set(el.id, now() + 1500);
    navPill(!first);
    queueMicrotask(function () {
      if (off()) { count(el, el, false, true); pills(el, false); return; }
      var blocks = blocksOf(el);
      if (first) blocks = [document.querySelector(".hd"), document.getElementById("secnav")].concat(blocks);
      enter(blocks);
      count(el, el, true, false);
      pops(el, el, true);
      pills(el, false);
    });
    // nog geen layout (bijv. vlak na laden of in een smal/verborgen venster): pil na de eerste frame alsnog plaatsen
    requestAnimationFrame(function () { navPill(false); pills(el, false); });
  }
  window.addEventListener("load", function () { navPill(false); });

  function reduce(on) { forceOff = !!on; document.documentElement.classList.toggle("m-reduce", forceOff); }
  if (REDUCE.addEventListener) REDUCE.addEventListener("change", function () { document.documentElement.classList.toggle("m-reduce", off()); });

  window.Motion = { shown: shown, enter: enter, blocksOf: blocksOf, count: count, flip: flip, pop: pop, pills: pills, reduce: reduce, off: off,
    measure: measureRows };
})();
