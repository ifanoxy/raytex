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
    version: "1.0.0",
    date: "2026-10-23",
    en: {
      points: [
        "Version 1: every command, every feature and features used together checked in the real application, on macOS, Windows and Linux, with TeX Live and MiKTeX.",
        "No more stop of the application: a fault in a check stops that check only, and texts of any script (Chinese, Korean) are read without one.",
        "Saves always in the order made: two saves of a file at once never leave the older text on the disk.",
        "Large projects checked in a moment: 400 files in 0.04 s instead of 8.9 s, a folder of thousands of documents in seconds.",
        "Folders of any name: accents, spaces, apostrophes, on Windows too.",
        "Builds that say the truth: no errors of the pass before (MiKTeX), Biber repaired by itself, a PDF never drawn half written.",
      ],
      details: [
        {
          title: "Reliability",
          items: [
            "A fault in one of the checks of the text stops that check only: the application no longer closes. Two checks cut a text of Chinese or Korean in the middle of a letter; every file of TeX Live is now read as the editor reads it, in the tests.",
            "Two saves of a file at once (the automatic one and the one before a build) go one after the other: the older text could reach the disk last while the tab said saved, and the build compiled what had been taken out. The settings, the open files, the project settings and the TikZ shape sets are saved in order too.",
            "Settings written by another release keep what can be read: one value unknown left every setting at its default. Only that value is, and the file as it was is kept beside it (`settings.toml.unread`); the project file is read the same way.",
            "Another project opened, or the project closed, during a build stops the build: its page and its problems no longer appear in the other project. Cleaning the build files during a build stops it first (on Windows they could not be removed).",
            "An open file renamed keeps what was typed in it; the changes of another program are seen in a folder opened through a link (a synced folder); a studio closed before its preview compiles nothing.",
            "What's new opens after an update only: at the very first start, opened with a file, it opened too (the file just opened was taken for an older use) and took the Escape meant for the window below.",
            "Linux: a file only read (by TeX, by the viewer, by RayTeX itself) is no longer taken for a file changed. Each reading was told as a change and read again: the PDF reloaded without end, a file said changed by another program, the project read again from the disk.",
          ],
        },
        {
          title: "Builds",
          items: [
            "The log is emptied before each pass: an engine that stops before writing it (MiKTeX 26.5 on some precompiled preambles) no longer shows the errors of the pass before. The pass is done again without the preamble, and the stop is said.",
            "Biber stopping without a word (macOS empties the copy it unpacks) is repaired by the build itself; two Biber runs no longer meet; a folder with accents keeps its bibliography.",
            "A PDF read while the next build writes it is not shown: the pages stay as they were until it is whole, and no thumbnail is made from half of it.",
            "Windows, folders with accents: the names of files TeX writes in the code page of the system are read as they are (from the PDF back to the text, the export, an `.aux` brought in, the errors of BibTeX, the files a build read).",
            "The log as MiKTeX writes it, its lines cut at 79: put back together with XeLaTeX (it counts letters, not bytes) and LuaLaTeX too, and a letter cut in two by pdfLaTeX read whole; a file whose folder has spaces is known as the one read. In a folder with accents or spaces, a problem was said in another file, or without its line.",
          ],
        },
        {
          title: "Checks and errors",
          items: [
            "A mistake said by LaTeX and by the live checks is shown and counted once; the window of the problems of a line stays by its line, and its text can be copied.",
            "Documents side by side in a folder (exercise sheets) are checked apart: the labels of one no longer count in another.",
            "A class or a package not installed yet (MiKTeX installs it at the first build) is not judged on what it defines; the theorems of tcolorbox label themselves; the pictures of mwe are known.",
            "The commands of the project are drawn in the previews of formulas, tables and matrices (`\\DeclareMathOperator`, `\\DeclarePairedDelimiter`, an optional first argument), from every file.",
          ],
        },
        {
          title: "Speed",
          items: [
            "The check of the whole project, after each save, in near-linear time: 400 files in 0.04 s instead of 8.9 s; the documentation of TeX Live opened as one project (6 447 documents) in 9 s instead of 366.",
            "The problems of a file merged in a time that grows with their number (3 000 problems: 1.4 ms instead of 56), and counted once for the whole window.",
            "Spell checking a long file no longer slows typing; the pictures of the start screen are kept from one session to the next and drawn one after the other.",
            "At rest, nothing runs: no frame, timer or animation once the work is over.",
          ],
        },
        {
          title: "Editor and studios",
          items: [
            "A click in the text after it lost the focus keeps it where it was scrolled (it jumped back to the old cursor and chose the text up to there).",
            "Probability trees, function plots and tables of variations write their numbers the French way from the moment they open, in a French document.",
            "The TikZ whiteboard draws as LaTeX draws: a node of the circle shape is a circle around its text, and the label of a link stays off the line at every zoom.",
            "The help names the menus and panels as the window names them.",
          ],
        },
      ],
    },
    fr: {
      points: [
        "Version 1 : chaque commande, chaque fonction et les fonctions utilisées ensemble vérifiées dans l'application réelle, sur macOS, Windows et Linux, avec TeX Live et MiKTeX.",
        "Plus d'arrêt de l'application : une faute dans une vérification n'arrête que cette vérification, et les textes de toute écriture (chinois, coréen) sont lus sans faute.",
        "Les enregistrements toujours dans l'ordre où ils sont faits : deux enregistrements d'un fichier à la fois ne laissent jamais l'ancien texte sur le disque.",
        "Les grands projets vérifiés en un instant : 400 fichiers en 0,04 s au lieu de 8,9 s, un dossier de milliers de documents en quelques secondes.",
        "Des dossiers de tout nom : accents, espaces, apostrophes, sous Windows aussi.",
        "Des compilations qui disent vrai : plus d'erreurs de la passe précédente (MiKTeX), Biber réparé tout seul, jamais un PDF dessiné à moitié écrit.",
      ],
      details: [
        {
          title: "Fiabilité",
          items: [
            "Une faute dans l'une des vérifications du texte n'arrête que cette vérification : l'application ne se ferme plus. Deux vérifications coupaient un texte en chinois ou en coréen au milieu d'une lettre ; chaque fichier de TeX Live est désormais lu comme l'éditeur le lit, dans les tests.",
            "Deux enregistrements d'un fichier à la fois (l'automatique et celui d'avant une compilation) passent l'un après l'autre : l'ancien texte pouvait atteindre le disque en dernier alors que l'onglet disait enregistré, et la compilation compilait ce qui avait été retiré. Les réglages, les fichiers ouverts, les réglages du projet et les jeux de formes TikZ sont enregistrés dans l'ordre aussi.",
            "Des réglages écrits par une autre version gardent ce qui peut être lu : une seule valeur inconnue remettait tous les réglages par défaut. Seule cette valeur l'est, et le fichier tel qu'il était est gardé à côté (`settings.toml.unread`) ; le fichier du projet est lu de la même façon.",
            "Un autre projet ouvert, ou le projet fermé, pendant une compilation arrête la compilation : sa page et ses problèmes n'apparaissent plus dans l'autre projet. Nettoyer les fichiers de compilation pendant une compilation l'arrête d'abord (sous Windows, ils ne pouvaient pas être supprimés).",
            "Un fichier ouvert renommé garde ce qui y a été tapé ; les changements d'un autre programme sont vus dans un dossier ouvert par un lien (un dossier synchronisé) ; un studio fermé avant son aperçu ne compile rien.",
            "Les nouveautés ne s'ouvrent qu'après une mise à jour : au tout premier lancement, ouvert avec un fichier, elles s'ouvraient aussi (le fichier qui venait d'être ouvert passait pour un usage plus ancien) et prenaient la touche Échap destinée à la fenêtre du dessous.",
            "Linux : un fichier seulement lu (par TeX, par la visionneuse, par RayTeX lui-même) n'est plus pris pour un fichier modifié. Chaque lecture était signalée comme un changement et relue : le PDF rechargé sans fin, un fichier dit modifié par un autre programme, le projet relu depuis le disque.",
          ],
        },
        {
          title: "Compilation",
          items: [
            "Le journal est vidé avant chaque passe : un moteur qui s'arrête avant de l'écrire (MiKTeX 26.5 sur certains préambules précompilés) ne montre plus les erreurs de la passe précédente. La passe est refaite sans le préambule, et l'arrêt est dit.",
            "Biber qui s'arrête sans un mot (macOS vide la copie qu'il décompresse) est réparé par la compilation elle-même ; deux Biber ne se croisent plus ; un dossier avec des accents garde sa bibliographie.",
            "Un PDF lu pendant que la compilation suivante l'écrit n'est pas montré : les pages restent telles qu'elles étaient jusqu'à ce qu'il soit entier, et aucune vignette n'est faite d'une moitié de PDF.",
            "Windows, dossiers avec des accents : les noms de fichiers que TeX écrit dans la page de code du système sont lus tels qu'ils sont (du PDF vers le texte, l'export, un `.aux` importé, les erreurs de BibTeX, les fichiers lus par une compilation).",
            "Le journal tel que MiKTeX l'écrit, ses lignes coupées à 79 : recollé avec XeLaTeX (qui compte les lettres, pas les octets) et LuaLaTeX aussi, et une lettre coupée en deux par pdfLaTeX lue entière ; un fichier dont le dossier a des espaces est reconnu comme celui qui est lu. Dans un dossier avec des accents ou des espaces, un problème était signalé dans un autre fichier, ou sans sa ligne.",
          ],
        },
        {
          title: "Vérifications et erreurs",
          items: [
            "Une faute signalée par LaTeX et par les vérifications en direct est montrée et comptée une fois ; la fenêtre des problèmes d'une ligne reste près de sa ligne, et son texte peut être copié.",
            "Des documents côte à côte dans un dossier (feuilles d'exercices) sont vérifiés séparément : les étiquettes de l'un ne comptent plus dans l'autre.",
            "Une classe ou un paquet pas encore installé (MiKTeX l'installe à la première compilation) n'est pas jugé sur ce qu'il définit ; les théorèmes de tcolorbox s'étiquettent eux-mêmes ; les images de mwe sont connues.",
            "Les commandes du projet sont dessinées dans les aperçus des formules, tableaux et matrices (`\\DeclareMathOperator`, `\\DeclarePairedDelimiter`, un premier argument optionnel), depuis chaque fichier.",
          ],
        },
        {
          title: "Rapidité",
          items: [
            "La vérification du projet entier, après chaque enregistrement, en temps quasi linéaire : 400 fichiers en 0,04 s au lieu de 8,9 s ; la documentation de TeX Live ouverte comme un seul projet (6 447 documents) en 9 s au lieu de 366.",
            "Les problèmes d'un fichier fusionnés en un temps qui croît avec leur nombre (3 000 problèmes : 1,4 ms au lieu de 56), et comptés une fois pour toute la fenêtre.",
            "La correction orthographique d'un long fichier ne ralentit plus la frappe ; les images de l'écran d'accueil sont gardées d'une session à l'autre et dessinées l'une après l'autre.",
            "Au repos, rien ne tourne : aucune image, minuterie ou animation une fois le travail fini.",
          ],
        },
        {
          title: "Éditeur et studios",
          items: [
            "Un clic dans le texte après qu'il a perdu le focus le garde là où il était défilé (il revenait à l'ancien curseur et sélectionnait le texte jusque-là).",
            "Les arbres de probabilités, les courbes de fonctions et les tableaux de variations écrivent leurs nombres à la française dès leur ouverture, dans un document en français.",
            "Le tableau blanc TikZ dessine comme LaTeX dessine : un nœud de forme cercle est un cercle autour de son texte, et l'étiquette d'un lien reste hors de la ligne à chaque zoom.",
            "L'aide nomme les menus et les panneaux comme la fenêtre les nomme.",
          ],
        },
      ],
    },
  },
  {
    version: "0.6.0",
    date: "2026-10-17",
    en: {
      points: [
        "The slides mode, for Beamer presentations: the slide written where it is drawn, the real slide as Beamer draws it beside it, the notes under it.",
        "Elements added from one bar or dragged where they go (text, lists, pictures, columns, formulas, tables, boxes), moved by their handle and set by their tools, written as plain LaTeX.",
        "Reveals step by step, tables managed cell by cell, a theme chosen on real slides with a colour of one's own.",
        "Presenting: the slides full screen on the projector, the presenter's view with the next slide, the notes and a timer.",
        "Exports: the slides, the slides with the notes, or handouts.",
        "Optional: offered by the installer of Windows, or the first time it is opened.",
      ],
      details: [
        {
          title: "The slides mode",
          items: [
            "View › Slides mode, or the Slides button of the top bar when the document is a Beamer deck, turns the window into the slides mode; Editor goes back. The editor stays behind: every change is made in it (undone with Ctrl+Z) and the deck is built again.",
            "On the left, the slides as thumbnails with their sections: a new one from a layout, copied or deleted from its thumbnail, moved by dragging it.",
            "In the middle, the slide written where it is drawn: its title, its texts (bold, italic, colours shown as they are), the points of its lists (Enter makes the next one), its pictures (their width set by a handle), its columns (their widths by the line between them), its formulas drawn, its tables, its boxes. What is anything else is kept as it is written and shown apart.",
            "On the right, the real slide as Beamer draws it, with its steps, or its LaTeX (written as in the editor, with completion); the notes of the speaker under it. A line at the bottom of the slide shows when it is too full.",
          ],
        },
        {
          title: "Elements and their tools",
          items: [
            "Insert adds an element after the one chosen: text, list, picture, columns, formula, table, box, and under More a numbered list, three columns, an alert, an example, code, a pause. The + between two elements does the same.",
            "Elements are dragged where they go, between two others or into a column, and moved by their handle; a picture dragged from the system is copied into the project. Dragging works the same on Windows.",
            "Above the slide, the tools of the element chosen: bold, italic, underlined, alert, a colour, a formula, a link on the words chosen; left, centred, right; smaller, larger; what its kind has; the step it appears at; copied, deleted. Delete, Ctrl+D and Alt with the arrows work from the keyboard.",
            "Everything is written as plain LaTeX (`\\begin{center}`, `\\begin{large}`, `\\begin{uncoverenv}<2->`, `\\textbf`, `\\textcolor`), only the element changed, at the indentation of the document; nothing is placed by coordinates.",
          ],
        },
        {
          title: "Tables",
          items: [
            "Cells typed into; Enter goes to the cell below and Tab to the next one, a row more after the last.",
            "Rows and columns put above, below, on the left or the right of the cell with the caret, or taken out; each column aligned; no lines, a line under the head, lines between rows or a grid; the head in bold.",
          ],
        },
        {
          title: "Theme",
          items: [
            "Theme opens a large window: every Beamer theme drawn on the slide chosen, and the look being chosen drawn on the title page and that slide.",
            "Its shape (16:9, 16:10, 4:3), its colour theme, a main colour of one's own, its font, the size of its text and the navigation symbols. Nothing is written before Apply, then only what changed.",
          ],
        },
        {
          title: "Reveals, presenting, exports",
          items: [
            "Each element can appear from a step on, or at one step only; a list can show one point a click. The steps are seen on the real slide.",
            "Present (F5 from the start, Shift+F5 from the slide chosen) shows the slides full screen on the screen of the projector; the main window becomes the presenter's view: the page shown, the next one, the notes, a timer, a black screen. The arrows, the space bar, a remote and a click move from step to step; Escape ends.",
            "Export gives the slides as a PDF, with the notes of the speaker, or as handouts (one, two or four to a page), each built apart, the deck untouched.",
          ],
        },
        {
          title: "Optional",
          items: [
            "The slides mode is offered by a box of the installer of Windows (NSIS); otherwise it is offered the first time it is opened, and installed at once, without the network.",
            "It is taken off and back in Settings › General; taken off, nothing of it is loaded.",
          ],
        },
      ],
    },
    fr: {
      points: [
        "Le mode diaporama, pour les présentations Beamer : la diapositive écrite là où elle est dessinée, la vraie diapositive telle que Beamer la dessine à côté, les notes dessous.",
        "Des éléments ajoutés depuis une seule barre ou glissés là où ils vont (texte, listes, images, colonnes, formules, tableaux, encadrés), déplacés par leur poignée et réglés par leurs outils, écrits en LaTeX simple.",
        "Des apparitions étape par étape, des tableaux gérés case par case, un thème choisi sur de vraies diapositives avec une couleur à soi.",
        "La présentation : les diapositives en plein écran sur le projecteur, la vue présentateur avec la diapositive suivante, les notes et un chrono.",
        "Les exports : les diapositives, les diapositives avec les notes, ou un polycopié.",
        "Facultatif : proposé par l'installateur de Windows, ou à la première ouverture.",
      ],
      details: [
        {
          title: "Le mode diaporama",
          items: [
            "Affichage › Mode diaporama, ou le bouton Diaporama de la barre du haut quand le document est une présentation Beamer, change la fenêtre en mode diaporama ; Éditeur y revient. L'éditeur reste derrière : chaque changement y est fait (annulé par Ctrl+Z) et la présentation est recompilée.",
            "À gauche, les diapositives en miniatures avec leurs parties : une nouvelle depuis une mise en page, copiée ou supprimée depuis sa miniature, déplacée en la glissant.",
            "Au milieu, la diapositive écrite là où elle est dessinée : son titre, ses textes (gras, italique, couleurs montrés tels quels), les points de ses listes (Entrée crée le suivant), ses images (leur largeur réglée par une poignée), ses colonnes (leur largeur par le trait qui les sépare), ses formules dessinées, ses tableaux, ses encadrés. Ce qui est autre chose est gardé tel qu'il est écrit et montré à part.",
            "À droite, la vraie diapositive telle que Beamer la dessine, avec ses étapes, ou son LaTeX (écrit comme dans l'éditeur, avec la complétion) ; les notes de l'orateur dessous. Un trait en bas de la diapositive montre quand elle est trop pleine.",
          ],
        },
        {
          title: "Les éléments et leurs outils",
          items: [
            "Insérer ajoute un élément après celui choisi : texte, liste, image, colonnes, formule, tableau, encadré, et sous Plus une liste numérotée, trois colonnes, une alerte, un exemple, du code, une pause. Le + entre deux éléments fait de même.",
            "Les éléments se glissent là où ils vont, entre deux autres ou dans une colonne, et se déplacent par leur poignée ; une image glissée depuis le système est copiée dans le projet. Le glisser marche de même sous Windows.",
            "Au-dessus de la diapositive, les outils de l'élément choisi : gras, italique, souligné, alerte, une couleur, une formule, un lien sur les mots choisis ; à gauche, centré, à droite ; plus petit, plus grand ; ce que son type a ; l'étape où il apparaît ; copié, supprimé. Suppr, Ctrl+D et Alt avec les flèches marchent au clavier.",
            "Tout est écrit en LaTeX simple (`\\begin{center}`, `\\begin{large}`, `\\begin{uncoverenv}<2->`, `\\textbf`, `\\textcolor`), seul l'élément changé, à l'indentation du document ; rien n'est placé par coordonnées.",
          ],
        },
        {
          title: "Les tableaux",
          items: [
            "On écrit dans les cases ; Entrée va à la case du dessous et Tab à la suivante, une ligne de plus après la dernière.",
            "Lignes et colonnes ajoutées au-dessus, en dessous, à gauche ou à droite de la case du curseur, ou supprimées ; chaque colonne alignée ; sans traits, un trait sous l'en-tête, des traits entre les lignes ou une grille ; l'en-tête en gras.",
          ],
        },
        {
          title: "Le thème",
          items: [
            "Thème ouvre une grande fenêtre : chaque thème Beamer dessiné sur la diapositive choisie, et l'allure choisie dessinée sur la page de titre et cette diapositive.",
            "Son format (16:9, 16:10, 4:3), son jeu de couleurs, une couleur principale à soi, sa police, la taille de son texte et les symboles de navigation. Rien n'est écrit avant Appliquer, puis seulement ce qui a changé.",
          ],
        },
        {
          title: "Apparitions, présentation, exports",
          items: [
            "Chaque élément peut apparaître à partir d'une étape, ou à une étape seulement ; une liste peut montrer un point par clic. Les étapes se voient sur la vraie diapositive.",
            "Présenter (F5 depuis le début, Maj+F5 depuis la diapositive choisie) montre les diapositives en plein écran sur l'écran du projecteur ; la fenêtre principale devient la vue présentateur : la page montrée, la suivante, les notes, un chrono, un écran noir. Les flèches, la barre d'espace, une télécommande et un clic avancent d'étape en étape ; Échap termine.",
            "Exporter donne les diapositives en PDF, avec les notes de l'orateur, ou en polycopié (une, deux ou quatre par page), chacun compilé à part, la présentation intacte.",
          ],
        },
        {
          title: "Facultatif",
          items: [
            "Le mode diaporama est proposé par une case de l'installateur de Windows (NSIS) ; sinon il est proposé à la première ouverture, et installé aussitôt, sans réseau.",
            "Il s'ôte et se remet dans Réglages › Général ; ôté, rien n'en est chargé.",
          ],
        },
      ],
    },
  },
  {
    version: "0.5.4",
    date: "2026-10-17",
    en: {
      points: [
        "Menus in the top bar (Format, Insert, Maths, Page, @) in place of See all: every tool by its name, with its shortcut and its submenus, usable with the keyboard.",
        "A subject and its answer key from one file: Subject | Answer key above the preview, and both PDFs exported in one go.",
        "Studios for maths: function plots (tangents, points, areas), tables of variations and of signs worked out from a function, probability trees.",
        "PDF/A for archiving and accessible PDF (PDF/UA, read by screen readers), checked once made, and a description for each picture.",
        "Paragraphs and indents set in the Page layout window, and what the text does by hand against them found and taken out.",
        "Fixes, and a lighter start.",
      ],
      details: [
        {
          title: "Menus",
          items: [
            "The top bar has the menus Format, Insert, Maths, Page and @: each tool by its name with its shortcut, the style of the line, the size, the colour and the alignment in submenus, the @ shortcuts drawn.",
            "A click opens a menu, passing over the others opens them; the arrows, Enter, Escape and the first letter of an entry work in them, and the text keeps its selection meanwhile.",
            "The command palette finds what they hold by its name too (Large, Fraction, Page break…).",
          ],
        },
        {
          title: "Subject and answer key",
          items: [
            "Above the preview, Subject | Answer key turns the switch of the document (one line of its preamble) and builds; Export both writes the subject and the answer key, each built apart, the document untouched.",
            "Insert › Subject and answer key writes an exercise with its points, a solution (framed in the answer key, left out of the subject), lines, room or a grid to answer on, with what they need in the preamble.",
            "The class exam, xsim and a switch of the document's own are understood as they are; a new template, Test with answer key, has it all. The export window gives the total of the points.",
          ],
        },
        {
          title: "Studios for maths",
          items: [
            "Function plots (pgfplots): functions written as on paper, each with its colour, line and name, tangents worked out from the derivative, points, lines, areas, axes as in textbooks. Opened again from its chip.",
            "Tables of variations and of signs (tkz-tab): filled by hand, or from a function (derivative, zeros, forbidden values, limits, simple values written exactly).",
            "Probability trees: one line a branch, the probability left out of two worked out (1 - p), each node checked to add up to 1, the probability of each path at its end if asked.",
          ],
        },
        {
          title: "PDF/A and accessible PDF",
          items: [
            "Export as PDF/A builds the document apart for archiving (PDF/A-2b, 1b, 2u or 3b), with pdfLaTeX, LuaLaTeX and XeLaTeX, then checks the PDF made (identification, colour profile, fonts, transparency).",
            "Export an accessible PDF builds it tagged, as PDF/UA-2 (PDF/A-3b and PDF/UA-1 with a PDF/A): its structure and language read by screen readers. The pictures without a description are counted.",
            "Both were validated with veraPDF, the reference validator. The image window has a Description field for each picture (`alt={…}`).",
          ],
        },
        {
          title: "Paragraphs and indents",
          items: [
            "A tab of the Page layout window: paragraphs indented, apart (a space between them) or both, the first one after a heading indented or not, seen on a compiled page before anything is written.",
            "What the open file does by hand against them, line by line: the `\\noindent` that do nothing, the blank lines after a formula that start a new paragraph, the `\\\\` ending a paragraph, each taken out in a click.",
          ],
        },
        {
          title: "Fixes",
          items: [
            "An environment renamed from the list of completion (`itemize` becoming `enumerate`) got a second body and `\\end`: its `\\begin` and `\\end` now change together, from either one.",
            "The code of the studios is loaded when one of them is opened, not at startup.",
            "What was typed in the title page window as it opened, or in a studio opened again from its chip, is no longer replaced by what the document had.",
          ],
        },
      ],
    },
    fr: {
      points: [
        "Des menus dans la barre du haut (Format, Insertion, Maths, Page, @) à la place de Tout voir : chaque outil par son nom, avec son raccourci et ses sous-menus, utilisables au clavier.",
        "Un sujet et son corrigé dans un seul fichier : Sujet | Corrigé au-dessus de l'aperçu, et les deux PDF exportés d'un coup.",
        "Des ateliers de maths : courbes de fonctions (tangentes, points, aires), tableaux de variations et de signes calculés depuis une fonction, arbres de probabilités.",
        "PDF/A pour l'archivage et PDF accessible (PDF/UA, lu par les lecteurs d'écran), vérifiés une fois faits, et une description pour chaque image.",
        "Les paragraphes et leur retrait réglés dans la fenêtre Mise en page, et ce que le texte fait à la main contre eux trouvé et retiré.",
        "Des corrections, et un démarrage plus léger.",
      ],
      details: [
        {
          title: "Les menus",
          items: [
            "La barre du haut a les menus Format, Insertion, Maths, Page et @ : chaque outil par son nom avec son raccourci, le style de la ligne, la taille, la couleur et l'alignement en sous-menus, les raccourcis @ dessinés.",
            "Un clic ouvre un menu, passer sur les autres les ouvre ; les flèches, Entrée, Échap et la première lettre d'une entrée y fonctionnent, et le texte garde sa sélection pendant ce temps.",
            "La palette de commandes trouve aussi ce qu'ils contiennent par son nom (Grand, Fraction, Saut de page…).",
          ],
        },
        {
          title: "Sujet et corrigé",
          items: [
            "Au-dessus de l'aperçu, Sujet | Corrigé bascule l'interrupteur du document (une ligne de son préambule) et compile ; Exporter les deux écrit le sujet et le corrigé, chacun compilé à part, sans toucher au document.",
            "Insertion › Sujet et corrigé écrit un exercice avec son barème, un corrigé (encadré dans le corrigé, absent du sujet), des lignes, une place ou un quadrillage pour répondre, avec ce qu'il leur faut dans le préambule.",
            "La classe exam, xsim et un interrupteur propre au document sont compris tels quels ; un nouveau modèle, Devoir avec corrigé, a tout cela. La fenêtre d'export donne le total des points.",
          ],
        },
        {
          title: "Les ateliers de maths",
          items: [
            "Courbes de fonctions (pgfplots) : des fonctions écrites comme sur papier, chacune avec sa couleur, son trait et son nom, des tangentes calculées depuis la dérivée, des points, des droites, des aires, des axes comme dans les manuels. Rouvert depuis sa puce.",
            "Tableaux de variations et de signes (tkz-tab) : remplis à la main, ou depuis une fonction (dérivée, zéros, valeurs interdites, limites, valeurs simples écrites exactement).",
            "Arbres de probabilités : une ligne par branche, la probabilité laissée vide sur deux calculée (1 - p), chaque nœud vérifié pour faire 1, la probabilité de chaque chemin au bout si demandé.",
          ],
        },
        {
          title: "PDF/A et PDF accessible",
          items: [
            "Exporter en PDF/A compile le document à part pour l'archivage (PDF/A-2b, 1b, 2u ou 3b), avec pdfLaTeX, LuaLaTeX et XeLaTeX, puis vérifie le PDF obtenu (identification, profil de couleur, polices, transparence).",
            "Exporter un PDF accessible le compile balisé, en PDF/UA-2 (PDF/A-3b et PDF/UA-1 avec un PDF/A) : sa structure et sa langue lues par les lecteurs d'écran. Les images sans description sont comptées.",
            "Les deux ont été validés avec veraPDF, le validateur de référence. La fenêtre des images a un champ Description pour chaque image (`alt={…}`).",
          ],
        },
        {
          title: "Paragraphes et retraits",
          items: [
            "Un onglet de la fenêtre Mise en page : des paragraphes en retrait, séparés par un espace ou les deux, le premier après un titre en retrait ou non, vus sur une page compilée avant que rien ne soit écrit.",
            "Ce que le fichier ouvert fait à la main contre eux, ligne par ligne : les `\\noindent` sans effet, les lignes vides après une formule qui commencent un nouveau paragraphe, les `\\\\` en fin de paragraphe, chacun retiré d'un clic.",
          ],
        },
        {
          title: "Corrections",
          items: [
            "Un environnement renommé depuis la liste de complétion (`itemize` devenant `enumerate`) recevait un deuxième corps et un deuxième `\\end` : son `\\begin` et son `\\end` changent maintenant ensemble, depuis l'un ou l'autre.",
            "Le code des ateliers se charge quand l'un d'eux s'ouvre, plus au démarrage.",
            "Ce qui était tapé dans la fenêtre de la page de titre à son ouverture, ou dans un atelier rouvert depuis sa puce, n'est plus remplacé par ce qu'avait le document.",
          ],
        },
      ],
    },
  },
  {
    version: "0.5.3",
    date: "2026-10-15",
    en: {
      points: [
        "TikZ and pgfplots pictures are drawn once: the next compilations put them back as they were drawn, to the pixel, and a pass takes about half the time on a document with plots.",
        "Pasting writes LaTeX: formatted text from Word, Google Docs or a web page, formulas (those of Word too) and tables.",
        "Writing faster: `&`, `_`, `#` and `%` escaped as they are typed, and an `@` shortcut offered for a command typed in full again and again. Each aid can be turned off.",
        "Find and replace redone: a card over the editor (Ctrl+F, Ctrl+R) and a panel for the whole project (Ctrl+Shift+F, Ctrl+Shift+R).",
        "Lighter compilations: a first pass without PDF when a second one follows, precompiled preambles with MiKTeX, a chapter on its own with latexmk and `\\import` too.",
        "A smaller application (14 MB instead of 17), and fixes.",
      ],
      details: [
        {
          title: "TikZ pictures drawn once",
          items: [
            "After a compilation, each new TikZ or pgfplots picture is drawn in the background on a page of its own. The next compilations put that page in its place: the same picture, to the pixel, with pdfLaTeX, XeLaTeX, LuaLaTeX and latexmk.",
            "A picture is drawn again as soon as its text changes, or a file it reads (data, image), the preamble, a definition of the document (`\\newcommand`, `\\tikzset`…), or what surrounds it (width, font, colour, language).",
            "Pictures that depend on the page or on the rest of the document (references, citations, counters, `remember picture`, `overlay`, random numbers) are always drawn.",
            "Exporting the PDF draws every picture. The setting is in Settings › Compilation › Keep TikZ pictures already drawn.",
          ],
        },
        {
          title: "Pasting",
          items: [
            "Text copied from Word, Google Docs, LibreOffice or a web page is pasted as LaTeX: bold, italic, underline, headings, lists, links, superscripts and subscripts. A notice offers Plain text at once.",
            "Formulas are pasted as formulas: those of a web page (MathML, or the TeX it carries, as on Wikipedia) and the equations of Word.",
            "A table (Excel, Calc, Word, a page) opens in the table window; inside a formula, it becomes a matrix. LaTeX code and code from an editor are pasted as they are.",
          ],
        },
        {
          title: "Writing faster",
          items: [
            "`&`, `_` and `#` typed in text, and `%` after a number, are written `\\&`, `\\_`, `\\#`, `\\%`. Never in a formula, a table, the name of a label or of a file, a definition, a comment, the preamble, TikZ or code. One undo puts the character back.",
            "A command typed in full again and again (`\\mathbb`, `\\varepsilon`…) gets one offer: the `@` shortcut that writes it, or a new one in a click. Never twice for a command.",
            "Each aid is a setting of the editor (Settings › Editor). A selection is wrapped by typing `(`, `[`, `{` or `$`.",
          ],
        },
        {
          title: "Find and replace",
          items: [
            "In the file, a card at the top right of the editor: Ctrl+F to find, Ctrl+R with its row of replacement. The matches are counted (2 of 5), with match case, whole word and regular expression; Enter for the next, Shift+Enter for the previous, Alt+Enter to select them all.",
            "In the project, Ctrl+Shift+F and Ctrl+Shift+R open the Search panel, redone: results by file, each line showing what it will become, replaced alone, with its file or all.",
          ],
        },
        {
          title: "Compilations",
          items: [
            "A document compiled for the first time, with a table of contents, references or citations, has a first pass that writes no PDF and reads no image: a second one follows for certain.",
            "The compilation that completes a live one starts from the pass already made when nothing changed in between.",
            "Precompiled preambles work with MiKTeX too: each pass of a pdfLaTeX document is 35 to 55 % faster.",
            "A chapter compiled on its own works with latexmk, and for a file brought in by `\\import`.",
          ],
        },
        {
          title: "Size and fixes",
          items: [
            "The application weighs 14 MB instead of 17 on macOS; what works while you type and compile is still built for speed.",
            "A file left by an older compilation that the compiler cannot read (`.aux`, `.toc`…) no longer stops the build with a false error: it is put aside and the pass done again.",
            "A chapter compiled on its own had one page less than in the document when the file before it ended on a page of text.",
            "In the PDF, a page keeps its size when the document gains or loses a page.",
          ],
        },
      ],
    },
    fr: {
      points: [
        "Les figures TikZ et pgfplots ne sont dessinées qu'une fois : les compilations suivantes les reprennent telles quelles, au pixel près, et une passe prend environ deux fois moins de temps sur un document avec des courbes.",
        "Coller écrit du LaTeX : texte mis en forme depuis Word, Google Docs ou une page web, formules (celles de Word aussi) et tableaux.",
        "Écrire plus vite : `&`, `_`, `#` et `%` échappés à la frappe, et un raccourci `@` proposé pour une commande tapée en entier encore et encore. Chaque aide se désactive.",
        "Rechercher et remplacer refait : une carte sur l'éditeur (Ctrl+F, Ctrl+R) et un panneau pour tout le projet (Ctrl+Maj+F, Ctrl+Maj+R).",
        "Des compilations plus légères : une première passe sans PDF quand une deuxième suit, le préambule précompilé avec MiKTeX, un chapitre seul avec latexmk et `\\import` aussi.",
        "Une application plus légère (14 Mo au lieu de 17), et des corrections.",
      ],
      details: [
        {
          title: "Les figures TikZ dessinées une fois",
          items: [
            "Après une compilation, chaque nouvelle figure TikZ ou pgfplots est dessinée en arrière-plan sur une page à part. Les compilations suivantes mettent cette page à sa place : la même figure, au pixel près, avec pdfLaTeX, XeLaTeX, LuaLaTeX et latexmk.",
            "Une figure est redessinée dès que son texte change, ou un fichier qu'elle lit (données, image), le préambule, une définition du document (`\\newcommand`, `\\tikzset`…), ou ce qui l'entoure (largeur, police, couleur, langue).",
            "Les figures qui dépendent de la page ou du reste du document (renvois, citations, compteurs, `remember picture`, `overlay`, nombres aléatoires) sont toujours dessinées.",
            "L'export du PDF redessine toutes les figures. Le réglage est dans Réglages › Compilation › Garder les figures TikZ déjà dessinées.",
          ],
        },
        {
          title: "Coller",
          items: [
            "Un texte copié depuis Word, Google Docs, LibreOffice ou une page web est collé en LaTeX : gras, italique, souligné, titres, listes, liens, exposants et indices. Une notification propose aussitôt Texte brut.",
            "Les formules sont collées en formules : celles d'une page web (MathML, ou le TeX qu'elle porte, comme sur Wikipédia) et les équations de Word.",
            "Un tableau (Excel, Calc, Word, une page) s'ouvre dans la fenêtre des tableaux ; dans une formule, il devient une matrice. Le code LaTeX et le code copié d'un éditeur sont collés tels quels.",
          ],
        },
        {
          title: "Écrire plus vite",
          items: [
            "`&`, `_` et `#` tapés dans le texte, et `%` après un nombre, s'écrivent `\\&`, `\\_`, `\\#`, `\\%`. Jamais dans une formule, un tableau, le nom d'un label ou d'un fichier, une définition, un commentaire, le préambule, TikZ ou du code. Une seule annulation remet le caractère.",
            "Une commande tapée en entier encore et encore (`\\mathbb`, `\\varepsilon`…) donne lieu à une proposition : le raccourci `@` qui l'écrit, ou un nouveau en un clic. Jamais deux fois pour une commande.",
            "Chaque aide est un réglage de l'éditeur (Réglages › Éditeur). Une sélection s'entoure en tapant `(`, `[`, `{` ou `$`.",
          ],
        },
        {
          title: "Rechercher et remplacer",
          items: [
            "Dans le fichier, une carte en haut à droite de l'éditeur : Ctrl+F pour chercher, Ctrl+R avec sa ligne de remplacement. Les résultats sont comptés (2 sur 5), avec respect de la casse, mot entier et expression régulière ; Entrée pour le suivant, Maj+Entrée pour le précédent, Alt+Entrée pour tous les sélectionner.",
            "Dans le projet, Ctrl+Maj+F et Ctrl+Maj+R ouvrent le panneau Rechercher, refait : les résultats par fichier, chaque ligne montrant ce qu'elle va devenir, remplacée seule, avec son fichier ou toutes.",
          ],
        },
        {
          title: "Les compilations",
          items: [
            "Un document compilé pour la première fois, avec une table des matières, des renvois ou des citations, a une première passe qui n'écrit pas de PDF et ne lit pas les images : une deuxième suit à coup sûr.",
            "La compilation qui complète une compilation en direct repart de la passe déjà faite quand rien n'a changé entre-temps.",
            "Le préambule précompilé fonctionne aussi avec MiKTeX : chaque passe d'un document pdfLaTeX est 35 à 55 % plus rapide.",
            "Un chapitre compilé seul fonctionne avec latexmk, et pour un fichier inclus par `\\import`.",
          ],
        },
        {
          title: "Taille et corrections",
          items: [
            "L'application pèse 14 Mo au lieu de 17 sur macOS ; ce qui travaille pendant la frappe et la compilation reste optimisé pour la vitesse.",
            "Un fichier laissé par une ancienne compilation que le compilateur ne sait pas lire (`.aux`, `.toc`…) n'arrête plus la compilation avec une fausse erreur : il est mis de côté et la passe refaite.",
            "Un chapitre compilé seul avait une page de moins que dans le document quand le fichier d'avant finissait sur une page de texte.",
            "Dans le PDF, une page garde sa taille quand le document gagne ou perd une page.",
          ],
        },
      ],
    },
  },
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
