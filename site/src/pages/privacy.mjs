import { pageHead } from "../util.mjs";
import { CONTACT, UPDATED } from "./legal.mjs";

export default {
  id: "privacy",
  path: "privacy/",
  title: { en: "Privacy policy", fr: "Politique de confidentialité" },
  description: {
    en: "RayTeX collects no personal data: no account, no telemetry, no cookies. What the website and the application do with the network, in detail.",
    fr: "RayTeX ne collecte aucune donnée personnelle : ni compte, ni télémétrie, ni cookie. Ce que le site et l'application font du réseau, en détail.",
  },
  body({ T, GITHUB }) {
    return `${pageHead(
      T("Privacy", "Confidentialité"),
      T("Privacy policy", "Politique de confidentialité"),
      T(`In short: we collect nothing about you. Last updated: ${UPDATED.en}`, `En bref : nous ne collectons rien sur vous. Dernière mise à jour : ${UPDATED.fr}`),
    )}
<section class="section tight">
  <div class="container narrow prose" data-reveal>
    <div class="summary-cards">
      <div class="card"><strong>0</strong><span>${T("cookies", "cookie")}</span></div>
      <div class="card"><strong>0</strong><span>${T("audience measurement", "mesure d'audience")}</span></div>
      <div class="card"><strong>0</strong><span>${T("telemetry in the application", "télémétrie dans l'application")}</span></div>
    </div>

    <h2>${T("The website", "Le site")}</h2>
    <p>${T(
      "This website is a set of static pages. It sets no cookie, has no audience measurement, no advertising and no third-party tracker; its fonts are served by the site itself.",
      "Ce site est un ensemble de pages statiques. Il ne dépose aucun cookie, n'a ni mesure d'audience, ni publicité, ni traceur tiers ; ses polices sont servies par le site lui-même.",
    )}</p>
    <ul>
      <li>${T(
        '<b>Hosting.</b> The site is hosted by GitHub Pages. Like any web server, GitHub receives the technical data of each request (IP address, browser, page asked for) and may keep them in its logs for security; see the <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement">GitHub privacy statement</a>. The publisher of the site has no access to these logs.',
        '<b>Hébergement.</b> Le site est hébergé par GitHub Pages. Comme tout serveur web, GitHub reçoit les données techniques de chaque requête (adresse IP, navigateur, page demandée) et peut les conserver dans ses journaux pour des raisons de sécurité ; voir la <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement">déclaration de confidentialité de GitHub</a>. L\'éditeur du site n\'a pas accès à ces journaux.',
      )}</li>
      <li>${T(
        "<b>Downloads.</b> The files are served by GitHub (release assets). To show the versions, the pages read a list prepared with the site; if it is missing, your browser asks GitHub's public API for it directly.",
        "<b>Téléchargements.</b> Les fichiers sont servis par GitHub (fichiers des versions). Pour afficher les versions, les pages lisent une liste préparée avec le site ; si elle manque, votre navigateur la demande directement à l'API publique de GitHub.",
      )}</li>
      <li>${T(
        "<b>Your preferences.</b> The theme (light or dark) and the language you choose are kept in your browser's local storage, on your device only. Clearing your browser's data removes them.",
        "<b>Vos préférences.</b> Le thème (clair ou sombre) et la langue que vous choisissez sont gardés dans le stockage local de votre navigateur, sur votre appareil uniquement. Effacer les données du navigateur les supprime.",
      )}</li>
      <li>${T(
        "<b>Your system.</b> To suggest the right file, the download pages read your operating system and processor type from your browser. This happens in your browser; nothing is sent anywhere.",
        "<b>Votre système.</b> Pour proposer le bon fichier, les pages de téléchargement lisent votre système d'exploitation et votre type de processeur dans le navigateur. Cela se passe dans votre navigateur ; rien n'est envoyé nulle part.",
      )}</li>
    </ul>

    <h2>${T("The application", "L'application")}</h2>
    <p>${T(
      "RayTeX needs no account and contains no telemetry, no statistics and no crash reporting. Your documents, projects, settings and templates stay on your computer.",
      "RayTeX ne demande aucun compte et ne contient ni télémétrie, ni statistiques, ni envoi de rapports de plantage. Vos documents, projets, réglages et modèles restent sur votre ordinateur.",
    )}</p>
    <p>${T("It uses the network only in these cases:", "Il n'utilise le réseau que dans ces cas :")}</p>
    <ul>
      <li>${T("<b>The CTAN catalogue</b> (ctan.org), when you browse or search the packages that are not installed, or open a package's page.", "<b>Le catalogue CTAN</b> (ctan.org), quand vous parcourez ou cherchez les packages non installés, ou ouvrez la page d'un package.")}</li>
      <li>${T("<b>Installing a TeX distribution or packages</b>: the commands, shown to you before they run, download from the servers of the distribution (TeX Live, MiKTeX, TinyTeX, Tectonic…). With MiKTeX, missing packages are installed automatically during builds unless you turn that setting off.", "<b>L'installation d'une distribution TeX ou de packages</b> : les commandes, montrées avant d'être lancées, téléchargent depuis les serveurs de la distribution (TeX Live, MiKTeX, TinyTeX, Tectonic…). Avec MiKTeX, les packages manquants s'installent automatiquement pendant les compilations, sauf si vous désactivez ce réglage.")}</li>
      <li>${T("<b>Links</b> you click (documentation, this website, GitHub) open in your browser.", "<b>Les liens</b> sur lesquels vous cliquez (documentation, ce site, GitHub) s'ouvrent dans votre navigateur.")}</li>
    </ul>
    <p>${T("Those services apply their own privacy policies. Your documents are never sent to them.", "Ces services appliquent leur propre politique de confidentialité. Vos documents ne leur sont jamais envoyés.")}</p>

    <h2>${T("Contributing on GitHub", "Contribuer sur GitHub")}</h2>
    <p>${T(
      `Issues, discussions and contributions on <a href="${GITHUB}">GitHub</a> are public and governed by GitHub's terms. Do not put personal information in a bug report; a security problem is reported <a href="${GITHUB}/security/advisories/new">privately</a>.`,
      `Les tickets, discussions et contributions sur <a href="${GITHUB}">GitHub</a> sont publics et relèvent des conditions de GitHub. Ne mettez pas d'informations personnelles dans un rapport de bug ; un problème de sécurité se signale <a href="${GITHUB}/security/advisories/new">en privé</a>.`,
    )}</p>

    <h2>${T("Your rights", "Vos droits")}</h2>
    <p>${T(
      `Since the publisher processes no personal data, there is nothing to consult, correct or delete on their side. For any question, write to <a href="mailto:${CONTACT}">${CONTACT}</a>. In the European Union you may also lodge a complaint with your data protection authority (in France, the <a href="https://www.cnil.fr">CNIL</a>).`,
      `L'éditeur ne traitant aucune donnée personnelle, il n'y a rien à consulter, corriger ou supprimer de son côté. Pour toute question, écrivez à <a href="mailto:${CONTACT}">${CONTACT}</a>. Dans l'Union européenne, vous pouvez aussi saisir votre autorité de protection des données (en France, la <a href="https://www.cnil.fr">CNIL</a>).`,
    )}</p>
    <h2>${T("Changes", "Modifications")}</h2>
    <p>${T(`This policy changes with the site; its history is public in the <a href="${GITHUB}/commits/main/site">repository</a>.`, `Cette politique évolue avec le site ; son historique est public dans le <a href="${GITHUB}/commits/main/site">dépôt</a>.`)}</p>
  </div>
</section>`;
  },
};
