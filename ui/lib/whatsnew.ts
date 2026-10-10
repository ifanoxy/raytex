// What each version of RayTeX brings: a summary in a few points, and
// everything in detail behind "See more". Shown when a new version is
// offered (the notes of the release are written from this file, and read
// back by the version that offers it), at the first start after an update,
// and from Help › What's new.
//
// One entry per version, the latest first, in English and French. The tests
// ask for the entry of the current version: a release cannot go without it.
// A word between `backquotes` is shown as code.

export type NotesLang = "en" | "fr";

/** A part of the details: a title and its lines. */
export interface NotesSection {
  title: string;
  items: string[];
}

/** What a version brings, in one language. */
export interface Notes {
  /** The summary: a few short points. */
  points: string[];
  /** Everything, in detail. */
  details: NotesSection[];
}

export interface VersionNotes {
  version: string;
  /** Day of publication (YYYY-MM-DD). */
  date: string;
  en: Notes;
  fr: Notes;
}

export const NOTES: VersionNotes[] = [
  {
    version: "0.4.2",
    date: "2026-10-08",
    en: {
      points: [
        "A TikZ whiteboard that is easier to draw on: selection with a rectangle, copies, shapes resized together.",
        "Sets: shapes kept under a name, drawn again with one click in any project.",
        "A lighter side panel, and a LaTeX rendering that is larger and always whole.",
        "Small previews work again in a document that has a page layout.",
      ],
      details: [
        {
          title: "TikZ whiteboard",
          items: [
            "With the selection tool, a drag on the paper draws a rectangle that selects what it touches; the view moves with Space, the middle button or the wheel.",
            "Once a shape is drawn, the selection tool comes back; a pin under the tools keeps the tool for several shapes in a row. A double-click on the paper writes a text.",
            "Alt and a drag leave a copy; a Duplicate button; Ctrl/⌘ + C, X and V copy, cut and paste, also from one picture to another.",
            "Several selected shapes are resized together by the corners of their box, and a bar at the top of the board holds what is done to a selection.",
            "The view frames the drawing by itself when the studio opens and when you come back from another tab.",
          ],
        },
        {
          title: "Sets",
          items: [
            "Keep the selection makes a set on the shelf under the paper; a click on its picture draws it again, a click on its name renames it.",
            "Sets are kept next to the settings and serve in every project.",
          ],
        },
        {
          title: "Side panel and rendering",
          items: [
            "The look of the selection in a few groups (line, filling, text), the rest behind Advanced; the grid has its own button under the tools.",
            "The LaTeX rendering takes nearly half of the panel, always shows the whole picture, and its upper edge is dragged to resize it.",
          ],
        },
        {
          title: "Fixed",
          items: [
            "Small previews (TikZ picture, font sample, command trial) failed in a document that has a page style, and a picture could be cut at the bottom when the header has a height of its own.",
            "A filling without a colour (`\\fill`) came back from the whiteboard as an outline.",
            "Back from the code, the drawing could show tiny in a corner.",
          ],
        },
      ],
    },
    fr: {
      points: [
        "Un tableau blanc TikZ plus simple : sélection au rectangle, copies, formes redimensionnées ensemble.",
        "Les ensembles : des formes gardées sous un nom, redessinées d'un clic dans n'importe quel projet.",
        "Un panneau de droite allégé, et un rendu LaTeX plus grand et toujours entier.",
        "Les petits aperçus fonctionnent de nouveau dans un document qui a une mise en page.",
      ],
      details: [
        {
          title: "Tableau blanc TikZ",
          items: [
            "Avec l'outil de sélection, glisser sur le papier trace un rectangle qui sélectionne ce qu'il touche ; la vue se déplace avec Espace, le bouton du milieu ou la molette.",
            "Après une forme, l'outil de sélection revient ; une épingle sous les outils garde l'outil pour plusieurs formes de suite. Un double-clic sur le papier écrit un texte.",
            "Alt et un glisser laissent une copie ; un bouton Dupliquer ; Ctrl/⌘ + C, X et V copient, coupent et collent, aussi d'un schéma à l'autre.",
            "Plusieurs formes sélectionnées se redimensionnent ensemble par les coins de leur cadre, et une barre en haut du tableau regroupe les actions sur la sélection.",
            "La vue se cadre toute seule sur le dessin à l'ouverture du studio et au retour depuis un autre onglet.",
          ],
        },
        {
          title: "Ensembles",
          items: [
            "Garder la sélection crée un ensemble sur l'étagère sous le papier ; un clic sur sa vignette le redessine, un clic sur son nom le renomme.",
            "Les ensembles sont gardés à côté des réglages et servent dans tous les projets.",
          ],
        },
        {
          title: "Panneau et rendu",
          items: [
            "L'apparence de la sélection en quelques groupes (trait, remplissage, texte), le reste derrière Avancé ; la grille a son bouton sous les outils.",
            "Le rendu LaTeX occupe près de la moitié du panneau, montre toujours le schéma entier, et son bord supérieur se fait glisser pour l'agrandir.",
          ],
        },
        {
          title: "Corrections",
          items: [
            "Les petits aperçus (schéma TikZ, essai de police, essai de commande) échouaient dans un document qui a un style de page, et un schéma pouvait être coupé en bas quand l'en-tête a une hauteur réglée.",
            "Un remplissage sans couleur (`\\fill`) revenait du tableau comme un simple contour.",
            "Au retour depuis le code, le dessin pouvait apparaître minuscule dans un coin.",
          ],
        },
      ],
    },
  },
  {
    version: "0.4.1",
    date: "2026-10-08",
    en: {
      points: ["The display of the installed application, broken in 0.4.0, is repaired."],
      details: [
        {
          title: "Fixed",
          items: [
            "Panels at the wrong size, formula previews and menus out of place: the launch screen had its styles written in the page itself, which the security policy of the installed application refused, along with every other inline style of the interface.",
          ],
        },
      ],
    },
    fr: {
      points: ["L'affichage de l'application installée, cassé dans la 0.4.0, est réparé."],
      details: [
        {
          title: "Correction",
          items: [
            "Panneaux à la mauvaise taille, aperçus de formules et menus mal placés : l'écran de chargement avait ses styles écrits dans la page elle-même, ce que la politique de sécurité de l'application installée refusait, avec tous les autres styles en ligne de l'interface.",
          ],
        },
      ],
    },
  },
  {
    version: "0.4.0",
    date: "2026-10-08",
    en: {
      points: [
        "Page layout: margins and page styles set with fields, seen on real pages before anything is written.",
        "Tab writes a snippet after its trigger: `fig` a figure, `eq` an equation, `doc` the minimal document.",
        "Your own `@` shortcuts, next to those of RayTeX.",
        "A launch screen where the ray crosses the window.",
      ],
      details: [
        {
          title: "Page layout",
          items: [
            "See all › Page, or Margins of the document… and Page styles… in the command palette.",
            "Margins: ready-made ones or your own, the paper, the orientation, two-sided pages, the binding; what the preamble already says is read and shown. For the whole document, or from the cursor on.",
            "Page styles: a header and a footer in three fields each (page number, title of the chapter, date, a logo), their rules, and a watermark across the page, a text or an image.",
            "The main settings in sight, the others behind Advanced, with nearly all of fancyhdr.",
            "A style goes to the whole document, to the title and chapter pages, from the cursor on, to one page, or to pages by their numbers.",
          ],
        },
        {
          title: "Writing",
          items: [
            "A few letters then Tab write a snippet; the macros of the user go first, and the package a snippet needs is loaded with it.",
            "The `+` of the @ macros & snippets view makes an `@` shortcut from a key and what it writes.",
            "A shortcut needs Ctrl, ⌘ or Alt, or a function key: a key that writes text is no longer taken as the shortcut of a macro.",
          ],
        },
        {
          title: "Fixed, on macOS",
          items: [
            "“main.tex was changed by another program” came up while typing, though nothing but RayTeX wrote the file.",
            "The shortcut of a macro or of a command could not be recorded, and did not run with ⌥ and a key that writes an accent.",
            "The trigger of a macro then Tab did not always write the macro.",
          ],
        },
      ],
    },
    fr: {
      points: [
        "Mise en page : marges et styles de page réglés par des champs, vus sur de vraies pages avant que rien ne soit écrit.",
        "Tab écrit un extrait après son déclencheur : `fig` une figure, `eq` une équation, `doc` le document minimal.",
        "Vos propres raccourcis `@`, à côté de ceux de RayTeX.",
        "Un écran de chargement où la raie traverse la fenêtre.",
      ],
      details: [
        {
          title: "Mise en page",
          items: [
            "Tout voir › Page, ou Marges du document… et Styles de page… dans la palette de commandes.",
            "Marges : des marges toutes faites ou les vôtres, le papier, l'orientation, le recto verso, la reliure ; ce que dit déjà le préambule est lu et affiché. Pour tout le document, ou à partir du curseur.",
            "Styles de page : un en-tête et un pied de page en trois champs chacun (numéro de page, titre du chapitre, date, un logo), leurs filets, et un filigrane en travers de la page, un texte ou une image.",
            "Les réglages principaux en vue, les autres derrière Avancé, avec presque tout fancyhdr.",
            "Un style va à tout le document, aux pages de titre et de chapitre, à partir du curseur, à une seule page, ou à des pages par leurs numéros.",
          ],
        },
        {
          title: "Écriture",
          items: [
            "Quelques lettres puis Tab écrivent un extrait ; les macros de l'utilisateur passent d'abord, et le package dont un extrait a besoin est chargé avec lui.",
            "Le `+` de la vue Macros et extraits @ crée un raccourci `@` à partir d'une touche et de ce qu'elle écrit.",
            "Un raccourci demande Ctrl, ⌘ ou Alt, ou une touche de fonction : une touche qui écrit du texte n'est plus prise comme raccourci d'une macro.",
          ],
        },
        {
          title: "Corrections, sur macOS",
          items: [
            "« main.tex a été modifié par un autre programme » apparaissait pendant la frappe, alors que seul RayTeX écrivait le fichier.",
            "Le raccourci d'une macro ou d'une commande ne pouvait pas être enregistré, et ne se lançait pas avec ⌥ et une touche qui écrit un accent.",
            "Le déclencheur d'une macro puis Tab n'écrivait pas toujours la macro.",
          ],
        },
      ],
    },
  },
];

