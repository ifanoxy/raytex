import { CONTACT, UPDATED } from "./legal.mjs";

export default {
  id: "privacy",
  path: "privacy/",
  title: { en: "Privacy policy", fr: "Politique de confidentialité" },
  description: {
    en: "RayTeX collects no personal data: no account, no telemetry, no cookies. What the website and the application do with the network, in detail.",
    fr: "RayTeX ne collecte aucune donnée personnelle : ni compte, ni télémétrie, ni cookie. Ce que le site et l'application font du réseau, en détail.",
  },
  body({ T, GITHUB, tex }) {
    return `${tex.chapter("H", T("Privacy policy", "Politique de confidentialité"), {
      stamp: [T("0 trackers", "0 traceur"), "green", -8],
      epigraph: [T("What we know about you: ∅.", "Ce que nous savons de vous : ∅."), T("this policy, in one line", "cette politique, en une ligne")],
      lead: T(`In short: we collect nothing about you. Last updated: ${UPDATED.en}.`, `En bref : nous ne collectons rien sur vous. Dernière mise à jour : ${UPDATED.fr}.`),
    })}
${tex.eq(String.raw`\#\,\text{${T("cookies", "cookies")}} \;=\; \#\,\text{${T("trackers", "traceurs")}} \;=\; \#\,\text{${T("telemetry events", "événements de télémétrie")}} \;=\; \htmlClass{hbox hbox-green}{\htmlClass{tx-green}{0}}`)}

${tex.section(T("The website", "Le site"), "website")}
<p data-reveal>${T(
      "This website is a set of static pages. It sets no cookie, has no audience measurement, no advertising and no third-party tracker; its fonts are served by the site itself.",
      "Ce site est un ensemble de pages statiques. Il ne dépose aucun cookie, n'a ni mesure d'audience, ni publicité, ni traceur tiers ; ses polices sont servies par le site lui-même.",
    )}</p>
<ul class="itemize" data-reveal>
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

${tex.section(T("The application", "L'application"), "application")}
<p data-reveal>${T(
      "RayTeX needs no account and contains no telemetry, no statistics and no crash reporting. Your documents, projects, settings and templates stay on your computer.",
      "RayTeX ne demande aucun compte et ne contient ni télémétrie, ni statistiques, ni envoi de rapports de plantage. Vos documents, projets, réglages et modèles restent sur votre ordinateur.",
    )}</p>
<p data-reveal>${T("It uses the network only in these cases:", "Il n'utilise le réseau que dans ces cas :")}</p>
<ul class="itemize" data-reveal>
      <li>${T("<b>The CTAN catalogue</b> (ctan.org), when you browse or search the packages that are not installed, or open a package's page.", "<b>Le catalogue CTAN</b> (ctan.org), quand vous parcourez ou cherchez les packages non installés, ou ouvrez la page d'un package.")}</li>
      <li>${T("<b>Installing a TeX distribution or packages</b>: the commands, shown to you before they run, download from the servers of the distribution (TeX Live, MiKTeX, TinyTeX, Tectonic…). With MiKTeX, missing packages are installed automatically during builds unless you turn that setting off.", "<b>L'installation d'une distribution TeX ou de packages</b> : les commandes, montrées avant d'être lancées, téléchargent depuis les serveurs de la distribution (TeX Live, MiKTeX, TinyTeX, Tectonic…). Avec MiKTeX, les packages manquants s'installent automatiquement pendant les compilations, sauf si vous désactivez ce réglage.")}</li>
      <li>${T(
        "<b>Updates</b>: at start, RayTeX asks GitHub whether a new version exists (it reads a small file, <code>latest.json</code>, from the project's releases), and downloads it if you accept. Like any web request, it gives GitHub your IP address; nothing else is sent. You can turn it off in <b>Settings → About</b>.",
        "<b>Les mises à jour</b> : au démarrage, RayTeX demande à GitHub si une nouvelle version existe (il lit un petit fichier, <code>latest.json</code>, dans les versions du projet), et la télécharge si vous acceptez. Comme toute requête web, cela donne votre adresse IP à GitHub ; rien d'autre n'est envoyé. Vous pouvez le désactiver dans <b>Réglages → À propos</b>.",
      )}</li>
      <li>${T("<b>Links</b> you click (documentation, this website, GitHub) open in your browser.", "<b>Les liens</b> sur lesquels vous cliquez (documentation, ce site, GitHub) s'ouvrent dans votre navigateur.")}</li>
</ul>
<p data-reveal>${T("Those services apply their own privacy policies. Your documents are never sent to them.", "Ces services appliquent leur propre politique de confidentialité. Vos documents ne leur sont jamais envoyés.")}</p>

${tex.section(T("Contributing on GitHub", "Contribuer sur GitHub"), "github")}
<p data-reveal>${T(
      `Issues, discussions and contributions on <a href="${GITHUB}">GitHub</a> are public and governed by GitHub's terms. Do not put personal information in a bug report; a security problem is reported <a href="${GITHUB}/security/advisories/new">privately</a>.`,
      `Les tickets, discussions et contributions sur <a href="${GITHUB}">GitHub</a> sont publics et relèvent des conditions de GitHub. Ne mettez pas d'informations personnelles dans un rapport de bug ; un problème de sécurité se signale <a href="${GITHUB}/security/advisories/new">en privé</a>.`,
    )}</p>

${tex.section(T("Your rights", "Vos droits"), "rights")}
<p data-reveal>${T(
      `Since the publisher processes no personal data, there is nothing to consult, correct or delete on their side. For any question, write to <a href="mailto:${CONTACT}">${CONTACT}</a>. In the European Union you may also lodge a complaint with your data protection authority (in France, the <a href="https://www.cnil.fr">CNIL</a>).`,
      `L'éditeur ne traitant aucune donnée personnelle, il n'y a rien à consulter, corriger ou supprimer de son côté. Pour toute question, écrivez à <a href="mailto:${CONTACT}">${CONTACT}</a>. Dans l'Union européenne, vous pouvez aussi saisir votre autorité de protection des données (en France, la <a href="https://www.cnil.fr">CNIL</a>).`,
    )}</p>
${tex.section(T("Changes", "Modifications"), "changes")}
<p data-reveal>${T(`This policy changes with the site; its history is public in the <a href="${GITHUB}/commits/main/site">repository</a>.`, `Cette politique évolue avec le site ; son historique est public dans le <a href="${GITHUB}/commits/main/site">dépôt</a>.`)}</p>`;
  },
};
