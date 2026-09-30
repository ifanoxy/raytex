// RayTeX website: theme, menu, animations, the editor demo, and the
// downloads (system detection, versions from GitHub's releases).
(() => {
  "use strict";
  const C = window.RAYTEX || { lang: "en", rel: "", texts: {}, icons: {} };
  const T = C.texts;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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
  const header = $(".site-header");
  const onScroll = () => header && header.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const menu = $("[data-menu]");
  menu?.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    menu.setAttribute("aria-expanded", String(open));
  });
  $$(".main-nav a").forEach((a) => a.addEventListener("click", () => document.body.classList.remove("menu-open")));

  $("[data-theme-toggle]")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    const apply = () => {
      document.documentElement.dataset.theme = next;
      store.set("raytex-theme", next);
    };
    if (document.startViewTransition && !reduced) document.startViewTransition(apply).ready.catch(() => {});
    else apply();
  });
  $$("[data-lang-switch]").forEach((a) => a.addEventListener("click", () => store.set("raytex-lang", a.dataset.langSwitch)));

  // ------------------------------------------------------------ reveals
  const reveal = new IntersectionObserver(
    (entries) => {
      let i = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.style.setProperty("--d", `${Math.min(i++, 6) * 0.07}s`);
        e.target.classList.add("visible");
        reveal.unobserve(e.target);
        const counter = $("[data-count]", e.target);
        if (counter) count(counter);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  $$("[data-reveal]").forEach((el) => reveal.observe(el));

  function count(el) {
    const n = Number(el.dataset.count);
    if (reduced || n === 0) return;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 1300);
      el.textContent = String(Math.round(n * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Cards lit where the pointer is.
  document.addEventListener(
    "pointermove",
    (e) => {
      const card = e.target.closest?.("[data-spotlight]");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    },
    { passive: true },
  );

  // ------------------------------------------------------------- hero
  // The floating cards arrive one after the other, then follow the pointer
  // a little, each at its own depth.
  const panel = $("[data-hero]");
  if (panel) {
    $$(".floater", panel).forEach((f, i) => setTimeout(() => f.classList.add("visible"), 150 + i * 120));
    if (!reduced && matchMedia("(pointer: fine)").matches) {
      let frame = 0;
      panel.addEventListener("pointermove", (e) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const r = panel.getBoundingClientRect();
          panel.style.setProperty("--px", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
          panel.style.setProperty("--py", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
        });
      });
      panel.addEventListener("pointerleave", () => {
        panel.style.setProperty("--px", "0");
        panel.style.setProperty("--py", "0");
      });
    }
  }

  // ---------------------------------------------------- screenshot tabs
  $$("[data-shot]").forEach((tab) =>
    tab.addEventListener("click", () => {
      $$("[data-shot]").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      $$("[data-shot-img]").forEach((img) => img.classList.toggle("active", img.dataset.shotImg === tab.dataset.shot));
    }),
  );

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

  // ---------------------------------------------------------- the demo
  const demo = $("[data-demo]");
  if (demo) runDemo(demo);

  function runDemo(root) {
    const lines = $$(".code-line .txt", root);
    const set = (s) => (root.dataset.state = s);
    if (reduced) {
      lines.forEach((l) => (l.style.width = "auto"));
      set("built");
      return;
    }
    let visible = false;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.2 }).observe(root);
    const sleep = (ms) =>
      new Promise((done) => {
        const tick = () => (visible && !document.hidden ? setTimeout(done, ms) : setTimeout(tick, 250));
        tick();
      });
    const caret = Object.assign(document.createElement("span"), { className: "caret" });

    (async () => {
      for (;;) {
        set("typing");
        lines.forEach((l) => (l.style.width = "0ch"));
        await sleep(600);
        for (const line of lines) {
          line.after(caret);
          const n = Number(line.dataset.n);
          for (let k = 1; k <= n; k++) {
            line.style.width = `${k}ch`;
            await sleep(line.textContent[k - 1] === " " ? 12 : 18 + Math.random() * 30);
          }
          await sleep(140);
        }
        caret.remove();
        await sleep(500);
        set("error");
        await sleep(900);
        set("card");
        await sleep(2200);
        set("press");
        await sleep(260);
        set("fixed");
        await sleep(900);
        set("built");
        await sleep(5200);
      }
    })();
  }

  // ---------------------------------------------------------- downloads
  const needsReleases = $("[data-download-primary], [data-dl-files], [data-releases], [data-platform]");
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
  const archLabel = (env) => (env.os === "macos" ? T.arch[env.arch] : "");

  (async () => {
    const env = await detect();
    document.documentElement.dataset.os = env.os;
    $$(`[data-platform="${env.os}"], [data-dl-platform="${env.os}"]`).forEach((el) => el.classList.add("is-detected"));
    const grid = $(".dl-grid");
    if (grid) {
      const detected = $(`[data-dl-platform="${env.os}"]`);
      if (detected) grid.prepend(detected);
    }

    let list;
    try {
      list = await loadReleases();
    } catch {
      list = null;
    }
    primaryButtons(list, env);
    if ($("[data-dl-files]")) downloadPage(list, env);
    if ($("[data-releases]")) releasesPage(list);
  })();

  function primaryButtons(list, env) {
    const latest = list && list.length ? latestOf(list) : null;
    const best = latest && env.os !== "mobile" && env.os !== "unknown" ? filesFor(latest, env.os, env.arch)[0] : null;
    for (const btn of $$("[data-download-primary]")) {
      const label = $("[data-download-label]", btn);
      const meta = $("[data-download-meta]", btn.closest(".hero-text") || btn.parentElement);
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
      <a class="btn btn-primary btn-sm" href="${esc(f.url)}" download aria-label="${esc(label)} — ${esc(f.name)}">${C.icons.download}</a>
    </div>`;
  }

  function downloadPage(list, env) {
    const select = $("[data-version-select]");
    const state = $("[data-dl-state]");
    const title = $("[data-dl-title]");
    const subtitle = $("[data-dl-subtitle]");
    const detectedLabel = $("[data-dl-detected]");
    const notes = $("[data-version-notes]");
    const heroBtn = $("[data-dl-hero] [data-download-primary]");
    const heroMeta = $("[data-dl-hero] [data-download-meta]");

    if (!list || !list.length) {
      state.hidden = false;
      state.innerHTML = list
        ? `<p><strong>${esc(T.noRelease)}</strong></p><p class="muted">${esc(T.noReleaseHint)} <a href="https://github.com/${C.repo}">${esc(T.onGithub)}</a></p>`
        : `<p><strong>${esc(T.loadFailed)}</strong></p><p class="muted">${esc(T.loadFailedHint)} <a href="https://github.com/${C.repo}/releases">${esc(T.onGithub)}</a></p>`;
      title.textContent = list ? T.noRelease : T.loadFailed;
      select.closest("label").hidden = true;
      heroBtn.href = `https://github.com/${C.repo}/releases`;
      $("[data-download-label]", heroBtn).textContent = T.onGithub;
      $$("[data-dl-files]").forEach((el) => (el.innerHTML = `<p class="dl-empty">—</p>`));
      return;
    }

    select.innerHTML = list
      .map((r) => `<option value="${esc(r.tag)}">${esc(version(r))}${r === latestOf(list) ? ` — ${esc(T.latest)}` : r.prerelease ? ` — ${esc(T.prerelease)}` : ""}</option>`)
      .join("");
    const wanted = new URLSearchParams(location.search).get("version");
    const initial = list.find((r) => r.tag === wanted || version(r) === wanted) || latestOf(list);
    select.value = initial.tag;

    const render = () => {
      const release = list.find((r) => r.tag === select.value);
      notes.href = `${C.rel}${C.lang === "fr" ? "fr/" : ""}releases/#${encodeURIComponent(release.tag)}`;
      for (const box of $$("[data-dl-files]")) {
        const os = box.dataset.dlFiles;
        const files = filesFor(release, os, os === env.os ? env.arch : os === "macos" ? "arm64" : "x64");
        box.innerHTML = files.length ? files.map((f, i) => fileRow(f, i === 0 && os === env.os)).join("") : `<p class="dl-empty">${esc(T.noFile)}</p>`;
      }
      const known = env.os !== "mobile" && env.os !== "unknown";
      const best = known ? filesFor(release, env.os, env.arch)[0] : null;
      detectedLabel.textContent = known ? `${T.detected} · ${[T.os[env.os], archLabel(env)].filter(Boolean).join(" · ")}` : T.downloadAll;
      title.textContent = known ? `RayTeX ${version(release)} — ${T.os[env.os]}` : `RayTeX ${version(release)}`;
      subtitle.textContent = known ? fill(T.released, { date: date(release.date) }) : T.mobile;
      if (best) {
        heroBtn.href = best.url;
        $("[data-download-label]", heroBtn).textContent = fill(T.downloadFor, { os: T.os[env.os] });
        heroMeta.textContent = [kindLabel(best)[0], size(best.size)].join(" · ");
      } else {
        heroBtn.href = "#platforms";
        $("[data-download-label]", heroBtn).textContent = T.downloadAll;
        heroMeta.textContent = "";
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
      box.innerHTML = `<div class="card dl-state"><p><strong>${esc(list ? T.noRelease : T.loadFailed)}</strong></p><p class="muted">${esc(list ? T.noReleaseHint : T.loadFailedHint)} <a href="https://github.com/${C.repo}/releases">${esc(T.onGithub)}</a></p></div>`;
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
          return `<article class="card release${r === latest ? " is-latest" : ""}" id="${esc(r.tag)}" data-reveal>
            <div class="release-head"><h2>${esc(r.name || r.tag)}</h2>${r === latest ? `<span class="badge latest">${esc(T.latest)}</span>` : ""}${r.prerelease ? `<span class="badge pre">${esc(T.prerelease)}</span>` : ""}<span class="release-date">${esc(fill(T.released, { date: date(r.date) }))}</span></div>
            <div class="release-notes">${r.notes}</div>
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
