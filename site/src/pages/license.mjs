import { pageHead } from "../util.mjs";

export default {
  id: "license",
  path: "license/",
  title: { en: "License", fr: "Licence" },
  description: {
    en: "RayTeX is free software under the MIT license or the Apache License 2.0, at your choice. What that allows, and the components it uses.",
    fr: "RayTeX est un logiciel libre sous licence MIT ou licence Apache 2.0, au choix. Ce que cela permet, et les composants qu'il utilise.",
  },
  body({ T, icon, GITHUB }) {
    const item = (ic, title, text) => `<li class="card">${icon(ic, 20)}<div><h3>${title}</h3><p>${text}</p></div></li>`;
    return `${pageHead(
      T("License", "Licence"),
      T("Free software, twice over", "Un logiciel libre, deux fois plutôt qu'une"),
      T("RayTeX is distributed under the MIT license <b>or</b> the Apache License 2.0, at your choice — the usual pair of the Rust world.", "RayTeX est distribué sous la licence MIT <b>ou</b> la licence Apache 2.0, au choix — le duo habituel du monde Rust."),
    )}
<section class="section tight">
  <div class="container narrow prose" data-reveal>
    <h2>${T("What you can do", "Ce que vous pouvez faire")}</h2>
    <ul class="license-list">
      ${item("check", T("Use it", "L'utiliser"), T("For anything: personal, school, research or commercial work.", "Pour tout : travail personnel, scolaire, de recherche ou commercial."))}
      ${item("book", T("Study and change it", "L'étudier et le modifier"), T("The whole source code is public.", "Tout le code source est public."))}
      ${item("copy", T("Share it", "Le partager"), T("Copy it and distribute it, changed or not, free or paid.", "Le copier et le distribuer, modifié ou non, gratuitement ou non."))}
    </ul>
    <h2>${T("What you must do", "Ce que vous devez faire")}</h2>
    <p>${T("Keep the copyright notice and the license text with the copies you distribute; with the Apache License, also say which files you changed and keep the NOTICE files. The software comes without warranty.", "Garder la mention de copyright et le texte de la licence avec les copies que vous distribuez ; avec la licence Apache, indiquer aussi les fichiers modifiés et garder les fichiers NOTICE. Le logiciel est fourni sans garantie.")}</p>
    <p class="actions"><a class="btn btn-ghost" href="${GITHUB}/blob/main/LICENSE-MIT">${icon("file", 16)} ${T("MIT license", "Licence MIT")}</a> <a class="btn btn-ghost" href="${GITHUB}/blob/main/LICENSE-APACHE">${icon("file", 16)} ${T("Apache License 2.0", "Licence Apache 2.0")}</a></p>
    <h2>${T("Contributions", "Contributions")}</h2>
    <p>${T("Unless stated otherwise, a contribution sent to the project is licensed under the same two licenses, with no additional terms.", "Sauf mention contraire, une contribution envoyée au projet est placée sous les deux mêmes licences, sans condition supplémentaire.")}</p>
    <h2>${T("Components", "Composants")}</h2>
    <p>${T(`RayTeX builds on open-source components (Tauri, Svelte, CodeMirror, pdf.js, KaTeX, the Inter and JetBrains Mono fonts, many Rust crates), each under its own license; the list is in <a href="${GITHUB}/blob/main/THIRD_PARTY.md">THIRD_PARTY.md</a>. The TeX distributions RayTeX uses are separate programs, with their own licenses.`, `RayTeX s'appuie sur des composants libres (Tauri, Svelte, CodeMirror, pdf.js, KaTeX, les polices Inter et JetBrains Mono, de nombreuses crates Rust), chacun sous sa propre licence ; la liste est dans <a href="${GITHUB}/blob/main/THIRD_PARTY.md">THIRD_PARTY.md</a>. Les distributions TeX qu'utilise RayTeX sont des programmes distincts, avec leurs propres licences.`)}</p>
    <h2>${T("Your documents", "Vos documents")}</h2>
    <p>${T("The documents you write with RayTeX are yours alone: the license of the editor has no effect on them, nor do the templates, which you may use freely.", "Les documents que vous écrivez avec RayTeX n'appartiennent qu'à vous : la licence de l'éditeur ne s'y applique pas, pas plus que les modèles, que vous pouvez utiliser librement.")}</p>
  </div>
</section>`;
  },
};