/** Compares two versions ("0.4.10" after "0.4.2"); what follows a hyphen is left out. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^v/, "")
      .split("-")[0]
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** The notes of a version, when they were written. */
export function notesOf(version: string, all: VersionNotes[] = NOTES): VersionNotes | null {
  return all.find((n) => compareVersions(n.version, version) === 0) ?? null;
}

/** The versions before `version`, the latest first. */
export function notesBefore(version: string, all: VersionNotes[] = NOTES): VersionNotes[] {
  return all.filter((n) => compareVersions(n.version, version) < 0).sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Whether the first start of `current` has something to tell: this version
 * was not seen yet, its notes exist, and RayTeX was used before (`known`: a
 * first installation has nothing new to learn).
 */
export function tellsAtStart(current: string, seen: string | null | undefined, known: boolean, all: VersionNotes[] = NOTES): boolean {
  if (seen && compareVersions(seen, current) >= 0) return false;
  return (known || !!seen) && !!notesOf(current, all);
}

const HEADINGS: Record<NotesLang, string> = { en: "What's new", fr: "Nouveautés" };

/**
 * The notes of a release, as the GitHub release and the update file carry
 * them: English, then French, each as a summary followed by its details.
 */
export function releaseBody(notes: VersionNotes): string {
  const block = (lang: NotesLang) =>
    [
      `## ${HEADINGS[lang]}`,
      "",
      ...notes[lang].points.map((p) => `- ${p}`),
      ...notes[lang].details.flatMap((s) => ["", `### ${s.title}`, "", ...s.items.map((i) => `- ${i}`)]),
    ].join("\n");
  return `${block("en")}\n\n---\n\n${block("fr")}\n`;
}

/** Reads notes written by `releaseBody` back, in one language; null for any other text. */
export function parseReleaseBody(body: string | null | undefined, lang: NotesLang): Notes | null {
  if (!body) return null;
  const blocks = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of body.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) blocks.set(heading[1], (current = []));
    else current?.push(line);
  }
  const lines = blocks.get(HEADINGS[lang]) ?? blocks.get(HEADINGS.en);
  if (!lines) return null;
  const notes: Notes = { points: [], details: [] };
  for (const line of lines) {
    const title = /^###\s+(.+?)\s*$/.exec(line);
    const item = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (title) notes.details.push({ title: title[1], items: [] });
    else if (item) (notes.details.at(-1)?.items ?? notes.points).push(item[1]);
  }
  return notes.points.length ? notes : null;
}

/** A line of notes as text and code (what stands between backquotes). */
export function noteParts(line: string): { text: string; code: boolean }[] {
  return line
    .split(/`([^`]+)`/)
    .map((text, i) => ({ text, code: i % 2 === 1 }))
    .filter((p) => p.text);
}
