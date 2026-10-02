// RayTeX website: theme, menu, the life of the page (figures that draw
// themselves, notes written in the margin, the ray), a few surprises, and
// the downloads (system detection, versions from GitHub's releases).
(() => {
  "use strict";
  const C = window.RAYTEX || { lang: "en", rel: "", texts: {}, icons: {} };
  const T = C.texts;
  const fr = (document.documentElement.lang || C.lang) === "fr";
  const L = (en, frText) => (fr ? frText : en);
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const rand = (a, b) => a + Math.random() * (b - a);
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* private mode */
      }
    },
  };

  // --------------------------------------------------------- header, menu
  const topbar = $(".topbar");
  const onScroll = () => topbar && topbar.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const menu = $("[data-menu]");
  menu?.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    menu.setAttribute("aria-expanded", String(open));
  });
  $$(".main-nav a").forEach((a) => a.addEventListener("click", () => document.body.classList.remove("menu-open")));

  // Paper by day, paper by night: the ink spreads from the button.
  $("[data-theme-toggle]")?.addEventListener("click", (e) => {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    const apply = () => {
      root.dataset.theme = next;
      store.set("raytex-theme", next);
    };
    if (!document.startViewTransition || reduced) return apply();
    const x = e.clientX || innerWidth - 60;
    const y = e.clientY || 30;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add("theme-vt");
    const vt = document.startViewTransition(apply);
    vt.ready
      .then(() =>
        root.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 650, easing: "cubic-bezier(.22,.7,.2,1)", pseudoElement: "::view-transition-new(root)" }),
      )
      .catch(() => {});
    vt.finished.catch(() => {}).finally(() => root.classList.remove("theme-vt"));
  });
  $$("[data-lang-switch]").forEach((a) => a.addEventListener("click", () => store.set("raytex-lang", a.dataset.langSwitch)));

  // ------------------------------------------------------ turning the page
  // Where the browser plays transitions between documents (site.css), it
  // shows both pages at once; the page number of the page that goes tells
  // the next one which way to turn (the script in its head). Elsewhere, a
  // link to another page of the site: the page turns over from its left
  // edge (or sinks, going back; or falls, going to the title page), then
  // the link is followed and the next page arrives ("raytex-turn").
  const root = document.documentElement;
  const here = Number(root.dataset.pageno) || 0;
  addEventListener("pageswap", (e) => {
    if (!e.viewTransition) return;
    try {
      sessionStorage.setItem("raytex-from", String(here));
    } catch {
      /* private mode */
    }
  });
  if (!reduced && !("CSSViewTransitionRule" in window)) {
    const base = new URL(C.rel || "./", location.href).pathname;
    const folioOf = (url) => {
      const path = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : "";
      return (C.folios || {})[path.replace(/^fr\//, "").replace(/index\.html$/, "")] || 0;
    };
    document.addEventListener("click", (e) => {
      const a = e.target.closest?.("a[href]");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin || (to.pathname === location.pathname && to.search === location.search)) return;
      if (!/\/$|\.html$/.test(to.pathname)) return;
      e.preventDefault();
      const there = folioOf(to);
      const way = there === 1 ? "book" : here > 0 && there > 0 && there < here ? "back" : "forward";
      try {
        sessionStorage.setItem("raytex-turn", way);
      } catch {
        /* private mode */
      }
      // The page turns around the middle of what is on screen.
      const paper = $(".paper");
      if (paper) paper.style.transformOrigin = `${way === "forward" ? "0" : "50%"} ${Math.round(innerHeight / 2 - paper.getBoundingClientRect().top)}px`;
      root.classList.add({ forward: "leaving", back: "leaving-back", book: "leaving-down" }[way]);
      setTimeout(() => location.assign(to.href), way === "back" ? 600 : 750);
    });
    // Back with the history: the page comes back as it was, turning in.
    addEventListener("pageshow", (e) => {
      if (!e.persisted) return;
      root.classList.remove("leaving", "leaving-back", "leaving-down");
      $(".paper")?.style.removeProperty("transform-origin");
      root.classList.add("arriving-back");
      setTimeout(() => root.classList.remove("arriving-back"), 1100);
    });
  }
  setTimeout(() => root.classList.remove("arriving", "arriving-back", "arriving-book"), 1600);

  // \today, in the reader's language.
  $$("[data-today]").forEach((el) => (el.textContent = new Intl.DateTimeFormat(fr ? "fr" : "en", { dateStyle: "long" }).format(new Date())));

  // ------------------------------------------------------- the strokes
  // Each stroke knows its length, so that it can trace itself; the steps of
  // a figure (data-step) follow one another.
  function strokeLength(el) {
    let len = 0;
    try {
      len = el.getTotalLength();
      // Strokes that do not scale are dashed in screen pixels.
      if (getComputedStyle(el).vectorEffect === "non-scaling-stroke") {
        const m = el.getScreenCTM();
        if (m) {
          let prev = null;
          len = 0;
          const total = el.getTotalLength();
          for (let i = 0; i <= 40; i++) {
            const p = el.getPointAtLength((total * i) / 40).matrixTransform(m);
            if (prev) len += Math.hypot(p.x - prev.x, p.y - prev.y);
            prev = p;
          }
        }
      }
    } catch {
      len = 400;
    }
    return Math.ceil(len) + 2;
  }
  function prepareStrokes(root = document) {
    for (const el of $$(".note-arrow path, .draw-me, svg .draw:not(.dashed), .ray-sketch path", root)) {
      el.style.setProperty("--len", strokeLength(el));
    }
    for (const el of $$("svg [data-step]", root)) {
      const step = Number(el.dataset.step);
      el.style.setProperty("--delay", `${0.25 + step * 0.6}s`);
    }
    // Labels and handwriting once the last stroke is drawn.
    for (const svg of $$("svg.tikz", root)) {
      const last = Math.max(0, ...$$("[data-step]", svg).map((e) => Number(e.dataset.step)));
      $$(".tikz-labels, .tikz-label, .tikz-hand", svg).forEach((el) => el.style.setProperty("--delay", `${0.6 + last * 0.6}s`));
    }
  }
  prepareStrokes();

  // A figure drawn again when clicked.
  $$(".figure-tikz svg").forEach((svg) => {
    svg.style.cursor = "pointer";
    svg.addEventListener("click", () => {
      if (reduced) return;
      const parts = $$(".draw, .tikz-dot, .tikz-labels, .tikz-label, .tikz-hand", svg);
      parts.forEach((el) => {
        el.style.transition = "none";
        if (el.classList.contains("draw") && !el.classList.contains("dashed")) el.style.strokeDashoffset = "var(--len)";
        else el.style.opacity = "0";
      });
      svg.getBoundingClientRect();
      parts.forEach((el) => {
        el.style.transition = "";
        el.style.strokeDashoffset = "";
        el.style.opacity = "";
      });
    });
  });

  // ------------------------------------------------------------ reveals
  const reveal = new IntersectionObserver(
    (entries) => {
      let i = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.style.setProperty("--d", `${Math.min(i++, 6) * 0.08}s`);
        e.target.classList.add("visible");
        reveal.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  $$("[data-reveal]").forEach((el) => reveal.observe(el));

  // --------------------------------------------------------------- the ray
  const hero = $("[data-ray]");
  if (hero) {
    const sketch = $(".ray-sketch", hero);
    requestAnimationFrame(() => sketch.classList.add("inked"));
    let swimming = false;
    hero.addEventListener("click", () => {
      if (swimming || reduced) return;
      swimming = true;
      hero.classList.add("swim");
      bubbles(hero);
      setTimeout(() => {
        hero.classList.remove("swim");
        swimming = false;
      }, 3500);
    });
  }
  function bubbles(el) {
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 9; i++) {
      const b = document.createElement("span");
      b.className = "ray-bubble";
      b.style.cssText = `left:${r.left + scrollX + rand(0.2, 0.8) * r.width}px;top:${r.top + scrollY + rand(0.3, 0.7) * r.height}px;--s:${rand(5, 14)}px;--dx:${rand(-30, 30)}px;animation-delay:${i * 0.18}s`;
      document.body.append(b);
      setTimeout(() => b.remove(), 2400 + i * 180);
    }
  }

  // ------------------------------------------------------------ the text
  // Double-click on a formula: its source; again: the formula.
  $$(".equation").forEach((eq) => {
    eq.title = L("Double-click: the LaTeX source", "Double-clic : la source LaTeX");
    eq.addEventListener("dblclick", () => {
      eq.classList.toggle("source");
      getSelection()?.removeAllRanges();
    });
  });

  // The end of a proof turns into the ray.
  $$("[data-qed]").forEach((q) => {
    q.dataset.said = L("Q.E.D.", "C.Q.F.D.");
    q.addEventListener("click", () => {
      const on = q.classList.toggle("flipped");
      q.innerHTML = on ? `<img src="${C.rel}assets/img/ray.svg" alt="" width="40" height="27" />` : "";
    });
  });

  // The page number, in every style LaTeX knows.
  const folio = $("button[data-folio]");
  if (folio) {
    const n = Number(folio.textContent) || 1;
    const roman = (k) =>
      [
        [10, "x"],
        [9, "ix"],
        [5, "v"],
        [4, "iv"],
        [1, "i"],
      ].reduce((acc, [v, s]) => {
        while (k >= v) {
          acc += s;
          k -= v;
        }
        return acc;
      }, "");
    const styles = [
      ["arabic", String(n)],
      ["roman", roman(n)],
      ["Roman", roman(n).toUpperCase()],
      ["alph", "abcdefghij"[n - 1] || String(n)],
      ["Alph", "ABCDEFGHIJ"[n - 1] || String(n)],
      ["fnsymbol", ["*", "†", "‡", "§", "¶", "‖", "**", "††", "‡‡", "§§"][n - 1] || "*"],
    ];
    let k = 0;
    let timer = 0;
    folio.addEventListener("click", () => {
      k = (k + 1) % styles.length;
      folio.textContent = styles[k][1];
      const note = Object.assign(document.createElement("span"), { className: "folio-note", textContent: `\\pagenumbering{${styles[k][0]}}` });
      $(".folio-note", folio)?.remove();
      folio.append(note);
      clearTimeout(timer);
      timer = setTimeout(() => note.remove(), 2200);
    });
  }

  // ------------------------------------------------------------ surprises
  function toast(text, ms = 3200) {
    $(".toast")?.remove();
    const t = Object.assign(document.createElement("div"), { className: "toast", textContent: text });
    t.setAttribute("role", "status");
    document.body.append(t);
    setTimeout(() => {
      t.classList.add("out");
      setTimeout(() => t.remove(), 400);
    }, ms);
  }

  // \TeX: mathematics rains on the page.
  function confetti() {
    if (reduced) return toast("\\TeX");
    const symbols = ["∑", "∫", "∂", "∇", "∞", "π", "α", "β", "γ", "λ", "∮", "√", "≈", "≠", "∈", "∀", "∃", "ℵ", "ℝ", "⊗", "∅", "θ", "Ω", "ζ", "ε", "∏", "TeX", "{ }", "$"];
    for (let i = 0; i < 46; i++) {
      const s = document.createElement("span");
      s.className = `confetti${Math.random() < 0.35 ? " ink" : ""}`;
      s.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      s.style.cssText = `left:${rand(0, 100)}vw;font-size:${rand(16, 40)}px;--t:${rand(2.2, 4.2)}s;--dx:${rand(-80, 80)}px;--r:${rand(-360, 360)}deg;animation-delay:${rand(0, 0.9)}s;font-style:${Math.random() < 0.5 ? "italic" : "normal"}`;
      document.body.append(s);
      setTimeout(() => s.remove(), 5400);
    }
  }

  // knuth: a reward cheque of one hexadecimal dollar (0x100 cents).
  function cheque() {
    $(".cheque")?.remove();
    const c = document.createElement("div");
    c.className = "cheque";
    c.setAttribute("role", "status");
    c.innerHTML = `<div class="cheque-top"><span>${L("Bank of San Serriffe", "Banque de San Serriffe")}</span><span>N° 0x100</span></div>
      <span class="cheque-amount">$2.56</span>
      ${L("Pay to the order of <b>you</b>, for a bug found in this document: two dollars and fifty-six cents, one hexadecimal dollar.", "Payez à l'ordre de <b>vous</b>, pour une erreur trouvée dans ce document : deux dollars et cinquante-six cents, un dollar hexadécimal.")}
      <span class="hand">${L("the ray", "la raie")}</span>
      <small>${L("In the manner of the cheques D. E. Knuth sends to whoever finds an error in his books. Not cashable.", "À la manière des chèques que D. E. Knuth envoie à qui trouve une erreur dans ses livres. Non encaissable.")}</small>`;
    c.addEventListener("click", () => c.remove());
    document.body.append(c);
    setTimeout(() => c.remove(), 12000);
  }

  // Konami code: \documentclass[draft].
  function draft() {
    const on = document.body.classList.toggle("draft");
    document.body.dataset.draft = L("DRAFT", "BROUILLON");
    $$(".figure .shot").forEach((img) => (img.closest(".figure").dataset.file = (img.getAttribute("src") || "").split("/").slice(-2).join("/")));
    toast(on ? "\\documentclass[draft]{article}" : "\\documentclass[final]{article}");
  }

  // ray: a ray crosses the page.
  function swimmer() {
    if (reduced) return;
    const img = Object.assign(document.createElement("img"), { src: `${C.rel}assets/img/ray.svg`, alt: "" });
    img.style.cssText = `position:fixed;z-index:90;width:120px;left:-140px;top:${rand(25, 70)}vh;pointer-events:none;transition:transform 6s cubic-bezier(.4,.1,.5,1)`;
    document.body.append(img);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        img.style.transform = `translate(${innerWidth + 300}px, ${rand(-120, 120)}px) rotate(${rand(-8, 8)}deg)`;
      }),
    );
    setTimeout(() => img.remove(), 6400);
  }

  const words = [
    ["\\tex", confetti],
    ["\\latex", confetti],
    ["knuth", cheque],
    ["\\bye", () => toast(L("Output written on raytex.pdf (1 page). Goodbye!", "Output written on raytex.pdf (1 page). Au revoir !"))],
    ["raytex", swimmer],
  ];
  const konami = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  let typed = "";
  let keys = [];
  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.target.closest?.("input, textarea, select, [contenteditable]") || $("[data-terminal]")) return;
    keys = [...keys, e.key.length === 1 ? e.key.toLowerCase() : e.key].slice(-konami.length);
    if (keys.join() === konami.join()) {
      keys = [];
      return draft();
    }
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-12);
    for (const [w, run] of words) {
      if (typed.endsWith(w)) {
        typed = "";
        run();
      }
    }
  });

  // For those who open the console.
  if (!$("[data-terminal]")) {
    console.log(
      "%cThis is RayTeX, Version 0.1 (preloaded format=site)\n%c" +
        L(
          "Entering extended mode.\nPsst: type \\TeX, knuth or raytex on the page, try ↑↑↓↓←→←→BA, double-click a formula, and click everything that looks like a square.",
          "Entering extended mode.\nPsst : tapez \\TeX, knuth ou raytex sur la page, essayez ↑↑↓↓←→←→BA, double-cliquez sur une formule, et cliquez sur tout ce qui ressemble à un carré.",
        ),
      "font: 15px 'LM Mono', monospace; color: #6a3ce0",
      "font: 12px 'LM Mono', monospace",
    );
  }

  // ------------------------------------------------- 404: TeX has stopped
  const term = $("[data-terminal]");
  if (term) terminal(term);

  function terminal(root) {
    const home = fr ? root.dataset.homeFr : root.dataset.homeEn;
    const segs = location.pathname.split("/").filter(Boolean);
    $("[data-path]", root).textContent = `${segs.join("/") || "index"}.tex`;
    $("[data-path-word]", root).textContent = `{${segs[segs.length - 1] || ""}}`;
    const input = $("[data-input]", root);
    const prompt = $(".t-prompt", root);
    const say = (lines, cls = "t-dim") => {
      const out = document.createElement("span");
      out.innerHTML = lines.map((l) => `<span class="${cls}">${esc(l)}</span>\n`).join("");
      prompt.before(out);
    };
    const go = (ms) => setTimeout(() => (location.href = home), ms);
    const run = (cmd) => {
      say([`? ${cmd}`], "");
      const c = cmd.trim().toLowerCase();
      if (c === "") {
        say([L("Back home…", "Retour à l'accueil…")]);
        go(500);
      } else if (c === "h") {
        say(
          L(
            "I can't find the page you asked for. Maybe it moved, or the link has a typo:\nthe pages are features, download, releases, guide, faq and about.\nType <return> and I'll take you home.",
            "Je ne trouve pas la page demandée. Elle a peut-être changé de place, ou le lien a une faute :\nles pages sont features, download, releases, guide, faq et about.\nTapez <Entrée> et je vous ramène à l'accueil.",
          ).split("\n"),
        );
      } else if (c === "x") {
        say(["No pages of output.", "Transcript written on 404.log."]);
        go(1400);
      } else if (c === "e") {
        say([L("You want to edit file 404.tex? Download RayTeX: it explains errors better than this.", "Vous voulez modifier 404.tex ? Téléchargez RayTeX : il explique les erreurs mieux que ça.")]);
      } else if (c === "q" || c === "r" || c === "s") {
        say([`OK, entering \\${{ q: "batchmode", r: "nonstopmode", s: "scrollmode" }[c]}...`]);
        go(1000);
      } else if (c === "i") {
        say(["insert>"]);
      } else {
        say([L("Type <return> to proceed, H for help, X to quit.", "Tapez <Entrée> pour continuer, H pour l'aide, X pour quitter.")]);
      }
    };
    addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = input.textContent;
        input.textContent = "";
        run(cmd);
      } else if (e.key === "Backspace") {
        input.textContent = input.textContent.slice(0, -1);
      } else if (e.key.length === 1 && input.textContent.length < 30) {
        e.preventDefault();
        input.textContent += e.key;
      }
    });
  }

  // --------------------------------------------------------------- copy
  async function copy(text, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = Object.assign(document.createElement("textarea"), { value: text });
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    button.classList.add("done");
    const label = button.getAttribute("aria-label");
    button.setAttribute("aria-label", T.copied);
    setTimeout(() => {
      button.classList.remove("done");
      if (label) button.setAttribute("aria-label", label);
    }, 1600);
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-copy]");
    if (b) copy(b.dataset.copy, b);
  });

  // ---------------------------------------------------------- downloads
  const needsReleases = $("[data-download-primary], [data-os-panel], [data-releases]");
  if (!needsReleases) return;

  async function detect() {
    const ua = navigator.userAgent || "";
    const hint = navigator.userAgentData;
    const plat = (hint && hint.platform) || navigator.platform || "";
    let os = "unknown";
    if (/android|iphone|ipad|ipod/i.test(ua) || (hint && hint.mobile)) os = "mobile";
    else if (/win/i.test(plat) || /windows/i.test(ua)) os = "windows";
    else if (/mac/i.test(plat) || /mac os x/i.test(ua)) os = navigator.maxTouchPoints > 1 ? "mobile" : "macos";
    else if (/linux|x11|cros/i.test(plat + ua)) os = "linux";
    let arch = null;
    try {
      if (hint && hint.getHighEntropyValues) {
        const v = await hint.getHighEntropyValues(["architecture"]);
        arch = v.architecture === "arm" ? "arm64" : v.architecture === "x86" ? "x64" : null;
      }
    } catch {
      /* not allowed */
    }
    if (!arch && os === "macos") {
      // The graphics chip names the processor in some browsers.
      try {
        const gl = document.createElement("canvas").getContext("webgl");
        const info = gl && gl.getExtension("WEBGL_debug_renderer_info");
        const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
        if (/apple m\d/i.test(renderer)) arch = "arm64";
        else if (/intel|amd|radeon|nvidia/i.test(renderer)) arch = "x64";
      } catch {
        /* no WebGL */
      }
    }
    if (!arch && /aarch64|arm64/i.test(ua)) arch = "arm64";
    return { os, arch: arch || (os === "macos" ? "arm64" : "x64") };
  }

  /** What a release file is: system, kind, processor. */
  function classify(name) {
    const n = name.toLowerCase();
    if (/\.(sig|json|zip|tar\.gz)$/.test(n)) return null;
    const arch = /aarch64|arm64/.test(n) ? "arm64" : /x86_64|x64|amd64|i686|x86/.test(n) ? "x64" : /universal/.test(n) ? "universal" : null;
    if (n.endsWith(".exe")) return { os: "windows", kind: "exe", arch: arch || "x64", rank: 0 };
    if (n.endsWith(".msi")) return { os: "windows", kind: "msi", arch: arch || "x64", rank: 1 };
    if (n.endsWith(".dmg")) return { os: "macos", kind: arch === "arm64" ? "dmg-arm64" : arch === "x64" ? "dmg-x64" : "dmg", arch: arch || "universal", rank: arch === "arm64" ? 0 : 1 };
    if (n.endsWith(".appimage")) return { os: "linux", kind: "appimage", arch: arch || "x64", rank: 0 };
    if (n.endsWith(".deb")) return { os: "linux", kind: "deb", arch: arch || "x64", rank: 1 };
    if (n.endsWith(".rpm")) return { os: "linux", kind: "rpm", arch: arch || "x64", rank: 2 };
    return null;
  }

  const sizeFmt = new Intl.NumberFormat(C.lang, { maximumFractionDigits: 1 });
  const size = (b) => `${sizeFmt.format(b / 1048576)} ${C.lang === "fr" ? "Mo" : "MB"}`;
  const date = (d) => (d ? new Intl.DateTimeFormat(C.lang, { dateStyle: "long" }).format(new Date(d)) : "");
  const version = (r) => r.tag.replace(/^v/, "");

  let releases;
  function loadReleases() {
    releases ||= (async () => {
      try {
        const res = await fetch(`${C.rel}releases.json`, { cache: "no-cache" });
        if (res.ok) return await res.json();
      } catch {
        /* not baked in: ask GitHub */
      }
      const res = await fetch(`https://api.github.com/repos/${C.repo}/releases?per_page=100`, { headers: { Accept: "application/vnd.github.html+json" } });
      if (!res.ok) throw new Error(`GitHub: ${res.status}`);
      return (await res.json())
        .filter((r) => !r.draft)
        .map((r) => ({
          tag: r.tag_name,
          name: r.name,
          date: r.published_at,
          prerelease: r.prerelease,
          url: r.html_url,
          notes: r.body_html || "",
          assets: r.assets.map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url, digest: a.digest || null })),
        }));
    })().then((list) => list.sort((a, b) => new Date(b.date) - new Date(a.date)));
    return releases;
  }
  const OS_ORDER = ["windows", "macos", "linux"];
  const latestOf = (list) => list.find((r) => !r.prerelease) || list[0];

  /** The files of a release for a system, the best one first. */
  function filesFor(release, os, arch) {
    return release.assets
      .map((a) => ({ ...a, info: classify(a.name) }))
      .filter((a) => a.info && a.info.os === os)
      .sort((a, b) => {
        const fit = (x) => (x.info.arch === arch || x.info.arch === "universal" ? 0 : 1);
        return fit(a) - fit(b) || a.info.rank - b.info.rank;
      });
  }
  const kindLabel = (f) => {
    const [label, desc] = T.kinds[f.info.kind] || [f.name, ""];
    const armLinux = f.info.os !== "macos" && f.info.arch === "arm64" ? " · ARM64" : "";
    return [label + armLinux, desc];
  };

  (async () => {
    const env = await detect();
    document.documentElement.dataset.os = env.os;

    let list;
    try {
      list = await loadReleases();
    } catch {
      list = null;
    }
    primaryButtons(list, env);
    if ($("[data-os-panel]")) downloadPage(list, env);
    if ($("[data-releases]")) releasesPage(list);
  })();

  function primaryButtons(list, env) {
    const latest = list && list.length ? latestOf(list) : null;
    const best = latest && env.os !== "mobile" && env.os !== "unknown" ? filesFor(latest, env.os, env.arch)[0] : null;
    for (const btn of $$("[data-download-primary]")) {
      const label = $("[data-download-label]", btn);
      const meta = $("[data-download-meta]", btn.parentElement);
      if (best) {
        btn.href = best.url;
        if (label) label.textContent = fill(T.downloadFor, { os: T.os[env.os] });
        const osIcon = C.icons[env.os === "macos" ? "apple" : env.os];
        const first = btn.querySelector("svg");
        if (osIcon && first) first.outerHTML = osIcon;
        if (meta) meta.textContent = [`v${version(latest)}`, kindLabel(best)[0], size(best.size)].join(" · ");
      }
    }
  }

  function fileRow(f, recommended) {
    const [label, desc] = kindLabel(f);
    const sha = f.digest && f.digest.startsWith("sha256:") ? f.digest.slice(7) : null;
    return `<div class="dl-file${recommended ? " recommended" : ""}">
      <span class="dl-file-name">${esc(label)}${recommended ? ` <span class="badge">${esc(T.recommended)}</span>` : ""}</span>
      <span class="dl-file-desc">${esc(desc)}</span>
      <span class="dl-file-meta"><span>${esc(size(f.size))}</span>${sha ? `<button type="button" data-copy="${sha}" title="${esc(sha)}" aria-label="${esc(T.copy)} ${T.sha}">${C.icons.copy} ${T.sha}</button>` : ""}</span>
      <a class="btn btn-primary btn-sm" href="${esc(f.url)}" download aria-label="${esc(label)}, ${esc(f.name)}">${C.icons.download}</a>
    </div>`;
  }

  function downloadPage(list, env) {
    const tabs = $$("[data-os-tab]");
    const panels = $$("[data-os-panel]");
    const known = OS_ORDER.includes(env.os);

    // The tabs: the reader's system first, the others one click (or arrow) away.
    // The first panel comes into view like the rest of the page; another
    // one, chosen with its tab, shows at once, already written and drawn
    // (no fade, nothing that blinks).
    const show = (os, focus = false, instant = false) => {
      for (const t of tabs) {
        const on = t.dataset.osTab === os;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      }
      for (const p of panels) {
        p.hidden = p.dataset.osPanel !== os;
        if (p.hidden) continue;
        if (instant) {
          p.classList.add("instant");
          for (const el of $$("[data-reveal]", p)) {
            el.classList.add("visible");
            reveal.unobserve(el);
          }
        }
        prepareStrokes(p);
        if (instant) requestAnimationFrame(() => requestAnimationFrame(() => p.classList.remove("instant")));
      }
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => show(t.dataset.osTab, false, true));
      t.addEventListener("keydown", (e) => {
        const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        show(tabs[(i + step + tabs.length) % tabs.length].dataset.osTab, true, true);
      });
    });
    if (known) $(`[data-os-tab="${env.os}"]`)?.classList.add("is-you");
    if (env.os === "mobile") $("[data-dl-mobile]").hidden = false;
    show(known ? env.os : "windows");

    const select = $("[data-version-select]");
    const state = $("[data-dl-state]");
    const versionLine = $("[data-dl-version]");
    const notes = $("[data-version-notes]");

    if (!list || !list.length) {
      state.hidden = false;
      state.innerHTML = list
        ? `<p><strong>${esc(T.noRelease)}</strong></p><p class="muted">${esc(T.noReleaseHint)} <a href="https://github.com/${C.repo}">${esc(T.onGithub)}</a></p>`
        : `<p><strong>${esc(T.loadFailed)}</strong></p><p class="muted">${esc(T.loadFailedHint)} <a href="https://github.com/${C.repo}/releases">${esc(T.onGithub)}</a></p>`;
      versionLine.hidden = true;
      select.closest("label").hidden = true;
      for (const btn of $$("[data-dl-main]")) {
        btn.href = `https://github.com/${C.repo}/releases`;
        $("[data-dl-main-label]", btn).textContent = T.onGithub;
      }
      $$("[data-dl-files]").forEach((el) => (el.innerHTML = `<p class="dl-empty">${esc(T.none)}</p>`));
      return;
    }

    select.innerHTML = list
      .map((r) => `<option value="${esc(r.tag)}">${esc(version(r))}${r === latestOf(list) ? ` (${esc(T.latest.toLowerCase())})` : r.prerelease ? ` (${esc(T.prerelease.toLowerCase())})` : ""}</option>`)
      .join("");
    const wanted = new URLSearchParams(location.search).get("version");
    const initial = list.find((r) => r.tag === wanted || version(r) === wanted) || latestOf(list);
    select.value = initial.tag;

    const render = () => {
      const release = list.find((r) => r.tag === select.value);
      versionLine.textContent = fill(T.versionLine, { v: version(release), date: date(release.date) });
      notes.href = `${C.rel}${C.lang === "fr" ? "fr/" : ""}releases/#${encodeURIComponent(release.tag)}`;
      const sums = release.assets.find((a) => a.name === "SHA256SUMS.txt");
      const sumsLink = $("[data-version-sums]");
      if (sumsLink) {
        sumsLink.hidden = !sums;
        if (sums) sumsLink.href = sums.url;
      }
      for (const os of OS_ORDER) {
        const files = filesFor(release, os, os === env.os ? env.arch : os === "macos" ? "arm64" : "x64");
        const [main, ...rest] = files;
        const btn = $(`[data-dl-main="${os}"]`);
        const meta = $(`[data-dl-main-meta="${os}"]`);
        if (!btn) continue;
        if (main) {
          btn.href = main.url;
          $("[data-dl-main-label]", btn).textContent = fill(T.downloadFor, { os: T.os[os] });
          meta.textContent = [kindLabel(main)[0], size(main.size)].join(" · ");
          $$(`[data-dl-filename="${os}"]`).forEach((el) => (el.textContent = main.name));
        } else {
          btn.href = release.url;
          $("[data-dl-main-label]", btn).textContent = T.onGithub;
          meta.textContent = T.noFile;
        }
        $(`[data-dl-files="${os}"]`).innerHTML = rest.length ? rest.map((f) => fileRow(f, false)).join("") : `<p class="dl-empty">${esc(T.none)}</p>`;
        // macOS: the other kind of Mac, right under the button.
        const alt = $(`[data-dl-alt="${os}"]`);
        if (alt) {
          const other = main && rest.find((f) => f.info.kind !== main.info.kind && f.info.kind.startsWith("dmg"));
          alt.hidden = !other;
          if (other) alt.innerHTML = `${esc(T.macOther[other.info.kind] || "")} <a href="${esc(other.url)}" download>${esc(kindLabel(other)[0])}</a> <small>${esc(size(other.size))}</small>`;
        }
      }
    };
    select.addEventListener("change", () => {
      const url = new URL(location.href);
      url.searchParams.set("version", select.value);
      history.replaceState(null, "", url);
      render();
    });
    render();
  }

  function releasesPage(list) {
    const box = $("[data-releases]");
    const toggle = $("[data-show-prereleases]");
    if (!list || !list.length) {
      box.innerHTML = `<div class="dl-state"><p><strong>${esc(list ? T.noRelease : T.loadFailed)}</strong></p><p class="muted">${esc(list ? T.noReleaseHint : T.loadFailedHint)} <a href="https://github.com/${C.repo}/releases">${esc(T.onGithub)}</a></p></div>`;
      toggle.closest("label").hidden = true;
      return;
    }
    const latest = latestOf(list);
    if (list.every((r) => r.prerelease)) toggle.checked = true;
    if (!list.some((r) => r.prerelease)) toggle.closest("label").hidden = true;
    const osIcon = { windows: "windows", macos: "apple", linux: "linux" };
    const render = () => {
      box.innerHTML = list
        .filter((r) => toggle.checked || !r.prerelease)
        .map((r) => {
          const chips = r.assets
            .map((a) => ({ ...a, info: classify(a.name) }))
            .filter((a) => a.info)
            .sort((a, b) => OS_ORDER.indexOf(a.info.os) - OS_ORDER.indexOf(b.info.os) || a.info.rank - b.info.rank)
            .map((a) => `<a class="asset-chip" href="${esc(a.url)}" title="${esc(a.name)}">${C.icons[osIcon[a.info.os]]} ${esc(kindLabel(a)[0])} <small>${esc(size(a.size))}</small></a>`)
            .join("");
          const others = r.assets.filter((a) => !classify(a.name)).length;
          return `<article class="release${r === latest ? " is-latest" : ""}" id="${esc(r.tag)}" data-reveal>
            <div class="release-head"><h2>${esc(r.name || r.tag)}</h2>${r === latest ? `<span class="badge latest">${esc(T.latest)}</span>` : ""}${r.prerelease ? `<span class="badge pre">${esc(T.prerelease)}</span>` : ""}<span class="release-date">${esc(fill(T.released, { date: date(r.date) }))}</span></div>
            <div class="release-notes">${r.notes.replace(/\s*\u2014\s*/g, ", ")}</div>
            <div class="release-assets">${chips}${others ? `<a class="asset-chip" href="${esc(r.url)}">${esc(T.otherFiles)} <small>${others}</small></a>` : ""}<a class="asset-chip" href="${esc(r.url)}">${C.icons.github} GitHub</a></div>
          </article>`;
        })
        .join("");
      $$("[data-reveal]", box).forEach((el) => reveal.observe(el));
      if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    };
    toggle.addEventListener("change", render);
    render();
  }
})();
