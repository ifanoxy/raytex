export default {
  id: "releases",
  path: "releases/",
  title: { en: "Versions", fr: "Versions" },
  description: {
    en: "Every version of RayTeX, with its release notes and its files for Windows, macOS and Linux.",
    fr: "Toutes les versions de RayTeX, avec leurs notes de version et leurs fichiers pour Windows, macOS et Linux.",
  },
  body({ T, icon, GITHUB, tex }) {
    return `${tex.chapter("C", T("Every version", "Toutes les versions"), {
      stamp: [T("Changelog", "Journal"), "violet", 6],
      epigraph: [T("Version 0.1: one has to start somewhere.", "Version 0.1 : il faut bien commencer quelque part."), T("the changelog", "le journal des modifications")],
      lead: T(
        "What changed in each version, and its files for every system. Older versions stay available; RayTeX itself offers the new ones when it starts.",
        "Ce qui a changé dans chaque version, et ses fichiers pour chaque système. Les anciennes versions restent disponibles ; RayTeX propose lui-même les nouvelles à son démarrage.",
      ),
    })}
<div class="releases-tools" data-reveal>
  <label class="toggle"><input type="checkbox" data-show-prereleases /> <span>${T("Show pre-releases", "Afficher les préversions")}</span></label>
  <a class="link-arrow" href="${GITHUB}/blob/main/CHANGELOG.md">${icon("file", 15)} ${T("Full changelog", "Journal complet des modifications")}</a>
</div>
${tex.note(T("the first of a long series", "la première d'une longue série"), { arrow: "left", tilt: -3 })}
<div class="timeline" data-releases>
  <div class="skeleton tall"></div>
  <div class="skeleton tall"></div>
</div>
${tex.eq(String.raw`v_{n+1} = v_n + \varepsilon, \qquad \varepsilon > 0`, { label: false })}`;
  },
};
