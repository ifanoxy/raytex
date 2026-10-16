# Page layout

Margins, header, footer, a watermark: the **Page layout** window sets them with fields, and shows the result on real pages, compiled with the class and the preamble of your project, before anything is written in the document. Open it from the **Page** menu, or from the command palette (*Margins of the document…*, *Page styles…*).

Each group shows what matters most; **Advanced**, on the right of its title, unfolds the rest.

## Margins

The **Margins** tab reads what the preamble already says (`\usepackage[…]{geometry}`, `\geometry{…}`, the options of the class).

| Group | Main settings | Advanced |
|---|---|---|
| **Margins** | Ready-made margins, and the four margins around a drawing of the page | Height of the header, distances header → text and text → footer, margin notes, other options of `geometry`, the code |
| **Paper** | Format, orientation, unit | Two-sided (*inner* and *outer* margins), binding |

A field left empty is worked out by LaTeX: its value is shown in grey. These values, like the size of the text area under the drawing, are not estimated: TeX measures them on the page of the preview. Write a number in the chosen unit (`2.5`), or a whole length (`1in`, `0.1\paperwidth`).

- **Apply to the document** writes everything in one place of the preamble, as one change that can be undone:

  ```latex
  \usepackage{geometry}
  \geometry{top=2.5cm, bottom=2.5cm, left=3.5cm, right=2cm}
  ```

- **From here on** writes `\newgeometry{…}` at the cursor: these margins start there, on a new page, and the rest of the document keeps its own.
- **Document margins from here** writes `\restoregeometry`.

## Page styles

A **page style** is what repeats on the pages. The **Page styles** tab lists those the document defines (`\fancypagestyle`) and makes new ones.

| Group | Main settings | Advanced |
|---|---|---|
| **Header**, **Footer** | Three fields: left, centre, right | Rule (thickness, colour, distance, none on pages of figures), font of the band (size, style, colour), how far it goes into the margins |
| **Watermark** | A text and its strength, or an image and its opacity | Colour, size, angle, place on the page, over the text, an image over the whole page (a background) |
| **Titles, base, code** | | How the title of the chapter and of the section is repeated, the style this one starts from, more LaTeX, the code of the style |

The **`+`** at the end of each field writes what a field can hold: page number, "page 2 / 9", title of the chapter or of the section, date, **image** (a logo, picked in your files: an image that is not in the project is copied into its folder of images, `figures/` by default, like the image of a watermark or the logo of a title page), bold, italic, colour, new line, and further on the number of pages, the first or the last title of the page, something left out on pages of figures.

When the text of a field is longer than its box, a double arrow shows next to the `+`: it opens the field in a larger area, under the three boxes (<kbd>Esc</kbd> closes it).

In a two-sided document, **Even pages** chooses between *Same*, *Mirrored* (what is outside stays outside) and *Their own* (even pages have fields of their own).

If the header is taller than the room the page keeps for it (an image, two lines), the preview says so and one click gives it the height LaTeX asks for.

> Nearly all of `fancyhdr` has its setting. For the rest (`\fancyheadwidth`, `\fancycenter`…), write it in *More LaTeX for this style*: it is kept as it is, like anything a hand-written style holds that the window does not show.

## Giving a style to the pages you want

| Button | What it does |
|---|---|
| **The whole document** | `\pagestyle{name}` in the preamble. Click again to take it back. |
| **Title and chapter pages** | These pages have a style of their own (`plain`): they take yours instead. |
| **From here on** | `\pagestyle{name}` at the cursor: this page and those that follow. |
| **This page only** | `\thispagestyle{name}` at the cursor. |
| *Advanced*: **Pages … to …** | By the numbers of the pages in the PDF (the first one is 1). |
| *Advanced*: `plain`, `empty`, `headings` | A style of LaTeX from the cursor on. |

> A page that opens a chapter keeps the style its chapter gives it, even when its number is in a range: use *Title and chapter pages* for those.

**Save the style** writes its definition in the preamble, with the packages it needs. **Delete the style** also removes what used it; *Undo* in the editor brings it back.

## The title page

The **Page › Title page…** menu entry (or the command palette) opens a window that writes the title page for you: you fill in fields, and the page is shown next to them, compiled with the class and the preamble of your project.

- **Four layouts**, chosen by their picture: *Classic* (the `\maketitle` of LaTeX, above the text in an article), *Centered*, *Report* (the institution at the top, authors on the left and supervisors on the right) and *Modern* (aligned on the left along a rule).
- **Text**: title, subtitle, authors (one per line), date (today, none, or the one you write).
- **Institution**: university or school, department, kind of document ("Master's thesis"), supervisors, logo. Under *Advanced*: the width of the logo, what is written above the supervisors, the colour of the rules.

**Write the title page** puts it in the main file, in place of the title it had (`\maketitle` or another title page), with the packages it needs; one undo removes it. Open the window again to change it: it finds its fields.

The code written is ordinary LaTeX, which you can touch up: each line says what it is in a comment (`% title`, `% author`), and it is by these comments that the window knows its fields. The characters `&`, `%`, `#` and `_` are written as LaTeX wants them (`\&`…); the rest is kept as it is, commands included (`\LaTeX`, `\\` for a line break in a title).

With the `beamer` class, the window sets `\title`, `\subtitle`, `\author`, `\institute` and `\date`, and the title frame.
