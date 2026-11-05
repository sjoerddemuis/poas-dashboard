/* ===== Beweging (motion.js) =====
 * Overgenomen uit de Lex-app (Motion-blok + CSS "beweging") en aangepast aan dit dashboard.
 * Zonder library: WAAPI (element.animate). Geen optellende getallen meer: getallen staan meteen goed.
 *
 * Wat beweegt er:
 *   - binnenkomen   → bij openen/wisselen van tabblad of als er "laden…" stond: blokken en de eerste rijen
 *                      glijden kort na elkaar in beeld
 *   - uitklappen    → <details>, panelen die verschijnen, het product-detail bij Te verzenden, menu's en
 *                      vensters openen soepel (hoogte + inhoud die na elkaar in beeld komt) en klappen netjes dicht
 *   - verschuiven   → bij sorteren/filteren glijden rijen naar hun nieuwe plek (FLIP), een verdwenen rij schuift weg
 *   - tab-pil       → één pil achter de actieve knop die via clip-path meeschuift
 *   - stil          → tijdens typen in een zoekveld, of bij "minder beweging"
 * Generiek: elke innerHTML-wissel binnen een tabblad (#sec-…) wordt onderschept (vóór en ná meten), dus bestaande
 * render-code hoeft niet aangepast te worden; index.html roept alleen Motion.shown(sec) aan.
 */
