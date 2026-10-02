export default {
  id: "license",
  path: "license/",
  title: { en: "License", fr: "Licence" },
  description: {
    en: "RayTeX is free software under the MIT license or the Apache License 2.0, at your choice. What that allows, and the components it uses.",
    fr: "RayTeX est un logiciel libre sous licence MIT ou licence Apache 2.0, au choix. Ce que cela permet, et les composants qu'il utilise.",
  },
  body({ T, icon, GITHUB, tex }) {
    return `${tex.chapter("I", T("License", "Licence"), {
      stamp: ["MIT ∨ Apache", "violet", 7],
      epigraph: [T("Free as in freedom — twice over.", "Libre comme l'air — deux fois plutôt qu'une."), T("the ray", "la raie")],
      lead: T("RayTeX is distributed under the MIT license <b>or</b> the Apache License 2.0, at your choice — the usual pair of the Rust world.", "RayTeX est distribué sous la licence MIT <b>ou</b> la licence Apache 2.0, au choix — le duo habituel du monde Rust."),
    })}
${tex.eq(String.raw`\mathcal{L}(\text{RayTeX}) \;=\; \htmlClass{tx-violet}{\text{MIT} \;\lor\; \text{Apache-2.0}}`)}

${tex.section(T("What you can do", "Ce que vous pouvez faire"), "can")}
${tex.theorem(
  T("Theorem", "Théorème"),
  T("freedom", "liberté"),
  T("Anyone may, for any purpose:", "Toute personne peut, pour tout usage :") +
    tex.enumerate([
      T("<b>use</b> RayTeX — personal, school, research or commercial work;", "<b>utiliser</b> RayTeX — travail personnel, scolaire, de recherche ou commercial ;"),
      T("<b>study and change</b> it — the whole source code is public;", "l'<b>étudier et le modifier</b> — tout le code source est public ;"),
      T("<b>share</b> it — copy and distribute it, changed or not, free or paid.", "le <b>partager</b> — le copier et le distribuer, modifié ou non, gratuitement ou non."),
    ]),
  T(`Read the licenses: <a href="${GITHUB}/blob/main/LICENSE-MIT">MIT</a> and <a href="${GITHUB}/blob/main/LICENSE-APACHE">Apache 2.0</a>.`, `Lisez les licences : <a href="${GITHUB}/blob/main/LICENSE-MIT">MIT</a> et <a href="${GITHUB}/blob/main/LICENSE-APACHE">Apache 2.0</a>.`),
)}

${tex.section(T("What you must do", "Ce que vous devez faire"), "must")}
<p data-reveal>${T("Keep the copyright notice and the license text with the copies you distribute; with the Apache License, also say which files you changed and keep the NOTICE files. The software comes without warranty.", "Garder la mention de copyright et le texte de la licence avec les copies que vous distribuez ; avec la licence Apache, indiquer aussi les fichiers modifiés et garder les fichiers NOTICE. Le logiciel est fourni sans garantie.")}</p>
<p class="actions" data-reveal><a class="fbox-link" href="${GITHUB}/blob/main/LICENSE-MIT">${icon("file", 15)} ${T("MIT license", "Licence MIT")}</a> <a class="fbox-link" href="${GITHUB}/blob/main/LICENSE-APACHE">${icon("file", 15)} ${T("Apache License 2.0", "Licence Apache 2.0")}</a></p>

${tex.section(T("Contributions", "Contributions"), "contributions")}
<p data-reveal>${T("Unless stated otherwise, a contribution sent to the project is licensed under the same two licenses, with no additional terms.", "Sauf mention contraire, une contribution envoyée au projet est placée sous les deux mêmes licences, sans condition supplémentaire.")}</p>

${tex.section(T("Components", "Composants"), "components")}
<p data-reveal>${T(`RayTeX builds on open-source components (Tauri, Svelte, CodeMirror, pdf.js, KaTeX, the Inter and JetBrains Mono fonts, many Rust crates), each under its own license; the list is in <a href="${GITHUB}/blob/main/THIRD_PARTY.md">THIRD_PARTY.md</a>. The TeX distributions RayTeX uses are separate programs, with their own licenses.`, `RayTeX s'appuie sur des composants libres (Tauri, Svelte, CodeMirror, pdf.js, KaTeX, les polices Inter et JetBrains Mono, de nombreuses crates Rust), chacun sous sa propre licence ; la liste est dans <a href="${GITHUB}/blob/main/THIRD_PARTY.md">THIRD_PARTY.md</a>. Les distributions TeX qu'utilise RayTeX sont des programmes distincts, avec leurs propres licences.`)}</p>

${tex.section(T("Your documents", "Vos documents"), "documents")}
${tex.note(T("your thesis belongs to you, not to your editor", "votre thèse est à vous, pas à votre éditeur"), { arrow: "left", tilt: -3 })}
<p data-reveal>${T("The documents you write with RayTeX are yours alone: the license of the editor has no effect on them, nor do the templates, which you may use freely.", "Les documents que vous écrivez avec RayTeX n'appartiennent qu'à vous : la licence de l'éditeur ne s'y applique pas, pas plus que les modèles, que vous pouvez utiliser librement.")}</p>`;
  },
};
