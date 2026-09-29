import { pageHead } from "../util.mjs";

export const CONTACT = "ifanoxy@gmail.com";
export const UPDATED = { en: "29 September 2026", fr: "29 septembre 2026" };

export default {
  id: "legal",
  path: "legal/",
  title: { en: "Legal notice", fr: "Mentions légales" },
  description: {
    en: "Legal notice of the RayTeX website: publisher, host, intellectual property and liability.",
    fr: "Mentions légales du site de RayTeX : éditeur, hébergeur, propriété intellectuelle et responsabilité.",
  },
  body({ T, url, GITHUB, lang }) {
    return `${pageHead(T("Legal", "Informations légales"), T("Legal notice", "Mentions légales"), T(`Last updated: ${UPDATED.en}`, `Dernière mise à jour : ${UPDATED.fr}`))}
<section class="section tight">
  <div class="container narrow prose" data-reveal>
    <h2>${T("Publisher", "Éditeur du site")}</h2>
    <p>${T(
      `This website presents RayTeX, a free and open-source software project. It is published by <b>ifanoxy</b>, maintainer of the project, as a private individual and on a non-commercial basis. Director of publication: ifanoxy.`,
      `Ce site présente RayTeX, un logiciel libre et gratuit. Il est édité par <b>ifanoxy</b>, mainteneur du projet, à titre personnel et non commercial. Directeur de la publication : ifanoxy.`,
    )}</p>
    <p>${T(
      "As a non-professional publisher, the maintainer has chosen not to publish their identity, which is known to the host (article 6, III, 2 of the French law n° 2004-575 of 21 June 2004 “pour la confiance dans l'économie numérique”).",
      "Éditeur non professionnel, le mainteneur a choisi de ne pas publier son identité, connue de l'hébergeur (article 6, III, 2 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique).",
    )}</p>
    <p>${T("Contact", "Contact")} : <a href="mailto:${CONTACT}">${CONTACT}</a> · <a href="${GITHUB}/issues">${T("GitHub issues", "tickets GitHub")}</a></p>

    <h2>${T("Host", "Hébergeur")}</h2>
    <p>GitHub, Inc. (GitHub Pages)<br />88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, ${T("United States", "États-Unis")}<br /><a href="https://github.com">github.com</a> · <a href="https://support.github.com">support.github.com</a></p>
    <p>${T("The files offered for download are hosted by GitHub as well, in the releases of the project's repository.", "Les fichiers proposés au téléchargement sont également hébergés par GitHub, dans les versions (releases) du dépôt du projet.")}</p>

    <h2>${T("Intellectual property", "Propriété intellectuelle")}</h2>
    <p>${T(
      `The source code of RayTeX and of this website, its texts and its images are the work of the RayTeX contributors and are distributed under the MIT license or the Apache License 2.0, at your choice (see <a href="${url("license/")}">License</a>). The fonts Inter and JetBrains Mono are under the SIL Open Font License 1.1.`,
      `Le code source de RayTeX et de ce site, ses textes et ses images sont l'œuvre des contributeurs de RayTeX et sont distribués sous la licence MIT ou la licence Apache 2.0, au choix (voir <a href="${url("license/")}">Licence</a>). Les polices Inter et JetBrains Mono sont sous licence SIL Open Font License 1.1.`,
    )}</p>
    <p>${T(
      "The name and the logo of RayTeX identify the project: you are welcome to use them to talk about RayTeX, but not in a way that suggests that the project endorses you or your product.",
      "Le nom et le logo de RayTeX identifient le projet : vous pouvez les utiliser pour parler de RayTeX, mais pas d'une façon qui laisse croire que le projet vous soutient, vous ou votre produit.",
    )}</p>
    <p>${T(
      "TeX is a trademark of the American Mathematical Society. Windows is a trademark of Microsoft Corporation; macOS and Mac of Apple Inc.; Linux of Linus Torvalds; GitHub of GitHub, Inc. RayTeX is an independent project, not affiliated with the LaTeX Project, TUG, MiKTeX, Overleaf or any of these companies.",
      "TeX est une marque de l'American Mathematical Society. Windows est une marque de Microsoft Corporation ; macOS et Mac d'Apple Inc. ; Linux de Linus Torvalds ; GitHub de GitHub, Inc. RayTeX est un projet indépendant, sans lien avec le LaTeX Project, TUG, MiKTeX, Overleaf ni aucune de ces entreprises.",
    )}</p>

    <h2>${T("Liability", "Responsabilité")}</h2>
    <p>${T(
      "RayTeX is provided “as is”, without warranty of any kind, as stated by its licenses. The publisher takes care of the accuracy of this website but cannot guarantee that it is complete, free of errors or always available, and is not responsible for the content of the external sites it links to.",
      "RayTeX est fourni « tel quel », sans garantie d'aucune sorte, comme le précisent ses licences. L'éditeur veille à l'exactitude de ce site mais ne peut garantir qu'il soit complet, exempt d'erreurs ou toujours disponible, et n'est pas responsable du contenu des sites externes vers lesquels il renvoie.",
    )}</p>

    <h2>${T("Personal data", "Données personnelles")}</h2>
    <p>${T(`This website sets no cookie and measures no audience. The details are in the <a href="${url("privacy/")}">privacy policy</a>.`, `Ce site ne dépose aucun cookie et ne mesure pas l'audience. Les détails sont dans la <a href="${url("privacy/")}">politique de confidentialité</a>.`)}</p>
    ${lang === "en" ? `<p class="muted small">This notice is also available <a href="${url("legal/", "fr")}" hreflang="fr">in French</a>, the version that prevails.</p>` : ""}
  </div>
</section>`;
  },
};