(function () {
  "use strict";
  if (window.Motion || !window.Element || !Element.prototype.animate) return;

  var REDUCE = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";       // binnenkomen, uitklappen
  var EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";   // verschuiven
  var MOVE_MS = 300;
  var forceOff = false, quietDepth = 0;
  function off() { return forceOff || REDUCE.matches; }
  function now() { return performance.now(); }

  /* ---------- CSS ---------- */
  var LOADERS = ".knloading,.tloading,.rloading,.svloading,.adloading,.rvloading,.kloading,.floading,.dloading,.ploading,.vzload,.m-loading";
  function each(sel, suffix) { return sel.split(",").map(function (s) { return s + suffix; }).join(","); }
  var CSS = ""
    + ":root{--ease-out:cubic-bezier(0.23,1,0.32,1);--ease-in-out:cubic-bezier(0.77,0,0.175,1)}"
    /* tab-pil: één element achter de knoppen, clip-path schuift naar de actieve */
    + ".m-ind{position:absolute;inset:0;z-index:0;pointer-events:none;clip-path:inset(0 100% 0 0);transition:clip-path 260ms var(--ease-in-out),opacity 150ms ease}"
    + ".m-has-ind>button,.m-has-ind>.navgroup>.navtop{position:relative;z-index:1}"
    + ".m-has-ind>button{transition:color 200ms ease,background-color 150ms ease,border-color 150ms ease,transform 160ms var(--ease-out)}"
    + ".m-has-ind>button.on{background:transparent!important;background-image:none!important;border-color:transparent!important;box-shadow:none!important}"
    + "#secnav.m-has-ind .navgroup .navtop{transition:color 200ms ease,background-color 150ms ease,box-shadow 150ms ease,transform 160ms var(--ease-out)}"
    + "#secnav.m-has-ind .navgroup.hasactive .navtop{background:transparent!important;background-image:none!important;border-color:transparent!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}"
    /* knoppen veren in bij klikken */
    + "button:active:not(:disabled),.btn:active{transform:scale(.97)}"
    + "button,.btn{transition-property:transform,background-color,color,border-color,box-shadow,opacity;transition-duration:160ms,150ms,150ms,150ms,150ms,150ms;transition-timing-function:var(--ease-out),ease,ease,ease,ease,ease}"
    /* uitklapmenu's in de navigatie: uit de knop tevoorschijn */
    + ".navgroup.open .navmenu{transform-origin:top left;animation:m-menu 200ms var(--ease-out)}"
    + "@keyframes m-menu{from{opacity:0;transform:translateY(-6px) scale(.97)}}"
    + ".navcar{transition:transform 200ms var(--ease-out)}"
    /* bolletjes die ploppen */
    + ".vzchip b{display:inline-block}"
    /* verdwijnende rij + oplichten */
    + ".m-ghost{position:absolute;z-index:60;pointer-events:none;overflow:hidden;border-radius:10px;background:rgba(255,255,255,.94);box-shadow:0 8px 24px rgba(31,38,35,.12)}"
    + ".m-ghost table{border-collapse:collapse}"
    + ".m-glow{position:absolute;z-index:5;pointer-events:none;border-radius:8px;background:rgba(1,181,45,.16)}"
    /* laadbalkje dat glanst (alleen transform) */
    + each(LOADERS, "{position:relative;overflow:hidden}").replace(/,/g, "")
    + each(LOADERS, "::after") + "{content:\"\";display:block;width:min(220px,60%);height:6px;margin:14px auto 0;border-radius:999px;background:rgba(60,60,67,.10)}"
    + each(LOADERS, "::before") + "{content:\"\";position:absolute;inset:0;pointer-events:none;background:linear-gradient(100deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.75) 50%,rgba(255,255,255,0) 70%);transform:translateX(-100%);animation:m-sheen 1.3s linear infinite}"
    + "@keyframes m-sheen{to{transform:translateX(100%)}}"
    /* minder beweging: alles meteen op zijn plek */
    + "@media (prefers-reduced-motion:reduce){.m-ind{transition:none}button:active,.btn:active{transform:none}.navgroup.open .navmenu{animation:none}"
    + each(LOADERS, "::before") + "{animation:none;display:none}}"
    + "html.m-reduce .m-ind{transition:none}html.m-reduce button:active,html.m-reduce .btn:active{transform:none}html.m-reduce .navgroup.open .navmenu{animation:none}"
    + each(LOADERS.split(",").map(function (s) { return "html.m-reduce " + s; }).join(","), "::before") + "{animation:none;display:none}";
  function injectCss() {
    if (document.getElementById("motion-css")) return;
    var st = document.createElement("style");
    st.id = "motion-css";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  injectCss();

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
  function expandList(el, out, depth) {
    var kids = el.children ? [].slice.call(el.children) : [];
    if (kids.length >= 2 && kids.length <= 10 && kids.filter(cardLike).length >= Math.max(2, kids.length - 1)) kids.forEach(function (k) { out.push(k); });
    else if (!depth && el.id && !/^sec-/.test(el.id) && !el.classList.contains("m-has-ind") && kids.length >= 2 && kids.length <= 12 && el.tagName === "DIV") kids.forEach(function (k) { expandList(k, out, 1); });
    else out.push(el);
  }
  function blocksOf(root) {
    if (!root) return [];
    var kids = [].slice.call(root.children);
    if (kids.length === 1 && kids[0].tagName === "DIV" && !cardLike(kids[0]) && kids[0].children.length >= 2 && !kids[0].querySelector(":scope > table")) kids = [].slice.call(kids[0].children);
    return kids;
  }
  function entering(el) { return el.getAnimations().some(function (a) { return a.id === "m-enter" && a.playState !== "finished"; }); }
  function rowsIn(el, startDelay, max) {
    var j = 0;
    el.querySelectorAll("tbody > tr").forEach(function (tr) {
      if (j >= max || !tr.getClientRects().length) return;
      anim(tr, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
        { duration: 300, delay: startDelay + j * 28, easing: EASE_OUT, fill: "backwards" }, "m-enter");
      j++;
    });
    return j;
  }
  function enter(blocks) {
    if (off()) return;
    var list = [], i = 0, rowsLeft = 14;
    blocks.forEach(function (b) { if (b) expandList(b, list); });
    list.forEach(function (el) {
      if (!el || el.tagName === "STYLE" || el.tagName === "SCRIPT" || el.classList.contains("m-ind") || !visible(el) || entering(el)) return;
      var delay = Math.min(i++, 7) * 40;
      anim(el, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
        { duration: 340, delay: delay, easing: EASE_OUT, fill: "backwards" }, "m-enter");
      if (rowsLeft > 0) rowsLeft -= rowsIn(el, delay + 60, rowsLeft);
      // balkjes (voortgang, verdeling) groeien mee vanaf links
      el.querySelectorAll(".ct > .cf, .rvibar > i, .rvdbar > i").forEach(function (bar) {
        if (getComputedStyle(bar).display === "inline") return;
        bar.style.transformOrigin = "left center";
        anim(bar, [{ transform: "scaleX(0)" }, { transform: "none" }], { duration: 700, delay: delay + 80, easing: EASE_OUT, fill: "backwards" }, "m-enter");
      });
    });
  }

  /* ---------- 2. uitklappen en dichtklappen ---------- */
  // Hoogte (met padding/marge) van 0 naar echt, inhoud glijdt er kort na elkaar in. Tijd groeit iets mee met de hoogte.
  function boxOf(el) {
    var cs = getComputedStyle(el);
    return { h: el.offsetHeight, pt: cs.paddingTop, pb: cs.paddingBottom, mt: cs.marginTop, mb: cs.marginBottom };
  }
  function durFor(h) { return Math.round(Math.min(420, 240 + h * 0.18)); }
  function clipDuring(el, a) {
    var prev = el.style.overflow;
    el.style.overflow = "hidden";
    if (a) a.addEventListener("finish", function () { el.style.overflow = prev; });
    if (a) a.addEventListener("cancel", function () { el.style.overflow = prev; });
  }
  function contentIn(el, delay) {
    var kids = [].slice.call(el.querySelectorAll("tbody > tr")).slice(0, 12);
    if (!kids.length) kids = [].slice.call(el.children).slice(0, 8);
    kids.forEach(function (k, j) {
      if (!k.getClientRects().length) return;
      anim(k, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
        { duration: 280, delay: delay + j * 28, easing: EASE_OUT, fill: "backwards" }, "m-enter");
    });
  }
  function expand(el) {
    if (off() || !visible(el)) return null;
    var b = boxOf(el);
    if (b.h < 8) return null;
    var d = durFor(b.h);
    var a = anim(el, [
      { height: "0px", paddingTop: "0px", paddingBottom: "0px", marginTop: "0px", marginBottom: "0px", opacity: 0 },
      { height: b.h + "px", paddingTop: b.pt, paddingBottom: b.pb, marginTop: b.mt, marginBottom: b.mb, opacity: 1 }
    ], { duration: d, easing: EASE_OUT }, "m-expand");
    clipDuring(el, a);
    contentIn(el, 60);
    return a;
  }
  function collapse(el, done) {
    if (off() || !visible(el)) { if (done) done(); return null; }
    var b = boxOf(el);
    var a = anim(el, [
      { height: b.h + "px", paddingTop: b.pt, paddingBottom: b.pb, marginTop: b.mt, marginBottom: b.mb, opacity: 1 },
      { height: "0px", paddingTop: "0px", paddingBottom: "0px", marginTop: "0px", marginBottom: "0px", opacity: 0 }
    ], { duration: Math.round(durFor(b.h) * 0.8), easing: EASE_OUT, fill: "forwards" }, "m-collapse");
    clipDuring(el, a);
    if (!a) { if (done) done(); return null; }
    a.addEventListener("finish", function () { if (done) done(); a.cancel(); });
    return a;
  }

  // <details>: klik op de samenvatting klapt soepel open of dicht
  document.addEventListener("click", function (e) {
    var s = e.target && e.target.closest ? e.target.closest("summary") : null;
    if (!s || off() || e.defaultPrevented) return;
    var d = s.parentElement;
    if (!d || d.tagName !== "DETAILS" || !secOf(d) || d.__mBusy) return;
    e.preventDefault();
    var from = d.offsetHeight, to;
    d.__mBusy = true;
    if (!d.open) {
      d.open = true;
      to = d.offsetHeight;
      var a = anim(d, [{ height: from + "px" }, { height: to + "px" }], { duration: durFor(to - from), easing: EASE_OUT }, "m-expand");
      clipDuring(d, a);
      [].forEach.call(d.children, function (c) { if (c !== s) contentIn(c, 40); });
      if (a) a.addEventListener("finish", function () { d.__mBusy = false; }); else d.__mBusy = false;
    } else {
      d.open = false; to = d.offsetHeight; d.open = true;   // dichte hoogte meten
      var c = anim(d, [{ height: from + "px" }, { height: to + "px" }], { duration: Math.round(durFor(from - to) * 0.8), easing: EASE_OUT }, "m-collapse");
      clipDuring(d, c);
      if (c) c.addEventListener("finish", function () { d.open = false; d.__mBusy = false; }); else { d.open = false; d.__mBusy = false; }
    }
  }, true);

  // Panelen die verschijnen (display: none → zichtbaar) en vensters (modal) die openen
  function isModal(el) { return el.classList && (el.classList.contains("modal") || el.classList.contains("omodal")); }
  function modalIn(m) {
    if (off()) return;
    anim(m, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT }, "m-modal");
    var p = m.querySelector(".panel, .opanel, [class*='panel']") || m.firstElementChild;
    if (p) anim(p, [{ opacity: 0, transform: "translateY(10px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: EASE_OUT }, "m-modal");
  }
  var shownState = new WeakMap();
  new MutationObserver(function (muts) {
    if (off()) return;
    var seen = new Set();
    muts.forEach(function (m) {
      var t = m.target;
      if (!t || t.nodeType !== 1 || seen.has(t)) return;
      if (isModal(t)) {
        var vis = getComputedStyle(t).display !== "none";
        if (vis && !shownState.get(t)) { seen.add(t); modalIn(t); }
        shownState.set(t, vis);
        return;
      }
      if (m.attributeName !== "style" || !/display:\s*none/.test(m.oldValue || "") || (t.style && t.style.display === "none")) return;
      if (/^sec-/.test(t.id || "") || t.id === "app" || t.tagName === "BUTTON" || t.tagName === "A" || !secOf(t) || typing()) return;
      if (!visible(t) || t.offsetHeight < 40) return;
      seen.add(t);
      expand(t);
    });
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["style", "class"] });

  /* ---------- 3. bolletjes die ploppen ---------- */
  var POP_SEL = ".vzchip b, .m-pop", lastPop = new Map();
  function pops(root, sec, quiet) {
    if (!sec) return;
    [].forEach.call(root.querySelectorAll(POP_SEL), function (el, i) {
      var host = el.closest("[data-k]"), k = sec.id + "|pop|" + (host ? host.getAttribute("data-k") : i);
      var v = (el.textContent || "").trim(), was = lastPop.get(k);
      lastPop.set(k, v);
      if (quiet || off() || was === undefined || was === v || !visible(el)) return;
      pop(el);
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

  /* ---------- 5. tabbladen: één pil die via clip-path naar het actieve tabblad schuift ---------- */
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
    if (off() || typing() || quietDepth) snap.mode = "still";
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
    if (!s.vis || s.mode === "still") { pops(root, s.sec, true); pills(root, false); return; }
    if (s.same && s.anims && s.anims.length) restoreAnims(root, s.anims);
    else if (s.mode === "enter") enter(blocksOf(root));
    else if (s.mode === "flip" && s.rows) flip(root, s.rows);
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
  // Opnieuw tekenen zonder eigen beweging (de aanroeper animeert zelf, bijv. uitklappen)
  function quiet(fn) { quietDepth++; try { fn(); } finally { quietDepth--; } }

  /* ---------- tabblad geopend / gewisseld (aangeroepen vanuit activate) ---------- */
  var firstShow = true;
  var pendingSec = null, waitMO = null;
  function shown(sec) {
    var el = document.getElementById("sec-" + sec);
    if (!el) return;
    if (!visible(el)) {                       // app nog verborgen (bijv. vóór het inloggen): zodra hij zichtbaar wordt alsnog
      pendingSec = sec;
      if (!waitMO && document.body) {
        waitMO = new MutationObserver(function () {
          var p = pendingSec && document.getElementById("sec-" + pendingSec);
          if (p && visible(p)) { var s = pendingSec; pendingSec = null; waitMO.disconnect(); waitMO = null; shown(s); }
        });
        waitMO.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
      }
      return;
    }
    pendingSec = null;
    var first = firstShow;
    firstShow = false;
    enterUntil.set(el.id, now() + 1500);
    navPill(!first);
    queueMicrotask(function () {
      if (off()) { pills(el, false); return; }
      var blocks = blocksOf(el);
      if (first) blocks = [document.querySelector(".hd"), document.getElementById("secnav")].concat(blocks);
      enter(blocks);
      pops(el, el, true);
      pills(el, false);
    });
    // nog geen layout (bijv. vlak na laden of in een smal/verborgen venster): pil na de eerste frame alsnog plaatsen
    requestAnimationFrame(function () { navPill(false); pills(el, false); });
  }
  window.addEventListener("load", function () { navPill(false); });

  function reduce(on) { forceOff = !!on; document.documentElement.classList.toggle("m-reduce", forceOff); }
  if (REDUCE.addEventListener) REDUCE.addEventListener("change", function () { document.documentElement.classList.toggle("m-reduce", off()); });

  window.Motion = { shown: shown, enter: enter, blocksOf: blocksOf, expand: expand, collapse: collapse, quiet: quiet,
    flip: flip, pop: pop, pills: pills, reduce: reduce, off: off, measure: measureRows };
})();
