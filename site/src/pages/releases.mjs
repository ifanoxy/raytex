import { pageHead } from "../util.mjs";

export default {
  id: "releases",
  path: "releases/",
  title: { en: "Versions", fr: "Versions" },
  description: {
    en: "Every version of RayTeX, with its release notes and its files for Windows, macOS and Linux.",
    fr: "Toutes les versions de RayTeX, avec leurs notes de version et leurs fichiers pour Windows, macOS et Linux.",
  },
  body({ T, icon, GITHUB }) {
    return `${pageHead(
      T("Versions", "Versions"),
      T("Every version of RayTeX", "Toutes les versions de RayTeX"),
      T("What changed in each version, and its files for every system. Older versions stay available.", "Ce qui a changé dans chaque version, et ses fichiers pour chaque système. Les anciennes versions restent disponibles."),
    )}
<section class="section tight">
  <div class="container narrow">
    <div class="releases-tools" data-reveal>
      <label class="toggle"><input type="checkbox" data-show-prereleases /> <span>${T("Show pre-releases", "Afficher les préversions")}</span></label>
      <a class="link-arrow" href="${GITHUB}/blob/main/CHANGELOG.md">${icon("file", 15)} ${T("Full changelog", "Journal complet des modifications")}</a>
    </div>
    <div class="timeline" data-releases>
      <div class="skeleton tall"></div>
      <div class="skeleton tall"></div>
    </div>
  </div>
</section>`;
  },
};
