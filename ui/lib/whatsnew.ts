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
    version: "0.5.2",
    date: "2026-10-14",
    en: {
      points: [
        "A chapter can be compiled on its own: a fraction of the time on a long document, with the numbers, pages and references it has in the document.",
        "Live compilation of long documents takes less time: one pass first, the rest once the text settles.",
        "Exporting the PDF opens a window of its own that follows the build in detail.",
        "See all is redone: a field that finds a tool by its name, the families on a rail, the tools as tiles.",
        "Previews know the commands of the project, and the preview of code is cut to the code.",
        "Fixes: the cursor stays where a click puts it, a problem is shown once, `@{` and `@[` work, table captions go under the table.",
      ],
      details: [
        {
          title: "A chapter on its own",
          items: [
            "When a part of a document is opened (a file brought in by `\\input`, `\\include` or `\\subfile`), RayTeX asks once per project what to compile while it is written: This file only, or The whole document. The choice is changed in the menu of the Build button.",
            "This file only compiles the file with the preamble of the document: on a thesis of 230 pages, a chapter takes half a second where a pass of the whole took two.",
            "The chapter keeps its numbers (chapter, sections, figures, equations), its pages, its references to the other files, its citations and the commands defined elsewhere. To know them, the whole document is compiled once, apart, and again when another file changes.",
            "A line above the PDF says which file is shown alone. The main file shows the whole document again, and an export always compiles the whole document.",
          ],
        },
        {
          title: "Live compilation of long documents",
          items: [
            "On a long document, a live build is first one pass: the page shows what was typed sooner, and the references, the table of contents and the bibliography are set right by a build that follows once the text settles.",
            "Typing again during a live build stops it for the newer text, unless it was about to finish.",
            "The pause before a live build grows a little with the time a pass takes, and the engine reads a long file less often while it is typed in.",
          ],
        },
        {
          title: "Exporting the PDF",
          items: [
            "Export PDF… opens a window of its own, apart from the main one: the steps of the build, the file the compiler reads, the page it is at, a progress bar, the time left and everything the compiler writes.",
            "It closes by itself when the PDF is written, unless Keep this window open at the end is ticked.",
          ],
        },
        {
          title: "See all and previews",
          items: [
            "See all shows the same tools another way: a field at the top finds a tool by its name as it is typed, the families are on a rail, the tools are tiles with their icon.",
            "Every preview (TikZ picture, trial of a command, sample of a font, code, title page, page layout) knows the commands of the project, wherever they are defined.",
            "The preview of the code window is a page cut to the code, under it, instead of a whole sheet with the code in small at its top.",
          ],
        },
        {
          title: "Fixes",
          items: [
            "After typing at the bottom of a text, going back up and clicking somewhere could send the letters and the view back down: a click now places the cursor where it lands, also in a window that was not in front (macOS) and in the margin.",
            "A mistake seen by several checks (a citation key by LaTeX and by Biber, a brace by the compiler and by the live checks) was shown two or three times with the same fix: it is shown once.",
            "The `@{` and `@[` shortcuts work: `@{` was never offered, and the bracket the editor closes by itself emptied the list.",
            "Tables have their caption under them: the table window, the formatting bar, the `tab` snippet and the templates.",
            "An image chosen outside the project for a page style or a title page is copied into its folder of images.",
          ],
        },
      ],
    },
    fr: {
      points: [
        "Un chapitre peut se compiler seul : une fraction du temps sur un long document, avec les numéros, les pages et les renvois qu'il a dans le document.",
        "La compilation en direct des longs documents prend moins de temps : une passe d'abord, le reste quand le texte se pose.",
        "L'export du PDF ouvre une fenêtre à part qui suit la compilation en détail.",
        "Tout voir est refait : un champ qui trouve un outil par son nom, les familles sur un rail, les outils en tuiles.",
        "Les aperçus connaissent les commandes du projet, et l'aperçu du code est coupé au code.",
        "Corrections : le curseur reste où un clic le place, un problème n'est montré qu'une fois, `@{` et `@[` fonctionnent, la légende des tableaux passe dessous.",
      ],
      details: [
        {
          title: "Un chapitre seul",
          items: [
            "Quand un fichier annexe est ouvert (un fichier inclus par `\\input`, `\\include` ou `\\subfile`), RayTeX demande une fois par projet ce qu'il faut compiler pendant qu'il est écrit : Ce fichier seul, ou Tout le document. Le choix se change dans le menu du bouton Compiler.",
            "Ce fichier seul compile le fichier avec le préambule du document : sur une thèse de 230 pages, un chapitre prend une demi-seconde quand une passe du tout en prenait deux.",
            "Le chapitre garde ses numéros (chapitre, sections, figures, équations), ses pages, ses renvois vers les autres fichiers, ses citations et les commandes définies ailleurs. Pour les connaître, le document entier est compilé une fois, à part, puis de nouveau quand un autre fichier change.",
            "Une ligne au-dessus du PDF dit quel fichier est montré seul. Le fichier principal montre de nouveau tout le document, et un export compile toujours le document entier.",
          ],
        },
        {
          title: "La compilation en direct des longs documents",
          items: [
            "Sur un long document, une compilation en direct ne fait d'abord qu'une passe : la page montre plus tôt ce qui vient d'être écrit, et les renvois, la table des matières et la bibliographie sont remis d'aplomb par une compilation qui suit quand le texte se pose.",
            "Reprendre la frappe pendant une compilation en direct l'arrête au profit du nouveau texte, sauf si elle allait finir.",
            "La pause avant une compilation en direct s'allonge un peu avec la durée d'une passe, et le moteur relit moins souvent un long fichier pendant la frappe.",
          ],
        },
        {
          title: "L'export du PDF",
          items: [
            "Exporter le PDF… ouvre une fenêtre à part, distincte de la fenêtre principale : les étapes de la compilation, le fichier lu par le compilateur, la page où il en est, une barre de progression, le temps restant et tout ce que le compilateur écrit.",
            "Elle se ferme seule quand le PDF est écrit, sauf si Laisser cette fenêtre ouverte à la fin est coché.",
          ],
        },
        {
          title: "Tout voir et les aperçus",
          items: [
            "Tout voir montre les mêmes outils autrement : un champ en haut trouve un outil par son nom pendant la frappe, les familles sont sur un rail, les outils sont des tuiles avec leur icône.",
            "Chaque aperçu (dessin TikZ, essai d'une commande, échantillon d'une police, code, page de titre, mise en page) connaît les commandes du projet, où qu'elles soient définies.",
            "L'aperçu de la fenêtre de code est une page coupée au code, sous celui-ci, au lieu d'une feuille entière avec le code en petit en haut.",
          ],
        },
        {
          title: "Corrections",
          items: [
            "Après avoir écrit en bas d'un texte, remonter et cliquer pour écrire ailleurs pouvait renvoyer les lettres et la vue tout en bas : un clic place désormais le curseur là où il tombe, aussi dans une fenêtre qui n'était pas au premier plan (macOS) et dans la marge.",
            "Une erreur vue par plusieurs vérifications (une clé de citation par LaTeX et par Biber, une accolade par le compilateur et par les vérifications en direct) était montrée deux ou trois fois avec la même solution : elle ne l'est plus qu'une fois.",
            "Les raccourcis `@{` et `@[` fonctionnent : `@{` n'était jamais proposé, et le crochet que l'éditeur ferme de lui-même vidait la liste.",
            "Les tableaux ont leur légende dessous : la fenêtre des tableaux, la barre de mise en forme, l'extrait `tab` et les modèles.",
            "Une image choisie hors du projet pour un style de page ou une page de titre est copiée dans son dossier d'images.",
          ],
        },
      ],
    },
  },
  {
    version: "0.5.1",
    date: "2026-10-12",
    en: {
      points: [
        "Insert code: a window for a listing, with its language, its indentation and one style for the whole document.",
        "A lighter PDF: the export asks how (images as they are, lighter, light, or under a size) and says about what each would weigh.",
        "Exporting the PDF while the document compiles no longer writes a broken file, and a small window follows the build.",
        "Images inserted together are one group: one chip opens them all, and their order is changed by dragging.",
        "Lighter images on their way into the project, with what each one will weigh.",
        "The TikZ studio holds in a small window: its tools and its settings no longer run over each other.",
      ],
      details: [
        {
          title: "Code in the document",
          items: [
            "Insert code… (See all, or the command palette) opens a window with the code on the left and, on the right, its settings and the listing compiled by LaTeX. It writes the `listings` package: every engine, every distribution, no outside tool.",
            "About forty languages; those `listings` does not know (JavaScript, TypeScript, Rust, Go, JSON, YAML…) come with their definition, written in the preamble when they are used.",
            "Indentation: 2 spaces, 4 spaces or Tabs writes the code again level by level. Code pasted from the middle of a file comes back to the margin, and tabs mixed with spaces are pointed out.",
            "One style for the whole document: Light, Plain (black and white, for print) or Dark, line numbers, line wrapping, a frame, the size of the text.",
            "LaTeX measures how many characters a line holds: the window says how many lines are too long, with line wrapping or a smaller text one click away. Accented letters work with pdfLaTeX too, and in a beamer presentation the frame gets the `fragile` option.",
            "The Code chip after `\\begin{lstlisting}` opens the window again on that code.",
          ],
        },
        {
          title: "Exporting the PDF",
          items: [
            "The PDF was copied at once, even while the compiler was writing it: the copy had a start and no end. It is now never copied while a build writes it, and a copy is written whole or not at all.",
            "Export PDF… compiles first when it has to, and a small window over the rest follows that build: the step of the compiler, the page it is at, a progress bar and an estimate of the time left. It closes when the PDF is written; closed before, the export goes on.",
            "A build that ends with errors exports nothing by itself: the window shows them, or exports the PDF as it is on request.",
          ],
        },
        {
          title: "A lighter PDF",
          items: [
            "When the document has PNG or JPEG images, Export PDF… asks how: Images as they are, Lighter images, Light images, or No more than a size in megabytes. Each choice says about what the PDF would weigh.",
            "Neither the images nor the project are touched: the document is built once more, apart, with lighter copies of its images.",
            "Under a size, RayTeX picks the gentlest compression that should do, weighs the PDF it gets and goes further while it is over; a limit that cannot be met is said, with the weight that was reached.",
          ],
        },
        {
          title: "Images",
          items: [
            "Images inserted together (sub-figures, or images side by side) have one chip, 2 images: a click opens the window on all of them, with their order, their captions and their layout.",
            "Their order is changed by dragging each image by its handle, and the sketch of the page shows every image at its place.",
            "Weight of the images: Original, Lighter or Light. A photograph is made smaller and written as a JPEG, a drawing or a screenshot stays a PNG without loss, and each image says what it weighs and what it will weigh. The image you chose is never changed.",
          ],
        },
        {
          title: "Fixed",
          items: [
            "TikZ studio: in a window that is not tall, the tools were squeezed and ran over the bottom bar, and the settings were cut by the rendering. The tools take two columns when one does not fit, and the rendering keeps a fair size.",
          ],
        },
      ],
    },
    fr: {
      points: [
        "Insérer du code : une fenêtre pour un listing, avec son langage, son indentation et un style pour tout le document.",
        "Un PDF plus léger : l'export demande comment (images d'origine, allégées, légères, ou sous une taille) et dit à peu près ce que chacun pèserait.",
        "Exporter le PDF pendant la compilation n'écrit plus de fichier corrompu, et une petite fenêtre suit la compilation.",
        "Les images insérées ensemble forment un groupe : une seule pastille les rouvre toutes, et leur ordre se change en les faisant glisser.",
        "Des images allégées à leur entrée dans le projet, avec ce que chacune pèsera.",
        "Le studio TikZ tient dans une petite fenêtre : ses outils et ses réglages ne se chevauchent plus.",
      ],
      details: [
        {
          title: "Du code dans le document",
          items: [
            "Insérer du code… (Tout voir, ou la palette de commandes) ouvre une fenêtre avec le code à gauche et, à droite, ses réglages et le listing compilé par LaTeX. Elle écrit le paquet `listings` : tous les moteurs, toutes les distributions, aucun outil externe.",
            "Une quarantaine de langages ; ceux que `listings` ne connaît pas (JavaScript, TypeScript, Rust, Go, JSON, YAML…) viennent avec leur définition, écrite dans le préambule quand ils sont utilisés.",
            "Indentation : 2 espaces, 4 espaces ou Tabulations réécrit le code niveau par niveau. Un code collé depuis le milieu d'un fichier revient à la marge, et des tabulations mélangées à des espaces sont signalées.",
            "Un style pour tout le document : Clair, Sobre (noir et blanc, pour l'impression) ou Sombre, numéros de ligne, retour à la ligne, cadre, taille du texte.",
            "LaTeX mesure combien de caractères tient une ligne : la fenêtre dit combien de lignes sont trop longues, avec le retour à la ligne ou un texte plus petit à un clic. Les lettres accentuées passent aussi avec pdfLaTeX, et dans une présentation beamer la diapositive reçoit l'option `fragile`.",
            "La pastille Code après `\\begin{lstlisting}` rouvre la fenêtre sur ce code.",
          ],
        },
        {
          title: "Export du PDF",
          items: [
            "Le PDF était copié tout de suite, même pendant que le compilateur l'écrivait : la copie avait un début et pas de fin. Il n'est plus jamais copié pendant qu'une compilation l'écrit, et une copie est écrite entière ou pas du tout.",
            "Exporter le PDF… compile d'abord quand il le faut, et une petite fenêtre par-dessus le reste suit cette compilation : l'étape du compilateur, la page en cours, une barre de progression et une estimation du temps restant. Elle se ferme quand le PDF est écrit ; fermée avant, l'export continue.",
            "Une compilation qui se termine avec des erreurs n'exporte rien d'elle-même : la fenêtre les montre, ou exporte le PDF tel quel sur demande.",
          ],
        },
        {
          title: "Un PDF plus léger",
          items: [
            "Quand le document contient des images PNG ou JPEG, Exporter le PDF… demande comment : Images d'origine, Images allégées, Images légères, ou Ne pas dépasser une taille en mégaoctets. Chaque choix dit à peu près ce que pèserait le PDF.",
            "Ni les images ni le projet ne sont modifiés : le document est compilé une fois de plus, à part, avec des copies allégées de ses images.",
            "Sous une taille, RayTeX choisit la compression la plus douce qui devrait suffire, pèse le PDF obtenu et compresse davantage tant qu'il dépasse ; une limite qui ne peut pas être tenue est dite, avec le poids atteint.",
          ],
        },
        {
          title: "Images",
          items: [
            "Les images insérées ensemble (sous-figures, ou images côte à côte) ont une seule pastille, 2 images : un clic rouvre la fenêtre sur toutes, avec leur ordre, leurs légendes et leur disposition.",
            "Leur ordre se change en faisant glisser chaque image par sa poignée, et l'aperçu de la page montre chaque image à sa place.",
            "Poids des images : D'origine, Allégé ou Léger. Une photo est réduite et écrite en JPEG, un schéma ou une capture d'écran reste en PNG sans perte, et chaque image dit ce qu'elle pèse et ce qu'elle pèsera. L'image que vous avez choisie n'est jamais modifiée.",
          ],
        },
        {
          title: "Corrections",
          items: [
            "Studio TikZ : dans une fenêtre peu haute, les outils étaient écrasés et débordaient sur la barre du bas, et les réglages étaient coupés par le rendu. Les outils passent sur deux colonnes quand une seule ne tient pas, et le rendu garde une taille correcte.",
          ],
        },
      ],
    },
  },
  {
    version: "0.5.0",
    date: "2026-10-11",
    en: {
      points: [
        "A bibliography panel: the entries of your `.bib` files listed, edited in a form, added from a DOI or an arXiv identifier.",
        "A local history of the project, to compare and to go back, and a PDF of the changes since a moment.",
        "A title page studio, and the export of the project as an archive, whole or ready for arXiv or a journal.",
        "A spell checker in the language of the document; its dictionary is downloaded once, and only when you agree.",
        "TikZ whiteboard: links that follow the texts they join, alignment guides, a curve tool, sets as a file.",
        "With MiKTeX, a language or a file that is missing is installed in one click, and the margins window measures the page.",
      ],
      details: [
        {
          title: "Bibliography",
          items: [
            "The book in the bar on the left lists every entry of the `.bib` files of the project, with its key, its title, its authors and how many times it is cited.",
            "A click opens an entry in a form: the usual fields of its kind in sight, the others behind Advanced. What the file says is kept as it is written, and a change can be undone.",
            "A new entry from a DOI, an arXiv identifier or pasted BibTeX: Fill in fills the fields and suggests a key. The network is used for that only, when you ask.",
            "Not cited lists the entries the document never cites, To check the duplicate keys and the works entered twice.",
          ],
        },
        {
          title: "Local history",
          items: [
            "RayTeX keeps moments of the source files. Project history shows them by day and, for the one chosen, what changed since, file by file and line by line.",
            "Restore this file and Restore everything go back; the project as it is now is kept first, and going back can itself be undone.",
            "Light by default: a moment when the project opens, then at most one every 10 minutes, none when nothing changed; old moments thin out. Nothing is written in the project folder, nothing leaves the computer.",
            "A PDF of the changes since a moment: removed text struck out, added text underlined, made by `latexdiff` and compiled like the project.",
            "Settings › Editor › Local history sets the time between two moments and how long they are kept, or turns the history off.",
          ],
        },
        {
          title: "Title page",
          items: [
            "See all › Page › Title page… writes the title page from a few fields, with the page compiled next to them.",
            "Four layouts chosen by their picture: Classic (`\\maketitle`), Centered, Report and Modern; the institution, the supervisors and a logo in their group.",
            "The code is plain LaTeX, each line saying what it is: it can be touched up by hand, and the window opened again finds its fields. With beamer, it sets the title frame.",
          ],
        },
        {
          title: "Export of the project",
          items: [
            "Export the project… makes a `.zip` archive, whose content is listed before anything is written.",
            "The whole project without the files of the build, or, for arXiv or a journal, only what the document uses, with its compiled bibliography (`.bbl`).",
            "For a submission, comments are removed unless told otherwise, and Advanced writes everything in one `.tex` file or adds the PDF.",
          ],
        },
        {
          title: "Spelling",
          items: [
            "The words the dictionary does not know are underlined in the prose only (not in commands, formulas, labels or file names), the same way on macOS, Windows and Linux.",
            "RayTeX ships no dictionary: one window says what is downloaded, its size and from where (the dictionaries of LibreOffice), with Download or Not now. Nothing else is downloaded or sent, and the checker then works without a connection.",
            "The language is read from babel, polyglossia or a `% !TEX spellcheck` line and shown at the bottom of the window; passages in another language use their own dictionary.",
            "A right click on an underlined word offers corrections and adds the word to your dictionary. Settings › Editor lists the dictionaries and removes them.",
          ],
        },
        {
          title: "TikZ whiteboard",
          items: [
            "Link tool (K): a drag from one text to another joins them with an arrow that follows them when they move; straight or bent, with a text of its own.",
            "Alignment guides: what is moved snaps to the sides and the middle of the other shapes, and a line shows what it is aligned with.",
            "Curve tool (B): a smooth curve through the points clicked, open or closed.",
            "Sets are exported to a file and imported from one, to take them to another computer.",
          ],
        },
        {
          title: "MiKTeX",
          items: [
            "A language of babel that is not installed is said before the build, on its name, with its installation.",
            "Install installs the package that holds the missing file (`scalefnt.sty` is in `carlisle`); it asked MiKTeX for a package named like the file, and nothing was installed.",
            "The margins window measured nothing with MiKTeX; it reads the lengths of the page there too.",
          ],
        },
        {
          title: "And also",
          items: [
            "Report a problem… (command palette, Settings › About) prepares a report to paste in an issue. Nothing is sent, and the folder of the project and your name are taken out of every path.",
            "What's new in RayTeX: this window, at the first start after an update and in the command palette.",
          ],
        },
      ],
    },
    fr: {
      points: [
        "Un panneau de bibliographie : les entrées de vos fichiers `.bib` listées, modifiées dans un formulaire, ajoutées depuis un DOI ou un identifiant arXiv.",
        "Un historique local du projet, pour comparer et revenir en arrière, et un PDF des changements depuis un moment.",
        "Un studio de page de titre, et l'export du projet en archive, entier ou prêt pour arXiv ou une revue.",
        "Un correcteur orthographique dans la langue du document ; son dictionnaire est téléchargé une seule fois, et seulement avec votre accord.",
        "Tableau blanc TikZ : des liens qui suivent les textes qu'ils relient, des guides d'alignement, un outil courbe, les ensembles en fichier.",
        "Avec MiKTeX, une langue ou un fichier manquant s'installe d'un clic, et la fenêtre des marges mesure la page.",
      ],
      details: [
        {
          title: "Bibliographie",
          items: [
            "Le livre dans la barre de gauche liste toutes les entrées des fichiers `.bib` du projet, avec leur clé, leur titre, leurs auteurs et le nombre de fois où elles sont citées.",
            "Un clic ouvre une entrée dans un formulaire : les champs habituels de son type en vue, les autres derrière Avancé. Ce que dit le fichier est gardé tel qu'il est écrit, et une modification s'annule.",
            "Une nouvelle entrée depuis un DOI, un identifiant arXiv ou du BibTeX collé : Remplir remplit les champs et propose une clé. Le réseau ne sert qu'à cela, quand vous le demandez.",
            "Non citées liste les entrées que le document ne cite jamais, À vérifier les clés en double et les ouvrages saisis deux fois.",
          ],
        },
        {
          title: "Historique local",
          items: [
            "RayTeX garde des moments des fichiers source. Historique du projet les montre par jour et, pour celui choisi, ce qui a changé depuis, fichier par fichier et ligne par ligne.",
            "Restaurer ce fichier et Tout restaurer reviennent en arrière ; le projet tel qu'il est est gardé d'abord, et ce retour s'annule lui aussi.",
            "Léger par défaut : un moment à l'ouverture du projet, puis au plus un toutes les 10 minutes, aucun quand rien n'a changé ; les anciens moments s'espacent. Rien n'est écrit dans le dossier du projet, rien ne quitte l'ordinateur.",
            "Un PDF des changements depuis un moment : le texte retiré barré, le texte ajouté souligné, produit par `latexdiff` et compilé comme le projet.",
            "Réglages › Éditeur › Historique local règle le temps entre deux moments et leur durée de conservation, ou désactive l'historique.",
          ],
        },
        {
          title: "Page de titre",
          items: [
            "Tout voir › Page › Page de titre… écrit la page de titre à partir de quelques champs, avec la page compilée à côté.",
            "Quatre mises en page choisies par leur image : Classique (`\\maketitle`), Centrée, Rapport et Moderne ; l'établissement, les encadrants et un logo dans leur groupe.",
            "Le code est du LaTeX simple, chaque ligne disant ce qu'elle est : il se retouche à la main, et la fenêtre rouverte retrouve ses champs. Avec beamer, elle règle la diapositive de titre.",
          ],
        },
        {
          title: "Export du projet",
          items: [
            "Exporter le projet… crée une archive `.zip`, dont le contenu est listé avant toute écriture.",
            "Le projet entier sans les fichiers de compilation, ou, pour arXiv ou une revue, seulement ce que le document utilise, avec sa bibliographie compilée (`.bbl`).",
            "Pour une soumission, les commentaires sont retirés sauf avis contraire, et Avancé écrit tout dans un seul fichier `.tex` ou ajoute le PDF.",
          ],
        },
        {
          title: "Orthographe",
          items: [
            "Les mots que le dictionnaire ne connaît pas sont soulignés dans le texte seulement (pas dans les commandes, les formules, les étiquettes ni les noms de fichiers), de la même façon sur macOS, Windows et Linux.",
            "RayTeX n'embarque aucun dictionnaire : une fenêtre dit ce qui est téléchargé, sa taille et d'où (les dictionnaires de LibreOffice), avec Télécharger ou Pas maintenant. Rien d'autre n'est téléchargé ni envoyé, et le correcteur fonctionne ensuite sans connexion.",
            "La langue est lue dans babel, polyglossia ou une ligne `% !TEX spellcheck` et affichée en bas de la fenêtre ; les passages dans une autre langue utilisent leur propre dictionnaire.",
            "Un clic droit sur un mot souligné propose des corrections et ajoute le mot à votre dictionnaire. Réglages › Éditeur liste les dictionnaires et les retire.",
          ],
        },
        {
          title: "Tableau blanc TikZ",
          items: [
            "Outil lien (K) : glisser d'un texte à un autre les relie par une flèche qui les suit quand ils bougent ; droite ou courbée, avec son propre texte.",
            "Guides d'alignement : ce qui est déplacé s'aimante aux bords et au milieu des autres formes, et un trait montre avec quoi il est aligné.",
            "Outil courbe (B) : une courbe lisse par les points cliqués, ouverte ou fermée.",
            "Les ensembles s'exportent dans un fichier et s'importent depuis un fichier, pour les emporter sur un autre ordinateur.",
          ],
        },
        {
          title: "MiKTeX",
          items: [
            "Une langue de babel qui n'est pas installée est signalée avant la compilation, sur son nom, avec son installation.",
            "Installer installe le paquet qui contient le fichier manquant (`scalefnt.sty` est dans `carlisle`) ; il demandait à MiKTeX un paquet du nom du fichier, et rien n'était installé.",
            "La fenêtre des marges ne mesurait rien avec MiKTeX ; elle y lit aussi les longueurs de la page.",
          ],
        },
        {
          title: "Et aussi",
          items: [
            "Signaler un problème… (palette de commandes, Réglages › À propos) prépare un rapport à coller dans une issue. Rien n'est envoyé, et le dossier du projet et votre nom sont retirés de tous les chemins.",
            "Quoi de neuf dans RayTeX : cette fenêtre, au premier démarrage après une mise à jour et dans la palette de commandes.",
          ],
        },
      ],
    },
  },
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
